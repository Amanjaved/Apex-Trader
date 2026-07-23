# Server-side technical indicator calculations for validation checks
from __future__ import annotations
import math
from typing import List, Dict, Any

def calculate_sma(closes: List[float], period: int) -> List[float]:
    """Calculate simple moving average."""
    n = len(closes)
    out = [0.0] * n
    sum_val = 0.0
    for i in range(n):
        sum_val += closes[i]
        if i >= period:
            sum_val -= closes[i - period]
        out[i] = sum_val / period if i >= period - 1 else closes[i]
    return out

def calculate_ema(closes: List[float], period: int) -> List[float]:
    """Calculate exponential moving average compatible with TradingView."""
    n = len(closes)
    out = [0.0] * n
    if n == 0:
        return out
    k = 2 / (period + 1)
    out[0] = closes[0]
    for i in range(1, n):
        out[i] = closes[i] * k + out[i - 1] * (1 - k)
    return out

def calculate_bb(closes: List[float], period: int, std_mult: float) -> Dict[str, List[float]]:
    """Calculate Bollinger Bands."""
    n = len(closes)
    upper = [0.0] * n
    mid = [0.0] * n
    lower = [0.0] * n
    sum_val = 0.0
    sum_sq = 0.0
    for i in range(n):
        v = closes[i]
        sum_val += v
        sum_sq += v * v
        if i >= period:
            old = closes[i - period]
            sum_val -= old
            sum_sq -= old * old
        if i >= period - 1:
            m = sum_val / period
            variance = max(0.0, sum_sq / period - m * m)
            sd = math.sqrt(variance)
            mid[i] = m
            upper[i] = m + std_mult * sd
            lower[i] = m - std_mult * sd
        else:
            mid[i] = upper[i] = lower[i] = v
    return {"upper": upper, "mid": mid, "lower": lower}

def calculate_rsi(closes: List[float], period: int) -> List[float]:
    """Calculate Relative Strength Index (Wilder's RMA smoothing)."""
    n = len(closes)
    out = [0.0] * n
    if n < period + 1:
        return out
    ag = 0.0
    al = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        if d > 0:
            ag += d
        else:
            al -= d
    ag /= period
    al /= period
    out[period] = 100.0 if al == 0.0 else 100.0 - 100.0 / (1.0 + ag / al)
    for i in range(period + 1, n):
        d = closes[i] - closes[i - 1]
        g = d if d > 0 else 0.0
        l = -d if d < 0 else 0.0
        ag = (ag * (period - 1) + g) / period
        al = (al * (period - 1) + l) / period
        out[i] = 100.0 if al == 0.0 else 100.0 - 100.0 / (1.0 + ag / al)
    return out

def calculate_macd(closes: List[float], fast: int, slow: int, sig: int) -> Dict[str, List[float]]:
    """Calculate MACD line, signal line, and histogram."""
    ef = calculate_ema(closes, fast)
    es = calculate_ema(closes, slow)
    n = len(closes)
    macd_line = [0.0] * n
    for i in range(n):
        macd_line[i] = ef[i] - es[i]
    sig_line = calculate_ema(macd_line, sig)
    hist = [0.0] * n
    for i in range(n):
        hist[i] = macd_line[i] - sig_line[i]
    return {"macd_line": macd_line, "sig_line": sig_line, "hist": hist}

def calculate_atr(candles: List[Dict[str, Any]], period: int) -> List[float]:
    """Calculate Average True Range."""
    n = len(candles)
    out = [0.0] * n
    if n < 2:
        return out
    tr = [0.0] * n
    tr[0] = candles[0]["h"] - candles[0]["l"]
    for i in range(1, n):
        hl = candles[i]["h"] - candles[i]["l"]
        hpc = abs(candles[i]["h"] - candles[i - 1]["c"])
        lpc = abs(candles[i]["l"] - candles[i - 1]["c"])
        tr[i] = max(hl, hpc, lpc)
    atr = 0.0
    if n < period:
        return out
    for i in range(period):
        atr += tr[i]
    atr /= period
    out[period - 1] = atr
    for i in range(period, n):
        atr = (atr * (period - 1) + tr[i]) / period
        out[i] = atr
    return out

