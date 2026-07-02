# Trader-grade S/R zone engine v4 — rejection-based touch counting, ATR-relative clustering
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

N_MAP = {"1m": 10, "5m": 8, "15m": 6, "1h": 5, "4h": 4, "1d": 4}
TF_RANK = ["1d", "4h", "1h", "15m", "5m", "1m"]

CLUSTER_ATR = 0.40          # pivot joins cluster within 0.40 x ATR of centroid
MIN_WIDTH_ATR = 0.12
MAX_WIDTH_ATR = 0.90
MERGE_ATR = 0.45            # cross-TF merge distance (anchor ATR)
MIN_SEP_ATR = 0.60          # min spacing between final zones (anchor ATR)
EDGE_BUFFER_ATR = 0.05      # close beyond edge by this to count as outside
BREAK_ATR = 0.25            # decisive close beyond far edge
TOUCH_COOLDOWN = 3          # bars between distinct touches
VOL_SPIKE = 1.5


def calc_atr(candles: List[dict], period: int = 14) -> List[float]:
    n = len(candles)
    atr = [0.0] * n
    if n < 2:
        return atr
    tr = [candles[0]["h"] - candles[0]["l"]]
    for i in range(1, n):
        tr.append(max(
            candles[i]["h"] - candles[i]["l"],
            abs(candles[i]["h"] - candles[i - 1]["c"]),
            abs(candles[i]["l"] - candles[i - 1]["c"]),
        ))
    if n < period:
        return atr
    cur = sum(tr[:period]) / period
    atr[period - 1] = cur
    for i in range(period, n):
        cur = (cur * (period - 1) + tr[i]) / period
        atr[i] = cur
    return atr


def detect_pivots(candles: List[dict], tf: str) -> List[dict]:
    n = len(candles)
    N = N_MAP.get(tf, 5)
    pivots = []
    for i in range(N, n - N):
        c = candles[i]
        is_high = all(candles[i - j]["h"] < c["h"] and candles[i + j]["h"] <= c["h"] for j in range(1, N + 1))
        is_low = all(candles[i - j]["l"] > c["l"] and candles[i + j]["l"] >= c["l"] for j in range(1, N + 1))
        if is_high:
            pivots.append({"price": c["h"], "timestamp": c["t"], "type": "high", "volume": c["v"], "tf": tf, "index": i})
        if is_low:
            pivots.append({"price": c["l"], "timestamp": c["t"], "type": "low", "volume": c["v"], "tf": tf, "index": i})
    return pivots


def _avg_volume(candles: List[dict], idx: int, window: int = 50) -> float:
    lo = max(0, idx - window)
    seg = candles[lo:idx]
    if not seg:
        return 1.0
    return sum(c["v"] for c in seg) / len(seg)


def cluster_pivots(pivots: List[dict], atr_last: float) -> List[List[dict]]:
    if not pivots or atr_last <= 0:
        return []
    pivots = sorted(pivots, key=lambda p: p["price"])
    clusters: List[List[dict]] = []
    cur = [pivots[0]]

    def centroid(cluster):
        tv = sum(p["volume"] for p in cluster) or 1.0
        return sum(p["price"] * p["volume"] for p in cluster) / tv

    for p in pivots[1:]:
        if abs(p["price"] - centroid(cur)) <= CLUSTER_ATR * atr_last:
            cur.append(p)
        else:
            clusters.append(cur)
            cur = [p]
    clusters.append(cur)
    return clusters


