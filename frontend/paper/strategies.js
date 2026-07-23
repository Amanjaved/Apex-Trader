// frontend/paper/strategies.js

// ──────────────────────────────────────────────
//  TECHNICAL INDICATOR CALCULATORS
// ──────────────────────────────────────────────

export function calculateEMA(candles, period) {
  const values = [];
  const k = 2 / (period + 1);
  let ema = candles[0]?.c || 0;
  values.push(ema);
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k);
    values.push(ema);
  }
  return values;
}

export function calculateSMA(candles, period) {
  const values = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      values.push(candles[i].c);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].c;
      }
      values.push(sum / period);
    }
  }
  return values;
}

export function calculateRSI(candles, period = 14) {
  const values = new Array(candles.length).fill(50);
  if (candles.length <= period) return values;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].c - candles[i - 1].c;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  values[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].c - candles[i - 1].c;
    let gain = 0;
    let loss = 0;
    if (diff > 0) gain = diff;
    else loss = -diff;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    values[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }
  return values;
}

export function calculateBollingerBands(candles, period = 20, stdDev = 2) {
  const basis = calculateSMA(candles, period);
  const upper = [];
  const lower = [];
  const width = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(candles[i].c);
      lower.push(candles[i].c);
      width.push(0);
    } else {
      let sumSqDiff = 0;
      const avg = basis[i];
      for (let j = 0; j < period; j++) {
        const diff = candles[i - j].c - avg;
        sumSqDiff += diff * diff;
      }
      const dev = Math.sqrt(sumSqDiff / period);
      const u = avg + stdDev * dev;
      const l = avg - stdDev * dev;
      upper.push(u);
      lower.push(l);
      width.push(avg > 0 ? ((u - l) / avg) * 100 : 0);
    }
  }
  return { basis, upper, lower, width };
}

export function calculateATR(candles, period = 14) {
  const tr = [];
  tr.push(candles[0] ? (candles[0].h - candles[0].l) : 0);

  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].h - candles[i].l;
    const hpc = Math.abs(candles[i].h - candles[i - 1].c);
    const lpc = Math.abs(candles[i].l - candles[i - 1].c);
    tr.push(Math.max(hl, hpc, lpc));
  }

  const atr = [];
  let sum = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) {
    sum += tr[i];
  }
  let currentAtr = sum / Math.min(period, tr.length);
  atr.push(currentAtr);

  for (let i = 1; i < candles.length; i++) {
    if (i < period) {
      atr.push(currentAtr);
    } else {
      currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
      atr.push(currentAtr);
    }
  }
  return atr;
}

export function calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(candles, fast);
  const emaSlow = calculateEMA(candles, slow);
  const macdLine = [];
  for (let i = 0; i < candles.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  // Signal line is EMA of MACD line
  const signalLine = [];
  const k = 2 / (signal + 1);
  let sig = macdLine[0] || 0;
  signalLine.push(sig);
  for (let i = 1; i < macdLine.length; i++) {
    sig = macdLine[i] * k + sig * (1 - k);
    signalLine.push(sig);
  }

  const histogram = [];
  for (let i = 0; i < candles.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }

  return { macdLine, signalLine, histogram };
}

export function calculateVWAP(candles) {
  const vwap = [];
  let sumPv = 0;
  let sumVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.h + c.l + c.c) / 3;
    const vol = c.v || 1.0;
    
    if (i > 0 && c.t && candles[i - 1] && candles[i - 1].t) {
      const day1 = typeof c.t === 'string' ? c.t.slice(0, 10) : new Date(c.t).toISOString().slice(0, 10);
      const day2 = typeof candles[i - 1].t === 'string' ? candles[i - 1].t.slice(0, 10) : new Date(candles[i - 1].t).toISOString().slice(0, 10);
      if (day1 !== day2) {
        sumPv = 0;
        sumVolume = 0;
      }
    }
    
    sumPv += typicalPrice * vol;
    sumVolume += vol;
    vwap.push(sumVolume > 0 ? sumPv / sumVolume : c.c);
  }
  return vwap;
}

