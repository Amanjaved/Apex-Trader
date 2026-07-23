from __future__ import annotations

import os
import sqlite3
import json
from contextlib import contextmanager

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "paper_trading.db")

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    # Ensure directory exists
    os.makedirs(DB_DIR, exist_ok=True)
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Demo Accounts Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS demo_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                balance REAL NOT NULL,
                equity REAL NOT NULL,
                reset_history TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now', 'utc'))
            )
        """)
        
        # 2. AI Signals Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                interval TEXT NOT NULL,
                bias TEXT NOT NULL,
                entry_price REAL NOT NULL,
                sl REAL,
                tp REAL,
                confidence REAL NOT NULL,
                reasoning_tags TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now', 'utc'))
            )
        """)
        
        # 3. Open Positions Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry_price REAL NOT NULL,
                size REAL NOT NULL,
                leverage REAL NOT NULL DEFAULT 1.0,
                sl REAL,
                tp REAL,
                status TEXT NOT NULL DEFAULT 'OPEN',
                linked_ai_signal_id INTEGER,
                created_at TEXT DEFAULT (datetime('now', 'utc')),
                FOREIGN KEY(linked_ai_signal_id) REFERENCES ai_signals(id)
            )
        """)
        
        # 4. Closed Trades Table (Trading Journal)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                size REAL NOT NULL,
                leverage REAL NOT NULL,
                entry_time TEXT NOT NULL,
                exit_time TEXT DEFAULT (datetime('now', 'utc')),
                pnl REAL NOT NULL,
                fees REAL NOT NULL,
                sl REAL,
                tp REAL,
                ai_confidence REAL,
                ai_reasoning_snapshot TEXT DEFAULT '{}',
                chart_state_snapshot TEXT DEFAULT '{}',
                user_notes TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now', 'utc'))
            )
        """)

        # 5. Historical Signal Log
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS signal_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT DEFAULT (datetime('now', 'utc')),
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                confidence_score REAL NOT NULL,
                factor_breakdown TEXT DEFAULT '{}',
                trade_recommendation TEXT DEFAULT '{}',
                outcome_status TEXT DEFAULT 'pending',
                outcome_recorded_at TEXT,
                actual_rr REAL
            )
        """)
        
        # 6. Local cache table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS local_cache (
                key TEXT PRIMARY KEY,
                value BLOB NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        
        # Pre-seed a default demo account with $10,000 if none exist
        cursor.execute("SELECT COUNT(*) FROM demo_accounts")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO demo_accounts (balance, equity, reset_history)
                VALUES (10000.0, 10000.0, '[]')
            """)

        # Migration: Repair existing trades' ai_reasoning_snapshot to ensure rr and grade are populated
        cursor.execute("SELECT id, symbol, side, entry_price, exit_price, sl, tp, pnl, ai_reasoning_snapshot FROM trades")
        rows = cursor.fetchall()
        for r in rows:
            trade_id = r["id"]
            snapshot_str = r["ai_reasoning_snapshot"]
            try:
                snapshot = json.loads(snapshot_str or "{}")
            except Exception:
                snapshot = {}
            
            # If "rr" or "grade" is not in the snapshot, let's calculate them and update
            if "rr" not in snapshot or "grade" not in snapshot:
                entry_price = r["entry_price"]
                exit_price = r["exit_price"]
                sl = r["sl"]
                tp = r["tp"]
                pnl = r["pnl"]
                side = r["side"]
                is_win = pnl > 0
                
                risk = abs(entry_price - sl) if sl and sl > 0 else 0.0
                reward = abs(exit_price - entry_price)
                rr = round(reward / risk, 2) if risk > 0 else 0.0
                
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
                
                snapshot["rr"] = rr
                snapshot["grade"] = grade
                if "summary" not in snapshot:
                    snapshot["summary"] = f"Stop Loss triggered." if not is_win and sl and ((side == "BUY" and exit_price <= sl) or (side == "SELL" and exit_price >= sl)) else f"Position closed."
                if "recommendation" not in snapshot:
                    snapshot["recommendation"] = "Follow system rules and risk guidelines."
                if "ai_notes" not in snapshot:
                    snapshot["ai_notes"] = f"Trade completed with risk-to-reward ratio of {rr:.2f}R."
                
                cursor.execute("UPDATE trades SET ai_reasoning_snapshot = ? WHERE id = ?", (json.dumps(snapshot), trade_id))

init_db()

def get_cached_item(key: str, ttl_seconds: float) -> bytes | None:
    import time
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value, updated_at FROM local_cache WHERE key = ?", (key,))
            row = cursor.fetchone()
            if row:
                value, updated_at = row["value"], row["updated_at"]
                if time.time() - updated_at < ttl_seconds:
                    return value
    except Exception:
        pass
    return None

def set_cached_item(key: str, value: bytes) -> None:
    import time
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO local_cache (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """, (key, sqlite3.Binary(value), time.time()))
    except Exception:
        pass
