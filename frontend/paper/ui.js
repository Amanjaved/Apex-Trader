/**
 * Shared paper-trading dashboard UI (charts sidebar + analysis tab).
 */
import { S } from '../settings/state.js';
import {
  fmtUSD, ensurePaperState, getPerformanceStats, getChallengeReturns,
  getCoachAdvice, getDailyPnlMap, closePaperPosition,
} from './engine.js';

export function renderPaperAccountSummary(prefix = '') {
  ensurePaperState();
  const acc = S.demoAccount;

  const ids = prefix === 'sb' ? {
    balance: 'sbDemoBalance', equity: 'sbDemoEquity', todayPnl: 'sbDemoTodayPnl',
    openCount: 'sbDemoOpenCount', unrealized: 'sbDemoUnrealized',
    realized: 'sbDemoRealizedToday', net: 'sbDemoNetPnl', winRate: 'sbDemoWinRate',
    usedMargin: 'sbDemoUsedMargin', freeMargin: 'sbDemoFreeMargin', openRisk: 'sbDemoOpenRisk',
    fees: 'sbDemoFeesPaid',
  } : {
    balance: 'demoBalance', equity: 'demoEquity', todayPnl: 'demoTodayPnl',
    openCount: 'demoOpenCount', unrealized: 'demoUnrealized',
    realized: 'demoRealizedToday', net: 'demoNetPnl', winRate: 'demoWinRate',
    usedMargin: 'demoUsedMargin', freeMargin: 'demoFreeMargin', openRisk: 'demoOpenRisk',
    fees: 'demoFeesPaid',
  };

  const set = (key, text, color) => {
    const el = document.getElementById(ids[key]);
    if (!el) return;
    el.textContent = text;
    if (color) el.style.color = color;
  };

  set('balance', fmtUSD(acc.balance));
  set('equity', fmtUSD(acc.equity));
  if (ids.winRate) {
    const wr = document.getElementById(ids.winRate);
    if (wr) wr.textContent = `${Math.round(acc.winRate)}%`;
  }

  const pnl = acc.todayPnl || 0;
  const pnlEl = document.getElementById(ids.todayPnl);
  if (pnlEl) {
    pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${fmtUSD(pnl)}`;
    pnlEl.style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    if (!prefix) pnlEl.className = `term-val ${pnl >= 0 ? 'green' : 'red'}`;
  }

  set('openCount', String(S.demoPositions.length));
  set('usedMargin', fmtUSD(acc.usedMargin));
  set('freeMargin', fmtUSD(acc.freeMargin));
  set('fees', fmtUSD(acc.feesPaid));

  const riskEl = document.getElementById(ids.openRisk);
  if (riskEl) {
    riskEl.textContent = `${(acc.openRisk || 0).toFixed(1)}%`;
    riskEl.style.color = acc.openRisk > 2 ? 'var(--red)' : acc.openRisk > 1 ? 'var(--gold)' : 'var(--green)';
  }

  const unreal = acc.equity - acc.balance;
  set('unrealized', `${unreal >= 0 ? '+' : ''}${fmtUSD(unreal)}`, unreal >= 0 ? 'var(--green)' : 'var(--red)');
  set('realized', `${(acc.realizedToday || 0) >= 0 ? '+' : ''}${fmtUSD(acc.realizedToday || 0)}`);
  set('net', `${pnl >= 0 ? '+' : ''}${fmtUSD(pnl)}`, pnl >= 0 ? 'var(--green)' : 'var(--red)');
}

export function renderPaperPositionsTable(currentPrice, opts = {}) {
  const tbody = document.getElementById(opts.tableId || 'demoPositionsList');
  if (!tbody) return;

  if (!S.demoPositions.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-3);padding:20px;">No active positions. Use BUY/SELL to open a demo trade.</td></tr>`;
    return;
  }

  tbody.innerHTML = S.demoPositions.map((p, idx) => {
    const px = currentPrice || p.entryPrice;
    const up = p.pnl >= 0;
    const closeFn = opts.closeFn || 'closeDemoPositionAtIndex';
    return `
      <tr>
        <td><b>${p.symbol}</b></td>
        <td><span class="bias-badge ${p.type === 'LONG' ? 'bullish' : 'bearish'}">${p.type}</span></td>
        <td style="font-family:var(--mono);">${p.leverage}x</td>
        <td style="font-family:var(--mono);">${p.size.toFixed(4)}</td>
        <td style="font-family:var(--mono);">${fmtUSD(p.entryPrice)}</td>
        <td style="font-family:var(--mono);color:var(--cyan);">${fmtUSD(px)}</td>
        <td style="font-family:var(--mono);color:${up ? 'var(--green)' : 'var(--red)'};">${up ? '+' : ''}${fmtUSD(p.pnl)}</td>
        <td style="font-family:var(--mono);color:${up ? 'var(--green)' : 'var(--red)'};">${p.roi >= 0 ? '+' : ''}${p.roi.toFixed(1)}%</td>
        <td style="font-family:var(--mono);color:var(--red);">${p.sl ? fmtUSD(p.sl) : '—'}</td>
        <td style="font-family:var(--mono);color:var(--green);">${p.tp ? fmtUSD(p.tp) : '—'}</td>
        <td><button class="btn-demo-ctrl btn-sm" onclick="${closeFn}(${idx})">Close</button></td>
      </tr>`;
  }).join('');
}