export function calculateStochastic(candles, kPeriod = 14, dPeriod = 3) {
  const percentK = [];
  const percentD = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      percentK.push(50);
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = 0; j < kPeriod; j++) {
        const c = candles[i - j];
        if (c.h > highestHigh) highestHigh = c.h;
        if (c.l < lowestLow) lowestLow = c.l;
      }
      const range = highestHigh - lowestLow || 1.0;
      percentK.push(((candles[i].c - lowestLow) / range) * 100);
    }
  }

  for (let i = 0; i < percentK.length; i++) {
    if (i < dPeriod - 1) {
      percentD.push(50);
    } else {
      let sum = 0;
      for (let j = 0; j < dPeriod; j++) {
        sum += percentK[i - j];
      }
      percentD.push(sum / dPeriod);
    }
  }

  return { k: percentK, d: percentD };
}

// ──────────────────────────────────────────────
//  SHARED INDICATOR WRAPPER
// ──────────────────────────────────────────────

export function prepareIndicatorValues(candles) {
  if (!candles || !candles.length) return {};
  const bb = calculateBollingerBands(candles, 20, 2);
  const macd = calculateMACD(candles, 12, 26, 9);
  const stoch = calculateStochastic(candles, 14, 3);
  return {
    ema10: calculateEMA(candles, 10),
    ema20: calculateEMA(candles, 20),
    ema50: calculateEMA(candles, 50),
    ema200: calculateEMA(candles, 200),
    rsi: calculateRSI(candles, 14),
    atr: calculateATR(candles, 14),
    vwap: calculateVWAP(candles),
    bbBasis: bb.basis,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    bbWidth: bb.width,
    macdLine: macd.macdLine,
    macdSignal: macd.signalLine,
    macdHist: macd.histogram,
    stochK: stoch.k,
    stochD: stoch.d,
    volumeSMA: calculateSMA(candles.map(c => ({ c: c.v || 0 })), 20)
  };
}

// ──────────────────────────────────────────────
//  BUILT-IN STRATEGY PRESETS REGISTRY
// ──────────────────────────────────────────────

