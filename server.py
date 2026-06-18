"""
BTC Live Chart — Python Edition (v3.0)
=======================================
Zero-dependency server — uses only the Python standard library.

Features
--------
• Gzip compression on all JSON responses (when client supports it)
• Smart per-endpoint caching with tailored TTLs
• Multi-coin support (10 major trading pairs)
• Order-book depth, Fear & Greed index, and bulk-coin endpoints
• Colored startup banner listing every route

Run:
    python server.py

Then open:  http://localhost:3000
"""

from __future__ import annotations

import gzip
import http.server
import json
import os
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import email.utils
import xml.etree.ElementTree as ET
from typing import Dict, Tuple
import math
import concurrent.futures

# ──────────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────────

PORT = 3000
HTML_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")

# Supported trading pairs (Binance symbol format)
SUPPORTED_SYMBOLS = frozenset({
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
})

# Allowed candle intervals (Binance API values)
ALLOWED_INTERVALS = frozenset({
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "12h",
    "1d", "1w", "1M",
})

# Intervals considered "live" (short-term) — get a shorter cache TTL
LIVE_INTERVALS = frozenset({"1m", "3m", "5m", "15m", "30m"})

# ── Binance Base Endpoints & mirrors ─────────
BINANCE_BASES = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://data-api.binance.vision"
]
FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1"
NEWS_URL = "http://feeds.feedburner.com/Coindesk"

# Common request headers sent to upstream APIs
UPSTREAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BTCChart/3.0)",
    "Accept": "application/json",
}

# ──────────────────────────────────────────────
#  Cache layer — per-endpoint TTLs
# ──────────────────────────────────────────────

# TTL constants (seconds)
TTL_TICKER      = 3
TTL_CANDLES_LIVE = 5    # intervals 1m–30m
TTL_CANDLES_LONG = 15   # intervals 1h+
TTL_ORDERBOOK   = 2
TTL_FEAR_GREED  = 300   # 5 minutes
TTL_MULTI_COINS = 5
TTL_NEWS        = 60    # 1 minute

# Thread-safe cache: url -> (timestamp, raw_bytes)
_cache: Dict[str, Tuple[float, bytes]] = {}
_cache_lock = threading.Lock()


def fetch_url(url: str, ttl: int) -> bytes:
    """Fetch *url* with an in-memory cache keyed by the full URL.

    Parameters
    ----------
    url : str
        Fully-qualified URL to fetch.
    ttl : int
        Time-to-live in seconds for this particular cache entry.

    Returns
    -------
    bytes
        Raw response body from the upstream API (or cache).
    """
    now = time.time()

    with _cache_lock:
        if url in _cache:
            ts, data = _cache[url]
            if now - ts < ttl:
                return data

    # Cache miss or stale — fetch fresh data (outside the lock)
    req = urllib.request.Request(url, headers=UPSTREAM_HEADERS)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()

    with _cache_lock:
        _cache[url] = (now, data)

    return data


# ──────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────

def parse_query_params(path: str) -> Tuple[str, Dict[str, str]]:
    """Split a request path into (clean_path, query_params_dict)."""
    if "?" not in path:
        return path, {}
    clean, qs = path.split("?", 1)
    params: Dict[str, str] = {}
    for part in qs.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k] = v
    return clean, params


def validate_symbol(params: Dict[str, str]) -> str:
    """Return a validated Binance symbol from query params (default BTCUSDT)."""
    sym = params.get("symbol", "BTCUSDT").upper()
    return sym if sym in SUPPORTED_SYMBOLS else "BTCUSDT"


def maybe_gzip(raw: bytes, accept_encoding: str) -> Tuple[bytes, bool]:
    """Compress *raw* with gzip if the client advertises support.

    Returns (payload, was_compressed).
    """
    if "gzip" in accept_encoding.lower():
        compressed = gzip.compress(raw, compresslevel=6)
        # Only use compressed version if it's actually smaller
        if len(compressed) < len(raw):
            return compressed, True
    return raw, False


# ──────────────────────────────────────────────
#  Input Validation Helpers
# ──────────────────────────────────────────────

def validate_limit(params: Dict[str, str], default: int = 200, min_val: int = 1, max_val: int = 1000) -> int:
    """Safely parse and clamp numeric limit parameter from query arguments."""
    raw_limit = params.get("limit")
    if raw_limit is None:
        return default
    try:
        val = int(raw_limit)
        return max(min_val, min(val, max_val))
    except ValueError:
        return default


