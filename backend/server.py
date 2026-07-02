from __future__ import annotations

import os
import sys
import json
import asyncio

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import FastAPI
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import backend.services as services
from backend.services.market_data import SUPPORTED_SYMBOLS, ALLOWED_INTERVALS
from backend.ai.copilot import AICopilot
app = FastAPI(title="ApexTrader Pro API", version="5.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_copilot = AICopilot()


def _sym(symbol: str) -> str:
    s = (symbol or "BTCUSDT").upper().strip()
    return s if s in SUPPORTED_SYMBOLS else "BTCUSDT"


def _iv(interval: str) -> str:
    i = (interval or "1h").lower().strip()
    return i if i in ALLOWED_INTERVALS else "1h"


def _offline() -> JSONResponse:
    return JSONResponse(
        {"status": "offline", "error": "Market data temporarily unavailable",
         "message": "Market data temporarily unavailable"},
        status_code=503,
    )


def _json_bytes(data: bytes) -> Response:
    return Response(content=data, media_type="application/json")


@app.get("/api/candles")
async def candles(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 500):
    try:
        lim = max(1, min(int(limit), 1000))
        data = await asyncio.to_thread(services.fetch_candles, _sym(symbol), _iv(interval), lim)
        return _json_bytes(data)
    except Exception as e:
        print(f"  [candles] {e}")
        return _offline()


@app.get("/api/ticker")
async def ticker(symbol: str = "BTCUSDT"):
    try:
        data = await asyncio.to_thread(services.fetch_ticker, _sym(symbol))
        return _json_bytes(data)
    except Exception as e:
        print(f"  [ticker] {e}")
        return _offline()


@app.get("/api/orderbook")
async def orderbook(symbol: str = "BTCUSDT", limit: int = 20):
    try:
        lim = max(5, min(int(limit), 100))
        data = await asyncio.to_thread(services.fetch_orderbook, _sym(symbol), lim)
        return _json_bytes(data)
    except Exception as e:
        print(f"  [orderbook] {e}")
        return _offline()


@app.get("/api/coins")
async def coins():
    try:
        data = await asyncio.to_thread(services.fetch_coins)
        return _json_bytes(data)
    except Exception as e:
        print(f"  [coins] {e}")
        return _offline()


@app.get("/api/feargreed")
async def feargreed():
    try:
        data = await asyncio.to_thread(services.fetch_feargreed)
        return _json_bytes(data)
    except Exception as e:
        print(f"  [feargreed] {e}")
        return _offline()


@app.get("/api/news")
async def news():
    try:
        data = await asyncio.to_thread(services.fetch_news)
        return _json_bytes(data)
    except Exception as e:
        print(f"  [news] {e}")
        return _offline()


@app.get("/api/health")
async def health():
    try:
        import backend.monitoring.telemetry as telemetry
        return telemetry.get_health_stats()
    except Exception:
        return {"status": "ok", "service": "ApexTrader Pro API"}


@app.get("/api/ai/analysis")
async def ai_analysis(symbol: str = "BTCUSDT", interval: str = "1h"):
    try:
        result = await asyncio.to_thread(_copilot.analyze_market_structure, _sym(symbol), _iv(interval))
        return result
    except Exception as e:
        print(f"  [ai_analysis] {e}")
        return JSONResponse({"error": str(e), "status": "error"}, status_code=502)


class ChatBody(BaseModel):
    symbol: str = "BTCUSDT"
    interval: str = "1h"
    message: str = ""


@app.post("/api/ai/chat")
async def ai_chat(body: ChatBody):
    symbol, interval = _sym(body.symbol), _iv(body.interval)
    message = body.message.strip()
    if not message:
        return JSONResponse({"error": "Empty message"}, status_code=400)
    try:
        quant = await asyncio.to_thread(_copilot.analyze_market_structure, symbol, interval, False)
        from backend.ai.llm_analyst import chat_reply
        reply = await chat_reply(symbol, interval, message, quant)
        return {"response": reply, "engine": "llm"}
    except Exception as e:
        print(f"  [ai_chat llm fallback] {e}")
        try:
            reply = await asyncio.to_thread(_copilot.chat_query, symbol, interval, message)
            return {"response": reply, "engine": "quant"}
        except Exception as e2:
            return JSONResponse({"error": str(e2), "status": "error"}, status_code=502)


class DeepBody(BaseModel):
    symbol: str = "BTCUSDT"
    interval: str = "1h"


@app.post("/api/ai/deep-analysis")
async def ai_deep_analysis(body: DeepBody):
    symbol, interval = _sym(body.symbol), _iv(body.interval)
    try:
        quant = await asyncio.to_thread(_copilot.analyze_market_structure, symbol, interval, False)
        from backend.ai.llm_analyst import deep_analysis
        report = await deep_analysis(symbol, interval, quant)
        return {"report": report, "bias": quant.get("bias"), "score": quant.get("score")}
    except Exception as e:
        print(f"  [deep_analysis] {e}")
        return JSONResponse({"error": str(e), "status": "error"}, status_code=502)


@app.get("/api/auth/session")
async def auth_session():
    return {"status": "success", "user": {"id": "guest", "email": "guest@apextrader.pro"}}


@app.get("/api/auth/config")
async def auth_config():
    return {"supabaseEnabled": False, "supabaseUrl": "", "supabaseKey": ""}


# ──────────────────────────────────────────────
#  Paper (Demo) Trading Simulator — /api/demo/*
# ──────────────────────────────────────────────
import json as _json
import time as _time
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from backend.repositories.db import get_db, init_db
from backend.services.demo_trading import (
    OpenPositionRequest, ClosePositionRequest, ModifyPositionRequest,
    open_position_internal, close_position_internal, calculate_portfolio,
    register_ws, unregister_ws, update_live_price, init_loop,
)


@app.on_event("startup")
async def _startup():
    init_db()
    init_loop(asyncio.get_event_loop())


@app.post("/api/demo/open")
async def demo_open(req: OpenPositionRequest):
    try:
        return await asyncio.to_thread(open_position_internal, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/demo/close")
async def demo_close(req: ClosePositionRequest):
    try:
        return await asyncio.to_thread(close_position_internal, req.position_id, req.price)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/demo/modify")
async def demo_modify(req: ModifyPositionRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM positions WHERE id = ?", (req.position_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Position not found")
        cursor.execute("UPDATE positions SET sl = ?, tp = ? WHERE id = ?", (req.sl, req.tp, req.position_id))
    return {"status": "success"}


@app.post("/api/demo/reset")
async def demo_reset(balance: float = 10000.0):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM demo_accounts ORDER BY id DESC LIMIT 1")
        acc = cursor.fetchone()
        if acc:
            history = _json.loads(acc["reset_history"] or "[]")
            history.append({"time": _time.strftime("%Y-%m-%d %H:%M:%S"),
                            "previous_balance": acc["balance"], "previous_equity": acc["equity"]})
            cursor.execute("UPDATE demo_accounts SET balance = ?, equity = ?, reset_history = ? WHERE id = ?",
                           (balance, balance, _json.dumps(history), acc["id"]))
        else:
            cursor.execute("INSERT INTO demo_accounts (balance, equity, reset_history) VALUES (?, ?, '[]')",
                           (balance, balance))
        cursor.execute("DELETE FROM positions")
    return {"status": "success", "balance": balance}


@app.get("/api/demo/portfolio")
async def demo_portfolio():
    return await asyncio.to_thread(calculate_portfolio)


@app.get("/api/demo/positions")
async def demo_positions():
    from backend.services.demo_trading import _live_prices, _live_prices_lock
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE status = 'OPEN'")
        rows = cursor.fetchall()
    res = []
    for r in rows:
        with _live_prices_lock:
            current_price = _live_prices.get(r["symbol"], r["entry_price"])
        pnl = (current_price - r["entry_price"]) * r["size"] if r["side"] == "BUY" else (r["entry_price"] - current_price) * r["size"]
        res.append({
            "id": r["id"], "symbol": r["symbol"], "side": r["side"],
            "entry_price": r["entry_price"], "current_price": current_price,
            "size": r["size"], "leverage": r["leverage"], "sl": r["sl"], "tp": r["tp"],
            "pnl": round(pnl, 2),
            "pnl_pct": round((pnl / (r["size"] * r["entry_price"] / r["leverage"]) * 100), 2) if r["size"] > 0 else 0.0,
            "created_at": r["created_at"],
        })
    return res


def _trade_row(r) -> dict:
    return {
        "id": r["id"], "symbol": r["symbol"], "side": r["side"],
        "entry_price": r["entry_price"], "exit_price": r["exit_price"],
        "size": r["size"], "leverage": r["leverage"],
        "entry_time": r["entry_time"], "exit_time": r["exit_time"],
        "pnl": round(r["pnl"], 2), "fees": round(r["fees"], 2),
        "sl": r["sl"], "tp": r["tp"], "ai_confidence": r["ai_confidence"],
        "ai_reasoning_snapshot": _json.loads(r["ai_reasoning_snapshot"] or "{}"),
        "user_notes": r["user_notes"],
    }


@app.get("/api/demo/trades")
async def demo_trades(limit: int = 100):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades ORDER BY exit_time DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
    return [_trade_row(r) for r in rows]


@app.get("/api/demo/trades/{trade_id}")
async def demo_trade(trade_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades WHERE id = ?", (trade_id,))
        r = cursor.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Trade not found")
    return _trade_row(r)


@app.get("/api/demo/performance")
async def demo_performance():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades")
        trades = cursor.fetchall()
    total = len(trades)
    if total == 0:
        return {"total_trades": 0, "wins": 0, "losses": 0, "win_rate": 0.0,
                "profit_factor": 0.0, "expectancy": 0.0, "avg_rr": 0.0,
                "largest_win": 0.0, "largest_loss": 0.0}
    wins = losses = 0
    win_pnl = loss_pnl = largest_win = largest_loss = total_pnl = 0.0
    rr_values = []
    for t in trades:
        pnl = t["pnl"]
        total_pnl += pnl
        if pnl >= 0:
            wins += 1
            win_pnl += pnl
            largest_win = max(largest_win, pnl)
        else:
            losses += 1
            loss_pnl += abs(pnl)
            largest_loss = min(largest_loss, pnl)
        if t["sl"] and t["sl"] > 0:
            risk = abs(t["entry_price"] - t["sl"]) * t["size"]
            if risk > 0:
                rr_values.append(pnl / risk)
    return {
        "total_trades": total, "wins": wins, "losses": losses,
        "win_rate": round(wins / total * 100, 2),
        "profit_factor": round(win_pnl / loss_pnl, 2) if loss_pnl > 0 else round(win_pnl, 2),
        "expectancy": round(total_pnl / total, 2),
        "avg_rr": round(sum(rr_values) / len(rr_values), 2) if rr_values else 0.0,
        "largest_win": round(largest_win, 2),
        "largest_loss": round(largest_loss, 2),
    }


@app.websocket("/api/ws/ticks")
async def websocket_ticks(websocket: WebSocket):
    await websocket.accept()
    register_ws(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = _json.loads(data)
            if msg.get("type") == "ticker":
                update_live_price(msg.get("symbol"), float(msg.get("price")))
    except WebSocketDisconnect:
        pass
    finally:
        unregister_ws(websocket)
