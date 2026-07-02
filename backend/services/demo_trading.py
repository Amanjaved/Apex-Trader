from __future__ import annotations

import json
import time
import threading
import asyncio
from typing import Dict, List, Optional
from pydantic import BaseModel
from fastapi import WebSocket

import backend.services as services
from backend.repositories.db import get_db

# ──────────────────────────────────────────────
#  State & Locks
# ──────────────────────────────────────────────
_live_prices: Dict[str, float] = {}
_live_prices_lock = threading.Lock()

_ws_connections: List[WebSocket] = []
_main_loop: asyncio.AbstractEventLoop | None = None

# ──────────────────────────────────────────────
#  Pydantic Models
# ──────────────────────────────────────────────
class LinkedAISignal(BaseModel):
    interval: str
    bias: str
    entry_price: float
    sl: Optional[float] = None
    tp: Optional[float] = None
    confidence: float
    reasoning_tags: List[str] = []

class OpenPositionRequest(BaseModel):
    symbol: str
    side: str  # BUY or SELL
    size: float
    leverage: float = 1.0
    sl: Optional[float] = None
    tp: Optional[float] = None
    price: Optional[float] = None
    linked_ai_signal: Optional[LinkedAISignal] = None

class ClosePositionRequest(BaseModel):
    position_id: int
    size: Optional[float] = None  # None means full close
    price: Optional[float] = None

class ModifyPositionRequest(BaseModel):
    position_id: int
    sl: Optional[float] = None
    tp: Optional[float] = None

# ──────────────────────────────────────────────
#  WebSocket Sync Functions
# ──────────────────────────────────────────────
def init_loop(loop: asyncio.AbstractEventLoop):
    global _main_loop
    _main_loop = loop

def register_ws(ws: WebSocket):
    if ws not in _ws_connections:
        _ws_connections.append(ws)

def unregister_ws(ws: WebSocket):
    if ws in _ws_connections:
        try:
            _ws_connections.remove(ws)
        except ValueError:
            pass

def broadcast_ws(payload: dict):
    if not _main_loop:
        return
    message = json.dumps(payload)
    for ws in list(_ws_connections):
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), _main_loop)
        except Exception:
            try:
                _ws_connections.remove(ws)
            except ValueError:
                pass

# ──────────────────────────────────────────────
#  Live Tick & Position Trigger Engine
# ──────────────────────────────────────────────
def update_live_price(symbol: str, price: float):
    with _live_prices_lock:
        _live_prices[symbol] = price
    # Run trigger check for positions
    check_triggers(symbol, price)

def check_triggers(symbol: str, price: float):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE symbol = ? AND status = 'OPEN'", (symbol,))
        open_positions = cursor.fetchall()
        
        for pos in open_positions:
            pos_id = pos["id"]
            side = pos["side"]
            sl = pos["sl"]
            tp = pos["tp"]
            entry_price = pos["entry_price"]
            size = pos["size"]
            
            trigger_hit = False
            exit_price = price
            reason = ""
            
            if side == "BUY":
                if sl is not None and sl > 0 and price <= sl:
                    trigger_hit = True
                    exit_price = sl
                    reason = "Triggered Stop Loss"
                elif tp is not None and tp > 0 and price >= tp:
                    trigger_hit = True
                    exit_price = tp
                    reason = "Triggered Take Profit"
            elif side == "SELL":
                if sl is not None and sl > 0 and price >= sl:
                    trigger_hit = True
                    exit_price = sl
                    reason = "Triggered Stop Loss"
                elif tp is not None and tp > 0 and price <= tp:
                    trigger_hit = True
                    exit_price = tp
                    reason = "Triggered Take Profit"
                    
            if trigger_hit:
                try:
                    close_position_internal(pos_id, exit_price, reason)
                except Exception as e:
                    print(f"[Trigger Engine] Error auto-closing position {pos_id}: {e}")