def analyze_touches(zone: dict, candles: List[dict], atr_last: float) -> None:
    """Rejection-based touch counting: wick enters zone, close stays outside on approach side."""
    n = len(candles)
    lo, hi = zone["low"], zone["high"]
    buf = EDGE_BUFFER_ATR * atr_last
    brk = BREAK_ATR * atr_last

    touches = 0
    vol_spikes = 0
    flips = 0
    breaks = 0
    last_side: Optional[str] = None
    last_break_side: Optional[str] = None
    last_touch_idx = zone["originIndex"]

    for k in range(zone["originIndex"] + 1, n):
        c = candles[k]
        if c["c"] > hi + buf:
            side = "above"
        elif c["c"] < lo - buf:
            side = "below"
        else:
            side = "inside"

        wick_touched = c["l"] <= hi and c["h"] >= lo

        if side in ("above", "below"):
            if wick_touched and (k - last_touch_idx) >= TOUCH_COOLDOWN:
                touches += 1
                last_touch_idx = k
                if c["v"] > VOL_SPIKE * _avg_volume(candles, k):
                    vol_spikes += 1
                if last_side and side != last_side:
                    flips += 1
            # decisive break: crossed the zone with strong close on the opposite side
            if last_side and side != last_side:
                beyond = (c["c"] - hi) if side == "above" else (lo - c["c"])
                if beyond >= brk and last_break_side != side:
                    breaks += 1
                    last_break_side = side
            last_side = side

    zone["touchCount"] = touches
    zone["volSpikes"] = vol_spikes
    zone["flips"] = flips
    zone["breaks"] = breaks
    zone["lastTouchIndex"] = last_touch_idx


def score_zone(zone: dict, candles: List[dict], atr_last: float) -> float:
    n = len(candles)
    analyze_touches(zone, candles, atr_last)

    touch_score = min(36.0, zone["touchCount"] * 9.0)
    vol_score = min(15.0, zone["volSpikes"] * 5.0)

    age = n - 1 - zone["lastTouchIndex"]
    recency = 15.0 * math.exp(-age / max(1.0, n * 0.25))

    flip_bonus = 10.0 if zone["flips"] > 0 else 0.0

    origin_q = 0.0
    oc = candles[zone["originIndex"]] if zone["originIndex"] < n else None
    if oc:
        rng = oc["h"] - oc["l"]
        body_ratio = abs(oc["c"] - oc["o"]) / rng if rng > 0 else 0.0
        strong = body_ratio >= 0.65 and oc["v"] > 1.8 * _avg_volume(candles, zone["originIndex"])
        if strong:
            origin_q = 8.0

    fresh_bonus = 6.0 if (zone["touchCount"] == 0 and origin_q > 0) else 0.0
    zone["fresh"] = zone["touchCount"] == 0

    # one clean break followed by flip evidence is role reversal, not weakness
    effective_breaks = max(0, zone["breaks"] - (1 if zone["flips"] > 0 else 0))
    break_penalty = min(30.0, effective_breaks * 12.0)

    raw = touch_score + vol_score + recency + flip_bonus + origin_q + fresh_bonus - break_penalty
    return max(0.0, min(84.0, raw))


def zone_from_cluster(cluster: List[dict], candles: List[dict], tf: str, atr_last: float) -> dict:
    tv = sum(p["volume"] for p in cluster) or 1.0
    centroid = sum(p["price"] * p["volume"] for p in cluster) / tv
    low = min(p["price"] for p in cluster)
    high = max(p["price"] for p in cluster)

    min_w = MIN_WIDTH_ATR * atr_last
    if high - low < min_w:
        low = centroid - min_w / 2
        high = centroid + min_w / 2
    max_w = MAX_WIDTH_ATR * atr_last
    if high - low > max_w:
        low = centroid - max_w / 2
        high = centroid + max_w / 2

    lows = sum(1 for p in cluster if p["type"] == "low")
    highs = len(cluster) - lows
    ztype = "flip" if (lows > 0 and highs > 0) else ("support" if lows > highs else "resistance")

    origin_idx = min(p["index"] for p in cluster)
    zone = {
        "id": f"{tf}_{round(centroid, 2)}_{min(p['timestamp'] for p in cluster)}",
        "price": centroid,
        "low": low,
        "high": high,
        "type": ztype,
        "timeframes": [tf],
        "isConfluence": False,
        "originTimestamp": min(p["timestamp"] for p in cluster),
        "originIndex": origin_idx,
        "pivots": cluster,
        "touchCount": 0,
        "score": 0.0,
    }
    zone["score"] = score_zone(zone, candles, atr_last)
    return zone


