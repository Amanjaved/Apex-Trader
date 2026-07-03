/**
 * ApexTrader Paper Trading Engine (Database Persistent Edition)
 * Integrates directly with the FastAPI backend endpoints.
 */
import { S, saveState } from '../settings/state.js';
import { getEMA, getBB, getRSI, getStoch, getCloses } from '../indicators/indicators.js';

export const FEE_RATE = 0.0004; // Matches backend fee structure (0.04%)
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
}

// ──────────────────────────────────────────────
//  Backend API Synchronization
// ──────────────────────────────────────────────
function apiFetch(path, options) {
  // Use same-origin fetch - backend serves demo routes on same port
  return fetch(path, options);
}

export async function syncDemoData() {
  ensurePaperState();
  try {
    // 1. Portfolio Summary
    const r1 = await apiFetch('/demo/portfolio');
    if (r1.ok) {
      const d1 = await r1.json();
      S.demoAccount.balance = d1.balance;
      S.demoAccount.equity = d1.equity;
      S.demoAccount.usedMargin = d1.used_margin;
      S.demoAccount.freeMargin = d1.free_margin;
      S.demoAccount.openRisk = d1.open_risk_pct;
      S.demoAccount.todayPnl = d1.equity - d1.balance;
    }

    // 2. Open Positions
    const r2 = await apiFetch('/demo/positions');
    if (r2.ok) {
      const d2 = await r2.json();
      S.demoPositions = d2.map(p => ({
        id: p.id,
        symbol: p.symbol,
        type: p.side === 'BUY' ? 'LONG' : 'SHORT',
        size: p.size,
        leverage: p.leverage,
        entryPrice: p.entry_price,
        sl: p.sl,
        tp: p.tp,
        pnl: p.pnl,
        roi: p.pnl_pct,
        status: 'Running',
        openTime: p.created_at
      }));
      S.demoAccount.openTrades = S.demoPositions.length;
    }

    // 3. Closed Trades Journal
    const r3 = await apiFetch('/demo/trades?limit=50');
    if (r3.ok) {
      const d3 = await r3.json();
      S.demoHistory = d3.map(h => ({
        id: h.id,
        symbol: h.symbol,
        type: h.side === 'BUY' ? 'LONG' : 'SHORT',
        size: h.size,
        leverage: h.leverage,
        entryPrice: h.entry_price,
        exitPrice: h.exit_price,
        sl: h.sl,
        tp: h.tp,
        rr: h.ai_reasoning_snapshot?.rr !== undefined ? h.ai_reasoning_snapshot.rr : (h.sl && h.sl > 0 ? parseFloat((Math.abs(h.exit_price - h.entry_price) / Math.abs(h.entry_price - h.sl)).toFixed(2)) : 0.0),
        pnl: h.pnl,
        roi: h.leverage > 0 ? (h.pnl / (h.size * h.entry_price / h.leverage) * 100) : 0,
        fees: h.fees,
        openTime: h.entry_time,
        closeTime: h.exit_time,
        closeDate: h.exit_time ? h.exit_time.slice(0, 10) : '',
        grade: h.ai_reasoning_snapshot?.grade || (h.pnl >= 0 ? 'B' : 'D'),
        exitReason: h.ai_reasoning_snapshot?.recommendation || h.user_notes || 'Respect invalidation levels.',
        aiConfidence: h.ai_confidence || 75,
        aiReasoning: h.ai_reasoning_snapshot?.ai_notes || 'Standard technical evaluation.',
        userNotes: h.ai_reasoning_snapshot?.summary || h.user_notes || 'No review notes.',
        aiReasons: h.ai_reasoning_snapshot?.tags || [],
        followedAi: h.ai_confidence > 0,
        source: h.ai_confidence > 0 ? 'ai-guided' : 'manual'
      }));

      // Compute and update achievements
      const prevAchs = { ...(S.achievements || {}) };
      const wins = S.demoHistory.filter(t => t.pnl > 0);
      
      const ach100Wins = wins.length >= 100;
      
      // 5 Days Streak
      const dailyPnls = {};
      S.demoHistory.forEach(h => {
        const d = h.closeDate || '';
        if (d) dailyPnls[d] = (dailyPnls[d] || 0) + h.pnl;
      });
      const dates = Object.keys(dailyPnls).sort();
      let maxStreak = 0;
      let currentStreak = 0;
      for (let i = 0; i < dates.length; i++) {
        const pnl = dailyPnls[dates[i]];
        if (pnl > 0) {
          currentStreak++;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
          currentStreak = 0;
        }
      }
      const ach5Days = maxStreak >= 5;

      // 10R Trade
      const ach10R = S.demoHistory.some(t => t.rr >= 10.0);

      // No Rule Breaks
      let hasRuleBreaks = false;
      const sorted = [...S.demoHistory].sort((a, b) => new Date(a.openTime.replace(' ', 'T')) - new Date(b.openTime.replace(' ', 'T')));
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        if (t.leverage > 20) hasRuleBreaks = true;
        if (i > 0) {
          const prev = sorted[i - 1];
          if (prev.pnl < 0 && prev.closeTime && t.openTime) {
            const diffMs = new Date(t.openTime.replace(' ', 'T')) - new Date(prev.closeTime.replace(' ', 'T'));
            if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
              hasRuleBreaks = true;
            }
          }
        }
        const hasOverbought = (t.aiReasons || []).some(r => r.toLowerCase().includes('overbought'));
        if (t.type === 'LONG' && hasOverbought) {
          hasRuleBreaks = true;
        }
      }
      const achNoRuleBreaks = !hasRuleBreaks;

      S.achievements = {
        '100-wins': ach100Wins,
        '5-days': ach5Days,
        '10r-trade': ach10R,
        'no-rule-breaks': achNoRuleBreaks
      };

      // Consolidate Win Rate
      const stats = getPerformanceStats();
      S.demoAccount.winRate = stats.winRate;

      saveState();

      // Check for new unlocks (only triggers if previously false, not undefined on startup)
      const keys = ['100-wins', '5-days', '10r-trade', 'no-rule-breaks'];
      keys.forEach(k => {
        if (S.achievements[k] && prevAchs[k] === false) {
          window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: { key: k } }));
        }
      });
    }
  } catch (e) {
    console.error('[syncDemoData] Sync failed:', e);
  }
}

