import { S } from '../settings/state.js';
import { D } from '../settings/dom.js';

// Get input value helper from state/DOM
function getInpVal(el, def) {
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

// ─────────────────────────────────────────────
//  INDICATORS CACHE
// ─────────────────────────────────────────────
export const IC = {
  _ref: null, _count: 0, _lastT: 0, _lastC: 0, _keys: {},
  get(key, fn) {
    const n = S.candles.length;
    const last = n ? S.candles[n-1] : null;
    const t = last ? last.t : 0;
    const c = last ? last.c : 0;
    if (this._ref !== S.candles || this._count !== n || this._lastT !== t || this._lastC !== c) {
      this._ref = S.candles; this._count = n; this._lastT = t; this._lastC = c;
      this._keys = {};
    }
    if (!(key in this._keys)) this._keys[key] = fn();
    return this._keys[key];
  },
  clear() { this._keys = {}; this._ref = null; this._count = 0; this._lastT = 0; this._lastC = 0; }
};

// Cached closes helper to prevent repeated S.candles.map allocation
export function getCloses() {
  return IC.get(`closes_${S.candles.length}`, () => {
    const n = S.candles.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = S.candles[i].c;
    return out;
  });
}

// EMA — TradingView compatible: seed = first close, k = 2/(p+1)
export function getEMA(closes, period) {
  return IC.get(`ema_${period}_${closes.length}`, () => {
    const n = closes.length;
    const out = new Float64Array(n);
    if (n === 0) return out;
    const k = 2 / (period + 1);
    out[0] = closes[0];
    for (let i = 1; i < n; i++) out[i] = closes[i] * k + out[i-1] * (1 - k);
    return out;
  });
}

// SMA — simple sliding window (O(n))
export function getSMA(closes, period) {
  return IC.get(`sma_${period}_${closes.length}`, () => {
    const n = closes.length;
    const out = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += closes[i];
      if (i >= period) sum -= closes[i - period];
      out[i] = i >= period - 1 ? sum / period : closes[i];
    }
    return out;
  });
}

// Bollinger Bands — online variance formula (numerically stable)
export function getBB(closes, period, stdMult) {
  return IC.get(`bb_${period}_${stdMult}_${closes.length}`, () => {
    const n = closes.length;
    const upper = new Float64Array(n);
    const mid   = new Float64Array(n);
    const lower = new Float64Array(n);
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = closes[i];
      sum += v; sumSq += v * v;
      if (i >= period) {
        const old = closes[i - period];
        sum -= old; sumSq -= old * old;
      }
      if (i >= period - 1) {
        const m = sum / period;
        const variance = Math.max(0, sumSq / period - m * m);
        const sd = Math.sqrt(variance);
        mid[i]   = m;
        upper[i] = m + stdMult * sd;
        lower[i] = m - stdMult * sd;
      } else {
        mid[i] = upper[i] = lower[i] = closes[i];
      }
    }
    return { upper, mid, lower };
  });
}

// RSI — Wilder (RMA) smoothing — matches TradingView exactly
export function getRSI(closes, period) {
  return IC.get(`rsi_${period}_${closes.length}`, () => {
    const n = closes.length;
    const out = new Float64Array(n);
    if (n < period + 1) return out;
    let ag = 0, al = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i-1];
      if (d > 0) ag += d; else al -= d;
    }
    ag /= period; al /= period;
    out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < n; i++) {
      const d = closes[i] - closes[i-1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  });
}

// MACD — EMA(fast) - EMA(slow), signal = EMA(macd, sig)
export function getMACD(closes, fast, slow, sig) {
  return IC.get(`macd_${fast}_${slow}_${sig}_${closes.length}`, () => {
    const ef = getEMA(closes, fast);
    const es = getEMA(closes, slow);
    const n = closes.length;
    const macdLine = new Float64Array(n);
    for (let i = 0; i < n; i++) macdLine[i] = ef[i] - es[i];
    const sigLine = getEMA(Array.from(macdLine), sig);
    const hist = new Float64Array(n);
    for (let i = 0; i < n; i++) hist[i] = macdLine[i] - sigLine[i];
    return { macdLine, sigLine, hist };
  });
}

// ATR — Wilder smoothing (RMA)
export function getATR(candles, period) {
  return IC.get(`atr_${period}_${candles.length}`, () => {
    const n = candles.length;
    const out = new Float64Array(n);
    if (n < 2) return out;
    const tr = new Float64Array(n);
    tr[0] = candles[0].h - candles[0].l;
    for (let i = 1; i < n; i++) {
      const hl  = candles[i].h - candles[i].l;
      const hpc = Math.abs(candles[i].h - candles[i-1].c);
      const lpc = Math.abs(candles[i].l - candles[i-1].c);
      tr[i] = Math.max(hl, hpc, lpc);
    }
    let atr = 0;
    if (n < period) return out;
    for (let i = 0; i < period; i++) atr += tr[i];
    atr /= period;
    out[period - 1] = atr;
    for (let i = period; i < n; i++) {
      atr = (atr * (period - 1) + tr[i]) / period;
      out[i] = atr;
    }
    return out;
  });
}

