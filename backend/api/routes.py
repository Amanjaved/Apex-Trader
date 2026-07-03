from __future__ import annotations

import http.server
import json
import os
import time
import gzip
import threading
from typing import Any, Dict, List, Tuple

from dotenv import load_dotenv
load_dotenv()



import backend.services as services
from backend.services.market_data import SUPPORTED_SYMBOLS, ALLOWED_INTERVALS, LIVE_INTERVALS
import backend.monitoring.telemetry as telemetry
from backend.repositories.db import get_db, init_db

# Initialize demo trading database on import
init_db()

# Paths Configuration
BASE_DIR     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# CSP Definition
CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "connect-src 'self' wss://stream.binance.com:9443 https://api.alternative.me; "
    "img-src 'self' data:; "
    "frame-ancestors 'none';"
)

# ──────────────────────────────────────────────
#  Rate limiter (sliding window per IP)
# ──────────────────────────────────────────────
_rl_db: Dict[str, List[float]] = {}
_rl_lock = threading.Lock()

# ──────────────────────────────────────────────
#  Demo Trading State
# ──────────────────────────────────────────────
_live_prices: Dict[str, float] = {}
_live_prices_lock = threading.Lock()

def update_live_price(symbol: str, price: float) -> None:
    with _live_prices_lock:
        _live_prices[symbol] = price

def get_live_price(symbol: str) -> float:
    with _live_prices_lock:
        return _live_prices.get(symbol, 0.0)

def is_rate_limited(ip: str, limit: int = 120, window: int = 60) -> bool:
    if ip in ("127.0.0.1", "localhost", "::1"):
        return False
    now = time.time()
    with _rl_lock:
        timestamps = _rl_db.get(ip, [])
        cutoff     = now - window
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= limit:
            _rl_db[ip] = timestamps
            return True
        timestamps.append(now)
        _rl_db[ip] = timestamps
        return False

# ──────────────────────────────────────────────
#  Routing & Request Handler
# ──────────────────────────────────────────────
def parse_qs(path: str) -> Tuple[str, Dict[str, str]]:
    if "?" not in path:
        return path, {}
    clean, qs = path.split("?", 1)
    params: Dict[str, str] = {}
    for part in qs.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[urllib.parse.unquote_plus(k)] = urllib.parse.unquote_plus(v)
    return clean, params

import urllib.parse

def validated_symbol(params: Dict[str, str]) -> str:
    sym = params.get("symbol", "BTCUSDT").upper().strip()
    return sym if sym in SUPPORTED_SYMBOLS else "BTCUSDT"

def validated_interval(params: Dict[str, str]) -> str:
    iv = params.get("interval", "1h").lower().strip()
    return iv if iv in ALLOWED_INTERVALS else "1h"

def validated_limit(params: Dict[str, str], default: int, mn: int, mx: int) -> int:
    try:
        return max(mn, min(int(params.get("limit", default)), mx))
    except (ValueError, TypeError):
        return default

def maybe_gzip(raw: bytes, accept_enc: str) -> Tuple[bytes, bool]:
    if "gzip" in accept_enc.lower() and len(raw) > 512:
        compressed = gzip.compress(raw, compresslevel=5)
        if len(compressed) < len(raw):
            return compressed, True
    return raw, False