export const BUILT_IN_STRATEGIES = [
  {
    id: "ai_consensus",
    name: "🧠 AI Consensus (>80% Conviction)",
    description: "Enters trades when the AI Neural Copilot is highly confident (>80% conviction score) with aligned trend direction.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [{ type: "ai_signal", condition: "bias_bullish", min_score: 80 }],
      short: [{ type: "ai_signal", condition: "bias_bearish", min_score: 80 }]
    },
    stop_loss: { type: "fixed_percent", value: 2.0 },
    take_profit: { type: "fixed_percent", value: 5.0 }
  },
  {
    id: "ema_smc",
    name: "🏛 EMA Stacks + SMC Zones",
    description: "Combines EMA crossover with SMC (Smart Money Concepts) support/resistance zone sweeps.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "EMA_Cross", params: { fast: 10, slow: 20 }, condition: "crosses_above" },
        { type: "structure", name: "SMC_Zone", condition: "near_support" }
      ],
      short: [
        { type: "indicator", name: "EMA_Cross", params: { fast: 10, slow: 20 }, condition: "crosses_below" },
        { type: "structure", name: "SMC_Zone", condition: "near_resistance" }
      ]
    },
    stop_loss: { type: "structural", reference: "last_swing_low" },
    take_profit: { type: "r_multiple", value: 2.5 }
  },
  {
    id: "ema_crossover",
    name: "📈 EMA Crossover (10/20)",
    description: "Traditional fast (10-period) and slow (20-period) moving average trend-following trigger.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [{ type: "indicator", name: "EMA_Cross", params: { fast: 10, slow: 20 }, condition: "crosses_above" }],
      short: [{ type: "indicator", name: "EMA_Cross", params: { fast: 10, slow: 20 }, condition: "crosses_below" }]
    },
    stop_loss: { type: "fixed_percent", value: 2.0 },
    take_profit: { type: "fixed_percent", value: 5.0 }
  },
  {
    id: "vwap_pullback",
    name: "🔄 VWAP Pullback Reversal",
    description: "Targets entries when price pulls back to the VWAP line during clear trending markets.",
    timeframe_primary: "15m",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "EMA", params: { period: 50 }, condition: "price_above" },
        { type: "indicator", name: "VWAP", params: {}, condition: "price_touch" }
      ],
      short: [
        { type: "indicator", name: "EMA", params: { period: 50 }, condition: "price_below" },
        { type: "indicator", name: "VWAP", params: {}, condition: "price_touch" }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 1.5 },
    take_profit: { type: "r_multiple", value: 2.0 }
  },
  {
    id: "orb_breakout",
    name: "⚡ ORB Opening Range Breakout",
    description: "Triggers on breakout of the high/low of the first 30 minutes of the trading session.",
    timeframe_primary: "15m",
    entry: {
      logic: "AND",
      long: [
        { type: "structure", name: "ORB", params: { period: 2 }, condition: "breaks_high" }
      ],
      short: [
        { type: "structure", name: "ORB", params: { period: 2 }, condition: "breaks_low" }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 2.0 },
    take_profit: { type: "fixed_percent", value: 3.5 }
  },
  {
    id: "orb_retest",
    name: "🔄 ORB Breakout + Retest",
    description: "Waits for opening range breakout followed by a pullback retesting the range edge for confirmation.",
    timeframe_primary: "5m",
    entry: {
      logic: "AND",
      long: [{ type: "structure", name: "ORB", params: { period: 2 }, condition: "breaks_high" }],
      short: [{ type: "structure", name: "ORB", params: { period: 2 }, condition: "breaks_low" }]
    },
    stop_loss: { type: "fixed_percent", value: 1.0 },
    take_profit: { type: "r_multiple", value: 3.0 }
  },
  {
    id: "range_fade",
    name: "↔ Range Fade Extremes",
    description: "Fades Bollinger Band extremes and support/resistance range boundaries during sideways regimes.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "RSI", params: { period: 14 }, condition: "value_below", value: 30 },
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "price_touches_lower" }
      ],
      short: [
        { type: "indicator", name: "RSI", params: { period: 14 }, condition: "value_above", value: 70 },
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "price_touches_upper" }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 1.5 },
    take_profit: { type: "r_multiple", value: 2.0 }
  },
  {
    id: "rsi_divergence",
    name: "🔮 RSI Divergence Pivot",
    description: "Identifies divergence between price action pivots and RSI peaks to capture early reversals.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [{ type: "indicator", name: "RSI_Divergence", condition: "bullish_divergence" }],
      short: [{ type: "indicator", name: "RSI_Divergence", condition: "bearish_divergence" }]
    },
    stop_loss: { type: "structural", reference: "last_swing_low" },
    take_profit: { type: "r_multiple", value: 3.0 }
  },
  {
    id: "bb_squeeze",
    name: "🗜 Bollinger Band Squeeze",
    description: "Scans for low-volatility consolidation squeeze, triggering on volume expansion breakout.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "bandwidth_squeeze" },
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "price_breaks_upper" }
      ],
      short: [
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "bandwidth_squeeze" },
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "price_breaks_lower" }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 2.0 },
    take_profit: { type: "fixed_percent", value: 6.0 }
  },
  {
    id: "macd_momentum",
    name: "🚀 MACD Momentum Rider",
    description: "Rides trend momentum based on MACD line and signal cross with histogram confirmation.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "MACD", params: { fast: 12, slow: 26, signal: 9 }, condition: "line_crosses_signal_above" },
        { type: "indicator", name: "MACD", params: { fast: 12, slow: 26, signal: 9 }, condition: "hist_positive" }
      ],
      short: [
        { type: "indicator", name: "MACD", params: { fast: 12, slow: 26, signal: 9 }, condition: "line_crosses_signal_below" },
        { type: "indicator", name: "MACD", params: { fast: 12, slow: 26, signal: 9 }, condition: "hist_negative" }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 1.8 },
    take_profit: { type: "r_multiple", value: 2.5 }
  },
  {
    id: "order_block_fvg",
    name: "🏛 Order Block + FVG Rebound",
    description: "Enters SMC positions inside unmitigated order blocks with overlapping Fair Value Gaps.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "structure", name: "SMC_Zone", condition: "near_support" }
      ],
      short: [
        { type: "structure", name: "SMC_Zone", condition: "near_resistance" }
      ]
    },
    stop_loss: { type: "structural", reference: "last_swing_low" },
    take_profit: { type: "r_multiple", value: 3.0 }
  },
  {
    id: "liquidity_sweep",
    name: "🧹 Liquidity Sweep Reversal",
    description: "Captures rapid stop-hunt sweeps beyond recent range wicks followed by close rejection.",
    timeframe_primary: "15m",
    entry: {
      logic: "AND",
      long: [{ type: "structure", name: "SMC_Zone", condition: "sweep_liquidity" }],
      short: [{ type: "structure", name: "SMC_Zone", condition: "sweep_liquidity" }]
    },
    stop_loss: { type: "fixed_percent", value: 1.2 },
    take_profit: { type: "r_multiple", value: 2.5 }
  },
  {
    id: "sr_bounce",
    name: "🧱 Support/Resistance Bounce",
    description: "Enters bounce trades off primary Antigravity price support and resistance zone sweeps.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [{ type: "structure", name: "SMC_Zone", condition: "near_support" }],
      short: [{ type: "structure", name: "SMC_Zone", condition: "near_resistance" }]
    },
    stop_loss: { type: "fixed_percent", value: 2.0 },
    take_profit: { type: "r_multiple", value: 2.2 }
  },
  {
    id: "trend_following",
    name: "🏃 Trend Following (Multi-EMA)",
    description: "Enters in direction of the macro trend when Fast, Medium, and Slow EMAs are in perfect stacked alignment.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "EMA", params: { period: 10 }, condition: "price_above" },
        { type: "indicator", name: "EMA", params: { period: 50 }, condition: "price_above" },
        { type: "indicator", name: "EMA", params: { period: 200 }, condition: "price_above" }
      ],
      short: [
        { type: "indicator", name: "EMA", params: { period: 10 }, condition: "price_below" },
        { type: "indicator", name: "EMA", params: { period: 50 }, condition: "price_below" },
        { type: "indicator", name: "EMA", params: { period: 200 }, condition: "price_below" }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 2.2 },
    take_profit: { type: "fixed_percent", value: 6.5 }
  },
  {
    id: "mean_reversion",
    name: "🔄 Mean Reversion (Stochastic/BB)",
    description: "Targets pullbacks returning to the 20-period moving average after price overextends to outer Bollinger Bands.",
    timeframe_primary: "1h",
    entry: {
      logic: "AND",
      long: [
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "price_touches_lower" },
        { type: "indicator", name: "Stochastic", params: {}, condition: "value_below", value: 20 }
      ],
      short: [
        { type: "indicator", name: "Bollinger_Bands", params: { period: 20, stdDev: 2 }, condition: "price_touches_upper" },
        { type: "indicator", name: "Stochastic", params: {}, condition: "value_above", value: 80 }
      ]
    },
    stop_loss: { type: "fixed_percent", value: 1.5 },
    take_profit: { type: "r_multiple", value: 2.0 }
  }
];

