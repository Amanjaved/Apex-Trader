/**
 * ApexTrader Paper Trading Engine
 * Virtual portfolio, P&L, journal, and AI-assisted trade evaluation.
 */
import { S, saveState } from '../settings/state.js';
import { getEMA, getBB, getRSI, getStoch, getCloses } from '../indicators/indicators.js';

export const FEE_RATE = 0.0006;
export const DEFAULT_BALANCE = 10000;

let _toast = (msg, type) => console.log(`[paper] ${type}: ${msg}`);
let _onChange = null;

export function initPaperEngine({ toast, onChange } = {}) {
  if (toast) _toast = toast;
  if (onChange) _onChange = onChange;
}

function notify() {
  if (_onChange) _onChange();
}

export function setAiSnapshot(data) {
  S.aiSnapshot = data || null;
}

export function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function defaultAccount() {
  return {
    balance: DEFAULT_BALANCE,
    equity: DEFAULT_BALANCE,
    todayPnl: 0,
    openTrades: 0,
    winRate: 100,
    freeMargin: DEFAULT_BALANCE,
    usedMargin: 0,
    openRisk: 0,
    realizedToday: 0,
    feesPaid: 0,
    netProfit: 0,
    dailyReturn: 0,
    weeklyReturn: 0,
    aiBalance: DEFAULT_BALANCE,
  };
}

export function ensurePaperState() {
  if (!S.demoAccount) S.demoAccount = defaultAccount();
  if (!S.demoPositions) S.demoPositions = [];
  if (!S.demoHistory) S.demoHistory = [];
  if (!S.achievements) {
    S.achievements = { '100-wins': false, '5-days': false, '10r-trade': false, 'no-rule-breaks': true };
  }
  if (S.demoAccount.aiBalance == null) S.demoAccount.aiBalance = DEFAULT_BALANCE;
}

export function resetPaperAccount() {
  S.demoAccount = defaultAccount();
  S.demoPositions = [];
  S.demoHistory = [];
  S.achievements = { '100-wins': false, '5-days': false, '10r-trade': false, 'no-rule-breaks': true };
  saveState();
  notify();
  _toast('Demo account reset to $10,000.', 'info');
}

function parseStepVal(steps, labelPart) {
  if (!steps) return 0;
  const step = steps.find(s => (s.label || '').toLowerCase().includes(labelPart.toLowerCase()));
  if (!step) return 0;
  return parseFloat(String(step.val).replace(/[^0-9.-]/g, '')) || 0;
}

export function getAiTradeLevels(type, currentPrice) {
  const snap = S.aiSnapshot;
  const steps = snap?.executionSteps;
  const levels = snap?.levels || { support: [], resistance: [] };

  let sl = 0;
  let tp = 0;
  let tp2 = 0;
  let tp3 = 0;
  let entry = currentPrice;

  if (steps?.length) {
    sl = parseStepVal(steps, 'stop loss');
    tp = parseStepVal(steps, 'take profit 1');
    tp2 = parseStepVal(steps, 'take profit 2');
    tp3 = parseStepVal(steps, 'take profit 3');
    const trigger = parseStepVal(steps, 'trigger target');
    if (trigger > 0) entry = trigger;
  }

  if (!sl) {
    if (type === 'LONG') sl = levels.support?.[0]?.price || currentPrice * 0.98;
    else sl = levels.resistance?.[0]?.price || currentPrice * 1.02;
  }
  if (!tp) {
    if (type === 'LONG') tp = levels.resistance?.[0]?.price || currentPrice * 1.04;
    else tp = levels.support?.[0]?.price || currentPrice * 0.96;
  }
  if (!tp2) tp2 = type === 'LONG' ? entry * 1.05 : entry * 0.95;
  if (!tp3) tp3 = type === 'LONG' ? entry * 1.08 : entry * 0.92;

  return { entry, sl, tp, tp2, tp3 };
}

export function biasMatchesType(bias, type) {
  const b = (bias || '').toLowerCase();
  if (type === 'LONG') return b.includes('bullish');
  if (type === 'SHORT') return b.includes('bearish');
  return false;
}