class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # Silence per-request logs in console

    def _base_headers(self, status: int, content_type: str, length: int,
                      extra: list[Tuple[str, str]] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        if extra:
            for k, v in extra:
                self.send_header(k, v)
        self.end_headers()

    def _send_json(self, data: bytes, status: int = 200) -> None:
        ae = self.headers.get("Accept-Encoding", "")
        payload, gz = maybe_gzip(data, ae)
        extra = [("Content-Encoding", "gzip")] if gz else []
        self._base_headers(status, "application/json; charset=utf-8", len(payload), extra)
        self.wfile.write(payload)

    def _send_json_with_cookie(self, data: bytes, cookie_header: str, status: int = 200) -> None:
        ae = self.headers.get("Accept-Encoding", "")
        payload, gz = maybe_gzip(data, ae)
        extra = [("Set-Cookie", cookie_header)]
        if gz:
            extra.append(("Content-Encoding", "gzip"))
        self._base_headers(status, "application/json; charset=utf-8", len(payload), extra)
        self.wfile.write(payload)

    def _read_json_body(self) -> Dict[str, Any] | None:
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return {}
            body = self.rfile.read(content_length)
            return json.loads(body)
        except Exception:
            return None



    def _error(self, msg: str, status: int = 502) -> None:
        body = json.dumps({"error": msg, "status": "error"}).encode()
        self._send_json(body, status)

    def _offline(self) -> None:
        body = json.dumps({
            "status": "offline",
            "error":  "Market data temporarily unavailable",
            "message": "Market data temporarily unavailable"
        }).encode()
        self._send_json(body, 503)

    def _not_found(self) -> None:
        body = b"404 Not Found"
        self._base_headers(404, "text/plain", len(body))
        self.wfile.write(body)

    # ── Serve Static Assets ──
    def _serve_static(self, rel_path: str) -> None:
        # Prevent path traversal
        clean_path = rel_path.lstrip("/")
        if not clean_path or clean_path in ["", "index.html"]:
            clean_path = "index.html"

        # Clean URL mapping for /charts and /analysis
        if clean_path in ["charts", "charts/"]:
            clean_path = "charts.html"
        elif clean_path in ["analysis", "analysis/"]:
            clean_path = "analysis.html"

        target_file = os.path.abspath(os.path.join(FRONTEND_DIR, clean_path))
        
        # Verify path remains inside frontend directory
        if not target_file.startswith(os.path.abspath(FRONTEND_DIR)):
            self._not_found()
            return

        if not os.path.isfile(target_file):
            self._not_found()
            return

        # Guess MIME type
        ext = os.path.splitext(target_file)[1].lower()
        mime_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }
        content_type = mime_types.get(ext, "application/octet-stream")

        try:
            with open(target_file, "rb") as f:
                data = f.read()
            
            ae = self.headers.get("Accept-Encoding", "")
            payload, gz = maybe_gzip(data, ae)
            extra = [("Content-Encoding", "gzip")] if gz else []
            self._base_headers(200, content_type, len(payload), extra)
            self.wfile.write(payload)
        except Exception:
            self._not_found()

    # ── GET Router ──
    def do_GET(self) -> None:  # noqa: N802
        ip = self.client_address[0]
        if is_rate_limited(ip):
            body = json.dumps({"error": "Rate limit exceeded"}).encode()
            self._base_headers(429, "application/json", len(body), [("Retry-After", "60")])
            self.wfile.write(body)
            return

        path, params = parse_qs(self.path)

        # API routing registry
        if path.startswith("/api/"):
            ROUTES = {
                "/api/candles":   lambda: self._candles(params),
                "/api/ticker":    lambda: self._ticker(params),
                "/api/orderbook": lambda: self._orderbook(params),
                "/api/coins":     lambda: self._coins(),
                "/api/feargreed": lambda: self._feargreed(),
                "/api/news":      lambda: self._news(),
                "/api/health":    lambda: self._health(),
                "/api/ai/analysis": lambda: self._ai_analysis(params),
                "/api/auth/session": lambda: self._auth_session(),
                "/api/auth/config": lambda: self._auth_config(),
                "/api/ticks": lambda: self._update_tick(params),
            }
            fn = ROUTES.get(path)
            if fn:
                fn()
            else:
                self._not_found()
        elif path.startswith("/demo/"):
            DEMO_ROUTES = {
                "/demo/portfolio":   lambda: self._demo_portfolio(),
                "/demo/positions":   lambda: self._demo_positions(),
                "/demo/trades":      lambda: self._demo_trades(params),
                "/demo/performance": lambda: self._demo_performance(),
            }
            # Handle /demo/trades/{id} pattern
            if path.startswith("/demo/trades/") and len(path) > 13:
                try:
                    trade_id = int(path.split("/")[-1])
                    self._demo_trade_detail(trade_id)
                except ValueError:
                    self._not_found()
            else:
                fn = DEMO_ROUTES.get(path)
                if fn:
                    fn()
                else:
                    self._not_found()
        else:
            # Fall back to static file routing
            self._serve_static(path)

    # ── POST Router ──
    def do_POST(self) -> None:  # noqa: N802
        ip = self.client_address[0]
        if is_rate_limited(ip):
            body = json.dumps({"error": "Rate limit exceeded"}).encode()
            self._base_headers(429, "application/json", len(body), [("Retry-After", "60")])
            self.wfile.write(body)
            return

        path, params = parse_qs(self.path)
        if path == "/api/ai/chat":
            self._ai_chat()
            return
        elif path == "/demo/open":
            self._demo_open()
            return
        elif path == "/demo/close":
            self._demo_close()
            return
        elif path == "/demo/modify":
            self._demo_modify()
            return
        elif path == "/demo/reset":
            self._demo_reset(params)
            return

        self._not_found()

    # ── Service Endpoints ──
    def _candles(self, params: Dict[str, str]) -> None:
        symbol   = validated_symbol(params)
        interval = validated_interval(params)
        limit    = validated_limit(params, 500, 1, 1000)
        try:
            self._send_json(services.fetch_candles(symbol, interval, limit))
        except Exception as e:
            print(f"  [candles] {e}")
            self._offline()

    def _ticker(self, params: Dict[str, str]) -> None:
        symbol = validated_symbol(params)
        try:
            self._send_json(services.fetch_ticker(symbol))
        except Exception as e:
            print(f"  [ticker] {e}")
            self._offline()

    def _orderbook(self, params: Dict[str, str]) -> None:
        symbol = validated_symbol(params)
        limit  = validated_limit(params, 20, 5, 100)
        try:
            self._send_json(services.fetch_orderbook(symbol, limit))
        except Exception as e:
            print(f"  [orderbook] {e}")
            self._offline()

    def _coins(self) -> None:
        try:
            self._send_json(services.fetch_coins())
        except Exception as e:
            print(f"  [coins] {e}")
            self._offline()

    def _feargreed(self) -> None:
        try:
            self._send_json(services.fetch_feargreed())
        except Exception as e:
            print(f"  [feargreed] {e}")
            self._offline()

    def _news(self) -> None:
        try:
            self._send_json(services.fetch_news())
        except Exception as e:
            print(f"  [news] {e}")
            self._offline()

    def _health(self) -> None:
        stats = telemetry.get_health_stats()
        body = json.dumps(stats).encode()
        self._send_json(body, 200)

    def _ai_analysis(self, params: Dict[str, str]) -> None:
        symbol   = validated_symbol(params)
        interval = validated_interval(params)
        try:
            from backend.ai.copilot import AICopilot
            copilot = AICopilot()
            analysis_dict = copilot.analyze_market_structure(symbol, interval)
            self._send_json(json.dumps(analysis_dict).encode())
        except Exception as e:
            print(f"  [ai_analysis] {e}")
            self._error(str(e))

    def _ai_chat(self) -> None:
        body = self._read_json_body()
        if body is None:
            self._error("Invalid JSON body", 400)
            return
        
        symbol   = body.get("symbol", "BTCUSDT").upper().strip()
        interval = body.get("interval", "1h").lower().strip()
        message  = body.get("message", "").strip()
        
        if symbol not in SUPPORTED_SYMBOLS:
            symbol = "BTCUSDT"
        if interval not in ALLOWED_INTERVALS:
            interval = "1h"
            
        try:
            from backend.ai.copilot import AICopilot
            copilot = AICopilot()
            reply = copilot.chat_query(symbol, interval, message)
            self._send_json(json.dumps({"response": reply}).encode())
        except Exception as e:
            print(f"  [ai_chat] {e}")
            self._error(str(e))

    # ── Authentication Endpoints ──
    def _auth_session(self) -> None:
        user = {"id": "guest", "email": "guest@apextrader.pro"}
        body = json.dumps({"status": "success", "user": user}).encode()
        self._send_json(body, 200)

    def _auth_config(self) -> None:
        body = json.dumps({
            "supabaseEnabled": False,
            "supabaseUrl": "",
            "supabaseKey": ""
        }).encode()
        self._send_json(body, 200)

    def _update_tick(self, params: Dict[str, str]) -> None:
        """REST endpoint for frontend to push live prices for demo trading P&L calculation"""
        symbol = params.get("symbol", "BTCUSDT").upper().strip()
        try:
            price = float(params.get("price", 0))
        except (ValueError, TypeError):
            self._error("Invalid price", 400)
            return
        if price > 0:
            update_live_price(symbol, price)
        self._send_json(json.dumps({"status": "ok"}).encode())

    # ── Demo Trading Endpoints ──
    def _demo_portfolio(self) -> None:
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM demo_accounts ORDER BY id DESC LIMIT 1")
                acc = cursor.fetchone()
                if not acc:
                    data = {"balance": 10000.0, "equity": 10000.0, "used_margin": 0.0, "free_margin": 10000.0, "open_risk_pct": 0.0}
                    self._send_json(json.dumps(data).encode())
                    return

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

                    current_price = get_live_price(symbol) or entry_price

                    if side == "BUY":
                        unrealized = (current_price - entry_price) * size
                        if sl and sl > 0:
                            risk = (entry_price - sl) * size
                            if risk > 0:
                                total_risk += risk
                    else:
                        unrealized = (entry_price - current_price) * size
                        if sl and sl > 0:
                            risk = (sl - entry_price) * size
                            if risk > 0:
                                total_risk += risk

                    total_unrealized_pnl += unrealized
                    used_margin += (size * entry_price) / leverage

                equity = balance + total_unrealized_pnl
                free_margin = max(0.0, equity - used_margin)
                open_risk_pct = (total_risk / balance * 100) if balance > 0 else 0.0

                cursor.execute("UPDATE demo_accounts SET equity = ? WHERE id = ?", (equity, acc["id"]))

                data = {
                    "balance": round(balance, 2),
                    "equity": round(equity, 2),
                    "used_margin": round(used_margin, 2),
                    "free_margin": round(free_margin, 2),
                    "open_risk_pct": round(open_risk_pct, 2)
                }
                self._send_json(json.dumps(data).encode())
        except Exception as e:
            print(f"  [demo_portfolio] {e}")
            self._error(str(e))

    def _demo_positions(self) -> None:
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

                current_price = get_live_price(symbol) or entry_price

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
            self._send_json(json.dumps(res).encode())
        except Exception as e:
            print(f"  [demo_positions] {e}")
            self._error(str(e))

    def _demo_trades(self, params: Dict[str, str]) -> None:
        try:
            limit = int(params.get("limit", 100))
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
            self._send_json(json.dumps(res).encode())
        except Exception as e:
            print(f"  [demo_trades] {e}")
            self._error(str(e))

    def _demo_trade_detail(self, trade_id: int) -> None:
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM trades WHERE id = ?", (trade_id,))
                r = cursor.fetchone()
            if not r:
                self._error("Trade not found", 404)
                return
            data = {
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
            self._send_json(json.dumps(data).encode())
        except Exception as e:
            print(f"  [demo_trade_detail] {e}")
            self._error(str(e))

    def _demo_performance(self) -> None:
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM trades")
                trades = cursor.fetchall()

            total_trades = len(trades)
            if total_trades == 0:
                data = {
                    "total_trades": 0, "wins": 0, "losses": 0, "win_rate": 0.0,
                    "profit_factor": 0.0, "expectancy": 0.0, "avg_rr": 0.0,
                    "largest_win": 0.0, "largest_loss": 0.0
                }
                self._send_json(json.dumps(data).encode())
                return

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

            data = {
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
            self._send_json(json.dumps(data).encode())
        except Exception as e:
            print(f"  [demo_performance] {e}")
            self._error(str(e))

    def _demo_open(self) -> None:
        body = self._read_json_body()
        if body is None:
            self._error("Invalid JSON body", 400)
            return

        symbol = body.get("symbol", "BTCUSDT").upper().strip()
        side = body.get("side", "BUY").upper().strip()
        size = float(body.get("size", 0))
        leverage = float(body.get("leverage", 1.0))
        sl = body.get("sl")
        tp = body.get("tp")
        price = body.get("price")

        if side not in ("BUY", "SELL"):
            self._error("Invalid side, must be BUY or SELL", 400)
            return
        if size <= 0:
            self._error("Size must be positive", 400)
            return

        try:
            # Resolve execution price
            if not price or price <= 0:
                price = get_live_price(symbol)
                if not price:
                    ticker_raw = json.loads(services.fetch_ticker(symbol))
                    price = float(ticker_raw.get("lastPrice", 0))

            if not price or price <= 0:
                self._error("Cannot resolve market price", 400)
                return

            position_cost = size * price
            required_margin = position_cost / leverage

            # Check margin
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM demo_accounts ORDER BY id DESC LIMIT 1")
                acc = cursor.fetchone()
                if not acc:
                    self._error("No demo account found", 400)
                    return

                # Calculate free margin
                balance = acc["balance"]
                cursor.execute("SELECT * FROM positions WHERE status = 'OPEN'")
                open_positions = cursor.fetchall()
                used_margin = sum((p["size"] * p["entry_price"]) / p["leverage"] for p in open_positions)
                free_margin = balance - used_margin

                if free_margin < required_margin:
                    self._error(f"Insufficient margin. Required: {required_margin:.2f}, Available: {free_margin:.2f}", 400)
                    return

                entry_fee = position_cost * 0.0004
                new_balance = balance - entry_fee

                cursor.execute("UPDATE demo_accounts SET balance = ?, equity = ? WHERE id = ?", (new_balance, new_balance, acc["id"]))

                cursor.execute("""
                    INSERT INTO positions (symbol, side, entry_price, size, leverage, sl, tp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (symbol, side, price, size, leverage, sl, tp))
                pos_id = cursor.lastrowid

            data = {
                "id": pos_id,
                "symbol": symbol,
                "side": side,
                "entry_price": price,
                "size": size,
                "leverage": leverage,
                "entry_fee": round(entry_fee, 2)
            }
            self._send_json(json.dumps(data).encode())
        except Exception as e:
            print(f"  [demo_open] {e}")
            self._error(str(e))

    def _demo_close(self) -> None:
        body = self._read_json_body()
        if body is None:
            self._error("Invalid JSON body", 400)
            return

        position_id = body.get("position_id")
        exit_price = body.get("price")

        if position_id is None:
            self._error("position_id required", 400)
            return

        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM positions WHERE id = ?", (position_id,))
                pos = cursor.fetchone()
                if not pos:
                    self._error("Position not found", 404)
                    return

                symbol = pos["symbol"]
                side = pos["side"]
                entry_price = pos["entry_price"]
                size = pos["size"]
                leverage = pos["leverage"]
                entry_time = pos["created_at"]
                sl = pos["sl"]
                tp = pos["tp"]

            # Resolve exit price
            if not exit_price or exit_price <= 0:
                exit_price = get_live_price(symbol)
                if not exit_price:
                    ticker_raw = json.loads(services.fetch_ticker(symbol))
                    exit_price = float(ticker_raw.get("lastPrice", 0))

            if not exit_price or exit_price <= 0:
                self._error("Cannot resolve exit price", 400)
                return

            # Calculate P&L
            if side == "BUY":
                pnl = (exit_price - entry_price) * size
            else:
                pnl = (entry_price - exit_price) * size

            exit_fee = exit_price * size * 0.0004

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM demo_accounts ORDER BY id DESC LIMIT 1")
                acc = cursor.fetchone()
                if not acc:
                    self._error("No demo account found", 400)
                    return

                new_balance = acc["balance"] + pnl - exit_fee
                cursor.execute("UPDATE demo_accounts SET balance = ?, equity = ? WHERE id = ?", (new_balance, new_balance, acc["id"]))

                # Generate AI review
                is_win = pnl > 0
                risk = abs(entry_price - sl) if sl and sl > 0 else 0.0
                reward = abs(exit_price - entry_price)
                rr = round(reward / risk, 2) if risk > 0 else 0.0

                if is_win:
                    grade = "A+" if rr >= 3.0 else "A" if rr >= 2.0 else "B" if rr >= 1.0 else "C"
                else:
                    grade = "D" if rr < 1.0 else "F"

                tags = ["Trend Following", "Price Action"] if is_win else ["Volatility", "Slippage"]
                summary = f"{'Successful' if is_win else 'Unsuccessful'} {side} trade."
                recommendation = "Follow system rules and risk guidelines."
                ai_notes = f"Trade completed with R:R ratio of {rr:.2f}R."

                ai_snapshot = {
                    "grade": grade,
                    "rr": rr,
                    "summary": summary,
                    "recommendation": recommendation,
                    "ai_notes": ai_notes,
                    "tags": tags
                }

                cursor.execute("""
                    INSERT INTO trades (symbol, side, entry_price, exit_price, size, leverage, entry_time, pnl, fees, sl, tp, ai_reasoning_snapshot, user_notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (symbol, side, entry_price, exit_price, size, leverage, entry_time, pnl, exit_fee, sl, tp, json.dumps(ai_snapshot), summary))

                cursor.execute("DELETE FROM positions WHERE id = ?", (position_id,))

            data = {
                "status": "closed",
                "symbol": symbol,
                "pnl": round(pnl, 2),
                "fees": round(exit_fee, 2),
                "exit_price": exit_price
            }
            self._send_json(json.dumps(data).encode())
        except Exception as e:
            print(f"  [demo_close] {e}")
            self._error(str(e))

    def _demo_modify(self) -> None:
        body = self._read_json_body()
        if body is None:
            self._error("Invalid JSON body", 400)
            return

        position_id = body.get("position_id")
        sl = body.get("sl")
        tp = body.get("tp")

        if position_id is None:
            self._error("position_id required", 400)
            return

        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM positions WHERE id = ?", (position_id,))
                if not cursor.fetchone():
                    self._error("Position not found", 404)
                    return
                cursor.execute("UPDATE positions SET sl = ?, tp = ? WHERE id = ?", (sl, tp, position_id))
            self._send_json(json.dumps({"status": "success"}).encode())
        except Exception as e:
            print(f"  [demo_modify] {e}")
            self._error(str(e))

    def _demo_reset(self, params: Dict[str, str]) -> None:
        try:
            balance = float(params.get("balance", 10000.0))
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
                    cursor.execute("UPDATE demo_accounts SET balance = ?, equity = ?, reset_history = ? WHERE id = ?", (balance, balance, json.dumps(history), acc["id"]))
                else:
                    cursor.execute("INSERT INTO demo_accounts (balance, equity, reset_history) VALUES (?, ?, '[]')", (balance, balance))
                cursor.execute("DELETE FROM positions")
            self._send_json(json.dumps({"status": "success", "balance": balance}).encode())
        except Exception as e:
            print(f"  [demo_reset] {e}")
            self._error(str(e))