// Stochastic — %K = (C - lowest(L,k)) / (highest(H,k) - lowest(L,k)) * 100, %D = SMA(%K, d)
export function getStoch(candles, kp, dp) {
  return IC.get(`stoch_${kp}_${dp}_${candles.length}`, () => {
    const n = candles.length;
    const k = new Float64Array(n);
    const d = new Float64Array(n);
    for (let i = kp - 1; i < n; i++) {
      let minL = Infinity, maxH = -Infinity;
      for (let j = i - kp + 1; j <= i; j++) {
        if (candles[j].l < minL) minL = candles[j].l;
        if (candles[j].h > maxH) maxH = candles[j].h;
      }
      k[i] = maxH === minL ? 50 : (candles[i].c - minL) / (maxH - minL) * 100;
    }
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += k[i];
      if (i >= dp) sum -= k[i - dp];
      d[i] = i >= dp - 1 ? sum / dp : k[i];
    }
    return { k, d };
  });
}

// VWAP — resets at each UTC midnight (matches TradingView daily VWAP)
export function getVWAP(candles) {
  return IC.get(`vwap_${candles.length}`, () => {
    const n = candles.length;
    const out = new Float64Array(n);
    let tpv = 0, vol = 0, lastDay = -1;
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const day = Math.floor(c.t / 86400000);
      if (day !== lastDay) { tpv = 0; vol = 0; lastDay = day; }
      const tp = (c.h + c.l + c.c) / 3;
      tpv += tp * c.v; vol += c.v;
      out[i] = vol > 0 ? tpv / vol : tp;
    }
    return out;
  });
}

// Ichimoku — TradingView standard (9,26,52), displacement +26
export function getIchimoku(candles, t9 = 9, k26 = 26, s52 = 52) {
  return IC.get(`ichi_${t9}_${k26}_${s52}_${candles.length}`, () => {
    const n = candles.length;
    const tenkan = new Float64Array(n);
    const kijun  = new Float64Array(n);
    const sA     = new Float64Array(n);
    const sB     = new Float64Array(n);
    const donchian = (len, i) => {
      let h = -Infinity, l = Infinity;
      const start = Math.max(0, i - len + 1);
      for (let j = start; j <= i; j++) {
        if (candles[j].h > h) h = candles[j].h;
        if (candles[j].l < l) l = candles[j].l;
      }
      return (h + l) / 2;
    };
    for (let i = 0; i < n; i++) {
      tenkan[i] = donchian(t9, i);
      kijun[i]  = donchian(k26, i);
    }
    // Senkou spans displaced +26 (proper lookback calculation for finite array)
    for (let i = 0; i < n; i++) {
      if (i >= k26) {
        sA[i] = (tenkan[i - k26] + kijun[i - k26]) / 2;
        sB[i] = donchian(s52, i - k26);
      } else {
        sA[i] = (tenkan[0] + kijun[0]) / 2;
        sB[i] = donchian(s52, 0);
      }
    }
    return { tenkan, kijun, sA, sB };
  });
}

// OBV — On-Balance Volume
export function getOBV(candles) {
  return IC.get(`obv_${candles.length}`, () => {
    const n = candles.length;
    const out = new Float64Array(n);
    let sum = 0;
    for (let i = 1; i < n; i++) {
      if (candles[i].c > candles[i-1].c)      sum += candles[i].v;
      else if (candles[i].c < candles[i-1].c) sum -= candles[i].v;
      out[i] = sum;
    }
    return out;
  });
}

// Heikin-Ashi — TradingView-compatible seed
export function toHeikin(src) {
  return IC.get(`ha_${src.length}`, () => {
    const n = src.length;
    const ha = new Array(n);
    if (n === 0) return ha;
    const f = src[0];
    const hc0 = (f.o + f.h + f.l + f.c) * 0.25;
    const ho0 = (f.o + f.c) * 0.5;
    ha[0] = { t:f.t, o:ho0, c:hc0, h:Math.max(f.h,ho0,hc0), l:Math.min(f.l,ho0,hc0), v:f.v };
    for (let i = 1; i < n; i++) {
      const s = src[i], p = ha[i-1];
      const o = (p.o + p.c) * 0.5;
      const c = (s.o + s.h + s.l + s.c) * 0.25;
      ha[i] = { t:s.t, o, c, h:Math.max(s.h,o,c), l:Math.min(s.l,o,c), v:s.v };
    }
    return ha;
  });
}