export function resolveOrderSizing(type, currentPrice, opts = {}) {
  const capital = opts.capital ?? DEFAULT_BALANCE;
  const riskPct = opts.riskPct ?? 1.0;
  const leverage = opts.leverage ?? 10;
  const useAi = opts.useAi !== false;

  let sl = opts.sl || 0;
  let tp = opts.tp || 0;
  let tp2 = 0;
  let tp3 = 0;

  if (useAi && S.aiSnapshot) {
    const ai = getAiTradeLevels(type, currentPrice);
    if (!opts.sl) sl = ai.sl;
    if (!opts.tp) tp = ai.tp;
    tp2 = ai.tp2;
    tp3 = ai.tp3;
  }

  if (!sl || sl <= 0) {
    sl = type === 'LONG' ? currentPrice * 0.98 : currentPrice * 1.02;
  }
  if (!tp || tp <= 0) {
    tp = type === 'LONG' ? currentPrice * 1.04 : currentPrice * 0.96;
  }

  const stopDistPct = (Math.abs(currentPrice - sl) / currentPrice) * 100;
  const riskUSD = capital * (riskPct / 100);
  const positionSizeUSD = stopDistPct > 0 ? riskUSD / (stopDistPct / 100) : riskUSD;
  const sizeUnits = positionSizeUSD / currentPrice;
  const marginRequired = positionSizeUSD / leverage;

  return {
    sl, tp, tp2, tp3,
    stopDistPct,
    riskUSD,
    positionSizeUSD,
    sizeUnits,
    marginRequired,
    leverage,
    riskPct,
  };
}

export function preTradeCheck(type, sizing) {
  const warnings = [];
  if (sizing.riskPct > 2.0) {
    warnings.push(`Position risks ${sizing.riskPct}% of account (recommended max 1%).`);
    S.achievements['no-rule-breaks'] = false;
  }
  if (sizing.riskPct > 1.0) {
    warnings.push(`Open risk ${sizing.riskPct.toFixed(1)}% exceeds 1% guideline.`);
  }

  const snap = S.aiSnapshot;
  if (snap && !biasMatchesType(snap.bias, type)) {
    warnings.push(`AI bias is ${snap.bias} — direction may conflict with ${type}.`);
  }

  const liq = type === 'LONG'
    ? sizing.entry * (1 - 1 / sizing.leverage)
    : sizing.entry * (1 + 1 / sizing.leverage);
  const entry = sizing.entry ?? 0;
  if (entry && type === 'LONG' && liq >= sizing.sl) {
    warnings.push('Liquidation price would trigger before stop loss — reduce leverage.');
  }
  if (entry && type === 'SHORT' && liq <= sizing.sl) {
    warnings.push('Liquidation price would trigger before stop loss — reduce leverage.');
  }

  return warnings;
}

export function openPaperPosition(type, opts = {}) {
  ensurePaperState();
  const currentPrice = opts.price;
  if (!currentPrice) {
    _toast('No live price available to execute order.', 'error');
    return null;
  }

  const sizing = resolveOrderSizing(type, currentPrice, opts);
  sizing.entry = currentPrice;

  const warnings = preTradeCheck(type, sizing);
  warnings.forEach(w => _toast(`⚠️ ${w}`, 'error'));

  const acc = S.demoAccount;
  if (sizing.marginRequired > acc.freeMargin) {
    _toast(`Insufficient margin: need ${fmtUSD(sizing.marginRequired)}, free ${fmtUSD(acc.freeMargin)}`, 'error');
    return null;
  }

  const snap = S.aiSnapshot;
  const followedAi = !!(snap && biasMatchesType(snap.bias, type) && opts.useAi !== false);

  const pos = {
    id: Date.now(),
    symbol: opts.symbol || S.coin,
    type,
    size: sizing.sizeUnits,
    leverage: sizing.leverage,
    entryPrice: currentPrice,
    sl: sizing.sl,
    tp: sizing.tp,
    tp2: sizing.tp2,
    tp3: sizing.tp3,
    margin: sizing.marginRequired,
    pnl: 0,
    roi: 0,
    status: 'Running',
    openTime: new Date().toISOString(),
    openTimeLabel: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    aiConfidence: snap?.score ?? null,
    aiBias: snap?.bias ?? null,
    aiConfluences: (snap?.confluences || []).slice(0, 5).map(c => c.txt),
    followedAi,
    source: followedAi ? 'ai-guided' : 'manual',
  };

  S.demoPositions.push(pos);
  acc.usedMargin += sizing.marginRequired;
  acc.freeMargin = acc.balance - acc.usedMargin;
  acc.openTrades = S.demoPositions.length;
  recomputeOpenRisk();

  saveState();
  notify();
  _toast(`${followedAi ? 'AI-guided' : 'Manual'} ${type} @ ${fmtUSD(currentPrice)}`, 'success');
  return pos;
}

