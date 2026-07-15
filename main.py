from __future__ import annotations

import os
import time
import json
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import backend.services as services
from backend.services.market_data import SUPPORTED_SYMBOLS, ALLOWED_INTERVALS
import backend.monitoring.telemetry as telemetry
from backend.ai.copilot import AICopilot
from backend.repositories.db import init_db, get_db
from backend.services.demo_trading import (
    init_loop,
    register_ws,
    unregister_ws,
    update_live_price,
    calculate_portfolio,
    open_position_internal,
    close_position_internal,
    OpenPositionRequest,
    ClosePositionRequest,
    ModifyPositionRequest
)

# Initialize Database Schema
init_db()

app = FastAPI(title="ApexTrader Pro API", version="4.0")

# Enable CORS for frontend flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    import asyncio
    init_loop(asyncio.get_running_loop())

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

def validated_symbol(symbol: str) -> str:
    sym = symbol.upper().strip()
    return sym if sym in SUPPORTED_SYMBOLS else "BTCUSDT"

def validated_interval(interval: str) -> str:
    iv = interval.lower().strip()
    return iv if iv in ALLOWED_INTERVALS else "1h"

# ──────────────────────────────────────────────
#  API Endpoints
# ──────────────────────────────────────────────

@app.get("/api/candles")
def get_candles(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 500):
    sym = validated_symbol(symbol)
    iv = validated_interval(interval)
    limit = max(1, min(limit, 1000))
    try:
        content = services.fetch_candles(sym, iv, limit)
        return Response(content=content, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

@app.get("/api/ticker")
def get_ticker(symbol: str = "BTCUSDT"):
    sym = validated_symbol(symbol)
    try:
        content = services.fetch_ticker(sym)
        return Response(content=content, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

@app.get("/api/orderbook")
def get_orderbook(symbol: str = "BTCUSDT", limit: int = 20):
    sym = validated_symbol(symbol)
    limit = max(5, min(limit, 100))
    try:
        content = services.fetch_orderbook(sym, limit)
        return Response(content=content, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

@app.get("/api/coins")
def get_coins():
    try:
        content = services.fetch_coins()
        return Response(content=content, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

@app.get("/api/feargreed")
def get_feargreed():
    try:
        content = services.fetch_feargreed()
        return Response(content=content, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

@app.get("/api/news")
def get_news():
    try:
        content = services.fetch_news()
        return Response(content=content, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

@app.get("/api/health")
def get_health():
    return telemetry.get_health_stats()

@app.get("/api/market-score")
def get_market_score(symbol: str = "BTCUSDT", interval: str = "1h"):
    sym = validated_symbol(symbol)
    iv = validated_interval(interval)
    try:
        from backend.services.market_score import MarketScoreEngine
        engine = MarketScoreEngine()
        return engine.compute_score(sym, iv)
    except Exception as e:
        print(f"  [api market-score] {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/ticks")
def get_ticks(symbol: str = "BTCUSDT", price: float = 0.0):
    sym = validated_symbol(symbol)
    if price > 0:
        update_live_price(sym, price)
    return {"status": "ok"}

from pydantic import BaseModel
from typing import List, Dict, Any

class AICoachRequest(BaseModel):
    symbol: str = "BTCUSDT"
    interval: str = "1h"
    positions: List[Dict[str, Any]] = []
    recent_trades: List[Dict[str, Any]] = []
    mode: str = "auto"
    question: str = ""

class AIDeepAnalysisRequest(BaseModel):
    symbol: str = "BTCUSDT"
    interval: str = "1h"

class AIChatRequest(BaseModel):
    symbol: str = "BTCUSDT"
    interval: str = "1h"
    message: str = ""

@app.get("/api/ai/analysis")
def get_ai_analysis(symbol: str = "BTCUSDT", interval: str = "1h"):
    sym = validated_symbol(symbol)
    iv = validated_interval(interval)
    try:
        copilot = AICopilot()
        return copilot.analyze_market_structure(sym, iv)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/coach")
def post_ai_coach(req: AICoachRequest):
    sym = validated_symbol(req.symbol)
    iv = validated_interval(req.interval)
    try:
        copilot = AICopilot()
        return copilot.generate_coaching(
            symbol=sym,
            interval=iv,
            positions=req.positions,
            recent_trades=req.recent_trades,
            mode=req.mode,
            question=req.question
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/deep-analysis")
def post_ai_deep_analysis(req: AIDeepAnalysisRequest):
    sym = validated_symbol(req.symbol)
    iv = validated_interval(req.interval)
    try:
        copilot = AICopilot()
        quant = copilot.analyze_market_structure(sym, iv, calculate_matrix=False)
        
        from backend.ai.llm_analyst import deep_analysis
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            report = loop.run_until_complete(deep_analysis(sym, iv, quant))
        finally:
            loop.close()
        return {"analysis": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/chat")
def post_ai_chat(req: AIChatRequest):
    sym = validated_symbol(req.symbol)
    iv = validated_interval(req.interval)
    try:
        copilot = AICopilot()
        reply = copilot.chat_query(sym, iv, req.message)
        return {"response": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────────
#  Paper (Demo) Trading Simulator Endpoints
# ──────────────────────────────────────────────

@app.post("/demo/open")
def open_position(req: OpenPositionRequest):
    try:
        return open_position_internal(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/demo/close")
def close_position(req: ClosePositionRequest):
    try:
        return close_position_internal(req.position_id, req.price)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/demo/modify")
def modify_position(req: ModifyPositionRequest):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM positions WHERE id = ?", (req.position_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Position not found")
            cursor.execute("UPDATE positions SET sl = ?, tp = ? WHERE id = ?", (req.sl, req.tp, req.position_id))
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/demo/reset")
def reset_demo_account(balance: float = 10000.0):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM demo_accounts ORDER BY id DESC LIMIT 1")
            acc = cursor.fetchone()
            if acc:
                history = json.loads(acc["reset_history"] or "[]")
                history.append({
                    "time": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "previous_balance": acc["balance"],
                    "previous_equity": acc["equity"]
                })
                cursor.execute("""
                    UPDATE demo_accounts
                    SET balance = ?, equity = ?, reset_history = ?
                    WHERE id = ?
                """, (balance, balance, json.dumps(history), acc["id"]))
            else:
                cursor.execute("""
                    INSERT INTO demo_accounts (balance, equity, reset_history)
                    VALUES (?, ?, '[]')
                """, (balance, balance))
            cursor.execute("DELETE FROM positions")
        return {"status": "success", "balance": balance}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/demo/portfolio")
def get_portfolio():
    return calculate_portfolio()

@app.get("/demo/positions")
def get_positions():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM positions WHERE status = 'OPEN'")
            rows = cursor.fetchall()
            
        res = []
        for r in rows:
            symbol = r["symbol"]
            entry_price = r["entry_price"]
            size = r["size"]
            side = r["side"]
            
            from backend.services.demo_trading import _live_prices, _live_prices_lock
            with _live_prices_lock:
                current_price = _live_prices.get(symbol, entry_price)
                
            if side == "BUY":
                pnl = (current_price - entry_price) * size
            else:
                pnl = (entry_price - current_price) * size
                
            res.append({
                "id": r["id"],
                "symbol": symbol,
                "side": side,
                "entry_price": entry_price,
                "current_price": current_price,
                "size": size,
                "leverage": r["leverage"],
                "sl": r["sl"],
                "tp": r["tp"],
                "pnl": round(pnl, 2),
                "pnl_pct": round((pnl / (size * entry_price / r["leverage"]) * 100), 2) if size > 0 else 0.0,
                "created_at": r["created_at"]
            })
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/demo/trades")
def get_trades_list(limit: int = 100):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM trades ORDER BY exit_time DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            
        res = []
        for r in rows:
            res.append({
                "id": r["id"],
                "symbol": r["symbol"],
                "side": r["side"],
                "entry_price": r["entry_price"],
                "exit_price": r["exit_price"],
                "size": r["size"],
                "leverage": r["leverage"],
                "entry_time": r["entry_time"],
                "exit_time": r["exit_time"],
                "pnl": round(r["pnl"], 2),
                "fees": round(r["fees"], 2),
                "sl": r["sl"],
                "tp": r["tp"],
                "ai_confidence": r["ai_confidence"],
                "ai_reasoning_snapshot": json.loads(r["ai_reasoning_snapshot"] or "{}"),
                "user_notes": r["user_notes"]
            })
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/demo/trades/{trade_id}")
def get_single_trade(trade_id: int):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM trades WHERE id = ?", (trade_id,))
            r = cursor.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Trade not found")
        return {
            "id": r["id"],
            "symbol": r["symbol"],
            "side": r["side"],
            "entry_price": r["entry_price"],
            "exit_price": r["exit_price"],
            "size": r["size"],
            "leverage": r["leverage"],
            "entry_time": r["entry_time"],
            "exit_time": r["exit_time"],
            "pnl": round(r["pnl"], 2),
            "fees": round(r["fees"], 2),
            "sl": r["sl"],
            "tp": r["tp"],
            "ai_confidence": r["ai_confidence"],
            "ai_reasoning_snapshot": json.loads(r["ai_reasoning_snapshot"] or "{}"),
            "user_notes": r["user_notes"]
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/demo/performance")
def get_demo_performance():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM trades")
            trades = cursor.fetchall()
            
        total_trades = len(trades)
        if total_trades == 0:
            return {
                "total_trades": 0, "wins": 0, "losses": 0, "win_rate": 0.0,
                "profit_factor": 0.0, "expectancy": 0.0, "avg_rr": 0.0,
                "largest_win": 0.0, "largest_loss": 0.0
            }
            
        wins, losses = 0, 0
        total_win_pnl, total_loss_pnl = 0.0, 0.0
        largest_win, largest_loss = 0.0, 0.0
        total_pnl = 0.0
        rr_values = []
        
        for t in trades:
            pnl = t["pnl"]
            total_pnl += pnl
            if pnl >= 0:
                wins += 1
                total_win_pnl += pnl
                if pnl > largest_win: largest_win = pnl
            else:
                losses += 1
                total_loss_pnl += abs(pnl)
                if pnl < largest_loss: largest_loss = pnl
                
            entry = t["entry_price"]
            sl = t["sl"]
            size = t["size"]
            if sl is not None and sl > 0:
                initial_risk = abs(entry - sl) * size
                if initial_risk > 0:
                    rr = pnl / initial_risk
                    rr_values.append(rr)
                    
        win_rate = (wins / total_trades) * 100
        profit_factor = (total_win_pnl / total_loss_pnl) if total_loss_pnl > 0 else (total_win_pnl if total_win_pnl > 0 else 0.0)
        expectancy = total_pnl / total_trades
        avg_rr = (sum(rr_values) / len(rr_values)) if rr_values else 0.0
        
        return {
            "total_trades": total_trades,
            "wins": wins,
            "losses": losses,
            "win_rate": round(win_rate, 2),
            "profit_factor": round(profit_factor, 2),
            "expectancy": round(expectancy, 2),
            "avg_rr": round(avg_rr, 2),
            "largest_win": round(largest_win, 2),
            "largest_loss": round(largest_loss, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/api/ws/ticks")
async def websocket_ticks(websocket: WebSocket):
    await websocket.accept()
    register_ws(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ticker":
                symbol = msg.get("symbol")
                price = float(msg.get("price"))
                update_live_price(symbol, price)
    except WebSocketDisconnect:
        pass
    finally:
        unregister_ws(websocket)

# ──────────────────────────────────────────────
#  Static File & Route Routing
# ──────────────────────────────────────────────

@app.get("/")
def serve_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found")

@app.get("/charts")
def serve_charts():
    charts_path = os.path.join(FRONTEND_DIR, "charts.html")
    if os.path.isfile(charts_path):
        return FileResponse(charts_path)
    raise HTTPException(status_code=404, detail="charts.html not found")

@app.get("/analysis")
def serve_analysis():
    analysis_path = os.path.join(FRONTEND_DIR, "analysis.html")
    if os.path.isfile(analysis_path):
        return FileResponse(analysis_path)
    raise HTTPException(status_code=404, detail="analysis.html not found")

@app.get("/simulator")
def serve_simulator():
    simulator_path = os.path.join(FRONTEND_DIR, "simulator.html")
    if os.path.isfile(simulator_path):
        return FileResponse(simulator_path)
    raise HTTPException(status_code=404, detail="simulator.html not found")

# Serve all CSS/JS and general assets directly from the frontend directory
app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")