# ──────────────────────────────────────────────
#  Portfolio & Account Math
# ──────────────────────────────────────────────
def calculate_portfolio() -> dict:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM demo_accounts ORDER BY id DESC LIMIT 1")
        acc = cursor.fetchone()
        if not acc:
            return {"balance": 10000.0, "equity": 10000.0, "used_margin": 0.0, "free_margin": 10000.0, "open_risk_pct": 0.0}
            
        balance = acc["balance"]
        
        cursor.execute("SELECT * FROM positions WHERE status = 'OPEN'")
        open_positions = cursor.fetchall()
        
        total_unrealized_pnl = 0.0
        used_margin = 0.0
        total_risk = 0.0
        
        for pos in open_positions:
            symbol = pos["symbol"]
            side = pos["side"]
            entry_price = pos["entry_price"]
            size = pos["size"]
            leverage = pos["leverage"]
            sl = pos["sl"]
            
            with _live_prices_lock:
                current_price = _live_prices.get(symbol, entry_price)
                
            if side == "BUY":
                unrealized = (current_price - entry_price) * size
                if sl is not None and sl > 0:
                    risk = (entry_price - sl) * size
                    if risk > 0:
                        total_risk += risk
            else:
                unrealized = (entry_price - current_price) * size
                if sl is not None and sl > 0:
                    risk = (sl - entry_price) * size
                    if risk > 0:
                        total_risk += risk
                        
            total_unrealized_pnl += unrealized
            used_margin += (size * entry_price) / leverage
            
        equity = balance + total_unrealized_pnl
        free_margin = max(0.0, equity - used_margin)
        open_risk_pct = (total_risk / balance * 100) if balance > 0 else 0.0
        
        cursor.execute("UPDATE demo_accounts SET equity = ? WHERE id = ?", (equity, acc["id"]))
        
        return {
            "balance": round(balance, 2),
            "equity": round(equity, 2),
            "used_margin": round(used_margin, 2),
            "free_margin": round(free_margin, 2),
            "open_risk_pct": round(open_risk_pct, 2)
        }