def _round_number_bonus(price: float) -> float:
    if price <= 0:
        return 0.0
    step = 10 ** round(math.log10(price * 0.01))
    rem = price % step
    near = min(rem, step - rem)
    return 4.0 if near <= 0.08 * step else 0.0


def compute_zones(mtf_candles: Dict[str, List[dict]], current_price: float, max_zones: int = 12) -> List[dict]:
    """Single source of truth for S/R zones across timeframes."""
    all_zones: List[dict] = []
    anchor_atr = 0.0

    for tf in TF_RANK:
        candles = mtf_candles.get(tf) or []
        if len(candles) < 120:
            continue
        atr = calc_atr(candles, 14)
        atr_last = atr[-1] if atr[-1] > 0 else (candles[-1]["c"] * 0.01)
        if anchor_atr == 0.0:
            anchor_atr = atr_last  # highest available TF sets spacing scale
        pivots = detect_pivots(candles, tf)
        for cluster in cluster_pivots(pivots, atr_last):
            all_zones.append(zone_from_cluster(cluster, candles, tf, atr_last))

    if not all_zones:
        return []
    if anchor_atr <= 0:
        anchor_atr = current_price * 0.01

    # Cross-TF merge: zones within MERGE_ATR of anchor ATR collapse; strongest wins, TFs union
    all_zones.sort(key=lambda z: z["price"])
    merged: List[dict] = []
    consumed = [False] * len(all_zones)
    for i, z in enumerate(all_zones):
        if consumed[i]:
            continue
        base = dict(z)
        base["timeframes"] = list(z["timeframes"])
        for j in range(i + 1, len(all_zones)):
            if consumed[j]:
                continue
            other = all_zones[j]
            if other["price"] - base["price"] > MERGE_ATR * anchor_atr:
                break
            if other["score"] > base["score"]:
                tfs = base["timeframes"]
                base = dict(other)
                base["timeframes"] = list(other["timeframes"])
                for tf in tfs:
                    if tf not in base["timeframes"]:
                        base["timeframes"].append(tf)
            else:
                for tf in other["timeframes"]:
                    if tf not in base["timeframes"]:
                        base["timeframes"].append(tf)
            consumed[j] = True
        base["isConfluence"] = len(base["timeframes"]) >= 2
        if base["isConfluence"]:
            base["score"] = min(100.0, base["score"] + min(16.0, (len(base["timeframes"]) - 1) * 4.0))
        base["score"] = min(100.0, base["score"] + _round_number_bonus(base["price"]))
        merged.append(base)

    # Enforce minimum spacing keeping strongest zones
    merged.sort(key=lambda z: z["score"], reverse=True)
    final: List[dict] = []
    for z in merged:
        if all(abs(z["price"] - k["price"]) >= MIN_SEP_ATR * anchor_atr for k in final):
            final.append(z)
        if len(final) >= max_zones:
            break

    for z in final:
        z["role"] = "support" if z["price"] < current_price else "resistance"
    final.sort(key=lambda z: z["score"], reverse=True)
    return final


def detect_liquidity_sweep(candles: List[dict], lookback: int = 20, recent: int = 10) -> Optional[dict]:
    """Detect stop-hunt sweeps: wick beyond prior extreme with close back inside."""
    n = len(candles)
    if n < lookback + recent + 2:
        return None
    for k in range(n - 1, n - 1 - recent, -1):
        c = candles[k]
        prior = candles[k - lookback:k]
        if not prior:
            continue
        prior_low = min(p["l"] for p in prior)
        prior_high = max(p["h"] for p in prior)
        if c["l"] < prior_low and c["c"] > prior_low:
            return {"side": "bullish", "level": prior_low, "index": k, "timestamp": c["t"]}
        if c["h"] > prior_high and c["c"] < prior_high:
            return {"side": "bearish", "level": prior_high, "index": k, "timestamp": c["t"]}
    return None