export function renderPaperJournalTable() {
  const tbody = document.getElementById('demoJournalTableList');
  if (!tbody) return;

  if (!S.demoHistory.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-3);padding:20px;">No journal entries yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = S.demoHistory.slice().reverse().slice(0, 50).map(h => {
    const up = h.pnl >= 0;
    return `
      <tr>
        <td>#${h.id}</td>
        <td style="font-size:10px;color:var(--text-3);">${h.closeTime}</td>
        <td><b>${h.symbol}</b></td>
        <td><span class="bias-badge ${h.type === 'LONG' ? 'bullish' : 'bearish'}">${h.type}</span></td>
        <td style="font-family:var(--mono);">${h.size.toFixed(4)}</td>
        <td style="font-family:var(--mono);color:var(--gold);">${(h.rr || 0).toFixed(1)}</td>
        <td style="font-family:var(--mono);color:${up ? 'var(--green)' : 'var(--red)'};">${up ? '+' : ''}${fmtUSD(h.pnl)}</td>
        <td style="font-family:var(--mono);">${h.grade}</td>
        <td style="font-size:10px;">${h.source || 'manual'}${h.followedAi ? ' ✓AI' : ''}</td>
        <td style="font-size:10px;">${h.exitReason}</td>
        <td><button class="btn-demo-ctrl btn-sm" onclick="replayDemoTrade(${h.id})">▶ Replay</button></td>
      </tr>`;
  }).join('');
}

export function renderPostTradeReview(h) {
  const container = document.getElementById('demoTradeReviewContainer');
  if (!container || !h) return;

  const isWin = h.pnl >= 0;
  const reasons = (h.aiReasons || []).map(r => `<li>${r}</li>`).join('');

  container.innerHTML = `
    <div style="font-family:var(--font-title);font-size:14px;font-weight:700;margin-bottom:10px;display:flex;justify-content:space-between;">
      <span>Trade Review #${h.id} (${h.symbol}) — ${h.type}</span>
      <span class="term-val-highlight gold">Grade ${h.grade}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;font-size:11px;font-family:var(--mono);">
      <div>Entry: <b>${fmtUSD(h.entryPrice)}</b></div>
      <div>Exit: <b>${fmtUSD(h.exitPrice)}</b></div>
      <div>P&L: <b style="color:${isWin ? 'var(--green)' : 'var(--red)'};">${isWin ? '+' : ''}${fmtUSD(h.pnl)}</b></div>
      <div>R:R: <b style="color:var(--gold);">${(h.rr || 0).toFixed(1)}</b></div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;font-size:11px;line-height:1.5;">
      <div style="margin-bottom:6px;">${isWin ? '✅' : '❌'} <b>${isWin ? 'Win Analysis' : 'Loss Analysis'}</b>: ${h.userNotes}</div>
      <div style="color:var(--text-3);margin-bottom:6px;">🔬 ${h.aiReasoning} (Confidence: ${h.aiConfidence}%)</div>
      ${reasons ? `<ul style="margin:0;padding-left:16px;color:var(--text-2);">${reasons}</ul>` : ''}
      ${!isWin ? '<div style="margin-top:8px;color:var(--gold);">Recommendation: Wait for candle close confirmation before entry.</div>' : ''}
    </div>`;
}