# ──────────────────────────────────────────────
#  IP Rate Limiting Layer
# ──────────────────────────────────────────────

_rate_limit_db: Dict[str, list[float]] = {}
_rate_limit_lock = threading.Lock()

def is_rate_limited(ip: str, limit: int = 60, window: int = 60) -> bool:
    """Thread-safe slide-window rate limiter checking if *ip* exceeds *limit* requests per *window* seconds."""
    now = time.time()
    with _rate_limit_lock:
        if ip not in _rate_limit_db:
            _rate_limit_db[ip] = [now]
            return False
            
        timestamps = _rate_limit_db[ip]
        cutoff = now - window
        timestamps = [t for t in timestamps if t > cutoff]
        
        if len(timestamps) >= limit:
            _rate_limit_db[ip] = timestamps
            return True
            
        timestamps.append(now)
        _rate_limit_db[ip] = timestamps
        return False


# ──────────────────────────────────────────────
#  Upstream Failover Client
# ──────────────────────────────────────────────

def fetch_binance(path: str, ttl: int) -> bytes:
    """Fetch *path* from Binance API with backup failovers and in-memory cache.
    
    Keys cache by path + query string rather than absolute URL.
    """
    now = time.time()
    
    with _cache_lock:
        if path in _cache:
            ts, data = _cache[path]
            if now - ts < ttl:
                return data
                
    # Cache miss or stale — failover bases
    last_error = None
    for base in BINANCE_BASES:
        url = base + path
        try:
            req = urllib.request.Request(url, headers=UPSTREAM_HEADERS)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = resp.read()
            with _cache_lock:
                _cache[path] = (now, data)
            return data
        except Exception as exc:
            print(f"  [Binance API Failover] Failed to fetch from {base}: {exc}")
            last_error = exc
            
    raise last_error or RuntimeError("All Binance endpoints failed")

#  HTTP request handler
# ──────────────────────────────────────────────

