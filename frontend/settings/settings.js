import { S, COINS, saveState, var_text, var_text3, var_cyan, var_green, var_red, var_amber, var_purple } from './state.js';
import { D, CTX } from './dom.js';

// Global toast helper
export function toast(msg, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  D.toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, duration);
}

function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Number(v).toFixed(2);
}

function getInpVal(el, def) {
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

// ─────────────────────────────────────────────
//  RISK CALCULATOR
// ─────────────────────────────────────────────
export function initRiskCalculator() {
  D.btnCalcRisk.addEventListener('click', () => {
    const acct  = getInpVal(D.riskAccount, 10000);
    const rp    = getInpVal(D.riskPct, 1) / 100;
    const entry = getInpVal(D.riskEntry, S.candles.length ? S.candles[S.candles.length-1].c : 0);
    const stop  = getInpVal(D.riskStop, 0);
    const tp    = getInpVal(D.riskTP, 0);

    if (!stop || stop <= 0) { toast('Enter a stop-loss price', 'error'); return; }
    if (!entry || entry <= 0) { toast('Enter an entry price', 'error'); return; }

    const riskAmt     = acct * rp;
    const stopDist    = Math.abs(entry - stop);
    const stopPct     = (stopDist / entry) * 100;
    const positionSz  = riskAmt / stopDist;

    let rrRatio = '—', potentialGain = '—';
    if (tp > 0) {
      const reward = Math.abs(tp - entry);
      rrRatio = (reward / stopDist).toFixed(2) + ':1';
      potentialGain = fmtUSD(reward * positionSz);
    }
    const beWinRate = stopDist / (stopDist + (tp > 0 ? Math.abs(tp-entry) : stopDist));

    D.rcSize.textContent    = positionSz.toFixed(4) + ' units';
    D.rcRisk.textContent    = fmtUSD(riskAmt);
    D.rcStopPct.textContent = stopPct.toFixed(2) + '%';
    D.rcRR.textContent      = rrRatio;
    D.rcGain.textContent    = potentialGain;
    D.rcBE.textContent      = (beWinRate * 100).toFixed(1) + '%';

    D.rcRR.className  = 'risk-card-val ' + (parseFloat(rrRatio) >= 2 ? 'good' : parseFloat(rrRatio) >= 1 ? 'warn' : 'bad');
    D.riskResults.style.display = 'block';

    if (!D.riskEntry.value) D.riskEntry.value = S.candles.length ? S.candles[S.candles.length-1].c.toFixed(2) : '';
  });

  D.riskEntry.addEventListener('focus', () => {
    if (!D.riskEntry.value && S.candles.length)
      D.riskEntry.value = S.candles[S.candles.length-1].c.toFixed(2);
  });

  D.btnJournalExport.addEventListener('click', () => {
    const tradeJournal = S.demoHistory || [];
    if (!tradeJournal.length) { toast('No trade history to export', 'warn'); return; }
    const csv = ['Date,Symbol,Side,Entry,Exit,Size,Leverage,P/L,RR,Grade,Notes']
      .concat(tradeJournal.map(t => [
        t.closeDate || '',
        t.symbol || '',
        t.type || '',
        t.entryPrice || 0,
        t.exitPrice || 0,
        t.size || 0,
        t.leverage || 1,
        t.pnl || 0,
        t.rr || 0,
        t.grade || '',
        (t.userNotes || t.exitReason || '').replace(/,/g, ';')
      ].join(','))).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'ApexTrader_Journal.csv';
    a.click();
    toast('Journal exported', 'success');
  });
}

// ─────────────────────────────────────────────
//  FEAR & GREED GAUGE
// ─────────────────────────────────────────────
export function drawFngGauge() {
  const c = D.fngCanvas;
  if (!c) return;
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  c.width=120*dpr; c.height=70*dpr;
  const ctx = CTX.fng;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,120,70);
  const cx=60, cy=62, r=44;
  const gr = ctx.createLinearGradient(cx-r,0,cx+r,0);
  gr.addColorStop(0,   '#ef5350');
  gr.addColorStop(0.25,'#ff9800');
  gr.addColorStop(0.5, '#ffee58');
  gr.addColorStop(0.75,'#66bb6a');
  gr.addColorStop(1,   '#26a69a');
  ctx.strokeStyle=gr; ctx.lineWidth=8; ctx.lineCap='round';
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0,false); ctx.stroke();
  const val = S.fng.value;
  const ang = Math.PI + (val/100)*Math.PI;
  ctx.strokeStyle=var_text(); ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(cx,cy);
  ctx.lineTo(cx+Math.cos(ang)*(r-12), cy+Math.sin(ang)*(r-12)); ctx.stroke();
  ctx.fillStyle=var_text(); ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
}

// ─────────────────────────────────────────────
//  NEWS SENTIMENT & RENDER
// ─────────────────────────────────────────────
let _highImpactOnly = false;

function getSentiment(title, body) {
  const t = (title + ' ' + body).toLowerCase();
  const bulls = ['bullish','surge','rally','gain','breakout','ath','soar','jump','buying','adoption',
                 'approval','growth','pump','investment','positive','greenlight','upgrade','partnership'];
  const bears = ['bearish','crash','drop','dump','hack','ban','lawsuit','plummet','selloff','fud',
                 'fears','dip','plunge','liquidated','crackdown','fined','probe','theft','risk','negative'];
  const b = bulls.filter(w=>t.includes(w)).length;
  const br = bears.filter(w=>t.includes(w)).length;
  return b > br ? 'bullish' : br > b ? 'bearish' : 'neutral';
}