function recomputeOpenRisk() {
  const acc = S.demoAccount;
  let riskSum = 0;
  S.demoPositions.forEach(p => {
    if (!p.entryPrice || !p.sl) return;
    const stopPct = (Math.abs(p.entryPrice - p.sl) / p.entryPrice) * 100;
    riskSum += stopPct * (p.margin / Math.max(acc.balance, 1));
  });
  acc.openRisk = riskSum;
}

export function calcPositionPnl(p, currentPrice) {
  const priceDiff = p.type === 'LONG' ? (currentPrice - p.entryPrice) : (p.entryPrice - currentPrice);
  const openFee = p.entryPrice * p.size * FEE_RATE;
  const closeFee = currentPrice * p.size * FEE_RATE;
  const pnl = priceDiff * p.size - (openFee + closeFee);
  const roi = p.margin > 0 ? (pnl / p.margin) * 100 : 0;
  return { pnl, roi, fees: openFee + closeFee };
}

export function tickPaperPositions(currentPrice, symbol) {
  ensurePaperState();
  if (!currentPrice || !S.demoPositions.length) {
    recomputeAccountEquity(0);
    notify();
    return;
  }

  let runningPnl = 0;
  let triggered = false;

  for (let idx = S.demoPositions.length - 1; idx >= 0; idx--) {
    const p = S.demoPositions[idx];
    if (p.symbol !== symbol || p.status !== 'Running') continue;

    const { pnl, roi } = calcPositionPnl(p, currentPrice);
    p.pnl = pnl;
    p.roi = roi;
    runningPnl += pnl;

    let exitReason = null;
    if (p.sl) {
      if (p.type === 'LONG' && currentPrice <= p.sl) exitReason = 'Stop Loss Hit';
      if (p.type === 'SHORT' && currentPrice >= p.sl) exitReason = 'Stop Loss Hit';
    }
    if (p.tp) {
      if (p.type === 'LONG' && currentPrice >= p.tp) exitReason = 'Take Profit Hit';
      if (p.type === 'SHORT' && currentPrice <= p.tp) exitReason = 'Take Profit Hit';
    }

    const liq = p.type === 'LONG'
      ? p.entryPrice * (1 - 1 / p.leverage)
      : p.entryPrice * (1 + 1 / p.leverage);
    if (p.type === 'LONG' && currentPrice <= liq) exitReason = 'Liquidated';
    if (p.type === 'SHORT' && currentPrice >= liq) exitReason = 'Liquidated';

    if (exitReason) {
      closePaperPosition(idx, exitReason, currentPrice);
      triggered = true;
    }
  }

  recomputeAccountEquity(runningPnl);
  if (triggered) saveState();
  notify();
}

function recomputeAccountEquity(unrealizedPnl) {
  const acc = S.demoAccount;
  acc.equity = acc.balance + unrealizedPnl;
  acc.todayPnl = acc.realizedToday + unrealizedPnl;
  acc.netProfit = acc.balance - DEFAULT_BALANCE;
  acc.dailyReturn = acc.balance > 0 ? (acc.realizedToday / DEFAULT_BALANCE) * 100 : 0;
  acc.openTrades = S.demoPositions.length;
}

function gradeTrade(finalPnl, rr) {
  if (finalPnl > 0) {
    if (rr >= 10) return 'A+';
    if (rr >= 3) return 'A+';
    if (rr >= 2) return 'A';
    return 'B';
  }
  return 'D';
}

function buildAiReview(p, finalPnl, exitReason) {
  const confs = p.aiConfluences || [];
  const confStr = confs.slice(0, 4).join(', ') || 'EMA stack, momentum, structure';

  if (finalPnl >= 0) {
    return {
      summary: `Excellent execution. ${confStr}. Held through noise to target.`,
      reasoning: `AI confidence was ${p.aiConfidence ?? '—'}% at entry. Exit: ${exitReason}.`,
      reasons: confs.length ? confs : ['Trend alignment', 'VWAP support', 'Order block confluence'],
    };
  }

  return {
    summary: 'Entered before full confirmation. Market reversed against the setup.',
    reasoning: `Confidence at entry: ${p.aiConfidence ?? '—'}%. ${exitReason}. Wait for candle close confirmation next time.`,
    reasons: ['Premature entry', 'Macro reversal', 'Stop loss respected (risk managed)'],
  };
}

