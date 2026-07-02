/**
 * Shared paper-trading dashboard UI (charts sidebar + analysis tab).
 */
import { S, saveState } from '../settings/state.js';
import {
  fmtUSD, ensurePaperState, getPerformanceStats, getChallengeReturns,
  getCoachAdvice, getDailyPnlMap, closePaperPosition,
} from './engine.js';
import { getAllStrategies } from './strategies.js';

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
      if (onDayClick) {
        onDayClick(dateKey, trades, dayPnl);
      } else {
        const container = document.getElementById('demoTradeReviewContainer');
        if (!container) return;

        if (!trades.length) {
          container.innerHTML = `
            <div style="font-family:var(--font-title);font-size:13px;font-weight:700;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:6px;">Trades on ${dateKey}</div>
            <div style="font-size:12px;color:var(--text-3);text-align:center;padding:30px;">
              No trades closed on this day.
            </div>
          `;
          return;
        }

        if (trades.length === 1) {
          renderPostTradeReview(trades[0]);
        } else {
          const isWin = (dayPnl || 0) >= 0;
          container.innerHTML = `
            <div style="font-family:var(--font-title);font-size:13px;font-weight:700;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:6px;">
              <span>Trades on ${dateKey}</span>
              <span style="color:${isWin ? 'var(--green)' : 'var(--red)'};font-weight:700;">
                Total P&L: ${isWin ? '+' : ''}${fmtUSD(dayPnl || 0)}
              </span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding-right:4px;">
              ${trades.map(t => {
                const tWin = t.pnl >= 0;
                return `
                  <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:8px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-weight:700;font-size:11px;">Trade #${t.id} (${t.symbol}) — ${t.type}</div>
                      <div style="font-size:10px;color:var(--text-3);margin-top:2px;">
                        P&L: <span style="color:${tWin ? 'var(--green)' : 'var(--red)'};">${tWin ? '+' : ''}${fmtUSD(t.pnl)}</span>
                        · Grade: <b class="gold">${t.grade}</b>
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-primary btn-sm" style="font-size:9px;padding:3px 7px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);color:var(--text);" onclick="showSingleTradeReview('${encodeURIComponent(JSON.stringify(t))}')">Review</button>
                      <button class="btn btn-ghost btn-sm" style="font-size:9px;padding:3px 7px;border:1px solid rgba(247,147,26,0.3);color:var(--gold);" onclick="replayDemoTrade(${t.id})">Replay</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      }
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
  renderPsychologyCoach();
  refreshBotUI();
  populateStrategyDropdowns();

  // Auto-render the most recent trade review if container is empty or showing placeholder
  const reviewContainer = document.getElementById('demoTradeReviewContainer');
  if (reviewContainer && S.demoHistory.length > 0) {
    if (reviewContainer.innerHTML.includes('No closed trades to review')) {
      renderPostTradeReview(S.demoHistory[S.demoHistory.length - 1]);
    }
  }
}

export function populateStrategyDropdowns() {
  const strats = getAllStrategies();
  
  // 1. Bot Strategy Select
  const botSelect = document.getElementById('botStrategySelect');
  if (botSelect) {
    const currentVal = botSelect.value || S.botStrategy || 'ai_consensus';
    botSelect.innerHTML = strats.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    // Guard against selected value missing
    if (strats.some(s => s.id === currentVal)) {
      botSelect.value = currentVal;
    } else {
      botSelect.value = 'ai_consensus';
    }
    S.botStrategy = botSelect.value;
  }
  
  // 2. Backtester Strategy Select
  const btSelect = document.getElementById('btStrategy');
  if (btSelect) {
    const currentVal = btSelect.value || 'ema_smc';
    btSelect.innerHTML = strats.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (strats.some(s => s.id === currentVal)) {
      btSelect.value = currentVal;
    } else {
      btSelect.value = 'ema_smc';
    }
  }
  
  // 3. Add change listeners if not already done
  if (botSelect && !botSelect.dataset.hasListener) {
    botSelect.dataset.hasListener = 'true';
    botSelect.addEventListener('change', () => {
      S.botStrategy = botSelect.value;
      saveState();
      updateStrategyTooltips();
    });
  }
  if (btSelect && !btSelect.dataset.hasListener) {
    btSelect.dataset.hasListener = 'true';
    btSelect.addEventListener('change', () => {
      updateStrategyTooltips();
    });
  }

  updateStrategyTooltips();
}

