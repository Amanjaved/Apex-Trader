import time
from backend.services.market_data import get_cache_size

_START_TIME = time.time()

def get_uptime() -> float:
    return time.time() - _START_TIME

def get_health_stats() -> dict:
    return {
        "status": "ok",
        "uptime": round(get_uptime(), 1),
        "cache_keys": get_cache_size(),
    }