export function closePaperPosition(idx, exitReason = 'Manual Close', exitPriceOverride) {
  ensurePaperState();
  const p = S.demoPositions[idx];
  if (!p) return null;

  const currentPrice = exitPriceOverride ?? p.entryPrice;
  const { pnl: finalPnl, roi: finalRoi, fees } = calcPositionPnl(p, currentPrice);

  S.demoPositions.splice(idx, 1);

  const acc = S.demoAccount;
  acc.balance += finalPnl;
  acc.usedMargin -= p.margin;
  acc.freeMargin = acc.balance - acc.usedMargin;
  acc.realizedToday += finalPnl;
  acc.feesPaid += fees;
  acc.todayPnl = acc.realizedToday;

  const stopDist = Math.abs(p.entryPrice - p.sl);
  const rr = stopDist > 0 ? Math.abs(currentPrice - p.entryPrice) / stopDist : 0;
  const grade = gradeTrade(finalPnl, rr);
  const review = buildAiReview(p, finalPnl, exitReason);

  if (grade === 'A+' && rr >= 10) {
    S.achievements['10r-trade'] = true;
    _toast('💎 Achievement: 10R Ratio Legend!', 'success');
  }

  const journalItem = {
    id: (S.demoHistory.length ? Math.max(...S.demoHistory.map(h => h.id)) : 100) + 1,
    symbol: p.symbol,
    type: p.type,
    size: p.size,
    leverage: p.leverage,
    entryPrice: p.entryPrice,
    exitPrice: currentPrice,
    sl: p.sl,
    tp: p.tp,
    rr,
    pnl: finalPnl,
    roi: finalRoi,
    fees,
    openTime: p.openTimeLabel || p.openTime,
    closeTime: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    closeDate: new Date().toISOString().slice(0, 10),
    grade,
    exitReason,
    aiConfidence: p.aiConfidence ?? 0,
    aiBias: p.aiBias,
    aiReasoning: review.reasoning,
    userNotes: review.summary,
    aiReasons: review.reasons,
    followedAi: p.followedAi,
    source: p.source,
  };

  S.demoHistory.push(journalItem);

  const wins = S.demoHistory.filter(h => h.pnl > 0).length;
  acc.winRate = S.demoHistory.length ? (wins / S.demoHistory.length) * 100 : 100;

  if (wins >= 100) {
    S.achievements['100-wins'] = true;
    _toast('🏆 Achievement: 100 Winning Trades!', 'success');
  }

  checkWinningDayStreak();
  updateAiShadowBalance(journalItem);

  saveState();
  notify();
  _toast(`Closed (${exitReason}): ${finalPnl >= 0 ? '+' : ''}${fmtUSD(finalPnl)}`, finalPnl >= 0 ? 'success' : 'info');
  return journalItem;
}

function checkWinningDayStreak() {
  const byDay = {};
  S.demoHistory.forEach(h => {
    const d = h.closeDate || new Date().toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + h.pnl;
  });
  const days = Object.keys(byDay).sort().slice(-5);
  if (days.length >= 5 && days.every(d => byDay[d] > 0)) {
    S.achievements['5-days'] = true;
    _toast('🔥 Achievement: 5 Winning Days!', 'success');
  }
}

function updateAiShadowBalance(trade) {
  const acc = S.demoAccount;
  if (trade.followedAi) {
    acc.aiBalance = (acc.aiBalance ?? DEFAULT_BALANCE) + trade.pnl;
  }
}

export function closeHalfPosition() {
  if (!S.demoPositions.length) {
    _toast('No open positions.', 'info');
    return;
  }
  const p = S.demoPositions[0];
  p.size /= 2;
  p.margin /= 2;
  saveState();
  notify();
  _toast('Closed 50% of position size.', 'info');
}

export function moveSlToBreakeven() {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  S.demoPositions[0].sl = S.demoPositions[0].entryPrice;
  saveState();
  notify();
  _toast('Stop loss moved to breakeven.', 'success');
}

export function trailStop(currentPrice) {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  const p = S.demoPositions[0];
  const px = currentPrice || p.entryPrice;
  p.sl = p.type === 'LONG' ? px * 0.995 : px * 1.005;
  saveState();
  notify();
  _toast('Trailing stop adjusted.', 'success');
}

