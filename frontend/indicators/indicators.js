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

let srWorker = null;
let lastCalculateTime = 0;
let pendingRecalculateTimeout = null;
let srLevelsUpdateCallback = null;

export function registerSrUpdateCallback(cb) {
  srLevelsUpdateCallback = cb;
}

export function calculateSmartSR() {
  if (!S.overlays.smartSR) return;

  const mtfCandles = S.srCandlesMTF || { "1d": S.srCandles || [] };
  const symbol = S.coin;
  let currentPrice = S.candles.length ? S.candles[S.candles.length - 1].c : 0;
  if (currentPrice === 0 && S.srCandles && S.srCandles.length) {
    currentPrice = S.srCandles[S.srCandles.length - 1].c;
  }

  // Debounce logic: minimum 500ms between recalculate calls
  const now = Date.now();
  if (now - lastCalculateTime < 500) {
    if (pendingRecalculateTimeout) clearTimeout(pendingRecalculateTimeout);
    pendingRecalculateTimeout = setTimeout(() => {
      calculateSmartSR();
    }, 500 - (now - lastCalculateTime));
    return;
  }
  lastCalculateTime = now;

  // Initialize the worker if it doesn't exist
  if (!srWorker) {
    srWorker = new Worker('/indicators/sr_worker.js');
    srWorker.onmessage = function (e) {
      if (e.data.status === 'success') {
        const zones = e.data.zones;

        // Initialize persistent zones in state if not present
        if (!S.antigravityZones) S.antigravityZones = [];
        S.antigravityZones = zones;

        let livePrice = S.candles.length ? S.candles[S.candles.length - 1].c : 0;
        if (livePrice === 0 && S.srCandles && S.srCandles.length) {
          livePrice = S.srCandles[S.srCandles.length - 1].c;
        }

        // Filter into support (below price) and resistance (above price)
        const support = zones.filter(z => z.price < livePrice);
        const resistance = zones.filter(z => z.price > livePrice);

        // Sort by distance to price
        support.sort((a, b) => b.price - a.price); // nearest first
        resistance.sort((a, b) => a.price - b.price); // nearest first

        // Assign labels with grade badges
        support.forEach((s, idx) => {
          const isNearest = idx === 0;
          const gradeBadge = s.isConfluence 
            ? `⚡ CONFLUENCE S (${s.timeframes.map(t => t.toUpperCase()).join('+')})` 
            : `${s.score >= 75 ? '⚡ STRONG S' : s.score >= 45 ? 'MEDIUM S' : 'WEAK S'}`;
          s.label = isNearest ? `Nearest Support (${gradeBadge})` : `Major Support (${gradeBadge})`;
        });

        resistance.forEach((r, idx) => {
          const isNearest = idx === 0;
          const gradeBadge = r.isConfluence 
            ? `⚡ CONFLUENCE R (${r.timeframes.map(t => t.toUpperCase()).join('+')})` 
            : `${r.score >= 75 ? '⚡ STRONG R' : r.score >= 45 ? 'MEDIUM R' : 'WEAK R'}`;
          r.label = isNearest ? `Nearest Resistance (${gradeBadge})` : `Major Resistance (${gradeBadge})`;
        });

        S.srLevels = {
          support: support,
          resistance: resistance,
          demand: support,
          supply: resistance
        };

        // Notify AI Sidebar and Trigger Chart Render Loop
        if (typeof updateAI === 'function') {
          try { updateAI(); } catch (err) { console.error(err); }
        } else if (typeof window.updateAI === 'function') {
          try { window.updateAI(); } catch (err) { console.error(err); }
        }
        if (srLevelsUpdateCallback) {
          srLevelsUpdateCallback();
        }
      } else {
        console.error('[SR Worker error]', e.data.error);
      }
    };
  }

  // Send request to Worker thread
  srWorker.postMessage({
    mtfCandles,
    symbol,
    existingZones: S.antigravityZones || [],
    currentPrice
  });
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
