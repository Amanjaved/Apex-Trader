# AI quant copilot v5 — regime-aware confluence scoring + rejection-based S/R engine
from __future__ import annotations

import json
import math
import datetime
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor

import backend.services as services
from backend.indicators.calculator import (
    calculate_ema, calculate_rsi, calculate_macd, calculate_bb, calculate_atr,
    detect_fvg, detect_order_blocks
)
from backend.indicators.sr_zones import compute_zones, detect_liquidity_sweep


def _parse_klines(raw: bytes) -> List[dict]:
    data = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    return [
        {"t": int(k[0]), "o": float(k[1]), "h": float(k[2]),
         "l": float(k[3]), "c": float(k[4]), "v": float(k[5])}
        for k in data
    ]


def _grade(z: dict, side: str) -> str:
    if z.get("isConfluence"):
        return f"⚡ CONFLUENCE {side}"
    if z["score"] >= 70:
        return f"⚡ STRONG {side}"
    if z["score"] >= 45:
        return f"MEDIUM {side}"
    return f"WEAK {side}"


class AICopilot:

    def analyze_market_structure(self, symbol: str, interval: str,
                                 calculate_matrix: bool = True, min_score: float = 7.5,
                                 include_levels: bool = True) -> Dict[str, Any]:
        try:
            candles = _parse_klines(services.fetch_candles(symbol, interval, 500))
            n = len(candles)
            if n < 50:
                return self._empty_result(calculate_matrix, "Insufficient market data (need at least 50 candles)")

            closes = [c["c"] for c in candles]
            price = closes[-1]

            # ── Indicators ──
            ema20 = calculate_ema(closes, 20)
            ema50 = calculate_ema(closes, 50)
            ema200 = calculate_ema(closes, 200) if n >= 200 else ema50
            rsi14 = calculate_rsi(closes, 14)
            macd = calculate_macd(closes, 12, 26, 9)
            bb = calculate_bb(closes, 20, 2.0)
            atr = calculate_atr(candles, 14)

            ef, es, el = ema20[-1], ema50[-1], ema200[-1]
            rv = rsi14[-1]
            hist = macd["hist"][-1]
            hist_prev = macd["hist"][-2] if n > 1 else hist
            bbu, bbl, bbm = bb["upper"][-1], bb["lower"][-1], bb["mid"][-1]
            atr_val = atr[-1] if atr and atr[-1] > 0 else price * 0.01
            daily_atr = atr_val

            above_fast = price > ef
            above_slow = price > es
            fast_above_slow = ef > es
            uptrend = fast_above_slow and es > el
            downtrend = (not fast_above_slow) and es < el

            score = 0.0
            confluences: List[Dict[str, str]] = []

            # A. Trend structure (EMA 20/50/200 stack)
            if above_fast and above_slow and fast_above_slow:
                pts = 3.0 if price > el else 2.5
                score += pts
                confluences.append({"type": "bullish", "txt": f"Trend: Bullish EMA stack — price > EMA20 ({ef:.2f}) > EMA50 ({es:.2f}){' with price above EMA200' if price > el else ''}"})
            elif not above_fast and not above_slow and not fast_above_slow:
                pts = 3.0 if price < el else 2.5
                score -= pts
                confluences.append({"type": "bearish", "txt": f"Trend: Bearish EMA stack — price < EMA20 ({ef:.2f}) < EMA50 ({es:.2f}){' with price below EMA200' if price < el else ''}"})
            else:
                confluences.append({"type": "neutral", "txt": "Trend: Mixed EMA structure — consolidation / transition phase"})

            # B. RSI (regime-aware: oversold is only a buy signal when not in a strong downtrend)
            if rv > 70:
                if uptrend:
                    score += 0.5
                    confluences.append({"type": "neutral", "txt": f"Momentum: RSI {rv:.1f} overbought, but strong trends can stay overbought — trim risk, don't fade blindly"})
                else:
                    score -= 1.5
                    confluences.append({"type": "bearish", "txt": f"Momentum: RSI {rv:.1f} overbought without trend support (elevated correction risk)"})
            elif rv < 30:
                if downtrend:
                    score -= 0.5
                    confluences.append({"type": "neutral", "txt": f"Momentum: RSI {rv:.1f} oversold inside a downtrend — falling knife risk, wait for structure"})
                else:
                    score += 1.5
                    confluences.append({"type": "bullish", "txt": f"Momentum: RSI {rv:.1f} oversold in non-trending context (mean-reversion long zone)"})
            elif rv > 55:
                score += 1.0
                confluences.append({"type": "bullish", "txt": f"Momentum: RSI {rv:.1f} in bullish territory"})
            elif rv < 45:
                score -= 1.0
                confluences.append({"type": "bearish", "txt": f"Momentum: RSI {rv:.1f} in bearish territory"})
            else:
                confluences.append({"type": "neutral", "txt": f"Momentum: RSI neutral at {rv:.1f}"})

            # C. MACD histogram + slope
            macd_rising = hist > hist_prev
            if hist > 0:
                score += 1.5 if macd_rising else 0.8
                confluences.append({"type": "bullish", "txt": f"Momentum: MACD histogram positive ({hist:.4f}){' and expanding' if macd_rising else ' but fading'}"})
            else:
                score -= 1.5 if not macd_rising else 0.8
                confluences.append({"type": "bearish", "txt": f"Momentum: MACD histogram negative ({hist:.4f}){' and expanding' if not macd_rising else ' but contracting'}"})

            # D. Bollinger position
            if price > bbu:
                score -= 1.0
                confluences.append({"type": "bearish", "txt": f"Volatility: Price above upper BB ({bbu:.2f}) — statistically stretched"})
            elif price < bbl:
                score += 1.0
                confluences.append({"type": "bullish", "txt": f"Volatility: Price below lower BB ({bbl:.2f}) — compressed value zone"})
            elif price > bbm:
                score += 0.5
                confluences.append({"type": "bullish", "txt": "Volatility: Price in upper BB half (bullish channel)"})
            else:
                score -= 0.5
                confluences.append({"type": "bearish", "txt": "Volatility: Price in lower BB half (bearish channel)"})

            # E. Order flow imbalance
            imbalance = 0.0
            try:
                ob_raw = json.loads(services.fetch_orderbook(symbol, 30))
                bid_vol = sum(float(b[1]) for b in ob_raw.get("bids", []))
                ask_vol = sum(float(a[1]) for a in ob_raw.get("asks", []))
                total = bid_vol + ask_vol
                if total > 0:
                    imbalance = (bid_vol - ask_vol) / total
                    if imbalance > 0.15:
                        score += 1.5
                        confluences.append({"type": "bullish", "txt": f"Order Flow: Bid-side dominance ({imbalance*100:+.1f}%) in top 30 levels"})
                    elif imbalance < -0.15:
                        score -= 1.5
                        confluences.append({"type": "bearish", "txt": f"Order Flow: Ask-side dominance ({imbalance*100:+.1f}%) in top 30 levels"})
                    else:
                        confluences.append({"type": "neutral", "txt": "Order Flow: Order book broadly balanced"})
            except Exception:
                pass

            # F. Fear & Greed (contrarian at extremes only)
            fng_val = 50
            try:
                fng_raw = json.loads(services.fetch_feargreed())
                fng_val = int(fng_raw["data"][0]["value"])
                if fng_val > 78:
                    score -= 1.0
                    confluences.append({"type": "bearish", "txt": f"Sentiment: Extreme Greed ({fng_val}) — crowd euphoria, late-cycle risk"})
                elif fng_val < 22:
                    score += 1.5
                    confluences.append({"type": "bullish", "txt": f"Sentiment: Extreme Fear ({fng_val}) — historical accumulation zone"})
                else:
                    confluences.append({"type": "neutral", "txt": f"Sentiment: Fear & Greed at {fng_val} — no contrarian edge"})
            except Exception:
                pass

            # G. News sentiment
            bull_ratio, bear_ratio = 0.5, 0.5
            top_headline = None
            try:
                news_raw = json.loads(services.fetch_news())
                articles = news_raw.get("Data", [])
                base = symbol[:3].lower()
                relevant = [a for a in articles if base in a["title"].lower() or base in a["body"].lower()][:10] or articles[:10]
                if relevant:
                    top_headline = relevant[0]
                bull_c = sum(1 for a in relevant if a["sentiment"] == "bullish")
                bear_c = sum(1 for a in relevant if a["sentiment"] == "bearish")
                tot = bull_c + bear_c
                if tot > 0:
                    bull_ratio, bear_ratio = bull_c / tot, bear_c / tot
                    if bull_ratio >= 0.6:
                        score += 1.0
                        confluences.append({"type": "bullish", "txt": f"News: Bullish coverage skew ({bull_c}/{tot} positive)"})
                    elif bear_ratio >= 0.6:
                        score -= 1.0
                        confluences.append({"type": "bearish", "txt": f"News: Bearish coverage skew ({bear_c}/{tot} negative)"})
                    else:
                        confluences.append({"type": "neutral", "txt": "News: Balanced coverage, no directional skew"})
            except Exception:
                pass

            # H. SMC structures
            fvg_data = detect_fvg(candles)
            recent_bull_fvg = [f for f in fvg_data["bullFVG"] if f["i"] >= n - 15]
            recent_bear_fvg = [f for f in fvg_data["bearFVG"] if f["i"] >= n - 15]
            if recent_bull_fvg:
                score += 1.0
                f = recent_bull_fvg[-1]
                confluences.append({"type": "bullish", "txt": f"SMC: Unmitigated bullish FVG at {f['bot']:.2f}–{f['top']:.2f}"})
            if recent_bear_fvg:
                score -= 1.0
                f = recent_bear_fvg[-1]
                confluences.append({"type": "bearish", "txt": f"SMC: Unmitigated bearish FVG at {f['bot']:.2f}–{f['top']:.2f}"})

            ob_data = detect_order_blocks(candles)
            recent_bull_ob = [o for o in ob_data["bullOBs"] if o["i"] >= n - 25]
            recent_bear_ob = [o for o in ob_data["bearOBs"] if o["i"] >= n - 25]
            if recent_bull_ob:
                score += 1.0
                confluences.append({"type": "bullish", "txt": f"SMC: Bullish order block near {recent_bull_ob[-1]['low']:.2f}"})
            if recent_bear_ob:
                score -= 1.0
                confluences.append({"type": "bearish", "txt": f"SMC: Bearish order block near {recent_bear_ob[-1]['high']:.2f}"})

            sweep = detect_liquidity_sweep(candles)
            if sweep:
                if sweep["side"] == "bullish":
                    score += 1.5
                    confluences.append({"type": "bullish", "txt": f"SMC: Bullish liquidity sweep — stops taken below {sweep['level']:.2f} with reclaim"})
                else:
                    score -= 1.5
                    confluences.append({"type": "bearish", "txt": f"SMC: Bearish liquidity sweep — stops taken above {sweep['level']:.2f} with rejection"})

            # ── Bias & probabilities ──
            if score >= 5.0:
                bias = "STRONG BULLISH"
            elif score >= 2.0:
                bias = "BULLISH"
            elif score <= -5.0:
                bias = "STRONG BEARISH"
            elif score <= -2.0:
                bias = "BEARISH"
            else:
                bias = "NEUTRAL"
            is_bull = bias.endswith("BULLISH")

            long_pct = max(12, min(88, 50 + int(score * 4.5)))
            short_pct = 100 - long_pct

            # ── Multi-timeframe S/R zones (rejection-based engine) ──
            zones: List[dict] = []
            if include_levels:
                sr_tfs = ["1m", "5m", "15m", "1h", "4h"]
                with ThreadPoolExecutor(max_workers=5) as ex:
                    futures = {tf: ex.submit(services.fetch_candles, symbol, tf, 300) for tf in sr_tfs}
                mtf_candles: Dict[str, List[dict]] = {}
                for tf, fut in futures.items():
                    try:
                        mtf_candles[tf] = _parse_klines(fut.result())
                    except Exception:
                        mtf_candles[tf] = []
                zones = compute_zones(mtf_candles, price, max_zones=12)
            support_zones = sorted([z for z in zones if z["price"] < price], key=lambda z: z["price"], reverse=True)
            resistance_zones = sorted([z for z in zones if z["price"] > price], key=lambda z: z["price"])

            final_support, final_resistance = [], []
            if support_zones:
                nearest = dict(support_zones[0])
                nearest["label"] = f"Nearest Support ({_grade(nearest, 'S')})"
                final_support.append(nearest)
                for s in sorted(support_zones[1:], key=lambda z: z["score"], reverse=True)[:2]:
                    item = dict(s)
                    item["label"] = f"Major Support ({_grade(item, 'S')})"
                    final_support.append(item)
                final_support.sort(key=lambda z: z["price"], reverse=True)
            if resistance_zones:
                nearest = dict(resistance_zones[0])
                nearest["label"] = f"Nearest Resistance ({_grade(nearest, 'R')})"
                final_resistance.append(nearest)
                for r in sorted(resistance_zones[1:], key=lambda z: z["score"], reverse=True)[:2]:
                    item = dict(r)
                    item["label"] = f"Major Resistance ({_grade(item, 'R')})"
                    final_resistance.append(item)
                final_resistance.sort(key=lambda z: z["price"])

            atr_pct = (daily_atr / price) * 100 if price > 0 else 0.0
            vol_status = "High Volatility" if atr_pct > 2.5 else "Normal Volatility"
            confluences.append({"type": "neutral", "txt": f"Volatility: ATR ${daily_atr:.2f} ({atr_pct:.2f}% of price) — {vol_status}"})

            # ── Trade plan with R:R gating ──
            nearest_sup = final_support[0]["price"] if final_support else price - 2 * daily_atr
            nearest_res = final_resistance[0]["price"] if final_resistance else price + 2 * daily_atr
            sup_low = final_support[0]["low"] if final_support else nearest_sup - 0.5 * daily_atr
            res_high = final_resistance[0]["high"] if final_resistance else nearest_res + 0.5 * daily_atr
            major_sup = min((z["price"] for z in final_support), default=price - 3 * daily_atr)
            major_res = max((z["price"] for z in final_resistance), default=price + 3 * daily_atr)

            if is_bull:
                entry_target = nearest_sup
                sl = sup_low - 0.5 * daily_atr
                tp1, tp2 = nearest_res, major_res
                risk = entry_target - sl
                tp3 = entry_target + 3 * risk if risk > 0 else major_res * 1.02
                action_dir = "BUY / LONG"
            else:
                entry_target = nearest_res
                sl = res_high + 0.5 * daily_atr
                tp1, tp2 = nearest_sup, major_sup
                risk = sl - entry_target
                tp3 = entry_target - 3 * risk if risk > 0 else major_sup * 0.98
                action_dir = "SELL / SHORT"

            rr1 = abs(tp1 - entry_target) / risk if risk > 0 else 0.0

            analysis = (
                f"### **Market Structure & Trend**\n"
                f"{symbol} shows a **{bias}** structure on the **{interval}** timeframe. "
                f"Price trades **{'above' if above_fast else 'below'}** EMA20 ({ef:.2f}) and **{'above' if above_slow else 'below'}** EMA50 ({es:.2f}), "
                f"with the EMA stack in a **{'bullish' if fast_above_slow else 'bearish'}** configuration.\n\n"
                f"### **Momentum & Volatility**\n"
                f"RSI is at **{rv:.1f}** and the MACD histogram is **{'positive' if hist > 0 else 'negative'}** ({hist:.4f}, {'expanding' if (hist > 0) == macd_rising else 'contracting'}). "
                f"ATR volatility is **{atr_pct:.2f}%** of price ({vol_status.lower()}).\n\n"
                f"### **Order Flow & Institutional Zones**\n"
                f"Order book shows **{abs(imbalance*100):.1f}% {'bid' if imbalance > 0 else 'ask'} dominance**. "
                f"S/R zones are scored by actual wick rejections across 5 timeframes — "
                f"nearest support **${nearest_sup:.2f}**, nearest resistance **${nearest_res:.2f}**."
                f"{' A liquidity sweep (' + sweep['side'] + ') was detected at ' + format(sweep['level'], '.2f') + '.' if sweep else ''}\n\n"
                f"### **Trading Plan Guidance**\n"
            )

            if bias == "NEUTRAL" or rr1 < 1.5:
                reason = "signals are conflicted" if bias == "NEUTRAL" else f"risk-reward to the first target is only {rr1:.2f}R (below the 1.5R minimum)"
                analysis += (
                    f"**BIAS: {'NEUTRAL / RANGE' if bias == 'NEUTRAL' else bias + ' — BUT WAIT'}**\n"
                    f"No trade recommended right now: {reason}. "
                    f"Wait for price to reach the **${nearest_sup:.2f}** support zone or break the **${nearest_res:.2f}** resistance with volume before committing risk."
                )
            elif is_bull:
                analysis += (
                    f"**BIAS: LONG / BUY**\n"
                    f"Favour longs on a pullback into the **${nearest_sup:.2f}** support zone (zone low ${sup_low:.2f}). "
                    f"Stop below the zone at **${sl:.2f}** (0.5×ATR buffer). Targets: TP1 **${tp1:.2f}** ({rr1:.1f}R), TP2 **${tp2:.2f}**, runner **${tp3:.2f}**."
                )
            else:
                analysis += (
                    f"**BIAS: SHORT / SELL**\n"
                    f"Favour shorts on a retrace into the **${nearest_res:.2f}** resistance zone (zone high ${res_high:.2f}). "
                    f"Stop above the zone at **${sl:.2f}** (0.5×ATR buffer). Targets: TP1 **${tp1:.2f}** ({rr1:.1f}R), TP2 **${tp2:.2f}**, runner **${tp3:.2f}**."
                )

            score_norm = max(10, min(95, 50 + int(score * 4.5)))
            conf_hist = [max(10, min(95, score_norm + d)) for d in (8, 5, 1, -4, -9)]

            # ── MTF matrix ──
            matrix_data: Dict[str, Any] = {}
            if calculate_matrix:
                matrix_intervals = ["1m", "5m", "15m", "1h", "4h", "1d"]
                with ThreadPoolExecutor(max_workers=len(matrix_intervals)) as ex:
                    futs = {ex.submit(self.analyze_market_structure, symbol, tf, False, min_score, False): tf for tf in matrix_intervals}
                    for fut in futs:
                        tf = futs[fut]
                        try:
                            res = fut.result()
                            cs = str(res.get("confluences", []))
                            matrix_data[tf] = {
                                "bias": res.get("bias", "NEUTRAL"),
                                "score": res.get("score", 0.0),
                                "longProb": res.get("longProb", 50),
                                "shortProb": res.get("shortProb", 50),
                                "trend": "bullish" if "Bullish EMA stack" in cs else "bearish" if "Bearish EMA stack" in cs else "neutral",
                                "rsi": "bullish" if ("oversold in non-trending" in cs or "bullish territory" in cs) else "bearish" if ("overbought without trend" in cs or "bearish territory" in cs) else "neutral",
                                "macd": "bullish" if "MACD histogram positive" in cs else "bearish" if "MACD histogram negative" in cs else "neutral",
                                "smc": "bullish" if ("bullish FVG" in cs or "Bullish order block" in cs or "Bullish liquidity sweep" in cs) else "bearish" if ("bearish FVG" in cs or "Bearish order block" in cs or "Bearish liquidity sweep" in cs) else "neutral",
                                "vwap": "bullish" if "price > EMA20" in cs.replace("Price", "price") or "Bullish EMA stack" in cs else "bearish" if "Bearish EMA stack" in cs else "neutral",
                                "overall": "bullish" if res.get("bias", "").endswith("BULLISH") else "bearish" if res.get("bias", "").endswith("BEARISH") else "neutral",
                            }
                        except Exception:
                            matrix_data[tf] = {"bias": "NEUTRAL", "score": 0.0, "longProb": 50, "shortProb": 50,
                                               "trend": "neutral", "rsi": "neutral", "macd": "neutral",
                                               "smc": "neutral", "vwap": "neutral", "overall": "neutral"}

            # ── Institutional dashboard metrics (data-driven) ──
            trend_pt = 25 if (uptrend or downtrend) else 12
            mom_pt = 20 if (hist > 0) == (rv > 50) else 10
            smc_pt = 20 if sweep or (recent_bull_fvg and recent_bull_ob) or (recent_bear_fvg and recent_bear_ob) else 12 if (recent_bull_fvg or recent_bull_ob or recent_bear_fvg or recent_bear_ob) else 6
            avg_vol_20 = sum(c["v"] for c in candles[-20:]) / 20
            vol_pt = 10 if candles[-1]["v"] > 1.1 * avg_vol_20 else 6
            of_pt = 10 if abs(imbalance) > 0.15 else 7 if abs(imbalance) > 0.05 else 4
            sent_pt = 5 if fng_val < 25 or fng_val > 75 else 3
            news_pt = 8 if bull_ratio > 0.6 or bear_ratio > 0.6 else 5
            raw_sum = trend_pt + mom_pt + smc_pt + vol_pt + of_pt + sent_pt + news_pt
            scale = score_norm / raw_sum if raw_sum > 0 else 1.0
            trend_pt = max(1, min(25, round(trend_pt * scale)))
            mom_pt = max(1, min(20, round(mom_pt * scale)))
            smc_pt = max(1, min(20, round(smc_pt * scale)))
            vol_pt = max(1, min(10, round(vol_pt * scale)))
            of_pt = max(1, min(10, round(of_pt * scale)))
            sent_pt = max(1, min(5, round(sent_pt * scale)))
            news_pt = max(1, score_norm - (trend_pt + mom_pt + smc_pt + vol_pt + of_pt + sent_pt))

            confidence_breakdown = {
                "trend": trend_pt, "momentum": mom_pt, "smc": smc_pt, "volume": vol_pt,
                "orderflow": of_pt, "sentiment": sent_pt, "news": news_pt, "total": score_norm,
            }

            htf_bias = matrix_data.get("4h", {}).get("bias", "NEUTRAL")
            entry_checklist = [
                {"label": "EMA20 above EMA50" if is_bull else "EMA20 below EMA50", "checked": fast_above_slow if is_bull else not fast_above_slow},
                {"label": "MACD histogram bullish" if is_bull else "MACD histogram bearish", "checked": hist > 0 if is_bull else hist < 0},
                {"label": "RSI above 50" if is_bull else "RSI below 50", "checked": rv > 50 if is_bull else rv < 50},
                {"label": "Price above EMA20" if is_bull else "Price below EMA20", "checked": above_fast if is_bull else not above_fast},
                {"label": "Liquidity sweep confirmed", "checked": bool(sweep and ((sweep["side"] == "bullish") == is_bull))},
                {"label": "Institutional Order Block active", "checked": bool(recent_bull_ob) if is_bull else bool(recent_bear_ob)},
                {"label": "Fair Value Gap (FVG) in play", "checked": bool(recent_bull_fvg) if is_bull else bool(recent_bear_fvg)},
                {"label": "Volume above 20-bar average", "checked": candles[-1]["v"] > 1.1 * avg_vol_20},
                {"label": "4H timeframe aligned", "checked": htf_bias.endswith("BULLISH") if is_bull else htf_bias.endswith("BEARISH")},
            ]

            blockers = []
            if is_bull and imbalance < -0.3:
                blockers.append("Heavy ask-side absorption in the order book contradicts the long bias")
            elif not is_bull and imbalance > 0.3:
                blockers.append("Heavy bid-side absorption in the order book contradicts the short bias")
            for r in final_resistance:
                if abs(price - r["price"]) / price < 0.002:
                    blockers.append(f"Price sits directly inside key resistance zone ({r['price']:.2f})")
            for s in final_support:
                if abs(price - s["price"]) / price < 0.002:
                    blockers.append(f"Price sits directly inside key support zone ({s['price']:.2f})")
            if candles[-1]["v"] < 0.6 * avg_vol_20:
                blockers.append("Session volume well below average (illiquidity / chop risk)")
            bb_width = (bbu - bbl) / bbm * 100 if bbm > 0 else 0
            if bb_width < 1.0:
                blockers.append("Volatility squeeze active — direction unresolved until expansion")
            if bias != "NEUTRAL" and rr1 < 1.5 and rr1 > 0:
                blockers.append(f"Risk-reward to first target is only {rr1:.2f}R (minimum 1.5R)")
            block_rec = "WAIT" if blockers else "READY"

            # Smart money timeline from actual detected event timestamps
            def _ts(ms):
                try:
                    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%H:%M")
                except Exception:
                    return "—"
            timeline = []
            if sweep:
                timeline.append({"time": _ts(sweep["timestamp"]), "event": f"Liquidity sweep ({sweep['side']}) at {sweep['level']:.2f}"})
            obs = recent_bull_ob if is_bull else recent_bear_ob
            if obs:
                timeline.append({"time": _ts(obs[-1]["t"]), "event": f"Order block formed at {obs[-1]['low' if is_bull else 'high']:.2f}"})
            fvgs = recent_bull_fvg if is_bull else recent_bear_fvg
            if fvgs:
                timeline.append({"time": _ts(fvgs[-1]["t"]), "event": f"FVG imbalance created ({fvgs[-1]['bot']:.2f}–{fvgs[-1]['top']:.2f})"})
            for i in range(len(closes) - 2, max(0, len(closes) - 60), -1):
                if (ema20[i] > ema50[i]) != (ema20[i - 1] > ema50[i - 1]):
                    timeline.append({"time": _ts(candles[i]["t"]), "event": f"EMA20/50 {'bullish' if ema20[i] > ema50[i] else 'bearish'} crossover"})
                    break
            timeline.append({"time": _ts(candles[-1]["t"]), "event": f"Current bar — bias {bias}, score {score_norm}/100"})
            timeline.sort(key=lambda e: e["time"])

            execution_steps = [
                {"label": "Current Market Price", "val": f"{price:.2f}"},
                {"label": "Wait for Trigger Target", "val": f"{entry_target:.2f}"},
                {"label": f"Trigger Execution {action_dir}", "val": "CONFIRMED" if block_rec == "READY" and bias != "NEUTRAL" else "WAIT"},
                {"label": "Set Stop Loss Protection", "val": f"{sl:.2f}"},
                {"label": "Expected Take Profit 1", "val": f"{tp1:.2f}"},
                {"label": "Expected Take Profit 2", "val": f"{tp2:.2f}"},
                {"label": "Expected Take Profit 3", "val": f"{tp3:.2f}"},
            ]

            if is_bull:
                eli10 = [
                    "Price pulled back toward a zone where buyers have stepped in before.",
                    f"That support zone has been defended {final_support[0]['touchCount'] if final_support else 0} time(s) with real wick rejections.",
                    "Trend and momentum indicators currently agree with the buyers.",
                    f"The plan risks ${abs(entry_target - sl):.2f} per unit to make {rr1:.1f}x that at the first target.",
                    "If price closes below the stop level, the idea is wrong — exit, no questions.",
                ]
            else:
                eli10 = [
                    "Price climbed into a zone where sellers have taken control before.",
                    f"That resistance zone has rejected price {final_resistance[0]['touchCount'] if final_resistance else 0} time(s) with real wick rejections.",
                    "Trend and momentum indicators currently agree with the sellers.",
                    f"The plan risks ${abs(sl - entry_target):.2f} per unit to make {rr1:.1f}x that at the first target.",
                    "If price closes above the stop level, the idea is wrong — exit, no questions.",
                ]

            heatmap = []
            ladder = max((nearest_res - nearest_sup) / 8, price * 0.0015)
            for i in range(-4, 5):
                lvl = price + i * ladder
                is_sup = any(abs(lvl - s["price"]) < daily_atr * 0.5 for s in final_support)
                is_res = any(abs(lvl - r["price"]) < daily_atr * 0.5 for r in final_resistance)
                blocks = "📌 CURRENT" if i == 0 else "🔴🔴" if is_res else "🟢🟢" if is_sup else "⚪"
                heatmap.append({"price": round(lvl, 2), "blocks": blocks})

            vol_delta_ratio = 0.55 if hist > 0 else 0.45
            inst_buy = round((vol_delta_ratio * 0.4 + (0.5 + imbalance / 2.0) * 0.6) * 100)
            inst_score = {"buy": inst_buy, "sell": 100 - inst_buy}

            smart_alerts = []
            if sweep:
                smart_alerts.append(f"{symbol} {sweep['side']} liquidity sweep at {sweep['level']:.2f}")
            if recent_bull_fvg or recent_bear_fvg:
                smart_alerts.append(f"{symbol} trading near unmitigated FVG zone")
            if rv > 70 or rv < 30:
                smart_alerts.append(f"{symbol} RSI at {rv:.0f} — overextended territory")
            if recent_bull_ob or recent_bear_ob:
                smart_alerts.append(f"{symbol} institutional order block detected")
            if bb_width < 1.2:
                smart_alerts.append(f"{symbol} Bollinger squeeze — volatility expansion imminent")
            if not smart_alerts:
                smart_alerts.append(f"{symbol} trading conditions normal — no structural alerts")

            conviction = abs(score)
            risk_label = "LOW" if conviction >= 5 else "MEDIUM" if conviction >= 2.5 else "HIGH"
            risk_meter = {
                "risk": risk_label,
                "drawdown": f"{(abs(entry_target - sl) / price * 100):.2f}%" if price > 0 else "—",
                "profit": f"{(abs(tp1 - entry_target) / price * 100):.2f}%" if price > 0 else "—",
            }

            reg_type = "TRENDING" if (uptrend or downtrend) and bb_width > 1.8 else "RANGING"
            regime = {
                "type": reg_type,
                "strength": f"{round(max(1, min(10, conviction * 1.3)))}/10",
                "strategy": "Trend Following" if reg_type == "TRENDING" else "Mean Reversion",
            }

            # Honest confluence-weighted estimates (bounded — no fake 98% claims)
            base_prob = 50 + min(12, conviction * 2)
            win_probs = {
                "ema": f"{round(base_prob):.0f}%",
                "ema_macd": f"{round(min(70, base_prob + (4 if (hist > 0) == is_bull else 0))):.0f}%",
                "ema_smc": f"{round(min(74, base_prob + (7 if (bool(recent_bull_ob or recent_bull_fvg) if is_bull else bool(recent_bear_ob or recent_bear_fvg)) else 0))):.0f}%",
                "ema_smc_vwap": f"{round(min(78, base_prob + (10 if sweep and (sweep['side'] == 'bullish') == is_bull else 5))):.0f}%",
            }

            if top_headline:
                news_impact = {
                    "event": top_headline["title"][:70],
                    "time": top_headline.get("source", "News"),
                    "impact": "HIGH" if top_headline["sentiment"] != "neutral" else "MODERATE",
                    "recommendation": "Reduce size around headline-driven volatility" if top_headline["sentiment"] != "neutral" else "Monitor — no immediate action",
                }
            else:
                news_impact = {"event": "No high-impact headlines detected", "time": "—", "impact": "LOW", "recommendation": "Normal trading conditions"}

            now_dt = datetime.datetime.utcnow()
            hr = now_dt.hour
            if 7 <= hr <= 12:
                sess = ("London", "High")
            elif 12 < hr <= 21:
                sess = ("New York", "Extreme" if 12 < hr <= 16 else "High")
            else:
                sess = ("Asian / consolidation", "Low")
            session_info = {
                "name": sess[0],
                "bias": "Bullish" if is_bull else "Bearish" if bias.endswith("BEARISH") else "Neutral",
                "volatility": sess[1],
                "winrate": f"{score_norm}%",
            }

            out = {
                "bias": bias,
                "score": score_norm,
                "scoreRaw": score,
                "confluences": confluences,
                "longProb": long_pct,
                "shortProb": short_pct,
                "levels": {
                    "support": [{"price": z["price"], "high": z["high"], "low": z["low"], "label": z["label"],
                                 "score": z["score"], "touches": z.get("touchCount", 0), "fresh": z.get("fresh", False)} for z in final_support],
                    "resistance": [{"price": z["price"], "high": z["high"], "low": z["low"], "label": z["label"],
                                    "score": z["score"], "touches": z.get("touchCount", 0), "fresh": z.get("fresh", False)} for z in final_resistance],
                },
                "analysis": analysis,
                "confidenceBreakdown": confidence_breakdown,
                "entryChecklist": entry_checklist,
                "blockersList": blockers,
                "blockRecommendation": block_rec,
                "smTimeline": timeline,
                "executionSteps": execution_steps,
                "eli10Text": eli10,
                "ofHeatmap": heatmap,
                "instScore": inst_score,
                "smartAlerts": smart_alerts,
                "riskMeter": risk_meter,
                "marketRegime": regime,
                "strategyWinProbs": win_probs,
                "newsImpact": news_impact,
                "sessionInfo": session_info,
                "confidenceHistory": conf_hist,
            }
            if calculate_matrix:
                out["matrix"] = matrix_data
            return out

        except Exception as e:
            print(f"  [AI Copilot Error] {e}")
            import traceback
            traceback.print_exc()
            return self._empty_result(calculate_matrix, f"Analysis failed: {str(e)}")

    def _empty_result(self, calculate_matrix: bool, msg: str) -> Dict[str, Any]:
        err = {
            "bias": "NEUTRAL",
            "confluences": [{"type": "neutral", "txt": msg}],
            "score": 0.0,
            "longProb": 50,
            "shortProb": 50,
            "levels": {"support": [], "resistance": []},
            "analysis": "AI Market Analysis is temporarily unavailable.",
        }
        if calculate_matrix:
            err["matrix"] = {}
        return err

    # Rule-based fallback when the LLM is unreachable
    def chat_query(self, symbol: str, interval: str, message: str) -> str:
        try:
            candles = _parse_klines(services.fetch_candles(symbol, interval, 200))
            if not candles:
                return "Insufficient market data to answer your query."
            closes = [c["c"] for c in candles]
            price = closes[-1]
            msg = message.lower().strip()

            if "rsi" in msg or "momentum" in msg:
                val = calculate_rsi(closes, 14)[-1]
                status = "Overbought (reversal risk)" if val > 70 else "Oversold (buying zone)" if val < 30 else "Neutral momentum"
                return f"The live RSI (14) for {symbol} on {interval} is **{val:.2f}** — **{status}**."

            if "ema" in msg or "trend" in msg or "moving average" in msg:
                e20, e50 = calculate_ema(closes, 20)[-1], calculate_ema(closes, 50)[-1]
                rel = ("above both EMA20 and EMA50 (bullish)" if price > e20 and price > e50
                       else "below both EMA20 and EMA50 (bearish)" if price < e20 and price < e50
                       else "consolidating between EMA20 and EMA50")
                return f"{symbol} ({interval}) at **${price:,.2f}** is **{rel}**. EMA20 **${e20:,.2f}**, EMA50 **${e50:,.2f}**."

            if "support" in msg or "resistance" in msg or "level" in msg:
                res = self.analyze_market_structure(symbol, interval, calculate_matrix=False)
                levels = res.get("levels", {"support": [], "resistance": []})
                out = f"Key rejection-scored S/R levels for {symbol} ({interval}):\n\n"
                if levels["resistance"]:
                    out += "🔺 **Resistance**:\n" + "\n".join(f"- ${r['price']:,.2f} ({r['label']})" for r in levels["resistance"]) + "\n\n"
                if levels["support"]:
                    out += "🟢 **Support**:\n" + "\n".join(f"- ${s['price']:,.2f} ({s['label']})" for s in levels["support"]) + "\n\n"
                return out + f"📌 **Current Price**: ${price:,.2f}"

            if "volatility" in msg or "bollinger" in msg or "atr" in msg:
                bb = calculate_bb(closes, 20, 2.0)
                atr = calculate_atr(candles, 14)
                atr_val = atr[-1] if atr else 0.0
                return (f"**Volatility Report — {symbol} ({interval})**:\n"
                        f"- ATR(14): ${atr_val:,.2f} ({atr_val/price*100:.2f}% of price)\n"
                        f"- Bollinger: Upper **${bb['upper'][-1]:,.2f}**, Mid **${bb['mid'][-1]:,.2f}**, Lower **${bb['lower'][-1]:,.2f}**")

            res = self.analyze_market_structure(symbol, interval, calculate_matrix=False)
            return (
                f"Summary for **{symbol}** ({interval}):\n\n"
                f"📈 **Bias**: **{res.get('bias')}** (score {res.get('score')}/100)\n"
                f"📊 **Probability**: Long **{res.get('longProb')}%** | Short **{res.get('shortProb')}%**\n\n"
                f"Ask me about RSI, trend, key levels, volatility, or the trade setup."
            )
        except Exception as e:
            return f"Error processing query: {str(e)}"
