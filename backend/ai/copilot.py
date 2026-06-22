from __future__ import annotations

import json
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor
import backend.services as services
from backend.indicators.calculator import (
    calculate_ema, calculate_rsi, calculate_macd, calculate_bb, calculate_atr,
    detect_swings, detect_fvg, detect_order_blocks
)

class AICopilot:
    def __init__(self):
        pass

    def analyze_market_structure(self, symbol: str, interval: str, calculate_matrix: bool = True, min_score: float = 7.5) -> Dict[str, Any]:
        try:
            # 1. Fetch historical candles (limit 500)
            candles_raw = json.loads(services.fetch_candles(symbol, interval, 500))
            candles = [
                {
                    "t": int(k[0]),
                    "o": float(k[1]),
                    "h": float(k[2]),
                    "l": float(k[3]),
                    "c": float(k[4]),
                    "v": float(k[5]),
                }
                for k in candles_raw
            ]
            
            n = len(candles)
            if n < 50:
                return {
                    "bias": "NEUTRAL",
                    "confluences": [{"type": "neutral", "txt": "Insufficient market data (need at least 50 candles)"}],
                    "score": 0.0,
                    "longProb": 50,
                    "shortProb": 50,
                    "levels": {"support": [], "resistance": []},
                    "analysis": "Insufficient data to perform market structure analysis."
                }

            closes = [c["c"] for c in candles]
            price = closes[-1]

            # 2. Calculate Indicators
            ema20 = calculate_ema(closes, 20)
            ema50 = calculate_ema(closes, 50)
            rsi14 = calculate_rsi(closes, 14)
            macd = calculate_macd(closes, 12, 26, 9)
            bb = calculate_bb(closes, 20, 2.0)
            atr = calculate_atr(candles, 14)

            ef = ema20[-1]
            es = ema50[-1]
            rv = rsi14[-1]
            hist = macd["hist"][-1]
            bbu = bb["upper"][-1]
            bbl = bb["lower"][-1]
            bbm = bb["mid"][-1]
            atr_val = atr[-1] if len(atr) > 0 else 0.0

            score = 0.0
            confluences = []

            # --- Dimensions of Analysis ---

            # A. Technical Trends (EMA)
            above_fast = price > ef
            above_slow = price > es
            fast_above_slow = ef > es
            if above_fast and above_slow and fast_above_slow:
                score += 3.0
                confluences.append({"type": "bullish", "txt": f"Bullish Trend: Price > EMA20 ({ef:.2f}) and EMA50 ({es:.2f}) with bullish stack"})
            elif not above_fast and not above_slow and not fast_above_slow:
                score -= 3.0
                confluences.append({"type": "bearish", "txt": f"Bearish Trend: Price < EMA20 ({ef:.2f}) and EMA50 ({es:.2f}) with bearish stack"})
            else:
                confluences.append({"type": "neutral", "txt": "Trend: Price consolidation / mixed EMA structure"})

            # B. Momentum (RSI)
            if rv > 70:
                score -= 1.0
                confluences.append({"type": "bearish", "txt": f"Momentum: RSI at {rv:.1f} is Overbought (elevated correction risk)"})
            elif rv < 30:
                score += 2.0
                confluences.append({"type": "bullish", "txt": f"Momentum: RSI at {rv:.1f} is Oversold (potential buying zone)"})
            elif rv > 50:
                score += 1.0
                confluences.append({"type": "bullish", "txt": f"Momentum: RSI is bullish at {rv:.1f} (upper momentum half)"})
            elif rv < 50:
                score -= 1.0
                confluences.append({"type": "bearish", "txt": f"Momentum: RSI is bearish at {rv:.1f} (lower momentum half)"})
            else:
                confluences.append({"type": "neutral", "txt": f"Momentum: RSI is neutral at {rv:.1f}"})

            # C. Momentum (MACD)
            if hist > 0:
                score += 1.5
                confluences.append({"type": "bullish", "txt": f"Momentum: MACD histogram is positive ({hist:.4f})"})
            else:
                score -= 1.5
                confluences.append({"type": "bearish", "txt": f"Momentum: MACD histogram is negative ({hist:.4f})"})

            # D. Volatility Channels (Bollinger Bands)
            if price > bbu:
                score -= 1.0
                confluences.append({"type": "bearish", "txt": f"Volatility: Price above Upper BB ({bbu:.2f}) - extended mean-reversion risk"})
            elif price < bbl:
                score += 1.0
                confluences.append({"type": "bullish", "txt": f"Volatility: Price below Lower BB ({bbl:.2f}) - compressed value zone"})
            elif price > bbm:
                score += 0.5
                confluences.append({"type": "bullish", "txt": f"Volatility: Price in upper half of BB (bullish channel)"})
            elif price < bbm:
                score -= 0.5
                confluences.append({"type": "bearish", "txt": f"Volatility: Price in lower half of BB (bearish channel)"})
            else:
                confluences.append({"type": "neutral", "txt": f"Volatility: Price is exactly at BB midline ({bbm:.2f})"})

            # E. Order Flow Imbalance
            try:
                ob_raw = json.loads(services.fetch_orderbook(symbol, 30))
                bids = ob_raw.get("bids", [])
                asks = ob_raw.get("asks", [])
                bid_vol = sum(float(b[1]) for b in bids)
                ask_vol = sum(float(a[1]) for a in asks)
                total_vol = bid_vol + ask_vol
                if total_vol > 0:
                    imbalance = (bid_vol - ask_vol) / total_vol
                    imbalance_pct = imbalance * 100
                    if imbalance > 0.15:
                        score += 1.5
                        confluences.append({"type": "bullish", "txt": f"Order Flow: Bullish order book imbalance ({imbalance_pct:+.1f}% bid dominance)"})
                    elif imbalance < -0.15:
                        score -= 1.5
                        confluences.append({"type": "bearish", "txt": f"Order Flow: Bearish order book imbalance ({imbalance_pct:+.1f}% ask dominance)"})
                    else:
                        confluences.append({"type": "neutral", "txt": "Order Flow: Order book volume is balanced"})
                else:
                    imbalance = 0.0
            except Exception:
                imbalance = 0.0

            # F. Market Sentiment
            try:
                fng_raw = json.loads(services.fetch_feargreed())
                fng_val = int(fng_raw["data"][0]["value"])
                if fng_val > 75:
                    score -= 1.0
                    confluences.append({"type": "bearish", "txt": f"Sentiment: Extreme Greed ({fng_val}) - excessive FOMO risk"})
                elif fng_val > 55:
                    score += 0.5
                    confluences.append({"type": "bullish", "txt": f"Sentiment: Greed ({fng_val})"})
                elif fng_val < 25:
                    score += 1.5
                    confluences.append({"type": "bullish", "txt": f"Sentiment: Extreme Fear ({fng_val}) - value accumulation zone"})
                elif fng_val < 45:
                    score -= 0.5
                    confluences.append({"type": "bearish", "txt": f"Sentiment: Fear ({fng_val})"})
                else:
                    confluences.append({"type": "neutral", "txt": f"Sentiment: Fear & Greed is Neutral ({fng_val})"})
            except Exception:
                fng_val = 50

            try:
                news_raw = json.loads(services.fetch_news())
                articles = news_raw.get("Data", [])
                relevant_articles = [
                    a for a in articles 
                    if symbol[:3].lower() in a["title"].lower() or symbol[:3].lower() in a["body"].lower()
                ][:10]
                if not relevant_articles:
                    relevant_articles = articles[:10]
                
                bull_count = sum(1 for a in relevant_articles if a["sentiment"] == "bullish")
                bear_count = sum(1 for a in relevant_articles if a["sentiment"] == "bearish")
                total_sent = bull_count + bear_count
                if total_sent > 0:
                    bull_ratio = bull_count / total_sent
                    bear_ratio = bear_count / total_sent
                    if bull_ratio >= 0.6:
                        score += 1.0
                        confluences.append({"type": "bullish", "txt": f"News Sentiment: Bullish coverage ({bull_count}/{total_sent} positive articles)"})
                    elif bear_ratio >= 0.6:
                        score -= 1.0
                        confluences.append({"type": "bearish", "txt": f"News Sentiment: Bearish coverage ({bear_count}/{total_sent} negative articles)"})
                    else:
                        confluences.append({"type": "neutral", "txt": "News Sentiment: Broadly balanced/neutral"})
            except Exception:
                pass

            # G. Smart Money Concepts & Structure
            fvg_data = detect_fvg(candles)
            bull_fvgs = fvg_data["bullFVG"]
            bear_fvgs = fvg_data["bearFVG"]
            # Look at recent 15 candles
            recent_bull_fvg = [f for f in bull_fvgs if f["i"] >= n - 15]
            recent_bear_fvg = [f for f in bear_fvgs if f["i"] >= n - 15]
            if recent_bull_fvg:
                score += 1.0
                fvg = recent_bull_fvg[-1]
                confluences.append({"type": "bullish", "txt": f"SMC Structure: Bullish FVG detected at {fvg['bot']:.2f} - {fvg['top']:.2f}"})
            if recent_bear_fvg:
                score -= 1.0
                fvg = recent_bear_fvg[-1]
                confluences.append({"type": "bearish", "txt": f"SMC Structure: Bearish FVG detected at {fvg['bot']:.2f} - {fvg['top']:.2f}"})

            ob_data = detect_order_blocks(candles)
            bull_obs = ob_data["bullOBs"]
            bear_obs = ob_data["bearOBs"]
            recent_bull_ob = [o for o in bull_obs if o["i"] >= n - 25]
            recent_bear_ob = [o for o in bear_obs if o["i"] >= n - 25]
            if recent_bull_ob:
                score += 1.0
                ob = recent_bull_ob[-1]
                confluences.append({"type": "bullish", "txt": f"SMC Structure: Bullish Order Block formed near {ob['low']:.2f}"})
            if recent_bear_ob:
                score -= 1.0
                ob = recent_bear_ob[-1]
                confluences.append({"type": "bearish", "txt": f"SMC Structure: Bearish Order Block formed near {ob['high']:.2f}"})

            # Calculate Bias and Probabilities
            if score >= 4.5:
                bias = "STRONG BULLISH"
                t_class = "bullish"
            elif score >= 1.5:
                bias = "BULLISH"
                t_class = "bullish"
            elif score <= -4.5:
                bias = "STRONG BEARISH"
                t_class = "bearish"
            elif score <= -1.5:
                bias = "BEARISH"
                t_class = "bearish"
            else:
                bias = "NEUTRAL"
                t_class = "neutral"

            shift = int(score * 5.5)
            long_pct = max(10, min(90, 50 + shift))
            short_pct = 100 - long_pct

            # Fetch historical candles for 4 S/R timeframes in parallel
            sr_tfs = ["1w", "1d", "4h", "1h"]
            with ThreadPoolExecutor(max_workers=4) as executor:
                sr_futures = {
                    tf: executor.submit(services.fetch_candles, symbol, tf, 300)
                    for tf in sr_tfs
                }
            
            mtf_candles = {}
            for tf, fut in sr_futures.items():
                try:
                    res_bytes = fut.result()
                    raw_str = res_bytes.decode("utf-8") if isinstance(res_bytes, bytes) else res_bytes
                    raw_json = json.loads(raw_str)
                    mtf_candles[tf] = [
                        {
                            "t": int(k[0]),
                            "o": float(k[1]),
                            "h": float(k[2]),
                            "l": float(k[3]),
                            "c": float(k[4]),
                            "v": float(k[5]),
                        }
                        for k in raw_json
                    ]
                except Exception as ex:
                    print(f"Error fetching {tf} candles: {ex}")
                    mtf_candles[tf] = []

            def detect_obs_and_fvgs_local(candles_list):
                obs = []
                fvgs = []
                n = len(candles_list)
                if n < 5:
                    return obs, fvgs
                
                # Order Blocks
                for i in range(1, n - 2):
                    c = candles_list[i]
                    next1 = candles_list[i+1]
                    next2 = candles_list[i+2]
                    if c["c"] < c["o"] and next1["c"] > next1["o"] and next2["c"] > next2["o"] and next2["c"] > c["h"]:
                        obs.append({"low": c["l"], "high": c["h"], "is_bull": True})
                    if c["c"] > c["o"] and next1["c"] < next1["o"] and next2["c"] < next2["o"] and next2["c"] < c["l"]:
                        obs.append({"low": c["l"], "high": c["h"], "is_bull": False})
                # FVGs
                for i in range(1, n - 1):
                    prev = candles_list[i-1]
                    next_c = candles_list[i+1]
                    if next_c["l"] > prev["h"]:
                        fvgs.append({"bot": prev["h"], "top": next_c["l"], "is_bull": True})
                    if next_c["h"] < prev["l"]:
                        fvgs.append({"bot": next_c["h"], "top": prev["l"], "is_bull": False})
                return obs, fvgs

            all_pivots = []
            N_sw = 5

            for tf in ["1w", "1d", "4h", "1h"]:
                candles = mtf_candles.get(tf, [])
                if not candles or len(candles) < 15:
                    continue
                n_c = len(candles)
                avg_vol = sum(c["v"] for c in candles) / n_c

                # Calculate ATR locally for this timeframe
                tr = [0.0] * n_c
                tr[0] = candles[0]["h"] - candles[0]["l"]
                for i in range(1, n_c):
                    hl = candles[i]["h"] - candles[i]["l"]
                    hpc = abs(candles[i]["h"] - candles[i-1]["c"])
                    lpc = abs(candles[i]["l"] - candles[i-1]["c"])
                    tr[i] = max(hl, hpc, lpc)
                
                sum_tr = sum(tr[:min(14, n_c)])
                atr_tf = sum_tr / min(14, n_c)
                for i in range(14, n_c):
                    atr_tf = (atr_tf * 13 + tr[i]) / 14
                if atr_tf <= 0:
                    atr_tf = candles[-1]["c"] * 0.015

                # Detect OBs and FVGs
                obs, fvgs = detect_obs_and_fvgs_local(candles)

                swH = []
                swL = []
                for i in range(N_sw, n_c - N_sw):
                    isH = True
                    isL = True
                    for j in range(1, N_sw + 1):
                        if candles[i-j]["h"] >= candles[i]["h"] or candles[i+j]["h"] > candles[i]["h"]:
                            isH = False
                        if candles[i-j]["l"] <= candles[i]["l"] or candles[i+j]["l"] < candles[i]["l"]:
                            isL = False
                    if isH:
                        swH.append(i)
                    if isL:
                        swL.append(i)

                # Impulse Breakout Origins
                impH = []
                impL = []
                for i in range(1, n_c):
                    c = candles[i]
                    body = abs(c["c"] - c["o"])
                    if body > 2.0 * atr_tf:
                        if c["c"] > c["o"]:
                            impL.append(i)
                        else:
                            impH.append(i)

                def check_high_caused_bos(i, price_val):
                    for k in range(i + 1, min(i + 51, n_c)):
                        for j in range(max(0, i - 100), i):
                            if j in swL:
                                prev_l = candles[j]["l"]
                                if candles[k]["c"] < prev_l:
                                    is_max = True
                                    for m in range(j, k + 1):
                                        if candles[m]["h"] > price_val + 0.001 * price_val:
                                            is_max = False
                                            break
                                    if is_max:
                                        return True
                    return False

                def check_low_caused_bos(i, price_val):
                    for k in range(i + 1, min(i + 51, n_c)):
                        for j in range(max(0, i - 100), i):
                            if j in swH:
                                prev_h = candles[j]["h"]
                                if candles[k]["c"] > prev_h:
                                    is_min = True
                                    for m in range(j, k + 1):
                                        if candles[m]["l"] < price_val - 0.001 * price_val:
                                            is_min = False
                                            break
                                    if is_min:
                                        return True
                    return False

                # Process high pivots
                all_high_indices = sorted(list(set(swH + impH)))
                for i in all_high_indices:
                    c = candles[i]
                    prev = candles[i-1] if i > 0 else c
                    is_impulse = i in impH
                    price_val = c["o"] if is_impulse else c["h"]
                    vol = c["v"]
                    time_val = c["t"]
                    rel_vol = vol / (avg_vol if avg_vol > 0 else 1.0)

                    max_move = 0.0
                    for j in range(i + 1, min(i + 8, n_c)):
                        d = abs(candles[j]["c"] - price_val)
                        if d > max_move:
                            max_move = d
                    rev_str = max_move / price_val if price_val > 0 else 0.0

                    is_sweep = False
                    for j in range(max(N_sw, i - 30), i):
                        if j in swH:
                            prev_h = candles[j]["h"]
                            if price_val > prev_h and (price_val - prev_h) / price_val <= 0.015 and (c["c"] < prev_h or c["c"] < c["o"]):
                                is_sweep = True
                                break

                    has_confluence = False
                    for ob in obs:
                        if not ob["is_bull"] and ob["low"] <= price_val <= ob["high"]:
                            has_confluence = True
                            break
                    if not has_confluence:
                        for fvg in fvgs:
                            if not fvg["is_bull"] and fvg["bot"] <= price_val <= fvg["top"]:
                                has_confluence = True
                                break

                    is_meaningful = rel_vol >= 1.2 or rev_str >= 0.005 or is_sweep or is_impulse
                    if not is_meaningful:
                        continue

                    body_bottom = c["o"] if c["c"] > c["o"] else (prev["o"] if prev["c"] > prev["o"] else c["c"])
                    high_wick = c["h"]

                    all_pivots.append({
                        "price": price_val,
                        "volume": vol,
                        "time": time_val,
                        "type": "high",
                        "tf": tf,
                        "idx": i,
                        "tf_weight": {"1w": 0.4, "1d": 0.3, "4h": 0.2, "1h": 0.1}[tf],
                        "rel_vol": rel_vol,
                        "rev_str": rev_str,
                        "is_sweep": is_sweep,
                        "has_confluence": has_confluence,
                        "caused_bos": check_high_caused_bos(i, price_val),
                        "body_bottom": body_bottom,
                        "high_wick": high_wick
                    })

                # Process low pivots
                all_low_indices = sorted(list(set(swL + impL)))
                for i in all_low_indices:
                    c = candles[i]
                    prev = candles[i-1] if i > 0 else c
                    is_impulse = i in impL
                    price_val = c["o"] if is_impulse else c["l"]
                    vol = c["v"]
                    time_val = c["t"]
                    rel_vol = vol / (avg_vol if avg_vol > 0 else 1.0)

                    max_move = 0.0
                    for j in range(i + 1, min(i + 8, n_c)):
                        d = abs(candles[j]["c"] - price_val)
                        if d > max_move:
                            max_move = d
                    rev_str = max_move / price_val if price_val > 0 else 0.0

                    is_sweep = False
                    for j in range(max(N_sw, i - 30), i):
                        if j in swL:
                            prev_l = candles[j]["l"]
                            if price_val < prev_l and (prev_l - price_val) / price_val <= 0.015 and (c["c"] > prev_l or c["c"] > c["o"]):
                                is_sweep = True
                                break

                    has_confluence = False
                    for ob in obs:
                        if ob["is_bull"] and ob["low"] <= price_val <= ob["high"]:
                            has_confluence = True
                            break
                    if not has_confluence:
                        for fvg in fvgs:
                            if fvg["is_bull"] and fvg["bot"] <= price_val <= fvg["top"]:
                                has_confluence = True
                                break

                    is_meaningful = rel_vol >= 1.2 or rev_str >= 0.005 or is_sweep or is_impulse
                    if not is_meaningful:
                        continue

                    body_top = c["o"] if c["c"] < c["o"] else (prev["o"] if prev["c"] < prev["o"] else c["c"])
                    low_wick = c["l"]

                    all_pivots.append({
                        "price": price_val,
                        "volume": vol,
                        "time": time_val,
                        "type": "low",
                        "tf": tf,
                        "idx": i,
                        "tf_weight": {"1w": 0.4, "1d": 0.3, "4h": 0.2, "1h": 0.1}[tf],
                        "rel_vol": rel_vol,
                        "rev_str": rev_str,
                        "is_sweep": is_sweep,
                        "has_confluence": has_confluence,
                        "caused_bos": check_low_caused_bos(i, price_val),
                        "body_top": body_top,
                        "low_wick": low_wick
                    })

            daily_candles = mtf_candles.get("1d", []) or candles
            current_price = price
            
            daily_atr_list = calculate_atr(daily_candles, 14)
            daily_atr = daily_atr_list[-1] if len(daily_atr_list) > 0 else (current_price * 0.015)
            
            daily_closes = [c["c"] for c in daily_candles]
            daily_ema50_list = calculate_ema(daily_closes, 50)
            daily_ema50 = daily_ema50_list[-1] if len(daily_ema50_list) > 0 else current_price
            trend_bullish = current_price > daily_ema50
            
            max_h = max(c["h"] for c in daily_candles) if daily_candles else current_price * 1.1
            min_l = min(c["l"] for c in daily_candles) if daily_candles else current_price * 0.9

            final_support = []
            final_resistance = []
            major_support_zone = None
            major_resistance_zone = None

            if all_pivots:
                support_pivots = [p for p in all_pivots if p["type"] == "low"]
                resistance_pivots = [p for p in all_pivots if p["type"] == "high"]

                def build_clusters(pivots, atr_val):
                    pivots.sort(key=lambda x: x["price"])
                    clusters_list = []
                    for p in pivots:
                        if not clusters_list:
                            clusters_list.append([p])
                        else:
                            last_cluster = clusters_list[-1]
                            avg_price = sum(cp["price"] for cp in last_cluster) / len(last_cluster)
                            if abs(p["price"] - avg_price) < 0.5 * atr_val:
                                last_cluster.append(p)
                            else:
                                clusters_list.append([p])
                    return clusters_list

                def make_zone(pivots_list):
                    is_low = pivots_list[0]["type"] == "low"
                    if is_low:
                        zone_low = min(p.get("low_wick", p["price"]) for p in pivots_list)
                        body_tops = [p.get("body_top", p["price"]) for p in pivots_list]
                        zone_high = sum(body_tops) / len(body_tops)
                        
                        if zone_high <= zone_low:
                            zone_high = zone_low + 0.2 * daily_atr
                        if zone_high - zone_low > 1.5 * daily_atr:
                            zone_high = zone_low + 1.5 * daily_atr
                    else:
                        zone_high = max(p.get("high_wick", p["price"]) for p in pivots_list)
                        body_bottoms = [p.get("body_bottom", p["price"]) for p in pivots_list]
                        zone_low = sum(body_bottoms) / len(body_bottoms)
                        
                        if zone_low >= zone_high:
                            zone_low = zone_high - 0.2 * daily_atr
                        if zone_high - zone_low > 1.5 * daily_atr:
                            zone_low = zone_high - 1.5 * daily_atr
                    
                    return {
                        "pivots": pivots_list,
                        "price": (zone_low + zone_high) / 2,
                        "high": zone_high,
                        "low": zone_low
                    }

                support_clusters = build_clusters(support_pivots, daily_atr)
                resistance_clusters = build_clusters(resistance_pivots, daily_atr)

                support_zones = [make_zone(c) for c in support_clusters]
                resistance_zones = [make_zone(c) for c in resistance_clusters]

                def merge_zones(zones_list):
                    merged = True
                    zones = list(zones_list)
                    while merged:
                        merged = False
                        zones.sort(key=lambda x: x["price"])
                        next_zones = []
                        i = 0
                        while i < len(zones):
                            if i == len(zones) - 1:
                                next_zones.append(zones[i])
                                i += 1
                            else:
                                if zones[i+1]["price"] - zones[i]["price"] < 0.5 * daily_atr:
                                    combined_pivots = zones[i]["pivots"] + zones[i+1]["pivots"]
                                    next_zones.append(make_zone(combined_pivots))
                                    i += 2
                                    merged = True
                                else:
                                    next_zones.append(zones[i])
                                    i += 1
                        zones = next_zones
                    return zones

                final_support_zones = merge_zones(support_zones)
                final_resistance_zones = merge_zones(resistance_zones)

                def check_retest(zone, candles_1d):
                    last_time = max(p["time"] for p in zone["pivots"])
                    start_idx = -1
                    for idx, c in enumerate(candles_1d):
                        if c["t"] > last_time:
                            start_idx = idx
                            break
                    if start_idx == -1:
                        return False
                    
                    has_broken_out = False
                    has_touched = False
                    has_breached = False
                    is_support = zone["price"] < current_price
                    
                    for k in range(start_idx, len(candles_1d)):
                        c = candles_1d[k]
                        if is_support:
                            if not has_broken_out:
                                if c["c"] > zone["high"]:
                                    has_broken_out = True
                            else:
                                if c["l"] <= zone["high"]:
                                    has_touched = True
                                    if c["c"] < zone["low"]:
                                        has_breached = True
                                        break
                        else:
                            if not has_broken_out:
                                if c["c"] < zone["low"]:
                                    has_broken_out = True
                            else:
                                if c["h"] >= zone["low"]:
                                    has_touched = True
                                    if c["c"] > zone["high"]:
                                        has_breached = True
                                        break
                    return has_broken_out and has_touched and not has_breached

                def check_psychological(p_val, sym):
                    import math
                    step = 10000
                    if "BTC" in sym:
                        step = 5000
                    elif "ETH" in sym:
                        step = 500
                    elif p_val > 100:
                        step = 50
                    elif p_val > 10:
                        step = 5
                    else:
                        step = 1
                    
                    low_b = float(math.floor(p_val / step) * step)
                    high_b = float(math.ceil(p_val / step) * step)
                    if abs(p_val - low_b) / p_val <= 0.01:
                        return True
                    if abs(p_val - high_b) / p_val <= 0.01:
                        return True
                    return False

                def get_grade(s_val):
                    if s_val >= 9.0:
                        return "AAA Institutional Zone"
                    if s_val >= 8.0:
                        return "AA Strong Zone"
                    return "A Tradable Zone"

                import time
                current_price_time = daily_candles[-1]["t"] if daily_candles else int(time.time() * 1000)

                def score_zone(zone):
                    tfs = [p["tf"] for p in zone["pivots"]]
                    if "1w" in tfs:
                        tf_points = 10.0
                    elif "1d" in tfs:
                        tf_points = 7.5
                    elif "4h" in tfs:
                        tf_points = 5.0
                    else:
                        tf_points = 2.5
                        
                    has_bos = any(p.get("caused_bos", False) for p in zone["pivots"])
                    bos_points = 10.0 if has_bos else 0.0
                    
                    has_sweep = any(p.get("is_sweep", False) for p in zone["pivots"])
                    sweep_points = 10.0 if has_sweep else 0.0
                    
                    has_conf = any(p.get("has_confluence", False) for p in zone["pivots"])
                    ob_points = 10.0 if has_conf else 0.0
                    
                    structure_score = (tf_points * 0.4) + (bos_points * 0.3) + (sweep_points * 0.2) + (ob_points * 0.1)
                    
                    is_retested = check_retest(zone, daily_candles)
                    retest_score = 10.0 if is_retested else 0.0
                    
                    avg_rel_vol = sum(p.get("rel_vol", 0) for p in zone["pivots"]) / len(zone["pivots"])
                    volume_score = min(10.0, avg_rel_vol * 3.0)
                    
                    t_start_pivot = max(p["time"] for p in zone["pivots"])
                    age_days = (current_price_time - t_start_pivot) / (1000 * 60 * 60 * 24)
                    if age_days > 90.0:
                        return None
                    
                    import math
                    freshness_score = 10.0 * math.exp(-age_days / 45.0)
                    
                    base_score = (structure_score * 0.40) + (retest_score * 0.25) + (volume_score * 0.20) + (freshness_score * 0.15)
                    
                    if not has_conf and not has_sweep:
                        base_score = min(base_score, 6.5)
                        
                    is_psych = check_psychological(zone["price"], symbol)
                    score_val = base_score * 1.1 if is_psych else base_score
                    score_val = max(1.0, min(score_val, 10.0))
                    
                    zone_start = min(p["time"] for p in zone["pivots"])
                    
                    return {
                        "price": zone["price"],
                        "high": zone["high"],
                        "low": zone["low"],
                        "t_start": zone_start,
                        "reactions": len(zone["pivots"]),
                        "score": score_val,
                        "grade": get_grade(score_val),
                        "debug_info": {
                            "structure": structure_score,
                            "retest": retest_score,
                            "volume": volume_score,
                            "freshness": freshness_score,
                            "has_conf": has_conf,
                            "has_sweep": has_sweep,
                            "is_retested": is_retested
                        }
                    }

                scored_support = [score_zone(z) for z in final_support_zones]
                scored_support = [z for z in scored_support if z is not None]

                scored_resistance = [score_zone(z) for z in final_resistance_zones]
                scored_resistance = [z for z in scored_resistance if z is not None]

                valid_support = [z for z in scored_support if z["price"] < current_price and z["score"] >= min_score]
                valid_resistance = [z for z in scored_resistance if z["price"] > current_price and z["score"] >= min_score]

                if valid_support:
                    valid_support.sort(key=lambda x: x["price"], reverse=True)
                    nearest_sup = dict(valid_support[0])
                    nearest_sup["label"] = f"Nearest Support ({nearest_sup['grade']})"
                    final_support.append(nearest_sup)

                    by_score = sorted(valid_support, key=lambda x: x["score"], reverse=True)
                    major_support_zone = by_score[0]
                    count = 0
                    for s in by_score:
                        if s["price"] != nearest_sup["price"] and count < 2:
                            item = dict(s)
                            item["label"] = f"Major Support ({s['grade']})"
                            final_support.append(item)
                            count += 1
                    final_support.sort(key=lambda x: x["price"], reverse=True)

                if valid_resistance:
                    valid_resistance.sort(key=lambda x: x["price"])
                    nearest_res = dict(valid_resistance[0])
                    nearest_res["label"] = f"Nearest Resistance ({nearest_res['grade']})"
                    final_resistance.append(nearest_res)

                    by_score = sorted(valid_resistance, key=lambda x: x["score"], reverse=True)
                    major_resistance_zone = by_score[0]
                    count = 0
                    for r in by_score:
                        if r["price"] != nearest_res["price"] and count < 2:
                            item = dict(r)
                            item["label"] = f"Major Resistance ({r['grade']})"
                            final_resistance.append(item)
                            count += 1
                    final_resistance.sort(key=lambda x: x["price"])

            # Formatting Volatility
            atr_pct = (daily_atr / price) * 100 if price > 0 else 0.0
            vol_status = "High Volatility" if atr_pct > 2.5 else "Normal Volatility"
            confluences.append({"type": "neutral", "txt": f"Volatility: ATR at ${daily_atr:.2f} ({atr_pct:.2f}% of price) — {vol_status}"})

            # Dynamic Analysis Text Creation
            analysis = (
                f"### **Market Structure & Trend**\n"
                f"The {symbol} market exhibits a **{bias}** structure on the **{interval}** time frame. "
                f"The price is currently trading **{'above' if price > ef else 'below'}** the EMA20 ({ef:.2f}) and **{'above' if price > es else 'below'}** the EMA50 ({es:.2f}). "
                f"This indicates a **{'solid uptrend' if fast_above_slow else 'prevailing downtrend'}** configuration in secondary trend indicators.\n\n"
                f"### **Momentum & Volatility**\n"
                f"The RSI stands at **{rv:.1f}**, reflecting **{'neutral' if 30 <= rv <= 70 else 'overextended'}** momentum. "
                f"The MACD histogram is **{'bullish' if hist > 0 else 'bearish'}** at **{hist:.4f}**. "
                f"Bollinger Bands show the asset is trading **{'above the midline' if price > bbm else 'below the midline'}** within a **{atr_pct:.2f}%** volatility band.\n\n"
                f"### **Order Flow & Institutional Zones**\n"
                f"The order book depth registers **{abs(imbalance * 100):.1f}% {'bid dominance' if imbalance > 0 else 'ask dominance'}** within the top 30 bid/ask levels. "
                f"Smart Money analysis has detected **{'active bullish imbalances' if recent_bull_fvg else 'no immediate unmitigated bullish zones'}** "
                f"and **{'significant bearish supply zones' if recent_bear_fvg else 'balanced price delivery'}** in the immediate vicinity.\n\n"
                f"### **Trading Plan Guidance**\n"
            )

            nearest_support_val = final_support[0]["price"] if final_support else price * 0.98
            nearest_resistance_val = final_resistance[0]["price"] if final_resistance else price * 1.02
            
            major_support_val = major_support_zone["price"] if major_support_zone else (final_support[0]["price"] if final_support else price * 0.95)
            major_resistance_val = major_resistance_zone["price"] if major_resistance_zone else (final_resistance[0]["price"] if final_resistance else price * 1.05)

            if bias == "STRONG BULLISH" or bias == "BULLISH":
                analysis += (
                    f"**BIAS: LONG / BUY**\n"
                    f"Confluences are strongly aligned to the upside. Consider positioning long near local support at **${nearest_support_val:.2f}** or pullbacks to the EMA20 ({ef:.2f}). "
                    f"Define stop losses below the major institutional swing low support levels at **${major_support_val:.2f}** if entered. Target immediate swing high resistance at **${nearest_resistance_val:.2f}**."
                )
            elif bias == "STRONG BEARISH" or bias == "BEARISH":
                analysis += (
                    f"**BIAS: SHORT / SELL**\n"
                    f"Confluences show distinct distribution patterns. Look for short entries on retracements towards the nearest resistance at **${nearest_resistance_val:.2f}** or the EMA20/EMA50 resistance block. "
                    f"Set protective stop-loss limits above major swing resistance at **${major_resistance_val:.2f}**. Immediate downside targets are located around nearest support levels at **${nearest_support_val:.2f}**."
                )
            else:
                analysis += (
                    f"**BIAS: NEUTRAL / RANGE**\n"
                    f"Trend indicators are currently conflicted. Recommending a flat exposure style, waiting for consolidation breakouts beyond boundaries "
                    f"({nearest_support_val:.2f} - {nearest_resistance_val:.2f}) or volatility squeeze expansion before establishing risk."
                )

            matrix_data = {}
            if calculate_matrix:
                matrix_intervals = ["5m", "15m", "1h", "4h", "1d"]
                with ThreadPoolExecutor(max_workers=len(matrix_intervals)) as executor:
                    future_to_tf = {
                        executor.submit(self.analyze_market_structure, symbol, tf, False, min_score): tf
                        for tf in matrix_intervals
                    }
                    for future in future_to_tf:
                        tf = future_to_tf[future]
                        try:
                            res = future.result()
                            matrix_data[tf] = {
                                "bias": res.get("bias", "NEUTRAL"),
                                "score": res.get("score", 0.0),
                                "longProb": res.get("longProb", 50),
                                "shortProb": res.get("shortProb", 50)
                            }
                        except Exception as e:
                            matrix_data[tf] = {"bias": "NEUTRAL", "score": 0.0, "longProb": 50, "shortProb": 50}

            out_dict = {
                "bias": bias,
                "score": score,
                "confluences": confluences,
                "longProb": long_pct,
                "shortProb": short_pct,
                "levels": {
                    "support": [{"price": z["price"], "high": z["high"], "low": z["low"], "label": z["label"], "score": z["score"]} for z in final_support],
                    "resistance": [{"price": z["price"], "high": z["high"], "low": z["low"], "label": z["label"], "score": z["score"]} for z in final_resistance]
                },
                "analysis": analysis
            }
            if calculate_matrix:
                out_dict["matrix"] = matrix_data
            return out_dict

        except Exception as e:
            print(f"  [AI Copilot Error] {e}")
            import traceback
            traceback.print_exc()
            err_dict = {
                "bias": "NEUTRAL",
                "confluences": [{"type": "neutral", "txt": f"Analysis failed: {str(e)}"}],
                "score": 0.0,
                "longProb": 50,
                "shortProb": 50,
                "levels": {"support": [], "resistance": []},
                "analysis": "AI Market Analysis is temporarily unavailable due to a processing error."
            }
            if calculate_matrix:
                err_dict["matrix"] = {}
            return err_dict
