from __future__ import annotations

import time
import threading
import json
import urllib.request
import urllib.parse
from typing import Dict, List, Tuple

# Configuration
SUPPORTED_SYMBOLS: frozenset[str] = frozenset({
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
})

ALLOWED_INTERVALS: frozenset[str] = frozenset({
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "12h",
    "1d", "3d", "1w", "1M",
})

LIVE_INTERVALS: frozenset[str] = frozenset({"1m", "3m", "5m", "15m", "30m"})

BINANCE_BASES: List[str] = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://data-api.binance.vision",
]

UPSTREAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ApexTraderPro/4.0)",
    "Accept":     "application/json",
}

# Cache TTLs (seconds)
TTL_TICKER       = 3
TTL_CANDLES_LIVE = 5
TTL_CANDLES_LONG = 15
TTL_ORDERBOOK    = 2
TTL_COINS        = 5

# ──────────────────────────────────────────────
#  Thread-safe cache
# ──────────────────────────────────────────────
_cache: Dict[str, Tuple[float, bytes]] = {}
_cache_lock = threading.Lock()

def cache_get(key: str) -> Tuple[float, bytes] | None:
    with _cache_lock:
        return _cache.get(key)

def cache_set(key: str, data: bytes) -> None:
    now = time.time()
    with _cache_lock:
        _cache[key] = (now, data)
        # Evict entries older than 10 minutes to prevent unbounded growth
        if len(_cache) > 500:
            cutoff = now - 600
            stale = [k for k, (ts, _) in _cache.items() if ts < cutoff]
            for k in stale:
                del _cache[k]

def get_cache_size() -> int:
    with _cache_lock:
        return len(_cache)

# ──────────────────────────────────────────────
#  Binance API Service Fetchers
# ──────────────────────────────────────────────
def fetch_binance(path: str, ttl: int) -> bytes:
    """Fetch Binance API path with automatic failover across mirror hosts."""
    entry = cache_get(path)
    if entry:
        ts, data = entry
        if time.time() - ts < ttl:
            return data

    last_err: Exception | None = None
    for base in BINANCE_BASES:
        try:
            url = base + path
            req = urllib.request.Request(url, headers=UPSTREAM_HEADERS)
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = resp.read()
            cache_set(path, data)
            return data
        except Exception as exc:
            last_err = exc

    raise last_err or RuntimeError("All Binance endpoints failed")

def fetch_candles(symbol: str, interval: str, limit: int) -> bytes:
    ttl = TTL_CANDLES_LIVE if interval in LIVE_INTERVALS else TTL_CANDLES_LONG
    api_path = f"/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
    return fetch_binance(api_path, ttl)

def fetch_ticker(symbol: str) -> bytes:
    return fetch_binance(f"/api/v3/ticker/24hr?symbol={symbol}", TTL_TICKER)

def fetch_orderbook(symbol: str, limit: int) -> bytes:
    return fetch_binance(f"/api/v3/depth?symbol={symbol}&limit={limit}", TTL_ORDERBOOK)

def fetch_coins() -> bytes:
    raw = fetch_binance("/api/v3/ticker/24hr", TTL_COINS)
    all_ = json.loads(raw)
    filtered = [t for t in all_ if t.get("symbol") in SUPPORTED_SYMBOLS]
    return json.dumps(filtered).encode()