class Handler(http.server.BaseHTTPRequestHandler):
    """Minimal request handler with JSON/gzip helpers."""

    # Silence per-request log lines from BaseHTTPRequestHandler
    def log_message(self, fmt, *args):  # noqa: D401
        pass

    # ── Security & Response helpers ──────────

    def send_response_with_security_headers(self, status: int, content_type: str, content_length: int, extra_headers: list[tuple[str, str]] = None) -> None:
        """Helper to send response with security headers and common headers."""
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", 
                         "default-src 'self'; "
                         "script-src 'self' 'unsafe-inline'; "
                         "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                         "font-src 'self' https://fonts.gstatic.com; "
                         "connect-src 'self' wss://stream.binance.com:9443; "
                         "img-src 'self' data:; "
                         "frame-ancestors 'none';")
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()

    def _send_json(self, data: bytes, status: int = 200) -> None:
        """Send a JSON response, gzip-compressing when possible."""
        accept_enc = self.headers.get("Accept-Encoding", "")
        payload, compressed = maybe_gzip(data, accept_enc)
        
        extra = []
        if compressed:
            extra.append(("Content-Encoding", "gzip"))
            
        self.send_response_with_security_headers(status, "application/json", len(payload), extra)
        self.wfile.write(payload)

    def _send_html(self, data: bytes) -> None:
        """Send an HTML response."""
        self.send_response_with_security_headers(200, "text/html; charset=utf-8", len(data))
        self.wfile.write(data)

    def _send_error_json(self, message: str, status: int = 502) -> None:
        """Convenience: send a JSON error object."""
        body = json.dumps({"error": message, "message": message}).encode()
        self._send_json(body, status)

    def _send_404(self) -> None:
        body = b"404 Not Found"
        self.send_response_with_security_headers(404, "text/plain", len(body))
        self.wfile.write(body)

    def _send_offline_error(self) -> None:
        """Send standard JSON error indicating upstream is unavailable."""
        body = json.dumps({
            "status": "offline",
            "message": "Market data unavailable",
            "error": "Market data unavailable"
        }).encode("utf-8")
        self._send_json(body, status=503)

    # ── Route dispatcher ─────────────────────

    def do_GET(self) -> None:  # noqa: N802
        # IP Rate Limiting Check (60 requests/minute)
        client_ip = self.client_address[0]
        if is_rate_limited(client_ip, limit=60, window=60):
            body = json.dumps({
                "error": "Too Many Requests", 
                "message": "Rate limit exceeded. Please wait."
            }).encode()
            self.send_response_with_security_headers(429, "application/json", len(body), [("Retry-After", "60")])
            self.wfile.write(body)
            return

        path, params = parse_query_params(self.path)

        # Static HTML
        if path in ("/", "/index.html"):
            return self._handle_index()

        # API routes
        routes = {
            "/api/candles":   self._handle_candles,
            "/api/ticker":    self._handle_ticker,
            "/api/orderbook": self._handle_orderbook,
            "/api/coins":     self._handle_coins,
            "/api/feargreed": self._handle_feargreed,
            "/api/news":      self._handle_news,
        }
        handler = routes.get(path)
        if handler:
            return handler(params)

        self._send_404()

    # ── Individual route handlers ────────────

    def _handle_index(self) -> None:
        try:
            with open(HTML_FILE, "rb") as f:
                self._send_html(f.read())
        except FileNotFoundError:
            body = b"index.html not found"
            self.send_response_with_security_headers(404, "text/plain", len(body))
            self.wfile.write(body)

    def _handle_candles(self, params: Dict[str, str]) -> None:
        """Proxy Binance kline/candlestick data."""
        symbol = validate_symbol(params)

        interval = params.get("interval", "1h")
        if interval not in ALLOWED_INTERVALS:
            interval = "1h"

        limit = validate_limit(params, default=200, min_val=1, max_val=1000)

        ttl = TTL_CANDLES_LIVE if interval in LIVE_INTERVALS else TTL_CANDLES_LONG
        path = f"/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"

        try:
            raw = fetch_binance(path, ttl)
            self._send_json(raw)
        except Exception as exc:
            print(f"  [Error] Failed to fetch candles: {exc}")
            self._send_offline_error()

    def _handle_ticker(self, params: Dict[str, str]) -> None:
        """Proxy the 24-hour ticker for a single symbol."""
        symbol = validate_symbol(params)
        path = f"/api/v3/ticker/24hr?symbol={symbol}"

        try:
            raw = fetch_binance(path, TTL_TICKER)
            self._send_json(raw)
        except Exception as exc:
            print(f"  [Error] Failed to fetch ticker: {exc}")
            self._send_offline_error()

    def _handle_orderbook(self, params: Dict[str, str]) -> None:
        """Proxy the order-book depth snapshot for a symbol."""
        symbol = validate_symbol(params)
        limit = validate_limit(params, default=20, min_val=5, max_val=100)
        path = f"/api/v3/depth?symbol={symbol}&limit={limit}"

        try:
            raw = fetch_binance(path, TTL_ORDERBOOK)
            self._send_json(raw)
        except Exception as exc:
            print(f"  [Error] Failed to fetch orderbook: {exc}")
            self._send_offline_error()

    def _handle_coins(self, params: Dict[str, str]) -> None:
        """Return 24-hour tickers for all supported coins."""
        path = "/api/v3/ticker/24hr"
        try:
            raw = fetch_binance(path, TTL_MULTI_COINS)
            all_tickers = json.loads(raw)
            filtered = [t for t in all_tickers if t.get("symbol") in SUPPORTED_SYMBOLS]
            self._send_json(json.dumps(filtered).encode())
        except Exception as exc:
            print(f"  [Error] Failed to fetch coins: {exc}")
            self._send_offline_error()

    def _handle_feargreed(self, params: Dict[str, str]) -> None:
        """Proxy the Crypto Fear & Greed Index (alternative.me)."""
        try:
            raw = fetch_url(FEAR_GREED_URL, TTL_FEAR_GREED)
            self._send_json(raw)
        except Exception as exc:
            print(f"  [Error] Failed to fetch feargreed: {exc}")
            self._send_offline_error()

    def _handle_news(self, params: Dict[str, str]) -> None:
        """Proxy and parse RSS news feed into expected JSON format."""
        try:
            raw_xml = fetch_url(NEWS_URL, TTL_NEWS)
            articles = []

            # Parse XML
            root = ET.fromstring(raw_xml)
            channel = root.find("channel")
            if channel is not None:
                items = channel.findall("item")
                for item in items:
                    title_el = item.find("title")
                    link_el = item.find("link")
                    pub_date_el = item.find("pubDate")
                    desc_el = item.find("description")

                    title = title_el.text if title_el is not None else ""
                    link = link_el.text if link_el is not None else ""
                    pub_date = pub_date_el.text if pub_date_el is not None else ""
                    desc = desc_el.text if desc_el is not None else ""

                    timestamp = 0
                    if pub_date:
                        try:
                            dt = email.utils.parsedate_to_datetime(pub_date)
                            timestamp = int(dt.timestamp())
                        except Exception:
                            pass

                    articles.append({
                        "title": title,
                        "url": link,
                        "published_on": timestamp,
                        "source": "CoinDesk",
                        "body": desc,
                        "source_info": {"name": "CoinDesk"}
                    })

            response_data = json.dumps({"Data": articles}).encode("utf-8")
            self._send_json(response_data)
        except Exception as exc:
            print(f"  [Error] Failed to fetch news: {exc}")
            self._send_offline_error()