// Swing pivot detection (N bars each side)
export function detectSwings(candles, N = 5) {
  return IC.get(`swings_${N}_${candles.length}`, () => {
    const highs = [], lows = [];
    const n = candles.length;
    for (let i = N; i < n - N; i++) {
      let isH = true, isL = true;
      for (let j = 1; j <= N; j++) {
        if (candles[i-j].h >= candles[i].h || candles[i+j].h > candles[i].h) isH = false;
        if (candles[i-j].l <= candles[i].l || candles[i+j].l < candles[i].l) isL = false;
      }
      if (isH) highs.push({ i, price: candles[i].h, t: candles[i].t, o: candles[i].o, c: candles[i].c });
      if (isL) lows.push ({ i, price: candles[i].l, t: candles[i].t, o: candles[i].o, c: candles[i].c });
    }
    return { highs, lows };
  });
}

// Smart S/R levels from a separate higher-TF candle set
export function calculateSmartSR() {
  // Use multi-timeframe candles if available, else fall back to S.srCandles (daily-ish)
  const mtfCandles = S.srCandlesMTF || { "1d": S.srCandles || [] };
  
  const allPivots = [];
  const N = 5;

  // Helper for Order Blocks and FVG detection on a timeframe
  function detectOBsAndFVGsLocal(candlesList) {
    const obs = [];
    const fvgs = [];
    const n = candlesList.length;
    if (n < 5) return { obs, fvgs };
    
    // Order Blocks
    for (let i = 1; i < n - 2; i++) {
      const c = candlesList[i];
      const next1 = candlesList[i+1];
      const next2 = candlesList[i+2];
      if (c.c < c.o && next1.c > next1.o && next2.c > next2.o && next2.c > c.h) {
        obs.push({ low: c.l, high: c.h, isBull: true });
      }
      if (c.c > c.o && next1.c < next1.o && next2.c < next2.o && next2.c < c.l) {
        obs.push({ low: c.l, high: c.h, isBull: false });
      }
    }
    // FVGs
    for (let i = 1; i < n - 1; i++) {
      const prev = candlesList[i-1];
      const next = candlesList[i+1];
      if (next.l > prev.h) {
        fvgs.push({ bot: prev.h, top: next.l, isBull: true });
      }
      if (next.h < prev.l) {
        fvgs.push({ bot: next.h, top: prev.l, isBull: false });
      }
    }
    return { obs, fvgs };
  }

  // 1. Process each timeframe
  const timeframes = ["1w", "1d", "4h", "1h"];
  timeframes.forEach(tf => {
    const candles = mtfCandles[tf];
    if (!candles || candles.length < 15) return;
    const n = candles.length;
    const avgVol = candles.reduce((acc, c) => acc + c.v, 0) / n;
    
    // Determine ATR on this timeframe to identify impulse breakout origins
    const closes = candles.map(c => c.c);
    
    // Calculate ATR locally
    const tr = new Float64Array(n);
    tr[0] = candles[0].h - candles[0].l;
    for (let i = 1; i < n; i++) {
      const hl  = candles[i].h - candles[i].l;
      const hpc = Math.abs(candles[i].h - candles[i-1].c);
      const lpc = Math.abs(candles[i].l - candles[i-1].c);
      tr[i] = Math.max(hl, hpc, lpc);
    }
    let sumTr = 0;
    for (let i = 0; i < 14 && i < n; i++) sumTr += tr[i];
    let atr_tf = sumTr / Math.min(14, n);
    for (let i = 14; i < n; i++) {
      atr_tf = (atr_tf * 13 + tr[i]) / 14;
    }
    if (isNaN(atr_tf) || atr_tf <= 0) {
      atr_tf = closes[closes.length - 1] * 0.015;
    }

    // Get local OBs & FVGs
    const { obs, fvgs } = detectOBsAndFVGsLocal(candles);
    
    const swH = [], swL = [];
    for (let i = N; i < n - N; i++) {
      let isH = true, isL = true;
      for (let j = 1; j <= N; j++) {
        if (candles[i-j].h >= candles[i].h || candles[i+j].h > candles[i].h) isH = false;
        if (candles[i-j].l <= candles[i].l || candles[i+j].l < candles[i].l) isL = false;
      }
      if (isH) swH.push(i);
      if (isL) swL.push(i);
    }

    // Impulse Breakout Origins
    const impH = [], impL = [];
    for (let i = 1; i < n; i++) {
      const c = candles[i];
      const body = Math.abs(c.c - c.o);
      if (body > 2.0 * atr_tf) {
        if (c.c > c.o) impL.push(i);
        else impH.push(i);
      }
    }

    // BOS/CHOCH lookahead trace checks
    function checkHighCausedBOS(i, price_val) {
      for (let k = i + 1; k < Math.min(i + 51, n); k++) {
        for (let j = Math.max(0, i - 100); j < i; j++) {
          if (swL.includes(j)) {
            const prevL = candles[j].l;
            if (candles[k].c < prevL) {
              let isMax = true;
              for (let m = j; m <= k; m++) {
                if (candles[m].h > price_val + 0.001 * price_val) { isMax = false; break; }
              }
              if (isMax) return true;
            }
          }
        }
      }
      return false;
    }

    function checkLowCausedBOS(i, price_val) {
      for (let k = i + 1; k < Math.min(i + 51, n); k++) {
        for (let j = Math.max(0, i - 100); j < i; j++) {
          if (swH.includes(j)) {
            const prevH = candles[j].h;
            if (candles[k].c > prevH) {
              let isMin = true;
              for (let m = j; m <= k; m++) {
                if (candles[m].l < price_val - 0.001 * price_val) { isMin = false; break; }
              }
              if (isMin) return true;
            }
          }
        }
      }
      return false;
    }
    
    // Process swing highs and bear impulse breakout origins
    const allHighIndices = Array.from(new Set([...swH, ...impH]));
    allHighIndices.forEach(i => {
      const c = candles[i];
      const prev = candles[i-1] || c;
      const isImpulse = impH.includes(i);
      
      const price = isImpulse ? c.o : c.h;
      const vol = c.v;
      const time = c.t;
      const relVol = vol / (avgVol || 1);
      
      let maxMove = 0;
      for (let j = i + 1; j < Math.min(i + 8, n); j++) {
        const d = Math.abs(candles[j].c - price);
        if (d > maxMove) maxMove = d;
      }
      const revStr = maxMove / price;
      
      // Sweep check
      let isSweep = false;
      for (let j = Math.max(N, i - 30); j < i; j++) {
        if (swH.includes(j)) {
          const prevH = candles[j].h;
          if (price > prevH && (price - prevH) / price <= 0.015 && (c.c < prevH || c.c < c.o)) {
            isSweep = true;
            break;
          }
        }
      }
      
      // OB Confluence
      let hasConfluence = false;
      for (const ob of obs) {
        if (!ob.isBull && price >= ob.low && price <= ob.high) { hasConfluence = true; break; }
      }
      if (!hasConfluence) {
        for (const fvg of fvgs) {
          if (!fvg.isBull && price >= fvg.bot && price <= fvg.top) { hasConfluence = true; break; }
        }
      }

      // Noise Filter: Only add if meaningful or impulse
      const isMeaningful = relVol >= 1.2 || revStr >= 0.005 || isSweep || isImpulse;
      if (!isMeaningful) return;

      const body_bottom = c.c > c.o ? c.o : (prev.c > prev.o ? prev.o : c.c);
      const high_wick = c.h;

      allPivots.push({
        price, volume: vol, time, type: 'high', tf, idx: i,
        tf_weight: { "1w": 0.4, "1d": 0.3, "4h": 0.2, "1h": 0.1 }[tf],
        relVol, revStr, isSweep, hasConfluence,
        causedBOS: checkHighCausedBOS(i, price),
        body_bottom, high_wick
      });
    });
    
    // Process swing lows and bull impulse breakout origins
    const allLowIndices = Array.from(new Set([...swL, ...impL]));
    allLowIndices.forEach(i => {
      const c = candles[i];
      const prev = candles[i-1] || c;
      const isImpulse = impL.includes(i);
      
      const price = isImpulse ? c.o : c.l;
      const vol = c.v;
      const time = c.t;
      const relVol = vol / (avgVol || 1);
      
      let maxMove = 0;
      for (let j = i + 1; j < Math.min(i + 8, n); j++) {
        const d = Math.abs(candles[j].c - price);
        if (d > maxMove) maxMove = d;
      }
      const revStr = maxMove / price;
      
      // Sweep check
      let isSweep = false;
      for (let j = Math.max(N, i - 30); j < i; j++) {
        if (swL.includes(j)) {
          const prevL = candles[j].l;
          if (price < prevL && (prevL - price) / price <= 0.015 && (c.c > prevL || c.c > c.o)) {
            isSweep = true;
            break;
          }
        }
      }
      
      // OB Confluence
      let hasConfluence = false;
      for (const ob of obs) {
        if (ob.isBull && price >= ob.low && price <= ob.high) { hasConfluence = true; break; }
      }
      if (!hasConfluence) {
        for (const fvg of fvgs) {
          if (fvg.isBull && price >= fvg.bot && price <= fvg.top) { hasConfluence = true; break; }
        }
      }

      const isMeaningful = relVol >= 1.2 || revStr >= 0.005 || isSweep || isImpulse;
      if (!isMeaningful) return;

      const body_top = c.c < c.o ? c.o : (prev.c < prev.o ? prev.o : c.c);
      const low_wick = c.l;

      allPivots.push({
        price, volume: vol, time, type: 'low', tf, idx: i,
        tf_weight: { "1w": 0.4, "1d": 0.3, "4h": 0.2, "1h": 0.1 }[tf],
        relVol, revStr, isSweep, hasConfluence,
        causedBOS: checkLowCausedBOS(i, price),
        body_top, low_wick
      });
    });
  });

  if (allPivots.length === 0) {
    S.srLevels = { support: [], resistance: [], demand: [], supply: [] };
    return;
  }

  // 2. Determine base parameters using Daily candles if available
  const dailyCandles = mtfCandles["1d"] || S.srCandles || [];
  const currentPrice = S.candles.length ? S.candles[S.candles.length - 1].c : (dailyCandles.length ? dailyCandles[dailyCandles.length - 1].c : 0);
  
  const atrArr = getATR(dailyCandles, 14);
  const atr = (atrArr && atrArr.length > 0) ? atrArr[atrArr.length - 1] : (currentPrice * 0.015);

  const maxH = dailyCandles.length ? Math.max(...dailyCandles.map(c => c.h)) : currentPrice * 1.1;
  const minL = dailyCandles.length ? Math.min(...dailyCandles.map(c => c.l)) : currentPrice * 0.9;

  const dailyCloses = dailyCandles.map(c => c.c);
  const ema50Arr = getEMA(dailyCloses, 50);
  const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : currentPrice;
  const trendBullish = currentPrice > ema50;

  // 3. Split support and resistance pivots, cluster independently
  const supportPivots = allPivots.filter(p => p.type === 'low');
  const resistancePivots = allPivots.filter(p => p.type === 'high');

  function buildClusters(pivots, atr) {
    pivots.sort((a, b) => a.price - b.price);
    const clusters = [];
    for (const p of pivots) {
      if (clusters.length === 0) {
        clusters.push([p]);
      } else {
        const lastCluster = clusters[clusters.length - 1];
        const avgPrice = lastCluster.reduce((sum, cp) => sum + cp.price, 0) / lastCluster.length;
        if (Math.abs(p.price - avgPrice) < 0.5 * atr) {
          lastCluster.push(p);
        } else {
          clusters.push([p]);
        }
      }
    }
    return clusters;
  }

  // 4. Sizing boundaries function (wick-to-body limits)
  function makeZone(pivotsList) {
    const isLow = pivotsList[0].type === 'low';
    let zoneLow, zoneHigh;
    
    if (isLow) {
      zoneLow = Math.min(...pivotsList.map(p => p.low_wick || p.price));
      const bodyTops = pivotsList.map(p => p.body_top || p.price);
      zoneHigh = bodyTops.reduce((sum, v) => sum + v, 0) / bodyTops.length;
      
      if (zoneHigh <= zoneLow) zoneHigh = zoneLow + 0.2 * atr;
      if (zoneHigh - zoneLow > 1.5 * atr) zoneHigh = zoneLow + 1.5 * atr;
    } else {
      zoneHigh = Math.max(...pivotsList.map(p => p.high_wick || p.price));
      const bodyBottoms = pivotsList.map(p => p.body_bottom || p.price);
      zoneLow = bodyBottoms.reduce((sum, v) => sum + v, 0) / bodyBottoms.length;
      
      if (zoneLow >= zoneHigh) zoneLow = zoneHigh - 0.2 * atr;
      if (zoneHigh - zoneLow > 1.5 * atr) zoneLow = zoneHigh - 1.5 * atr;
    }
    
    return {
      pivots: pivotsList,
      price: (zoneLow + zoneHigh) / 2,
      high: zoneHigh,
      low: zoneLow
    };
  }

  const supportClusters = buildClusters(supportPivots, atr);
  const resistanceClusters = buildClusters(resistancePivots, atr);

  let supportZones = supportClusters.map(makeZone);
  let resistanceZones = resistanceClusters.map(makeZone);

  // 5. Merge nearby zones independently (< 0.5 * ATR)
  function mergeZones(zonesList) {
    let merged = true;
    let zones = [...zonesList];
    while (merged) {
      merged = false;
      zones.sort((a, b) => a.price - b.price);
      const nextZones = [];
      for (let i = 0; i < zones.length; i++) {
        if (i === zones.length - 1) {
          nextZones.push(zones[i]);
        } else {
          if (zones[i+1].price - zones[i].price < 0.5 * atr) {
            const combinedPivots = [...zones[i].pivots, ...zones[i+1].pivots];
            nextZones.push(makeZone(combinedPivots));
            i++; // skip next
            merged = true;
          } else {
            nextZones.push(zones[i]);
          }
        }
      }
      zones = nextZones;
    }
    return zones;
  }

  const finalSupportZones = mergeZones(supportZones);
  const finalResistanceZones = mergeZones(resistanceZones);

  // Retest verification check on Daily candles
  function checkRetest(zone, candles1d) {
    const lastTime = Math.max(...zone.pivots.map(p => p.time));
    const startIdx = candles1d.findIndex(c => c.t > lastTime);
    if (startIdx === -1) return false;
    
    let hasBrokenOut = false;
    let hasTouched = false;
    let hasBreached = false;
    
    const isSupport = zone.price < currentPrice;
    
    for (let k = startIdx; k < candles1d.length; k++) {
      const c = candles1d[k];
      if (isSupport) {
        if (!hasBrokenOut) {
          if (c.c > zone.high) hasBrokenOut = true;
        } else {
          if (c.l <= zone.high) {
            hasTouched = true;
            if (c.c < zone.low) { hasBreached = true; break; }
          }
        }
      } else {
        if (!hasBrokenOut) {
          if (c.c < zone.low) hasBrokenOut = true;
        } else {
          if (c.h >= zone.low) {
            hasTouched = true;
            if (c.c > zone.high) { hasBreached = true; break; }
          }
        }
      }
    }
    return hasBrokenOut && hasTouched && !hasBreached;
  }

  function checkPsychological(price, symbol) {
    let step = 10000;
    if (symbol && symbol.includes("BTC")) step = 5000;
    else if (symbol && symbol.includes("ETH")) step = 500;
    else if (price > 100) step = 50;
    else if (price > 10) step = 5;
    else step = 1;
    
    const lowB = Math.floor(price / step) * step;
    const highB = Math.ceil(price / step) * step;
    if (Math.abs(price - lowB) / price <= 0.01) return true;
    if (Math.abs(price - highB) / price <= 0.01) return true;
    return false;
  }

  function getGrade(score) {
    if (score >= 9.0) return "AAA Institutional Zone";
    if (score >= 8.0) return "AA Strong Zone";
    return "A Tradable Zone";
  }

  // 6. Score and label each zone under Zone Ranking V3
  const currentCandle = S.candles.length ? S.candles[S.candles.length - 1] : (dailyCandles.length ? dailyCandles[dailyCandles.length - 1] : null);
  const currentPriceTime = currentCandle ? currentCandle.t : Date.now();

  function scoreZone(zone) {
    // A. Structure Score (40%)
    let tfPoints = 0;
    const tfs = zone.pivots.map(p => p.tf);
    if (tfs.includes("1w")) tfPoints = 10.0;
    else if (tfs.includes("1d")) tfPoints = 7.5;
    else if (tfs.includes("4h")) tfPoints = 5.0;
    else tfPoints = 2.5;

    const hasBOS = zone.pivots.some(p => p.causedBOS);
    const bosPoints = hasBOS ? 10.0 : 0.0;

    const hasSweep = zone.pivots.some(p => p.isSweep);
    const sweepPoints = hasSweep ? 10.0 : 0.0;

    const hasConf = zone.pivots.some(p => p.hasConfluence);
    const obPoints = hasConf ? 10.0 : 0.0;

    const structure_score = (tfPoints * 0.4) + (bosPoints * 0.3) + (sweepPoints * 0.2) + (obPoints * 0.1);

    // B. Retest Confirmation (25%)
    const isRetested = checkRetest(zone, dailyCandles);
    const retest_score = isRetested ? 10.0 : 0.0;

    // C. Volume Reaction (20%)
    const avgRelVol = zone.pivots.reduce((sum, p) => sum + p.relVol, 0) / zone.pivots.length;
    const volume_score = Math.min(10.0, avgRelVol * 3.0); // 3.3x avg volume gives max score

    // D. Freshness Decay (15%) with V3 Exponential Decay and 90-day cap
    const t_start = Math.max(...zone.pivots.map(p => p.time));
    const age_days = (currentPriceTime - t_start) / (1000 * 60 * 60 * 24);
    if (age_days > 90) return null; // Discard zones older than 90 days!

    const freshness_score = 10.0 * Math.exp(-age_days / 45); // Exponential decay

    // V3 Composite Score
    let baseScore = (structure_score * 0.40) + (retest_score * 0.25) + (volume_score * 0.20) + (freshness_score * 0.15);

    // Cap without OB/FVG confluence or sweep
    if (!hasConf && !hasSweep) {
      baseScore = Math.min(baseScore, 6.5);
    }

    // Psych boost (1.1x)
    const isPsych = checkPsychological(zone.price, S.coin);
    let score = isPsych ? baseScore * 1.1 : baseScore;
    score = Math.max(1.0, Math.min(score, 10.0));

    const zoneStart = Math.min(...zone.pivots.map(p => p.time));

    return {
      price: zone.price,
      high: zone.high,
      low: zone.low,
      t_start: zoneStart,
      reactions: zone.pivots.length,
      score: score,
      grade: getGrade(score)
    };
  }

  const scoredSupport = finalSupportZones.map(scoreZone).filter(z => z !== null);
  const scoredResistance = finalResistanceZones.map(scoreZone).filter(z => z !== null);

  // 7. Filter out weak zones (Score < 7.5) and extract Active (Nearest) vs Major (Strongest)
  const validSupport = scoredSupport.filter(z => z.price < currentPrice && z.score >= 7.5);
  const validResistance = scoredResistance.filter(z => z.price > currentPrice && z.score >= 7.5);

  const finalSupport = [];
  const finalResistance = [];

  if (validSupport.length > 0) {
    // Sort by distance to price descending to find nearest (closest to currentPrice, i.e., highest price below currentPrice)
    validSupport.sort((a, b) => b.price - a.price);
    const nearestSup = { ...validSupport[0], label: `Nearest Support (${validSupport[0].grade})` };
    finalSupport.push(nearestSup);

    // Sort remaining by score descending to get Major Support
    const byScore = [...validSupport].sort((a, b) => b.score - a.score);
    let count = 0;
    for (const s of byScore) {
      if (s.price !== nearestSup.price && count < 2) {
        finalSupport.push({ ...s, label: `Major Support (${s.grade})` });
        count++;
      }
    }
    // Sort final support by price descending for rendering
    finalSupport.sort((a, b) => b.price - a.price);
  }

  if (validResistance.length > 0) {
    // Sort by distance to price ascending to find nearest (closest to currentPrice, i.e., lowest price above currentPrice)
    validResistance.sort((a, b) => a.price - b.price);
    const nearestRes = { ...validResistance[0], label: `Nearest Resistance (${validResistance[0].grade})` };
    finalResistance.push(nearestRes);

    // Sort remaining by score descending to get Major Resistance
    const byScore = [...validResistance].sort((a, b) => b.score - a.score);
    let count = 0;
    for (const r of byScore) {
      if (r.price !== nearestRes.price && count < 2) {
        finalResistance.push({ ...r, label: `Major Resistance (${r.grade})` });
        count++;
      }
    }
    // Sort final resistance by price ascending for rendering
    finalResistance.sort((a, b) => a.price - b.price);
  }

  S.srLevels = {
    support:   finalSupport,
    resistance: finalResistance,
    demand:    finalSupport,
    supply:    finalResistance
  };
}