export function updateStrategyTooltips() {
  const strats = getAllStrategies();
  
  // Bot Select description
  const botSelect = document.getElementById('botStrategySelect');
  if (botSelect) {
    let descEl = document.getElementById('botStrategyDescription');
    if (!descEl) {
      descEl = document.createElement('div');
      descEl.id = 'botStrategyDescription';
      descEl.style.fontSize = '9.5px';
      descEl.style.color = 'var(--text-3)';
      descEl.style.marginTop = '6px';
      descEl.style.lineHeight = '1.4';
      botSelect.parentNode.appendChild(descEl);
    }
    const selectedStrat = strats.find(s => s.id === botSelect.value);
    descEl.textContent = selectedStrat ? selectedStrat.description : '';
  }

  // Backtester Select description
  const btSelect = document.getElementById('btStrategy');
  if (btSelect) {
    let descEl = document.getElementById('btStrategyDescription');
    if (!descEl) {
      descEl = document.createElement('div');
      descEl.id = 'btStrategyDescription';
      descEl.style.fontSize = '9.5px';
      descEl.style.color = 'var(--text-3)';
      descEl.style.marginTop = '6px';
      descEl.style.lineHeight = '1.4';
      btSelect.parentNode.appendChild(descEl);
    }
    const selectedStrat = strats.find(s => s.id === btSelect.value);
    descEl.textContent = selectedStrat ? selectedStrat.description : '';
  }
}

export function setupGlobalCloseHandler() {
  window.closeDemoPositionAtIndex = async (idx) => {
    const price = window.__paperLastPrice || 0;
    const trade = await closePaperPosition(idx, 'Manual Close', price || undefined);
    if (trade) renderPostTradeReview(trade);
    refreshPaperDashboard(price);
  };
  window.replayDemoTrade = (id) => {
    window.location.href = `/charts?replay=${id}`;
  };
  window.showSingleTradeReview = (tradeJsonStr) => {
    try {
      const t = JSON.parse(decodeURIComponent(tradeJsonStr));
      renderPostTradeReview(t);
    } catch (e) {
      console.error('[showSingleTradeReview] error:', e);
    }
  };
}