# ──────────────────────────────────────────────
#  Startup helpers
# ──────────────────────────────────────────────

def _open_browser() -> None:
    """Open the default browser after a short delay."""
    time.sleep(1.2)
    webbrowser.open(f"http://localhost:{PORT}")


def _print_banner() -> None:
    """Print a colourful startup banner with all available endpoints."""
    # ANSI colour codes (gracefully ignored on terminals that don't support them)
    BOLD    = "\033[1m"
    DIM     = "\033[2m"
    RESET   = "\033[0m"
    CYAN    = "\033[96m"
    GREEN   = "\033[92m"
    YELLOW  = "\033[93m"
    MAGENTA = "\033[95m"
    WHITE   = "\033[97m"

    base = f"http://localhost:{PORT}"

    print()
    print(f"  {YELLOW}{'=' * 50}{RESET}")
    print(f"  {BOLD}{YELLOW}*{RESET}  {BOLD}{WHITE}BTC Live Chart{RESET}  {DIM}v3.0{RESET}")
    print(f"  {YELLOW}{'=' * 50}{RESET}")
    print()
    print(f"  {GREEN}>  Server running at {CYAN}{base}{RESET}")
    print()
    print(f"  {BOLD}{MAGENTA}Endpoints:{RESET}")
    print(f"  {DIM}|--{RESET} {WHITE}GET{RESET}  {CYAN}/{RESET}                 {DIM}-> UI (index.html){RESET}")
    print(f"  {DIM}|--{RESET} {WHITE}GET{RESET}  {CYAN}/api/candles{RESET}      {DIM}-> OHLCV candlesticks{RESET}")
    print(f"  {DIM}|--{RESET} {WHITE}GET{RESET}  {CYAN}/api/ticker{RESET}       {DIM}-> 24h ticker stats{RESET}")
    print(f"  {DIM}|--{RESET} {WHITE}GET{RESET}  {CYAN}/api/orderbook{RESET}    {DIM}-> Order-book depth{RESET}")
    print(f"  {DIM}|--{RESET} {WHITE}GET{RESET}  {CYAN}/api/coins{RESET}        {DIM}-> All supported coins{RESET}")
    print(f"  {DIM}|--{RESET} {WHITE}GET{RESET}  {CYAN}/api/feargreed{RESET}    {DIM}-> Fear & Greed index{RESET}")
    print(f"  {DIM}+--{RESET} {WHITE}GET{RESET}  {CYAN}/api/news{RESET}          {DIM}-> Latest crypto news{RESET}")
    print()
    print(f"  {BOLD}{MAGENTA}Supported symbols:{RESET}")
    symbols_list = sorted(SUPPORTED_SYMBOLS)
    print(f"  {DIM}   {', '.join(symbols_list)}{RESET}")
    print()
    print(f"  {BOLD}{MAGENTA}Cache TTLs:{RESET}")
    print(f"  {DIM}   ticker={TTL_TICKER}s  candles(live)={TTL_CANDLES_LIVE}s  "
          f"candles(long)={TTL_CANDLES_LONG}s{RESET}")
    print(f"  {DIM}   orderbook={TTL_ORDERBOOK}s  coins={TTL_MULTI_COINS}s  "
          f"feargreed={TTL_FEAR_GREED}s  news={TTL_NEWS}s{RESET}")
    print()
    print(f"  {DIM}Press Ctrl+C to stop.{RESET}")
    print()


# ──────────────────────────────────────────────
#  Main entry point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    _print_banner()
    server = http.server.ThreadingHTTPServer(("", PORT), Handler)
    threading.Thread(target=_open_browser, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped. Goodbye!")