export function renderTradingCalendar(onDayClick) {
  const grid = document.getElementById('demoCalendarGrid');
  if (!grid) return;

  grid.innerHTML = '';
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = new Date(year, month, 1).getDay();
  const dailyMap = getDailyPnlMap();

  for (let i = 0; i < startOffset; i++) {
    const c = document.createElement('div');
    c.className = 'calendar-day empty';
    grid.appendChild(c);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    cell.textContent = day;

    const dayPnl = dailyMap[dateKey];
    if (dayPnl !== undefined) {
      cell.classList.add(dayPnl > 0 ? 'green' : dayPnl < 0 ? 'red' : 'gray');
      cell.title = `${dayPnl >= 0 ? '+' : ''}${fmtUSD(dayPnl)}`;
    }

    cell.addEventListener('click', () => {
      const trades = S.demoHistory.filter(h => h.closeDate === dateKey);
      if (onDayClick) onDayClick(dateKey, trades, dayPnl);
    });
    grid.appendChild(cell);
  }
}

export function renderAchievements() {
  const achs = S.achievements || {};
  const map = [
    ['ach-100-wins', '100-wins'],
    ['ach-5-days', '5-days'],
    ['ach-10r-trade', '10r-trade'],
    ['ach-no-rule-breaks', 'no-rule-breaks'],
  ];
  map.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.className = `achievement-item ${achs[key] ? 'unlocked' : 'locked'}`;
  });
}

export function renderCoach(currentPrice) {
  const el = document.getElementById('demoCoachAdvice');
  if (!el) return;

  const pos = S.demoPositions[0];
  const advice = getCoachAdvice(pos, currentPrice);

  if (!pos) {
    el.innerHTML = `<div style="font-size:12px;line-height:1.6;color:var(--text-2);">${advice.body}</div>`;
    return;
  }

  el.innerHTML = `
    <div style="font-weight:700;color:var(--gold);margin-bottom:6px;">${advice.title}</div>
    <div style="font-size:12px;line-height:1.6;color:var(--text-2);margin-bottom:8px;">${advice.body}</div>
    <div style="font-size:11px;font-family:var(--mono);color:var(--text-3);">
      Unrealized: <b style="color:${advice.currentPnl >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtUSD(advice.currentPnl)}</b>
      · TP1 prob: <b style="color:var(--green);">${advice.tp1Prob}%</b>
      · TP2 prob: <b>${advice.tp2Prob}%</b>
    </div>`;
}