# ──────────────────────────────────────────────
#  Core Trade Execution Operations
# ──────────────────────────────────────────────
def open_position_internal(req: OpenPositionRequest) -> dict:
    # Resolve execution price
    if req.price is None or req.price <= 0:
        with _live_prices_lock:
            current_price = _live_prices.get(req.symbol)
        if not current_price:
            try:
                ticker_raw = json.loads(services.fetch_ticker(req.symbol))
                current_price = float(ticker_raw["lastPrice"])
            except Exception:
                raise ValueError(f"Market price for {req.symbol} is currently unavailable.")
    else:
        current_price = req.price
        
    position_cost = req.size * current_price
    required_margin = position_cost / req.leverage
    
    portfolio = calculate_portfolio()
    if portfolio["free_margin"] < required_margin:
        raise ValueError(f"Insufficient free margin. Required: ${required_margin:.2f}, Available: ${portfolio['free_margin']:.2f}")
        
    entry_fee = position_cost * 0.0004
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Deduct entry fee
        cursor.execute("SELECT id, balance FROM demo_accounts ORDER BY id DESC LIMIT 1")
        acc = cursor.fetchone()
        if not acc:
            raise ValueError("No demo account found.")
        new_balance = acc["balance"] - entry_fee
        cursor.execute("UPDATE demo_accounts SET balance = ?, equity = ? WHERE id = ?", (new_balance, new_balance, acc["id"]))
        
        # Handle linked AI signal mapping
        linked_ai_signal_id = None
        if req.linked_ai_signal:
            sig = req.linked_ai_signal
            cursor.execute("""
                INSERT INTO ai_signals (symbol, interval, bias, entry_price, sl, tp, confidence, reasoning_tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (req.symbol, sig.interval, sig.bias, sig.entry_price, sig.sl, sig.tp, sig.confidence, json.dumps(sig.reasoning_tags)))
            linked_ai_signal_id = cursor.lastrowid
            
        # Insert open position record
        cursor.execute("""
            INSERT INTO positions (symbol, side, entry_price, size, leverage, sl, tp, linked_ai_signal_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (req.symbol, req.side.upper(), current_price, req.size, req.leverage, req.sl, req.tp, linked_ai_signal_id))
        pos_id = cursor.lastrowid
        
    broadcast_ws({
        "type": "trade_opened",
        "id": pos_id,
        "symbol": req.symbol,
        "side": req.side.upper(),
        "size": req.size,
        "entry_price": current_price
    })
    
    return {
        "id": pos_id,
        "symbol": req.symbol,
        "side": req.side.upper(),
        "entry_price": current_price,
        "size": req.size,
        "leverage": req.leverage,
        "entry_fee": entry_fee
    }

def generate_ai_review(side: str, entry_price: float, exit_price: float, pnl: float, sl: Optional[float], tp: Optional[float], ai_signal: Optional[dict]) -> dict:
    is_win = pnl > 0
    
    # Calculate R:R achieved
    risk = abs(entry_price - sl) if sl and sl > 0 else 0.0
    reward = abs(exit_price - entry_price)
    rr = round(reward / risk, 2) if risk > 0 else 0.0
    
    # Determine Grade
    if is_win:
        if rr >= 3.0:
            grade = "A+"
        elif rr >= 2.0:
            grade = "A"
        elif rr >= 1.0:
            grade = "B"
        else:
            grade = "C"
    else:
        grade = "D" if rr < 1.0 else "F"
        
    reasoning_tags = []
    if ai_signal and ai_signal.get("reasoning_tags"):
        try:
            reasoning_tags = json.loads(ai_signal["reasoning_tags"])
        except Exception:
            reasoning_tags = []
    if not reasoning_tags:
        # Fallback tags based on basic outcomes
        reasoning_tags = ["Trend Following", "Price Action"] if is_win else ["Volatility", "Slippage"]

    tags_str = ", ".join(reasoning_tags)
    
    if is_win:
        summary = f"Successful {side} execution conforming to {tags_str} structures."
        recommendation = "Excellent target discipline. Continue following high-confidence setups and letting them mature to Take Profit targets."
        ai_notes = f"Conviction was {ai_signal.get('confidence', 75.0) if ai_signal else 75.0:.0f}% at entry. Price targets met with achieved risk-to-reward ratio of {rr:.1f}R."
    else:
        # Loss analysis
        if sl and ((side == "BUY" and exit_price <= sl) or (side == "SELL" and exit_price >= sl)):
            summary = f"Stop Loss triggered at {exit_price:.2f}. Position closed on invalidation."
            recommendation = "Always set stop loss levels to respect structural boundaries. Consider waiting for confirmation on lower-timeframe pivots."
            ai_notes = f"Position invalidated. Exit triggered at defined risk boundary. Managed loss size according to parameters."
        else:
            summary = "Position closed manually before hitting invalidation zones."
            recommendation = "Avoid premature closure of valid setups unless immediate macro announcements or sentiment changes occur."
            ai_notes = f"Manual exit triggered before Stop Loss or Take Profit targets were reached. Realized partial loss."

    return {
        "grade": grade,
        "rr": rr,
        "summary": summary,
        "recommendation": recommendation,
        "ai_notes": ai_notes,
        "tags": reasoning_tags
    }

def close_position_internal(pos_id: int, exit_price: Optional[float] = None, notes: str = "Manual Close") -> dict:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE id = ?", (pos_id,))
        pos = cursor.fetchone()
        if not pos:
            raise ValueError(f"Position ID {pos_id} not found.")
            
        symbol = pos["symbol"]
        side = pos["side"]
        entry_price = pos["entry_price"]
        size = pos["size"]
        leverage = pos["leverage"]
        entry_time = pos["created_at"]
        linked_ai_signal_id = pos["linked_ai_signal_id"]
        
    # Resolve execution exit price
    if exit_price is None or exit_price <= 0:
        with _live_prices_lock:
            exit_price = _live_prices.get(symbol)
        if not exit_price:
            try:
                ticker_raw = json.loads(services.fetch_ticker(symbol))
                exit_price = float(ticker_raw["lastPrice"])
            except Exception:
                raise ValueError("Market exit price unavailable.")
                
    # Calculate P&L
    if side == "BUY":
        pnl = (exit_price - entry_price) * size
    else:
        pnl = (entry_price - exit_price) * size
        
    exit_fee = exit_price * size * 0.0004
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Adjust account balance
        cursor.execute("SELECT id, balance FROM demo_accounts ORDER BY id DESC LIMIT 1")
        acc = cursor.fetchone()
        if not acc:
            raise ValueError("No demo account found.")
        new_balance = acc["balance"] + pnl - exit_fee
        cursor.execute("UPDATE demo_accounts SET balance = ?, equity = ? WHERE id = ?", (new_balance, new_balance, acc["id"]))
        
        # Retrieve original AI signal details
        ai_confidence = None
        ai_signal_dict = None
        if linked_ai_signal_id:
            cursor.execute("SELECT * FROM ai_signals WHERE id = ?", (linked_ai_signal_id,))
            sig = cursor.fetchone()
            if sig:
                ai_confidence = sig["confidence"]
                ai_signal_dict = {
                    "bias": sig["bias"],
                    "confidence": sig["confidence"],
                    "reasoning_tags": sig["reasoning_tags"]
                }
                
        # Generate AI Review
        review = generate_ai_review(side, entry_price, exit_price, pnl, pos["sl"], pos["tp"], ai_signal_dict)
        ai_reasoning_snapshot = json.dumps(review)
        
        # Insert closed journal log
        cursor.execute("""
            INSERT INTO trades (symbol, side, entry_price, exit_price, size, leverage, entry_time, pnl, fees, sl, tp, ai_confidence, ai_reasoning_snapshot, user_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (symbol, side, entry_price, exit_price, size, leverage, entry_time, pnl, exit_fee, pos["sl"], pos["tp"], ai_confidence, ai_reasoning_snapshot, review["summary"]))
        
        # Remove position from open stack
        cursor.execute("DELETE FROM positions WHERE id = ?", (pos_id,))
        
    broadcast_ws({
        "type": "trade_closed",
        "symbol": symbol,
        "side": side,
        "pnl": pnl,
        "fees": exit_fee,
        "exit_price": exit_price,
        "notes": review["summary"]
    })
    
    return {
        "status": "closed",
        "symbol": symbol,
        "pnl": round(pnl, 2),
        "fees": round(exit_fee, 2),
        "exit_price": exit_price,
        "notes": review["summary"]
    }