// ──────────────────────────────────────────────
//  Trade Operation Triggers (REST Endpoints)
// ──────────────────────────────────────────────
export async function resetPaperAccount() {
  try {
    const r = await apiFetch('/demo/reset?balance=10000', { method: 'POST' });
    if (r.ok) {
      await syncDemoData();
      notify();
      _toast('Demo account reset to $10,000.', 'info');
    }
  } catch (e) {
    _toast('Failed to reset account.', 'error');
  }
}

export async function openPaperPosition(type, opts = {}) {
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

  const payload = {
    symbol: opts.symbol || S.coin,
    side: type === 'LONG' ? 'BUY' : 'SELL',
    size: sizing.sizeUnits,
    leverage: sizing.leverage,
    sl: sizing.sl || null,
    tp: sizing.tp || null,
    price: currentPrice
  };

  const snap = S.aiSnapshot;
  const followedAi = !!(snap && biasMatchesType(snap.bias, type) && opts.useAi !== false);
  if (followedAi) {
    payload.linked_ai_signal = {
      interval: S.tf,
      bias: snap.bias,
      entry_price: snap.entryPrice || currentPrice,
      sl: snap.sl || null,
      tp: snap.tp || null,
      confidence: snap.score || 0.0,
      reasoning_tags: (snap.confluences || []).slice(0, 5).map(c => c.txt)
    };
  }

  try {
    const r = await apiFetch('/demo/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      let msg = r.statusText;
      try {
        const err = await r.json();
        msg = err.detail || msg;
      } catch (_) {}
      _toast(`Error: ${msg}`, 'error');
      return null;
    }
    await syncDemoData();
    notify();
    _toast(`${followedAi ? 'AI-guided' : 'Manual'} ${type} opened.`, 'success');
  } catch (e) {
    console.error('[engine.js] openPaperPosition exception:', e);
    _toast('Failed to open position.', 'error');
  }
}

export async function closePaperPosition(idx, exitReason = 'Manual Close', exitPriceOverride) {
  ensurePaperState();
  const p = S.demoPositions[idx];
  if (!p) return null;

  try {
    const r = await apiFetch('/demo/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_id: p.id,
        price: exitPriceOverride || null
      })
    });
    if (!r.ok) {
      const err = await r.json();
      _toast(`Error: ${err.detail || r.statusText}`, 'error');
      return null;
    }
    const trade = await r.json();
    await syncDemoData();
    notify();
    _toast(`Closed: ${trade.pnl >= 0 ? '+' : ''}${fmtUSD(trade.pnl)}`, trade.pnl >= 0 ? 'success' : 'info');
    return trade;
  } catch (e) {
    _toast('Failed to close position.', 'error');
    return null;
  }
}