export function reversePosition(currentPrice, openOpts) {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  const p = S.demoPositions[0];
  const newType = p.type === 'LONG' ? 'SHORT' : 'LONG';
  closePaperPosition(0, 'Position Reversed', currentPrice);
  openPaperPosition(newType, { ...openOpts, price: currentPrice });
}

export function closeAllPositions(currentPrice) {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  while (S.demoPositions.length) {
    closePaperPosition(0, 'Manual Close All', currentPrice);
  }
}

export function getPerformanceStats() {
  ensurePaperState();
  const hist = S.demoHistory;
  if (!hist.length) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0, avgRR: 0,
      largestWin: 0, largestLoss: 0, profitFactor: 0, expectancy: 0,
    };
  }

  const wins = hist.filter(h => h.pnl > 0);
  const losses = hist.filter(h => h.pnl <= 0);
  const grossWin = wins.reduce((s, h) => s + h.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, h) => s + h.pnl, 0));

  return {
    totalTrades: hist.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / hist.length) * 100,
    avgRR: hist.reduce((s, h) => s + (h.rr || 0), 0) / hist.length,
    largestWin: wins.length ? Math.max(...wins.map(h => h.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map(h => h.pnl)) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    expectancy: hist.reduce((s, h) => s + h.pnl, 0) / hist.length,
  };
}

export function getChallengeReturns() {
  ensurePaperState();
  const acc = S.demoAccount;
  const userReturn = ((acc.balance - DEFAULT_BALANCE) / DEFAULT_BALANCE) * 100;
  const aiTrades = S.demoHistory.filter(h => h.followedAi);
  let aiReturn = 0;
  if (aiTrades.length) {
    aiReturn = (aiTrades.reduce((s, h) => s + h.pnl, 0) / DEFAULT_BALANCE) * 100;
  } else if (acc.aiBalance != null) {
    aiReturn = ((acc.aiBalance - DEFAULT_BALANCE) / DEFAULT_BALANCE) * 100;
  }
  return { userReturn, aiReturn, aiTradeCount: aiTrades.length };
}

export function getCoachAdvice(position, currentPrice) {
  if (!position) {
    return {
      title: 'AI Coach',
      body: 'No open trade. When AI bias aligns with your direction, entry/SL/TP are pulled from the analysis engine automatically.',
      tp1Prob: null,
    };
  }

  const pnl = position.pnl || 0;
  const notional = position.entryPrice * position.size;
  let body = 'Hold position — structure still supports the trade. Do not exit early.';
  let tp1Prob = 76;

  if (pnl > 0 && notional > 0 && pnl >= notional * 0.015) {
    body = 'Move stop loss to breakeven to lock a risk-free trade. TP2 probability remains elevated.';
    tp1Prob = 82;
  } else if (pnl < 0 && notional > 0 && Math.abs(pnl) >= notional * 0.01) {
    body = 'Price is testing your invalidation zone. Consider closing 50% or tightening the stop.';
    tp1Prob = 38;
  }

  const snap = S.aiSnapshot;
  if (snap?.score != null && snap.score < 45 && position.type === 'LONG') {
    body = 'AI confidence dropped below 45%. Re-evaluate hold vs partial exit.';
    tp1Prob = 42;
  }

  return {
    title: `AI Coach — ${position.symbol} ${position.type}`,
    body,
    tp1Prob,
    tp2Prob: Math.max(20, tp1Prob - 22),
    currentPnl: pnl,
  };
}

export function getDailyPnlMap() {
  const map = {};
  S.demoHistory.forEach(h => {
    const d = h.closeDate || new Date().toISOString().slice(0, 10);
    map[d] = (map[d] || 0) + h.pnl;
  });
  return map;
}

export function logBotAction(msg) {
  if (!S.botLogs) S.botLogs = [];
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  S.botLogs.push(`[${timestamp}] ${msg}`);
  if (S.botLogs.length > 50) S.botLogs.shift();
  notify();
}

let lastCheckTime = 0;

