/**
 * S/R Zone Web Worker v4 — rejection-based touch counting, ATR-relative clustering.
 * Mirrors backend/indicators/sr_zones.py (single-source algorithm).
 */

const Config = {
  N_MAP: { '1m': 10, '5m': 8, '15m': 6, '1h': 5, '4h': 4, '1d': 4, default: 5 },
  TF_RANK: ['1d', '4h', '1h', '15m', '5m', '1m'],
  clusterAtr: 0.40,
  minWidthAtr: 0.12,
  maxWidthAtr: 0.90,
  mergeAtr: 0.45,
  minSepAtr: 0.60,
  edgeBufferAtr: 0.05,
  breakAtr: 0.25,
  touchCooldown: 3,
  volSpike: 1.5,
  minCandles: 120,
  maxZones: 12,
};

function calcATR(candles, period = 14) {
  const n = candles.length;
  const atr = new Float64Array(n);
  if (n < 2) return atr;
  const tr = new Float64Array(n);
  tr[0] = candles[0].h - candles[0].l;
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c)
    );
  }
  if (n < period) return atr;
  let cur = 0;
  for (let i = 0; i < period; i++) cur += tr[i];
  cur /= period;
  atr[period - 1] = cur;
  for (let i = period; i < n; i++) {
    cur = (cur * (period - 1) + tr[i]) / period;
    atr[i] = cur;
  }
  return atr;
}

function detectPivots(candles, tf) {
  const n = candles.length;
  const N = Config.N_MAP[tf] || Config.N_MAP.default;
  const pivots = [];
  for (let i = N; i < n - N; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= N; j++) {
      if (candles[i - j].h >= c.h || candles[i + j].h > c.h) isHigh = false;
      if (candles[i - j].l <= c.l || candles[i + j].l < c.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ price: c.h, timestamp: c.t, type: 'high', volume: c.v, tf, index: i });
    if (isLow) pivots.push({ price: c.l, timestamp: c.t, type: 'low', volume: c.v, tf, index: i });
  }
  return pivots;
}

function avgVolume(candles, idx, window = 50) {
  const lo = Math.max(0, idx - window);
  let s = 0, cnt = 0;
  for (let j = lo; j < idx; j++) { s += candles[j].v; cnt++; }
  return cnt > 0 ? s / cnt : 1;
}

function clusterPivots(pivots, atrLast) {
  if (!pivots.length || atrLast <= 0) return [];
  pivots.sort((a, b) => a.price - b.price);
  const clusters = [];
  let cur = [pivots[0]];
  const centroid = (cluster) => {
    let tv = 0, ts = 0;
    for (const p of cluster) { tv += p.volume; ts += p.price * p.volume; }
    return tv > 0 ? ts / tv : cluster[0].price;
  };
  for (let i = 1; i < pivots.length; i++) {
    if (Math.abs(pivots[i].price - centroid(cur)) <= Config.clusterAtr * atrLast) cur.push(pivots[i]);
    else { clusters.push(cur); cur = [pivots[i]]; }
  }
  clusters.push(cur);
  return clusters;
}

function analyzeTouches(zone, candles, atrLast) {
  const n = candles.length;
  const { low: lo, high: hi } = zone;
  const buf = Config.edgeBufferAtr * atrLast;
  const brk = Config.breakAtr * atrLast;

  let touches = 0, volSpikes = 0, flips = 0, breaks = 0;
  let lastSide = null, lastBreakSide = null;
  let lastTouchIdx = zone.originIndex;

  for (let k = zone.originIndex + 1; k < n; k++) {
    const c = candles[k];
    const side = c.c > hi + buf ? 'above' : c.c < lo - buf ? 'below' : 'inside';
    const wickTouched = c.l <= hi && c.h >= lo;

    if (side !== 'inside') {
      if (wickTouched && k - lastTouchIdx >= Config.touchCooldown) {
        touches++;
        lastTouchIdx = k;
        if (c.v > Config.volSpike * avgVolume(candles, k)) volSpikes++;
        if (lastSide && side !== lastSide) flips++;
      }
      if (lastSide && side !== lastSide) {
        const beyond = side === 'above' ? c.c - hi : lo - c.c;
        if (beyond >= brk && lastBreakSide !== side) { breaks++; lastBreakSide = side; }
      }
      lastSide = side;
    }
  }
  zone.touchCount = touches;
  zone.volSpikes = volSpikes;
  zone.flips = flips;
  zone.breaks = breaks;
  zone.lastTouchIndex = lastTouchIdx;
}

function scoreZone(zone, candles, atrLast) {
  const n = candles.length;
  analyzeTouches(zone, candles, atrLast);

  const touchScore = Math.min(36, zone.touchCount * 9);
  const volScore = Math.min(15, zone.volSpikes * 5);
  const age = n - 1 - zone.lastTouchIndex;
  const recency = 15 * Math.exp(-age / Math.max(1, n * 0.25));
  const flipBonus = zone.flips > 0 ? 10 : 0;

  let originQ = 0;
  const oc = candles[zone.originIndex];
  if (oc) {
    const rng = oc.h - oc.l;
    const bodyRatio = rng > 0 ? Math.abs(oc.c - oc.o) / rng : 0;
    if (bodyRatio >= 0.65 && oc.v > 1.8 * avgVolume(candles, zone.originIndex)) originQ = 8;
  }
  const freshBonus = zone.touchCount === 0 && originQ > 0 ? 6 : 0;
  zone.fresh = zone.touchCount === 0;

  const effBreaks = Math.max(0, zone.breaks - (zone.flips > 0 ? 1 : 0));
  const breakPenalty = Math.min(30, effBreaks * 12);

  return Math.max(0, Math.min(84, touchScore + volScore + recency + flipBonus + originQ + freshBonus - breakPenalty));
}