// Order Blocks
export function detectOrderBlocks(candles) {
  return IC.get(`ob_${candles.length}`, () => {
    const n = candles.length;
    const bullOBs = [], bearOBs = [];
    for (let i = 1; i < n - 2; i++) {
      const c = candles[i];
      const next1 = candles[i+1];
      const next2 = candles[i+2];
      if (c.c < c.o) {
        const impulseUp = next1.c > next1.o && next2.c > next2.o &&
                          next2.c > c.h;
        if (impulseUp) bullOBs.push({ i, t: c.t, high: c.h, low: c.l, open: c.o, close: c.c });
      }
      if (c.c > c.o) {
        const impulseDown = next1.c < next1.o && next2.c < next2.o &&
                            next2.c < c.l;
        if (impulseDown) bearOBs.push({ i, t: c.t, high: c.h, low: c.l, open: c.o, close: c.c });
      }
    }
    return { bullOBs: bullOBs.slice(-6), bearOBs: bearOBs.slice(-6) };
  });
}

// Fair Value Gaps
export function detectFVG(candles) {
  return IC.get(`fvg_${candles.length}`, () => {
    const n = candles.length;
    const bullFVG = [], bearFVG = [];
    for (let i = 1; i < n - 1; i++) {
      const prev = candles[i-1];
      const next = candles[i+1];
      if (next.l > prev.h) {
        bullFVG.push({ i, t: candles[i].t, top: next.l, bot: prev.h });
      }
      if (next.h < prev.l) {
        bearFVG.push({ i, t: candles[i].t, top: prev.l, bot: next.h });
      }
    }
    return { bullFVG: bullFVG.slice(-10), bearFVG: bearFVG.slice(-10) };
  });
}

