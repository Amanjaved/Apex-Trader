from __future__ import annotations

import http.server
import json
import os
import time
import gzip
import threading
from typing import Dict, List, Tuple

import backend.services as services
from backend.services.market_data import SUPPORTED_SYMBOLS, ALLOWED_INTERVALS, LIVE_INTERVALS
import backend.monitoring.telemetry as telemetry

# Paths Configuration
BASE_DIR     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# CSP Definition
CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
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

def is_rate_limited(ip: str, limit: int = 120, window: int = 60) -> bool:
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
            }
            fn = ROUTES.get(path)
            if fn:
                fn()
            else:
                self._not_found()
        else:
            # Fall back to static file routing
            self._serve_static(path)

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