export function renderNews() {
  D.newsList.innerHTML = '';
  if (!S.newsArticles?.length) {
    D.newsList.innerHTML = '<div style="font-size:11px;color:var(--text-3)">No headlines.</div>';
    return;
  }
  const info = COINS[S.coin];
  const coinLC = info.sym.toLowerCase();
  const rx = new RegExp(`\\b${coinLC}\\b|${info.name.toLowerCase()}|btc|crypto|fed|sec|etf|inflation|fomc|regulation`, 'i');
  let articles = S.newsArticles.filter(a => rx.test(a.title + ' ' + (a.body||'')));
  if (_highImpactOnly) articles = articles.filter(a => (a.sentiment || getSentiment(a.title, a.body||'')) !== 'neutral');
  const list = articles.slice(0, 10);
  if (!list.length) {
    D.newsList.innerHTML = `<div style="font-size:11px;color:var(--text-3);text-align:center;padding:8px;">No relevant news.</div>`;
    return;
  }
  D.newsTitle.textContent = `📰 ${info.sym} News`;
  list.forEach(a => {
    const s = a.sentiment || getSentiment(a.title, a.body||'');
    const t = new Date(a.published_on * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const el = document.createElement('div');
    el.className = `news-item ${s}`;
    el.innerHTML = `<div class="news-meta"><span>${a.source_info?.name||a.source} · ${t}</span>
      <span class="news-tag ${s}">${s}</span></div>
      <a class="news-title" href="${a.url}" target="_blank" rel="noopener noreferrer">${a.title}</a>`;
    D.newsList.appendChild(el);
  });
}

export function initNewsFilter() {
  D.btnNewsFilter.addEventListener('click', () => {
    _highImpactOnly = !_highImpactOnly;
    D.btnNewsFilter.textContent = _highImpactOnly ? 'Impact' : 'All';
    D.btnNewsFilter.style.color = _highImpactOnly ? 'var(--cyan)' : '';
    renderNews();
  });
}

// ─────────────────────────────────────────────
//  ECONOMIC CALENDAR EVENTS
// ─────────────────────────────────────────────
const DEFAULT_EVENTS = [
  { id:1, title:'US Non-Farm Payrolls (NFP)', date:'2026-07-03', impact:'high', desc:'Jobs report — high volatility expected.' },
  { id:2, title:'US CPI Inflation Data',       date:'2026-07-10', impact:'high', desc:'Key inflation print — crypto vol spike likely.' },
  { id:3, title:'FOMC Rate Decision',           date:'2026-07-29', impact:'high', desc:'Fed rate guidance will move all risk assets.' },
  { id:4, title:'Bitcoin ETF Rebalancing',      date:'2026-07-15', impact:'med',  desc:'Monthly institutional ETF rebalancing window.' },
  { id:5, title:'Ethereum EIP Upgrade',         date:'2026-09-10', impact:'med',  desc:'Protocol upgrade — watch ETH/BTC ratio.' },
];

export function loadEvents() {
  try {
    const s = localStorage.getItem('apex_events');
    S.events = s ? JSON.parse(s) : [...DEFAULT_EVENTS];
  } catch(e) { S.events = [...DEFAULT_EVENTS]; }
  renderEvents();
}

function saveEvents() {
  localStorage.setItem('apex_events', JSON.stringify(S.events));
  renderEvents();
}

export function renderEvents() {
  D.eventList.innerHTML = '';
  if (!S.events.length) {
    D.eventList.innerHTML = '<div style="font-size:11px;color:var(--text-3)">No events.</div>'; return;
  }
  [...S.events].sort((a,b) => new Date(a.date)-new Date(b.date)).forEach(ev => {
    const el = document.createElement('div');
    el.className = `event-item ${ev.impact}`;
    const ds = new Date(ev.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    el.innerHTML = `<div class="event-meta"><span>${ds}</span>
      <span class="impact-badge ${ev.impact}">${ev.impact==='high'?'🔥':ev.impact==='med'?'⚡':'⚙'} ${ev.impact}</span></div>
      <div class="event-title" title="${ev.desc||''}">${ev.title}</div>
      <button class="ev-del" data-id="${ev.id}">✕</button>`;
    D.eventList.appendChild(el);
  });
}

export function initEvents() {
  D.eventList.addEventListener('click', e => {
    const btn = e.target.closest('.ev-del');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (!isNaN(id)) {
      S.events = S.events.filter(ev => ev.id !== id);
      saveEvents();
      toast('Event removed');
    }
  });

  // Attach legacy window method
  window.removeEvent = id => {
    S.events = S.events.filter(ev => ev.id !== id);
    saveEvents();
    toast('Event removed');
  };

  D.btnAddEvt.addEventListener('click', () => {
    const v = D.addEvtForm.style.display === 'flex';
    D.addEvtForm.style.display = v ? 'none' : 'flex';
    D.btnAddEvt.textContent = v ? '+ Add' : '✕';
  });

  D.btnSaveEvt.addEventListener('click', () => {
    const title = D.evtTitle.value.trim(), date = D.evtDate.value;
    if (!title || !date) { toast('Fill title and date', 'error'); return; }
    S.events.push({ id: Date.now(), title, date, impact: D.evtImpact.value, desc:'' });
    saveEvents(); D.evtTitle.value=''; D.evtDate.value='';
    D.addEvtForm.style.display='none'; D.btnAddEvt.textContent='+ Add';
    toast('Event saved', 'success');
  });
}