// Market Structure — BOS/CHoCH detection
export function detectMarketStructure(candles) {
  return IC.get(`ms_${candles.length}`, () => {
    const n = candles.length;
    const labels = new Array(n).fill(null);
    if (n < 20) return labels;

    const { highs, lows } = detectSwings(candles, 3);
    if (highs.length < 2 || lows.length < 2) return labels;

    for (let k = 1; k < highs.length; k++) {
      const prev = highs[k-1], curr = highs[k];
      if (curr.price > prev.price) {
        labels[curr.i] = { type: 'HH', color: '#00ff88', pos: 'above' };
      } else {
        labels[curr.i] = { type: 'LH', color: '#ff3366', pos: 'above' };
      }
    }
    for (let k = 1; k < lows.length; k++) {
      const prev = lows[k-1], curr = lows[k];
      if (curr.price < prev.price) {
        labels[curr.i] = { type: 'LL', color: '#ff3366', pos: 'below' };
      } else {
        labels[curr.i] = { type: 'HL', color: '#00ff88', pos: 'below' };
      }
    }

    let hIdx = 0, lIdx = 0;
    let recentH = null, recentL = null;
    let hBroken = false, lBroken = false;
    for (let i = 5; i < n; i++) {
      let updatedH = false, updatedL = false;
      while (hIdx < highs.length && highs[hIdx].i < i) {
        recentH = highs[hIdx];
        hIdx++;
        updatedH = true;
      }
      while (lIdx < lows.length && lows[lIdx].i < i) {
        recentL = lows[lIdx];
        lIdx++;
        updatedL = true;
      }
      if (updatedH) hBroken = false;
      if (updatedL) lBroken = false;

      if (recentH && !hBroken && candles[i].c > recentH.price && candles[i-1].c <= recentH.price) {
        labels[i] = { type: 'BOS', color: '#00d4ff', pos: 'above', price: recentH.price };
        hBroken = true;
      }
      if (recentL && !lBroken && candles[i].c < recentL.price && candles[i-1].c >= recentL.price) {
        labels[i] = { type: 'BOS', color: '#ff3366', pos: 'below', price: recentL.price };
        lBroken = true;
      }
    }
    return labels;
  });
}