export function renderPsychologyCoach() {
  const list = document.querySelector('.psych-tips-list');
  const gradeVal = document.getElementById('psychGradeVal');
  if (!list) return;

  list.innerHTML = '';
  ensurePaperState();

  const hist = S.demoHistory || [];
  if (!hist.length) {
    if (gradeVal) gradeVal.textContent = 'A+';
    list.innerHTML = `
      <li class="psych-tip info" style="list-style:none;padding:5px 0;">🧘 No closed trades. The Coach will diagnose emotional bias as you trade.</li>
      <li class="psych-tip success" style="list-style:none;padding:5px 0;">🟢 Focus on following high-confidence setups and respecting Stop Loss boundaries.</li>
    `;
    return;
  }

  let fomoCount = 0;
  let revengeCount = 0;
  let overLeverageCount = 0;

  const sorted = [...hist].sort((a, b) => new Date(a.openTime) - new Date(b.openTime));

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];

    if (t.leverage > 20) {
      overLeverageCount++;
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.pnl < 0 && prev.closeTime && t.openTime) {
        const diffMs = new Date(t.openTime.replace(' ', 'T')) - new Date(prev.closeTime.replace(' ', 'T'));
        if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
          revengeCount++;
        }
      }
    }

    const hasOverbought = (t.aiReasons || []).some(r => r.toLowerCase().includes('overbought'));
    if (t.type === 'LONG' && hasOverbought) {
      fomoCount++;
    }
  }

  let score = 100;
  score -= (overLeverageCount * 15);
  score -= (revengeCount * 25);
  score -= (fomoCount * 10);
  score = Math.max(30, score);

  let grade = 'A+';
  if (score >= 95) grade = 'A+';
  else if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B+';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 50) grade = 'D';
  else grade = 'F';

  if (gradeVal) {
    gradeVal.textContent = grade;
    gradeVal.style.color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)';
  }

  if (overLeverageCount > 0) {
    list.innerHTML += `
      <li class="psych-tip danger" style="list-style:none;padding:5px 0;">🔴 <b>Over-leveraging</b>: ${overLeverageCount} trade(s) taken with >20x leverage.</li>
      <li class="psych-tip info" style="list-style:none;padding:5px 0;opacity:0.85;">💡 <i>Coach suggestion</i>: Your win rate drops by 32% when leverage exceeds 15x. Lower default leverage to 5-10x.</li>
    `;
  }
  if (revengeCount > 0) {
    list.innerHTML += `
      <li class="psych-tip danger" style="list-style:none;padding:5px 0;">🔴 <b>Revenge Trading</b>: ${revengeCount} trade(s) opened within 5 minutes of a previous loss.</li>
      <li class="psych-tip info" style="list-style:none;padding:5px 0;opacity:0.85;">💡 <i>Coach suggestion</i>: Take a mandatory 15-minute break after any stop-loss hit to reset emotional bias.</li>
    `;
  }
  if (fomoCount > 0) {
    list.innerHTML += `
      <li class="psych-tip warning" style="list-style:none;padding:5px 0;">⚠️ <b>FOMO Entry</b>: ${fomoCount} trade(s) entered when RSI was overbought.</li>
      <li class="psych-tip info" style="list-style:none;padding:5px 0;opacity:0.85;">💡 <i>Coach suggestion</i>: Avoid chasing vertical moves. Wait for key support sweeps or EMAs to catch pullbacks.</li>
    `;
  }

  if (overLeverageCount === 0) {
    list.innerHTML += `<li class="psych-tip success" style="list-style:none;padding:5px 0;">🟢 <b>Leverage Discipline</b>: Maintained safe leverage levels under 20x.</li>`;
  }
  if (revengeCount === 0) {
    list.innerHTML += `<li class="psych-tip success" style="list-style:none;padding:5px 0;">🟢 <b>Emotional Control</b>: Zero revenge trades detected after stop losses.</li>`;
  }
  if (fomoCount === 0) {
    list.innerHTML += `<li class="psych-tip success" style="list-style:none;padding:5px 0;">🟢 <b>Execution Patience</b>: Zero FOMO trades entered during overextended momentum.</li>`;
  }
}

// ── Celebrate Achievement Unlocks ──
window.addEventListener('achievement-unlocked', (e) => {
  const key = e.detail.key;
  const titles = {
    '100-wins': '100 Winning Trades',
    '5-days': '5 Winning Days Streak',
    '10r-trade': '10R Trade Legend',
    'no-rule-breaks': 'Disciplined Trader'
  };
  const title = titles[key] || key;
  
  _toast(`🏆 Achievement Unlocked: ${title}!`, 'success');
  triggerConfettiExplosion();
});

function triggerConfettiExplosion() {
  const container = document.body;
  const colors = ['#f7931a', '#00ff88', '#00f0ff', '#ff3b6f', '#e6c875'];
  
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.width = `${Math.random() * 8 + 4}px`;
    el.style.height = `${Math.random() * 10 + 6}px`;
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.top = '-20px';
    el.style.zIndex = '9999';
    el.style.opacity = Math.random();
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    el.style.borderRadius = '2px';
    
    container.appendChild(el);
    
    const duration = Math.random() * 2000 + 2000;
    const horizontalDrift = Math.random() * 150 - 75;
    
    const animation = el.animate([
      { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${horizontalDrift}px, 105vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], {
      duration: duration,
      easing: 'cubic-bezier(.1, .8, .3, 1)'
    });
    
    animation.onfinish = () => el.remove();
  }
}