export async function closeHalfPosition() {
  if (!S.demoPositions.length) {
    _toast('No open positions.', 'info');
    return;
  }
  const p = S.demoPositions[0];
  const halfSize = p.size / 2;
  try {
    const r = await apiFetch('/demo/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_id: p.id,
        size: halfSize
      })
    });
    if (!r.ok) {
      const err = await r.json();
      _toast(`Error: ${err.detail || r.statusText}`, 'error');
      return;
    }
    await syncDemoData();
    notify();
    _toast('Closed 50% of position size.', 'info');
  } catch (e) {
    _toast('Failed to close 50% of position.', 'error');
  }
}

export async function moveSlToBreakeven() {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  const p = S.demoPositions[0];
  try {
    const r = await apiFetch('/demo/modify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_id: p.id,
        sl: p.entryPrice,
        tp: p.tp
      })
    });
    if (r.ok) {
      await syncDemoData();
      notify();
      _toast('Stop loss moved to breakeven.', 'success');
    }
  } catch (e) {
    _toast('Failed to modify stop loss.', 'error');
  }
}

export async function trailStop(currentPrice) {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  const p = S.demoPositions[0];
  const px = currentPrice || p.entryPrice;
  const newSl = p.type === 'LONG' ? px * 0.995 : px * 1.005;
  try {
    const r = await apiFetch('/demo/modify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_id: p.id,
        sl: newSl,
        tp: p.tp
      })
    });
    if (r.ok) {
      await syncDemoData();
      notify();
      _toast('Trailing stop adjusted.', 'success');
    }
  } catch (e) {
    _toast('Failed to adjust trailing stop.', 'error');
  }
}

export async function reversePosition(currentPrice, openOpts) {
  if (!S.demoPositions.length) return _toast('No open positions.', 'info');
  const p = S.demoPositions[0];
  const newType = p.type === 'LONG' ? 'SHORT' : 'LONG';
  await closePaperPosition(0, 'Position Reversed', currentPrice);
  await openPaperPosition(newType, { ...openOpts, price: currentPrice });
}

export async function closeAllPositions(currentPrice) {
  if (!S.demoPositions.length) {
    _toast('No open positions.', 'info');
    return;
  }
  // Close positions one by one, re-fetching after each close since indices change
  const posIds = S.demoPositions.map(p => p.id);
  for (const posId of posIds) {
    try {
      const r = await apiFetch('/demo/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_id: posId,
          price: currentPrice || null
        })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.error(`[closeAllPositions] Error closing ${posId}:`, err.detail || r.statusText);
      }
    } catch (e) {
      console.error(`[closeAllPositions] Exception closing ${posId}:`, e);
    }
  }
  await syncDemoData();
  notify();
  _toast('All positions closed.', 'info');
}

// ──────────────────────────────────────────────
//  Trade Sizing & Indicator Helpers
// ──────────────────────────────────────────────
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
  if (type === 'LONG') return b.includes('bullish') || b.includes('long');
  if (type === 'SHORT') return b.includes('bearish') || b.includes('short');
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

export function calcPositionPnl(p, currentPrice) {
  const priceDiff = p.type === 'LONG' ? (currentPrice - p.entryPrice) : (p.entryPrice - currentPrice);
  const openFee = p.entryPrice * p.size * FEE_RATE;
  const closeFee = currentPrice * p.size * FEE_RATE;
  const pnl = priceDiff * p.size - (openFee + closeFee);
  const roi = p.margin > 0 ? (pnl / p.margin) * 100 : 0;
  return { pnl, roi, fees: openFee + closeFee };
}

// Recalculates position P&L locally on price updates to show ticking digits
export function tickPaperPositions(currentPrice, symbol) {
  ensurePaperState();
  if (!currentPrice || !S.demoPositions.length) return;

  let runningPnl = 0;
  S.demoPositions.forEach(p => {
    if (p.symbol !== symbol) return;
    const { pnl, roi } = calcPositionPnl(p, currentPrice);
    p.pnl = pnl;
    p.roi = roi;
    runningPnl += pnl;
  });

  const acc = S.demoAccount;
  acc.equity = acc.balance + runningPnl;
  acc.todayPnl = acc.realizedToday + runningPnl;
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
    const d = h.closeDate || '';
    if (d) map[d] = (map[d] || 0) + h.pnl;
  });
  return map;
}
