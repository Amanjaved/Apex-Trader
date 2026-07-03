// Market-aware SL/TP planner shared by AI mode, bot mode, and paper orders.

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function last(arr) {
  return arr && arr.length ? arr[arr.length - 1] : undefined;
}

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function ema(values, period) {
  const out = new Array(values.length).fill(0);
  if (!values.length) return out;
  const k = 2 / (period + 1);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(0);
  if (candles.length < 2) return out;
  const tr = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    return Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c));
  });
  let seed = 0;
  const n = Math.min(period, tr.length);
  for (let i = 0; i < n; i++) seed += tr[i];
  let value = seed / n;
  out[n - 1] = value;
  for (let i = n; i < tr.length; i++) {
    value = (value * (period - 1) + tr[i]) / period;
    out[i] = value;
  }
  return out;
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(50);
  if (closes.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function bollinger(closes, period = 20, mult = 2) {
  const upper = new Array(closes.length).fill(0);
  const mid = new Array(closes.length).fill(0);
  const lower = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = closes.slice(start, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / slice.length;
    const sd = Math.sqrt(variance);
    mid[i] = mean;
    upper[i] = mean + sd * mult;
    lower[i] = mean - sd * mult;
  }
  return { upper, mid, lower };
}

function detectSwings(candles, lookback = 80, wing = 2) {
  const start = Math.max(wing, candles.length - lookback);
  const end = candles.length - wing;
  const highs = [];
  const lows = [];
  for (let i = start; i < end; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i].h <= candles[i - j].h || candles[i].h < candles[i + j].h) isHigh = false;
      if (candles[i].l >= candles[i - j].l || candles[i].l > candles[i + j].l) isLow = false;
    }
    if (isHigh) highs.push({ price: candles[i].h, index: i });
    if (isLow) lows.push({ price: candles[i].l, index: i });
  }
  return { highs, lows };
}

function normalizeLevels(levels) {
  return {
    support: (levels?.support || []).map(z => ({
      price: num(z.price),
      low: num(z.low, num(z.price)),
      high: num(z.high, num(z.price)),
      score: num(z.score, 0),
      label: z.label || 'Support'
    })).filter(z => z.price > 0),
    resistance: (levels?.resistance || []).map(z => ({
      price: num(z.price),
      low: num(z.low, num(z.price)),
      high: num(z.high, num(z.price)),
      score: num(z.score, 0),
      label: z.label || 'Resistance'
    })).filter(z => z.price > 0),
  };
}

function strategyProfile(strategyId = '', strategy = {}) {
  const id = String(strategyId || strategy.id || '').toLowerCase();
  if (id.includes('scalp') || id.includes('orb') || id.includes('vwap')) {
    return { name: 'scalp', stopAtr: 1.15, minAtr: 0.55, maxAtr: 2.1, rr: 1.65, minRR: 1.25 };
  }
  if (id.includes('range') || id.includes('mean') || id.includes('divergence')) {
    return { name: 'mean reversion', stopAtr: 1.25, minAtr: 0.65, maxAtr: 2.35, rr: 1.75, minRR: 1.25 };
  }
  if (id.includes('breakout') || id.includes('squeeze') || id.includes('liquidity')) {
    return { name: 'breakout', stopAtr: 1.7, minAtr: 0.8, maxAtr: 3.0, rr: 2.2, minRR: 1.45 };
  }
  if (id.includes('smc') || id.includes('order_block') || id.includes('sr_bounce')) {
    return { name: 'structure', stopAtr: 1.8, minAtr: 0.75, maxAtr: 3.2, rr: 2.35, minRR: 1.5 };
  }
  return { name: 'trend', stopAtr: 1.9, minAtr: 0.8, maxAtr: 3.4, rr: 2.4, minRR: 1.5 };
}

function candidateDistance(side, entry, level) {
  if (!Number.isFinite(level) || level <= 0) return 0;
  if (side === 'LONG' && level < entry) return entry - level;
  if (side === 'SHORT' && level > entry) return level - entry;
  return 0;
}