function zoneFromCluster(cluster, candles, tf, atrLast) {
  let tv = 0, ts = 0;
  for (const p of cluster) { tv += p.volume; ts += p.price * p.volume; }
  const centroid = tv > 0 ? ts / tv : cluster[0].price;
  let low = Math.min(...cluster.map(p => p.price));
  let high = Math.max(...cluster.map(p => p.price));

  const minW = Config.minWidthAtr * atrLast;
  if (high - low < minW) { low = centroid - minW / 2; high = centroid + minW / 2; }
  const maxW = Config.maxWidthAtr * atrLast;
  if (high - low > maxW) { low = centroid - maxW / 2; high = centroid + maxW / 2; }

  const lows = cluster.filter(p => p.type === 'low').length;
  const highs = cluster.length - lows;
  const type = lows > 0 && highs > 0 ? 'role_reversal' : lows > highs ? 'support' : 'resistance';

  const zone = {
    id: `${tf}_${Math.round(centroid * 100) / 100}_${Math.min(...cluster.map(p => p.timestamp))}`,
    price: centroid, low, high, type,
    timeframes: [tf],
    isConfluence: false,
    originTimestamp: Math.min(...cluster.map(p => p.timestamp)),
    originIndex: Math.min(...cluster.map(p => p.index)),
    pivots: cluster,
    touchCount: 0,
    score: 0,
  };
  zone.score = scoreZone(zone, candles, atrLast);
  return zone;
}

function roundNumberBonus(price) {
  if (price <= 0) return 0;
  const step = Math.pow(10, Math.round(Math.log10(price * 0.01)));
  const rem = price % step;
  const near = Math.min(rem, step - rem);
  return near <= 0.08 * step ? 4 : 0;
}

function computeZones(mtfCandles, currentPrice, existingZones) {
  const allZones = [];
  let anchorAtr = 0;

  for (const tf of Config.TF_RANK) {
    const candles = mtfCandles[tf];
    if (!candles || candles.length < Config.minCandles) continue;
    const atr = calcATR(candles, 14);
    const atrLast = atr[atr.length - 1] > 0 ? atr[atr.length - 1] : candles[candles.length - 1].c * 0.01;
    if (anchorAtr === 0) anchorAtr = atrLast;
    const pivots = detectPivots(candles, tf);
    for (const cluster of clusterPivots(pivots, atrLast)) {
      allZones.push(zoneFromCluster(cluster, candles, tf, atrLast));
    }
  }

  if (!allZones.length) return [];
  if (anchorAtr <= 0) anchorAtr = currentPrice * 0.01;

  // Cross-TF merge: strongest zone wins, timeframes union
  allZones.sort((a, b) => a.price - b.price);
  const merged = [];
  const consumed = new Uint8Array(allZones.length);
  for (let i = 0; i < allZones.length; i++) {
    if (consumed[i]) continue;
    let base = { ...allZones[i], timeframes: [...allZones[i].timeframes] };
    for (let j = i + 1; j < allZones.length; j++) {
      if (consumed[j]) continue;
      const other = allZones[j];
      if (other.price - base.price > Config.mergeAtr * anchorAtr) break;
      if (other.score > base.score) {
        const tfs = base.timeframes;
        base = { ...other, timeframes: [...other.timeframes] };
        for (const tf of tfs) if (!base.timeframes.includes(tf)) base.timeframes.push(tf);
      } else {
        for (const tf of other.timeframes) if (!base.timeframes.includes(tf)) base.timeframes.push(tf);
      }
      consumed[j] = 1;
    }
    base.isConfluence = base.timeframes.length >= 2;
    if (base.isConfluence) {
      base.score = Math.min(100, base.score + Math.min(16, (base.timeframes.length - 1) * 4));
    }
    base.score = Math.min(100, base.score + roundNumberBonus(base.price));
    merged.push(base);
  }

  // Enforce minimum spacing, strongest zones win
  merged.sort((a, b) => b.score - a.score);
  const final = [];
  for (const z of merged) {
    if (final.every(k => Math.abs(z.price - k.price) >= Config.minSepAtr * anchorAtr)) final.push(z);
    if (final.length >= Config.maxZones) break;
  }

  // Stable IDs: reuse existing zone id when a new zone lands at the same level (prevents redraw flicker)
  if (existingZones && existingZones.length) {
    for (const z of final) {
      const match = existingZones.find(ez => Math.abs(ez.price - z.price) <= 0.3 * anchorAtr);
      if (match) z.id = match.id;
    }
  }

  final.sort((a, b) => b.score - a.score);
  return final;
}

self.onmessage = function (e) {
  const { mtfCandles, existingZones, currentPrice } = e.data;
  try {
    const zones = computeZones(mtfCandles, currentPrice || 0, existingZones || []);
    self.postMessage({ status: 'success', zones });
  } catch (error) {
    self.postMessage({ status: 'error', error: error.message });
  }
};