// Candlestick Pattern Recognition
export function detectPatterns(candles) {
  return IC.get(`patterns_${candles.length}`, () => {
    const n = candles.length;
    const out = new Array(n).fill(null);
    for (let i = 2; i < n; i++) {
      const c = candles[i], p = candles[i-1], pp = candles[i-2];
      const body  = Math.abs(c.c - c.o);
      const range = c.h - c.l;
      const upShadow = c.h - Math.max(c.o, c.c);
      const dnShadow = Math.min(c.o, c.c) - c.l;

      if (range < 1e-10) continue;

      if (body <= range * 0.1) {
        out[i] = { label:'◆', desc:'Doji', color:'#ffaa00', pos:'above' }; continue;
      }
      if (dnShadow > body * 2 && upShadow < body * 0.5 && body > 0) {
        out[i] = { label:'⬆', desc:'Hammer', color:'#00ff88', pos:'below' }; continue;
      }
      if (upShadow > body * 2 && dnShadow < body * 0.5 && body > 0) {
        out[i] = { label:'⬇', desc:'Shooting Star', color:'#ff3366', pos:'above' }; continue;
      }
      const pb = Math.abs(p.c - p.o);
      if (p.c < p.o && c.c > c.o && c.o < p.c && c.c > p.o && body > pb * 0.8) {
        out[i] = { label:'⚡', desc:'Bullish Engulfing', color:'#00ff88', pos:'below' }; continue;
      }
      if (p.c > p.o && c.c < c.o && c.o > p.c && c.c < p.o && body > pb * 0.8) {
        out[i] = { label:'⚡', desc:'Bearish Engulfing', color:'#ff3366', pos:'above' }; continue;
      }
      const ppBody = Math.abs(pp.c - pp.o);
      if (pp.c < pp.o && Math.abs(p.c-p.o) < ppBody*0.3 && c.c > c.o && c.c > (pp.o+pp.c)/2) {
        out[i] = { label:'★', desc:'Morning Star', color:'#00ff88', pos:'below' }; continue;
      }
      if (pp.c > pp.o && Math.abs(p.c-p.o) < ppBody*0.3 && c.c < c.o && c.c < (pp.o+pp.c)/2) {
        out[i] = { label:'★', desc:'Evening Star', color:'#ff3366', pos:'above' };
      }
    }
    return out;
  });
}

// EMA crossover + RSI exit signals
export function detectSignals(candles) {
  return IC.get(`signals_${candles.length}`, () => {
    const n = candles.length;
    const out = new Array(n).fill(null);
    if (n < 60) return out;
    const closes = getCloses();
    const fast = getEMA(closes, getInpVal(D.inpEmaFast, 20));
    const slow = getEMA(closes, getInpVal(D.inpEmaSlow, 50));
    const rsi  = getRSI(closes, getInpVal(D.inpRsiPeriod, 14));
    const rsiPeriod = getInpVal(D.inpRsiPeriod, 14);
    for (let i = 1; i < n; i++) {
      if (fast[i] > slow[i] && fast[i-1] <= slow[i-1])
        out[i] = { type:'BUY',  label:'▲' };
      else if (fast[i] < slow[i] && fast[i-1] >= slow[i-1])
        out[i] = { type:'SELL', label:'▼' };
      else if (i > rsiPeriod && rsi[i-1] < 30 && rsi[i] >= 30)
        out[i] = { type:'BUY',  label:'▲' };
      else if (i > rsiPeriod && rsi[i-1] > 70 && rsi[i] <= 70)
        out[i] = { type:'SELL', label:'▼' };
    }
    return out;
  });
}