export function renderChallenge() {
  const { userReturn, aiReturn } = getChallengeReturns();
  const aiEl = document.getElementById('challengeAiPnl');
  const userEl = document.getElementById('challengeUserPnl');
  const advEl = document.getElementById('challengeAdvText');

  if (aiEl) aiEl.textContent = `${aiReturn >= 0 ? '+' : ''}${aiReturn.toFixed(1)}%`;
  if (userEl) {
    userEl.textContent = `${userReturn >= 0 ? '+' : ''}${userReturn.toFixed(1)}%`;
    userEl.style.color = userReturn >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (advEl) {
    if (userReturn >= aiReturn) {
      advEl.innerHTML = `🔥 You beat the AI by <b>${(userReturn - aiReturn).toFixed(1)}%</b>. Strong discipline on entries and stops.`;
    } else {
      advEl.innerHTML = `🤖 <b>AI ahead by ${(aiReturn - userReturn).toFixed(1)}%</b><br>
        ✓ Waited for structural retest<br>
        ✓ Used AI stop-loss levels<br>
        ✓ Higher average risk-to-reward`;
    }
  }
}

export function renderPerformancePanel() {
  const stats = getPerformanceStats();
  const map = {
    perfTotalTrades: stats.totalTrades,
    perfWinRate: `${stats.winRate.toFixed(0)}%`,
    perfAvgRR: stats.avgRR.toFixed(1),
    perfProfitFactor: stats.profitFactor.toFixed(2),
    perfExpectancy: fmtUSD(stats.expectancy),
    perfLargestWin: fmtUSD(stats.largestWin),
    perfLargestLoss: fmtUSD(stats.largestLoss),
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

export function renderPreTradeBanner() {
  const el = document.getElementById('demoPreTradeBanner');
  if (!el) return;
  const snap = S.aiSnapshot;
  if (!snap) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = `AI Bias: <b>${snap.bias}</b> · Confidence ${snap.score ?? '—'}% · Long ${snap.longProb}% / Short ${snap.shortProb}%`;
}

export function refreshBotUI() {
  const btnManual = document.getElementById('btnModeManual');
  const btnBot = document.getElementById('btnModeBot');
  const secManual = document.getElementById('sectionManualMode');
  const secBot = document.getElementById('sectionBotMode');
  
  if (btnManual && btnBot && secManual && secBot) {
    const isBot = !!S.botActive;
    btnManual.classList.toggle('active', !isBot);
    btnBot.classList.toggle('active', isBot);
    secManual.style.display = isBot ? 'none' : 'block';
    secBot.style.display = isBot ? 'block' : 'none';
  }

  const badge = document.getElementById('botStatusBadge');
  const toggleBtn = document.getElementById('btnToggleBotState');
  if (badge && toggleBtn) {
    const active = !!S.botActiveState;
    badge.textContent = active ? 'RUNNING' : 'OFFLINE';
    badge.className = `status-badge ${active ? 'active' : 'inactive'}`;
    toggleBtn.textContent = active ? 'STOP AUTOMATED BOT' : 'START AUTOMATED BOT';
    
    // Toggle color classes dynamically using direct styles
    if (active) {
      toggleBtn.style.setProperty('background', 'var(--red)', 'important');
      toggleBtn.style.setProperty('color', '#fff', 'important');
    } else {
      toggleBtn.style.setProperty('background', 'var(--gold)', 'important');
      toggleBtn.style.setProperty('color', '#010306', 'important');
    }
  }

  const select = document.getElementById('botStrategySelect');
  if (select && S.botStrategy) {
    select.value = S.botStrategy;
  }

  const logBox = document.getElementById('botLogBox');
  if (logBox && S.botLogs) {
    logBox.innerHTML = S.botLogs.map(log => `<div class="bot-log-entry">${log}</div>`).join('');
    logBox.scrollTop = logBox.scrollHeight;
  }
}

export function refreshPaperDashboard(currentPrice, opts = {}) {
  renderPaperAccountSummary(opts.prefix || '');
  renderPaperPositionsTable(currentPrice, opts);
  renderPaperJournalTable();
  renderTradingCalendar(opts.onDayClick);
  renderAchievements();
  renderCoach(currentPrice);
  renderChallenge();
  renderPerformancePanel();
  renderPreTradeBanner();
  refreshBotUI();
}

export function setupGlobalCloseHandler() {
  window.closeDemoPositionAtIndex = (idx) => {
    const price = window.__paperLastPrice || 0;
    const trade = closePaperPosition(idx, 'Manual Close', price || undefined);
    if (trade) renderPostTradeReview(trade);
    refreshPaperDashboard(price);
  };
  window.replayDemoTrade = (id) => {
    const h = S.demoHistory.find(t => t.id === id);
    if (h) renderPostTradeReview(h);
  };
}