def detect_swings(candles: List[Dict[str, Any]], n_bars: int = 5) -> Dict[str, List[Dict[str, Any]]]:
    """Detect high and low swing pivots."""
    highs = []
    lows = []
    n = len(candles)
    for i in range(n_bars, n - n_bars):
        is_h = True
        is_l = True
        for j in range(1, n_bars + 1):
            if candles[i - j]["h"] >= candles[i]["h"] or candles[i + j]["h"] > candles[i]["h"]:
                is_h = False
            if candles[i - j]["l"] <= candles[i]["l"] or candles[i + j]["l"] < candles[i]["l"]:
                is_l = False
        if is_h:
            highs.append({
                "i": i,
                "price": candles[i]["h"],
                "t": candles[i]["t"],
                "o": candles[i]["o"],
                "c": candles[i]["c"]
            })
        if is_l:
            lows.append({
                "i": i,
                "price": candles[i]["l"],
                "t": candles[i]["t"],
                "o": candles[i]["o"],
                "c": candles[i]["c"]
            })
    return {"highs": highs, "lows": lows}

def detect_fvg(candles: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Detect Fair Value Gaps."""
    n = len(candles)
    bull_fvg = []
    bear_fvg = []
    for i in range(1, n - 1):
        prev = candles[i - 1]
        next_c = candles[i + 1]
        if next_c["l"] > prev["h"]:
            bull_fvg.append({
                "i": i,
                "t": candles[i]["t"],
                "top": next_c["l"],
                "bot": prev["h"]
            })
        if next_c["h"] < prev["l"]:
            bear_fvg.append({
                "i": i,
                "t": candles[i]["t"],
                "top": prev["l"],
                "bot": next_c["h"]
            })
    return {"bullFVG": bull_fvg, "bearFVG": bear_fvg}

def detect_order_blocks(candles: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Detect Order Blocks."""
    n = len(candles)
    bull_obs = []
    bear_obs = []
    for i in range(1, n - 2):
        c = candles[i]
        next1 = candles[i + 1]
        next2 = candles[i + 2]
        if c["c"] < c["o"]:
            impulse_up = next1["c"] > next1["o"] and next2["c"] > next2["o"] and next2["c"] > c["h"]
            if impulse_up:
                bull_obs.append({
                    "i": i,
                    "t": c["t"],
                    "high": c["h"],
                    "low": c["l"],
                    "open": c["o"],
                    "close": c["c"]
                })
        if c["c"] > c["o"]:
            impulse_down = next1["c"] < next1["o"] and next2["c"] < next2["o"] and next2["c"] < c["l"]
            if impulse_down:
                bear_obs.append({
                    "i": i,
                    "t": c["t"],
                    "high": c["h"],
                    "low": c["l"],
                    "open": c["o"],
                    "close": c["c"]
                })
    return {"bullOBs": bull_obs, "bearOBs": bear_obs}

def calculate_vwap(candles: List[Dict[str, Any]]) -> List[float]:
    """Calculate daily-resetting Volume Weighted Average Price (VWAP)."""
    n = len(candles)
    out = [0.0] * n
    if n == 0:
        return out
        
    import datetime
    
    current_day = None
    sum_pv = 0.0
    sum_vol = 0.0
    
    for i in range(n):
        c = candles[i]
        try:
            # Assume UTC timezone aware or simple offset division
            dt = datetime.datetime.fromtimestamp(c["t"] / 1000.0, datetime.timezone.utc)
            day = dt.date()
        except Exception:
            day = i // 24 # Fallback
            
        if current_day != day:
            current_day = day
            sum_pv = 0.0
            sum_vol = 0.0
            
        tp = (c["h"] + c["l"] + c["c"]) / 3.0
        vol = c["v"]
        sum_pv += tp * vol
        sum_vol += vol
        
        out[i] = sum_pv / sum_vol if sum_vol > 0 else c["c"]
        
    return out