function targetDistance(side, entry, level) {
  if (!Number.isFinite(level) || level <= 0) return 0;
  if (side === 'LONG' && level > entry) return level - entry;
  if (side === 'SHORT' && level < entry) return entry - level;
  return 0;
}

function chooseDistance(candidates, ideal, minStop, maxStop) {
  const valid = candidates
    .filter(d => Number.isFinite(d) && d > 0)
    .map(d => Math.max(minStop, Math.min(maxStop, d)));
  if (!valid.length) return Math.max(minStop, Math.min(maxStop, ideal));
  valid.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
  return valid[0];
}

function describeDirection(side, price, ema20, ema50, rsiValue) {
  const trendOk = side === 'LONG' ? price > ema20 && ema20 > ema50 : price < ema20 && ema20 < ema50;
  const momentumOk = side === 'LONG' ? rsiValue >= 45 && rsiValue <= 72 : rsiValue <= 55 && rsiValue >= 28;
  if (trendOk && momentumOk) return 'trend and momentum align';
  if (trendOk) return 'trend aligns, momentum is mixed';
  if (momentumOk) return 'momentum supports a tactical setup';
  return 'counter-trend setup requires tighter validation';
}

export function buildMarketTradePlan({
  side,
  entry,
  candles,
  levels,
  strategyId,
  strategy,
  minRR,
} = {}) {
  const type = String(side || '').toUpperCase();
  const price = num(entry);
  const cleanCandles = (candles || []).filter(c => c && num(c.h) > 0 && num(c.l) > 0 && num(c.c) > 0);
  if ((type !== 'LONG' && type !== 'SHORT') || price <= 0 || cleanCandles.length < 30) {
    return { valid: false, reason: 'Not enough candle data to build market-aware SL/TP.' };
  }

  const closes = cleanCandles.map(c => c.c);
  const atrArr = atr(cleanCandles, 14);
  const atrValue = last(atrArr) || median(cleanCandles.slice(-14).map(c => c.h - c.l)) || price * 0.01;
  const ema20 = last(ema(closes, 20)) || price;
  const ema50 = last(ema(closes, 50)) || price;
  const rsiValue = last(rsi(closes, 14)) || 50;
  const bb = bollinger(closes, 20, 2);
  const bbUpper = last(bb.upper) || price + atrValue * 2;
  const bbLower = last(bb.lower) || price - atrValue * 2;
  const profile = strategyProfile(strategyId, strategy);
  const rrFloor = minRR || profile.minRR;
  const normalizedLevels = normalizeLevels(levels);
  const swings = detectSwings(cleanCandles);
  const buffer = Math.max(atrValue * 0.2, price * 0.001);

  const recentLow = last(swings.lows.filter(s => s.price < price))?.price;
  const recentHigh = last(swings.highs.filter(s => s.price > price))?.price;
  const supportsBelow = normalizedLevels.support.filter(z => z.price < price).sort((a, b) => b.score - a.score || b.price - a.price);
  const resistancesAbove = normalizedLevels.resistance.filter(z => z.price > price).sort((a, b) => b.score - a.score || a.price - b.price);
  const supportStop = supportsBelow[0] ? Math.min(supportsBelow[0].low, supportsBelow[0].price) - buffer : 0;
  const resistanceStop = resistancesAbove[0] ? Math.max(resistancesAbove[0].high, resistancesAbove[0].price) + buffer : 0;

  const atrStop = profile.stopAtr * atrValue;
  const minStop = Math.max(profile.minAtr * atrValue, price * 0.0035);
  const maxStop = Math.max(minStop * 1.15, Math.min(profile.maxAtr * atrValue, price * 0.055));

  const stopCandidates = type === 'LONG'
    ? [
        candidateDistance(type, price, supportStop),
        candidateDistance(type, price, recentLow ? recentLow - buffer : 0),
        candidateDistance(type, price, bbLower - buffer),
        atrStop,
      ]
    : [
        candidateDistance(type, price, resistanceStop),
        candidateDistance(type, price, recentHigh ? recentHigh + buffer : 0),
        candidateDistance(type, price, bbUpper + buffer),
        atrStop,
      ];

  const stopDistance = chooseDistance(stopCandidates, atrStop, minStop, maxStop);
  const sl = type === 'LONG' ? price - stopDistance : price + stopDistance;

  const targetZones = type === 'LONG'
    ? normalizedLevels.resistance.filter(z => z.price > price).map(z => z.price)
    : normalizedLevels.support.filter(z => z.price < price).map(z => z.price);
  const naturalTargets = targetZones
    .map(t => ({ price: t, distance: targetDistance(type, price, t) }))
    .filter(t => t.distance >= stopDistance * rrFloor)
    .sort((a, b) => a.distance - b.distance);

  const defaultTp1Distance = stopDistance * Math.max(rrFloor, Math.min(profile.rr, 1.8));
  const tp1Distance = naturalTargets[0]?.distance || defaultTp1Distance;
  const tpDistance = Math.max(tp1Distance, stopDistance * profile.rr);
  const tp = type === 'LONG' ? price + tpDistance : price - tpDistance;
  const tp1 = type === 'LONG' ? price + tp1Distance : price - tp1Distance;
  const tp2 = tp;
  const tp3 = type === 'LONG' ? price + stopDistance * (profile.rr + 0.9) : price - stopDistance * (profile.rr + 0.9);
  const rr = Math.abs(tp - price) / stopDistance;

  if ((type === 'LONG' && !(sl < price && tp > price)) || (type === 'SHORT' && !(sl > price && tp < price))) {
    return { valid: false, reason: 'SL/TP failed directional validation.' };
  }
  if (rr < rrFloor) {
    return { valid: false, reason: `Risk/reward ${rr.toFixed(2)}R is below ${rrFloor.toFixed(2)}R.` };
  }

  const context = describeDirection(type, price, ema20, ema50, rsiValue);
  const invalidation = type === 'LONG'
    ? supportsBelow[0]?.label || (recentLow ? 'recent swing low' : 'ATR volatility stop')
    : resistancesAbove[0]?.label || (recentHigh ? 'recent swing high' : 'ATR volatility stop');
  const targetBasis = naturalTargets[0] ? 'next opposing liquidity zone' : `${profile.rr.toFixed(1)}R extension`;

  return {
    valid: true,
    side: type,
    entry: price,
    sl,
    tp,
    tp1,
    tp2,
    tp3,
    rr,
    stopDistance,
    atr: atrValue,
    atrPct: (atrValue / price) * 100,
    profile: profile.name,
    minRR: rrFloor,
    reason: `${profile.name} ${type}: ${context}; SL below/above ${invalidation}; TP uses ${targetBasis}.`,
    thinking: `Market-aware plan: ATR ${atrValue.toFixed(2)}, stop ${stopDistance.toFixed(2)} (${(stopDistance / price * 100).toFixed(2)}%), target ${rr.toFixed(2)}R.`,
  };
}

export function executionStepsFromPlan(plan) {
  if (!plan?.valid) return [];
  return [
    { label: 'Current Market Price', val: plan.entry.toFixed(2) },
    { label: 'Wait for Trigger Target', val: plan.entry.toFixed(2) },
    { label: `Trigger Execution ${plan.side === 'LONG' ? 'BUY / LONG' : 'SELL / SHORT'}`, val: 'CONFIRMED' },
    { label: 'Set Stop Loss Protection', val: plan.sl.toFixed(2) },
    { label: 'Expected Take Profit 1', val: plan.tp1.toFixed(2) },
    { label: 'Expected Take Profit 2', val: plan.tp2.toFixed(2) },
    { label: 'Expected Take Profit 3', val: plan.tp3.toFixed(2) },
    { label: 'Validated Risk Reward', val: `${plan.rr.toFixed(2)}R` },
  ];
}

export function sideFromBias(bias) {
  const b = String(bias || '').toLowerCase();
  if (b.includes('bullish') || b.includes('long')) return 'LONG';
  if (b.includes('bearish') || b.includes('short')) return 'SHORT';
  return '';
}