// ──────────────────────────────────────────────
//  CUSTOM STRATEGY STORAGE
// ──────────────────────────────────────────────

export function getCustomStrategies() {
  try {
    return JSON.parse(localStorage.getItem('apextrader_custom_strategies') || '[]');
  } catch (e) {
    console.error('[Strategies] failed to parse custom strategies:', e);
    return [];
  }
}

export function saveCustomStrategy(strat) {
  const custom = getCustomStrategies().filter(s => s.id !== strat.id);
  custom.push(strat);
  localStorage.setItem('apextrader_custom_strategies', JSON.stringify(custom));
}

export function deleteCustomStrategy(id) {
  const custom = getCustomStrategies().filter(s => s.id !== id);
  localStorage.setItem('apextrader_custom_strategies', JSON.stringify(custom));
}

export function getAllStrategies() {
  return [...BUILT_IN_STRATEGIES, ...getCustomStrategies()];
}

// ──────────────────────────────────────────────
//  RULE EVALUATOR ENGINE
// ──────────────────────────────────────────────

export function evaluateStrategyRule(candles, idx, rule, indicators, aiSnapshot) {
  if (!candles || candles.length <= idx || idx < 5) return { buy: false, sell: false };

  const entry = rule.entry || { logic: "AND", long: [], short: [] };
  const logic = entry.logic || "AND";

  const evaluateGroup = (conditions) => {
    if (!conditions || !conditions.length) return false;
    
    const results = conditions.map(cond => {
      try {
        return evaluateSingleCondition(candles, idx, cond, indicators, aiSnapshot);
      } catch (err) {
        console.error('[Evaluator] Error matching condition:', cond, err);
        return false;
      }
    });

    if (logic === "OR") {
      return results.some(r => r === true);
    }
    return results.every(r => r === true);
  };

  const buy = evaluateGroup(entry.long);
  const sell = evaluateGroup(entry.short);

  return { buy, sell };
}