export function tickTradingBot(currentPrice, symbol) {
  ensurePaperState();
  if (!S.botActive) return;

  // Run strategy evaluation at most once every 3 seconds to avoid spamming indicators logic
  const now = Date.now();
  if (now - lastCheckTime < 3000) return;
  lastCheckTime = now;

  // If there are already active positions, let's wait until they exit
  if (S.demoPositions.length >= 1) return;

  const strategy = S.botStrategy || 'ai_consensus';
  const snap = S.aiSnapshot;

  if (strategy === 'ai_consensus') {
    if (!snap || snap.score == null) return;
    if (snap.score >= 80) {
      const bias = (snap.bias || '').toLowerCase();
      if (bias.includes('long') || bias.includes('bullish')) {
        logBotAction(`AI Consensus trigger: Placing BUY (LONG) @ ${fmtUSD(currentPrice)} (Confidence ${snap.score}%)`);
        openPaperPosition('LONG', { symbol, price: currentPrice, useAi: true, leverage: 20 });
      } else if (bias.includes('short') || bias.includes('bearish')) {
        logBotAction(`AI Consensus trigger: Placing SELL (SHORT) @ ${fmtUSD(currentPrice)} (Confidence ${snap.score}%)`);
        openPaperPosition('SHORT', { symbol, price: currentPrice, useAi: true, leverage: 20 });
      }
    }
  } 
  else if (strategy === 'ema_rsi') {
    if (S.candles.length < 60) return;
    const closes = getCloses();
    const ema20 = getEMA(closes, 20);
    const ema50 = getEMA(closes, 50);
    const rsi = getRSI(closes, 14);

    const len = closes.length;
    const last20 = ema20[len - 1];
    const last50 = ema50[len - 1];
    const lastRsi = rsi[len - 1];

    if (last20 > last50 && lastRsi < 40) {
      logBotAction(`EMA+RSI trigger: Placing BUY (LONG) @ ${fmtUSD(currentPrice)} (EMA Cross Up, RSI: ${lastRsi.toFixed(0)})`);
      openPaperPosition('LONG', { symbol, price: currentPrice, useAi: false, leverage: 15 });
    } else if (last20 < last50 && lastRsi > 60) {
      logBotAction(`EMA+RSI trigger: Placing SELL (SHORT) @ ${fmtUSD(currentPrice)} (EMA Cross Down, RSI: ${lastRsi.toFixed(0)})`);
      openPaperPosition('SHORT', { symbol, price: currentPrice, useAi: false, leverage: 15 });
    }
  }
  else if (strategy === 'smc_fvg') {
    if (!snap || !snap.levels) return;
    const bias = (snap.bias || '').toLowerCase();
    const isBullish = bias.includes('long') || bias.includes('bullish');
    
    // Check if price is inside entry range target (within 0.5% of target entry price)
    const targetEntry = snap.entryPrice || (isBullish ? snap.levels.support?.[0]?.price : snap.levels.resistance?.[0]?.price) || currentPrice;
    const pctDiff = Math.abs(currentPrice - targetEntry) / targetEntry;
    
    if (pctDiff <= 0.005) {
      if (isBullish) {
        logBotAction(`SMC FVG trigger: Placing BUY (LONG) @ ${fmtUSD(currentPrice)} (Entry zone retest: ${fmtUSD(targetEntry)})`);
        openPaperPosition('LONG', { symbol, price: currentPrice, useAi: true, leverage: 25 });
      } else {
        logBotAction(`SMC FVG trigger: Placing SELL (SHORT) @ ${fmtUSD(currentPrice)} (Entry zone retest: ${fmtUSD(targetEntry)})`);
        openPaperPosition('SHORT', { symbol, price: currentPrice, useAi: true, leverage: 25 });
      }
    }
  }
  else if (strategy === 'mean_reversion') {
    if (S.candles.length < 30) return;
    const closes = getCloses();
    const bb = getBB(closes, 20, 2);
    const stoch = getStoch(S.candles, 14, 3);
    
    const len = closes.length;
    const lastClose = closes[len - 1];
    const lastUpper = bb.upper[len - 1];
    const lastLower = bb.lower[len - 1];
    const lastStochK = stoch.k[len - 1];
    
    if (lastClose <= lastLower && lastStochK < 20) {
      logBotAction(`Mean Reversion trigger: Placing BUY (LONG) @ ${fmtUSD(currentPrice)} (Price below Lower BB, Stochastic: ${lastStochK.toFixed(0)})`);
      openPaperPosition('LONG', { symbol, price: currentPrice, useAi: false, leverage: 10 });
    } else if (lastClose >= lastUpper && lastStochK > 80) {
      logBotAction(`Mean Reversion trigger: Placing SELL (SHORT) @ ${fmtUSD(currentPrice)} (Price above Upper BB, Stochastic: ${lastStochK.toFixed(0)})`);
      openPaperPosition('SHORT', { symbol, price: currentPrice, useAi: false, leverage: 10 });
    }
  }
}