function evaluateSingleCondition(candles, idx, cond, indicators, aiSnapshot) {
  const c = candles[idx];
  const prev = candles[idx - 1];
  if (!c) return false;

  const close = c.c;
  const open = c.o;
  const high = c.h;
  const low = c.l;

  if (cond.type === 'ai_signal') {
    if (!aiSnapshot) return false;
    const isBull = aiSnapshot.bias.includes('BULLISH') || aiSnapshot.bias.includes('LONG');
    const isBear = aiSnapshot.bias.includes('BEARISH') || aiSnapshot.bias.includes('SHORT');
    const score = aiSnapshot.score || 0;
    const minScore = cond.min_score || 80;
    
    if (cond.condition === 'bias_bullish') return isBull && score >= minScore;
    if (cond.condition === 'bias_bearish') return isBear && score >= minScore;
    return false;
  }

  if (cond.type === 'indicator') {
    const params = cond.params || {};

    if (cond.name === 'EMA_Cross') {
      const fastArr = indicators[`ema${params.fast || 10}`];
      const slowArr = indicators[`ema${params.slow || 20}`];
      if (!fastArr || !slowArr) return false;
      
      const f = fastArr[idx];
      const s = slowArr[idx];
      const fPrev = fastArr[idx - 1];
      const sPrev = slowArr[idx - 1];
      
      if (cond.condition === 'crosses_above') return f > s && fPrev <= sPrev;
      if (cond.condition === 'crosses_below') return f < s && fPrev >= sPrev;
      return false;
    }

    if (cond.name === 'EMA' || cond.name === 'SMA') {
      const p = params.period || 50;
      const maArr = cond.name === 'EMA' ? indicators[`ema${p}`] : calculateSMA(candles, p);
      if (!maArr) return false;
      
      const maVal = maArr[idx];
      if (cond.condition === 'price_above') return close > maVal;
      if (cond.condition === 'price_below') return close < maVal;
      if (cond.condition === 'crosses_above') return close > maVal && prev.c <= maArr[idx - 1];
      if (cond.condition === 'crosses_below') return close < maVal && prev.c >= maArr[idx - 1];
      return false;
    }

    if (cond.name === 'RSI') {
      const rsiArr = indicators.rsi || calculateRSI(candles, params.period || 14);
      const rVal = rsiArr[idx];
      const limit = cond.value !== undefined ? cond.value : (cond.condition.includes('above') ? 70 : 30);
      
      if (cond.condition === 'value_below') return rVal < limit;
      if (cond.condition === 'value_above') return rVal > limit;
      if (cond.condition === 'crosses_above') return rVal > limit && rsiArr[idx - 1] <= limit;
      if (cond.condition === 'crosses_below') return rVal < limit && rsiArr[idx - 1] >= limit;
      return false;
    }

    if (cond.name === 'Stochastic') {
      const kArr = indicators.stochK;
      const dArr = indicators.stochD;
      if (!kArr) return false;
      
      const kVal = kArr[idx];
      const limit = cond.value !== undefined ? cond.value : (cond.condition.includes('above') ? 80 : 20);
      
      if (cond.condition === 'value_below') return kVal < limit;
      if (cond.condition === 'value_above') return kVal > limit;
      if (cond.condition === 'crosses_above') return kVal > dArr[idx] && kArr[idx - 1] <= dArr[idx - 1];
      if (cond.condition === 'crosses_below') return kVal < dArr[idx] && kArr[idx - 1] >= dArr[idx - 1];
      return false;
    }

    if (cond.name === 'Bollinger_Bands') {
      const upper = indicators.bbUpper;
      const lower = indicators.bbLower;
      if (!upper || !lower) return false;
      
      if (cond.condition === 'price_touches_lower') return low <= lower[idx];
      if (cond.condition === 'price_touches_upper') return high >= upper[idx];
      if (cond.condition === 'price_breaks_lower') return close < lower[idx];
      if (cond.condition === 'price_breaks_upper') return close > upper[idx];
      if (cond.condition === 'bandwidth_squeeze') {
        const width = indicators.bbWidth;
        if (!width) return false;
        const recent = width.slice(Math.max(0, idx - 100), idx + 1);
        const sorted = [...recent].sort((a,b) => a - b);
        const threshold = sorted[Math.floor(sorted.length * 0.25)] || 0;
        return width[idx] <= threshold;
      }
      return false;
    }

    if (cond.name === 'MACD') {
      const line = indicators.macdLine;
      const sig = indicators.macdSignal;
      const hist = indicators.macdHist;
      if (!line || !sig || !hist) return false;
      
      if (cond.condition === 'line_crosses_signal_above') return line[idx] > sig[idx] && line[idx - 1] <= sig[idx - 1];
      if (cond.condition === 'line_crosses_signal_below') return line[idx] < sig[idx] && line[idx - 1] >= sig[idx - 1];
      if (cond.condition === 'hist_positive') return hist[idx] > 0;
      if (cond.condition === 'hist_negative') return hist[idx] < 0;
      return false;
    }

    if (cond.name === 'VWAP') {
      const vwap = indicators.vwap;
      if (!vwap) return false;
      
      if (cond.condition === 'price_above') return close > vwap[idx];
      if (cond.condition === 'price_below') return close < vwap[idx];
      if (cond.condition === 'price_touch') return low <= vwap[idx] && high >= vwap[idx];
      return false;
    }

    if (cond.name === 'RSI_Divergence') {
      if (cond.condition === 'bullish_divergence') {
        return indicators.rsi[idx] < 40 && close > prev.c && indicators.rsi[idx] > indicators.rsi[idx - 1];
      }
      if (cond.condition === 'bearish_divergence') {
        return indicators.rsi[idx] > 60 && close < prev.c && indicators.rsi[idx] < indicators.rsi[idx - 1];
      }
      return false;
    }
  }

  if (cond.type === 'candle_pattern') {
    const isBullEngulfing = close > open && prev.c < prev.o && (close >= prev.o && open <= prev.c);
    const isBearEngulfing = close < open && prev.c > prev.o && (close <= prev.o && open >= prev.c);
    const bodySize = Math.abs(close - open);
    const totalSize = high - low || 1.0;
    const isDoji = bodySize / totalSize < 0.1;
    const lowerWick = Math.min(open, close) - low;
    const upperWick = high - Math.max(open, close);
    const isHammer = lowerWick > bodySize * 2 && upperWick < bodySize * 0.5;
    const isShootingStar = upperWick > bodySize * 2 && lowerWick < bodySize * 0.5;

    if (cond.name === 'bullish_engulfing') return isBullEngulfing;
    if (cond.name === 'bearish_engulfing') return isBearEngulfing;
    if (cond.name === 'doji') return isDoji;
    if (cond.name === 'hammer') return isHammer;
    if (cond.name === 'shooting_star') return isShootingStar;
    if (cond.name === 'pin_bar') return isHammer || isShootingStar;
    if (cond.name === 'inside_bar') return high < prev.h && low > prev.l;
    return false;
  }

  if (cond.type === 'structure') {
    if (cond.name === 'SMC_Zone') {
      if (cond.condition === 'near_support') {
        const recent = candles.slice(Math.max(0, idx - 20), idx).map(x => x.l);
        const minL = Math.min(...recent);
        return low <= minL * 1.002;
      }
      if (cond.condition === 'near_resistance') {
        const recent = candles.slice(Math.max(0, idx - 20), idx).map(x => x.h);
        const maxH = Math.max(...recent);
        return high >= maxH * 0.998;
      }
      if (cond.condition === 'sweep_liquidity') {
        const recentL = candles.slice(Math.max(0, idx - 20), idx).map(x => x.l);
        const recentH = candles.slice(Math.max(0, idx - 20), idx).map(x => x.h);
        const minL = Math.min(...recentL);
        const maxH = Math.max(...recentH);
        return (low < minL && close > minL) || (high > maxH && close < maxH);
      }
    }

    if (cond.name === 'ORB') {
      const period = cond.params?.period || 2;
      if (idx < period) return false;
      const sessionStartIdx = idx - (idx % 24);
      if (idx <= sessionStartIdx + period) return false;

      const sessionOpenCandles = candles.slice(sessionStartIdx, sessionStartIdx + period);
      const orbHigh = Math.max(...sessionOpenCandles.map(x => x.h));
      const orbLow = Math.min(...sessionOpenCandles.map(x => x.l));

      if (cond.condition === 'breaks_high') return close > orbHigh && prev.c <= orbHigh;
      if (cond.condition === 'breaks_low') return close < orbLow && prev.c >= orbLow;
      return false;
    }
  }

  return false;
}
