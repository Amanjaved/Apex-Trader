import { S, COINS, TF_MAP, saveState, loadState, var_red, var_green, var_text } from './settings/state.js';
import { D } from './settings/dom.js';
import { getEMA, getRSI, getATR, getVWAP, IC, getCloses, registerSrUpdateCallback } from './indicators/indicators.js';
import { drawMainChart, drawVolChart, drawRsiChart, drawMacdChart, drawStochChart, drawObvChart, drawMinimap, initChartInteractions, registerRenderQueuer } from './chart/chart_engine.js';
import { drawDepthChart } from './orderflow/orderflow.js';
import { updateAI } from './ai/ai.js';
import { initWatchlist, registerWatchlistInitDataCallback } from './watchlist/watchlist.js';
import { initAlerts, renderAlertList } from './alerts/alerts.js';
import { initRiskCalculator, initEvents, loadEvents, initNewsFilter, renderNews, drawFngGauge, toast } from './settings/settings.js';
import { initData, connectWS, fetchCoinsList, fetchFearGreed, fetchNews, fetchSrCandles, registerApiRenderQueuer, updateWSSubscriptions, setStatus } from './settings/api.js';
import {
  initPaperEngine, tickPaperPositions, openPaperPosition, closeAllPositions,
  closeHalfPosition, moveSlToBreakeven, trailStop, reversePosition, resetPaperAccount,
  ensurePaperState, syncDemoData
} from './paper/engine.js';
import { renderPaperAccountSummary, renderPreTradeBanner, setupGlobalCloseHandler } from './paper/ui.js';

// Render loop queueing flag
let renderQueued = false;

function queueRender() {
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }
}

function render() {
  if (!S.candles.length) return;
  updateStats();
  tickPaperPositions(getLivePrice(), S.coin);
  window.__paperLastPrice = getLivePrice();
  renderPaperAccountSummary('sb');
  renderPreTradeBanner();
  drawMainChart();
  if (S.showDepth)   drawDepthChart();
  if (S.subs.vol)    drawVolChart();
  if (S.subs.rsi)    drawRsiChart();
  if (S.subs.macd)   drawMacdChart();
  if (S.subs.stoch)  drawStochChart();
  if (S.subs.obv)    drawObvChart();
  drawMinimap();
}

function getInpVal(el, def) {
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

function clamp(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }

function getLivePrice() {
  const n = S.candles.length;
  return n ? S.candles[n - 1].c : 0;
}

function getPaperOrderOpts() {
  return {
    price: getLivePrice(),
    symbol: S.coin,
    capital: parseFloat(document.getElementById('riskAccount')?.value) || S.demoAccount?.balance || 10000,
    riskPct: parseFloat(document.getElementById('riskPct')?.value) || 1,
    leverage: parseInt(document.getElementById('riskLeverage')?.value, 10) || 10,
    sl: parseFloat(document.getElementById('riskStop')?.value) || 0,
    tp: parseFloat(document.getElementById('riskTP')?.value) || 0,
    useAi: true,
    strategyId: S.botStrategy || 'ai_consensus',
  };
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

function updateStats() {
  const n = S.candles.length;
  if (!n) return;
  const idx = S.hoverIdx >= 0
    ? clamp(S.viewStart + S.hoverIdx, 0, n - 1)
    : n - 1;

  let c;
  if (S.mode === 'heikin') {
    const ha = toHeikin(S.candles); // heikin function inside indicators
    c = ha[idx];
  } else {
    c = S.candles[idx];
  }
  if (!c) return;

  const closes = getCloses();
  const emaF   = getEMA(closes, getInpVal(D.inpEmaFast,  20));
  const emaS   = getEMA(closes, getInpVal(D.inpEmaSlow,  50));
  const rsi    = getRSI(closes, getInpVal(D.inpRsiPeriod, 14));
  const atr    = getATR(S.candles, 14);
  const vwap   = getVWAP(S.candles);

  D.sOpen.textContent  = fmtUSD(c.o);
  D.sHigh.textContent  = fmtUSD(c.h);
  D.sLow.textContent   = fmtUSD(c.l);
  D.sClose.textContent = fmtUSD(c.c);
  D.sVol.textContent   = fmtVol(c.v);
  D.sEmaF.textContent  = emaF[idx]  ? fmtUSD(emaF[idx])  : '—';
  D.sEmaS.textContent  = emaS[idx]  ? fmtUSD(emaS[idx])  : '—';
  D.sRsi.textContent   = rsi[idx]   ? rsi[idx].toFixed(1) : '—';
  D.sAtr.textContent   = atr[idx]   ? fmtUSD(atr[idx])   : '—';
  D.sVwap.textContent  = vwap[idx]  ? fmtUSD(vwap[idx])  : '—';
  D.sCount.textContent = n;

  const rv = rsi[idx];
  D.sRsi.style.color = rv > 70 ? var_red() : rv < 30 ? var_green() : var_text();
}

function toHeikin(src) {
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
}

// ─────────────────────────────────────────────
//  DROPDOWNS MANAGEMENT
// ─────────────────────────────────────────────
function closeAllDDs() {
  document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.dd-trigger.open').forEach(t => t.classList.remove('open'));
}

function toggleDD(trigger, menu, e) {
  e.stopPropagation();
  const wasOpen = menu.classList.contains('open');
  closeAllDDs();
  D.coinDropdown.classList.remove('open');
  D.symBtn.classList.remove('open');
  D.symChev.textContent = '▼';
  if (!wasOpen) { menu.classList.add('open'); trigger.classList.add('open'); }
}

// ── Overlays Badge ──
function updateOverlayBadge() {
  const cnt = Object.values(S.overlays).filter(Boolean).length;
  D.overlayBadge.textContent = cnt;
}

// ─────────────────────────────────────────────
//  STATE APPLIER TO DOM
// ─────────────────────────────────────────────
function applyState() {
  D.body.setAttribute('data-theme', S.theme);
  D.btnTheme.textContent = S.theme === 'dark' ? '🌙' : '☀';

  const ci = COINS[S.coin];
  D.symIcon.textContent = ci.icon;
  D.symName.textContent = `${ci.sym}/USDT`;

  document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('on', b.dataset.tf === S.tf));

  const lbls = {candle:'Candle',heikin:'Heikin Ashi',line:'Line',area:'Area',bar:'OHLC Bars'};
  D.typeLabel.textContent = lbls[S.mode] || 'Candle';
  D.typeMenu.querySelectorAll('.dd-item[data-mode]').forEach(i => i.classList.toggle('on', i.dataset.mode === S.mode));

  D.overlayMenu.querySelectorAll('.dd-item[data-ov]').forEach(i => {
    i.classList.toggle('on', !!S.overlays[i.dataset.ov]);
  });
  updateOverlayBadge();

  D.indMenu.querySelectorAll('.dd-item[data-sub]').forEach(i => {
    const on = !!S.subs[i.dataset.sub];
    i.classList.toggle('on', on);
    const p = document.getElementById(`${i.dataset.sub}Pane`);
    if (p) p.classList.toggle('hidden', !on);
  });
  const sCnt = Object.values(S.subs).filter(Boolean).length;
  D.indBadge.textContent = sCnt;

  D.btnDepth.classList.toggle('on', S.showDepth);
  D.depthDrawer.classList.toggle('open', S.showDepth);
  D.btnSidebar.classList.toggle('on', S.sidebarOpen);
  D.sidebar.classList.toggle('hidden', !S.sidebarOpen);
  if (D.sidebarBackdrop) D.sidebarBackdrop.classList.toggle('open', S.sidebarOpen);

  D.chkSR.checked = !!S.overlays.smartSR;
  D.selSrTf.value = S.srTf;

  D.inpBullColor.value = S.bullColor;
  D.inpBearColor.value = S.bearColor;
}

// ─────────────────────────────────────────────
//  INITIALIZE SYSTEM EVENT LISTENERS
// ─────────────────────────────────────────────
function initListeners() {
  document.addEventListener('click', e => {
    if (!e.target.closest('.dd-wrap') && !e.target.closest('.sym-btn') && !e.target.closest('.coin-dropdown')) {
      closeAllDDs();
      D.coinDropdown.classList.remove('open');
      D.symBtn.classList.remove('open');
      D.symChev.textContent = '▼';
      D.ctxMenu.style.display = 'none';
    }
  });

  // Chart Type
  D.typeTrigger.addEventListener('click', e => toggleDD(D.typeTrigger, D.typeMenu, e));
  D.typeMenu.addEventListener('click', e => {
    const item = e.target.closest('.dd-item[data-mode]');
    if (!item) return;
    S.mode = item.dataset.mode;
    const labels = { candle:'Candle', heikin:'Heikin Ashi', line:'Line', area:'Area', bar:'OHLC Bars' };
    D.typeLabel.textContent = labels[S.mode];
    D.typeMenu.querySelectorAll('.dd-item[data-mode]').forEach(i => i.classList.toggle('on', i.dataset.mode === S.mode));
    closeAllDDs(); saveState(); queueRender();
  });

  // Overlays
  D.overlayTrigger.addEventListener('click', e => toggleDD(D.overlayTrigger, D.overlayMenu, e));
  D.overlayMenu.addEventListener('click', e => {
    const item = e.target.closest('.dd-item[data-ov]');
    if (!item) return;
    const ov = item.dataset.ov;
    S.overlays[ov] = !S.overlays[ov];
    item.classList.toggle('on', S.overlays[ov]);
    updateOverlayBadge();
    if (ov === 'smartSR') fetchSrCandles();
    saveState(); queueRender();
  });

  // Indicators Sub-charts
  D.indTrigger.addEventListener('click', e => toggleDD(D.indTrigger, D.indMenu, e));
  D.indMenu.addEventListener('click', e => {
    const item = e.target.closest('.dd-item[data-sub]');
    if (!item) return;
    const sub = item.dataset.sub;
    S.subs[sub] = !S.subs[sub];
    item.classList.toggle('on', S.subs[sub]);
    const pane = document.getElementById(`${sub}Pane`);
    if (pane) pane.classList.toggle('hidden', !S.subs[sub]);
    const cnt = Object.values(S.subs).filter(Boolean).length;
    D.indBadge.textContent = cnt;
    saveState(); queueRender();
  });

  // Timeframes
  D.tfGroup.addEventListener('click', e => {
    const btn = e.target.closest('.tf-btn');
    if (!btn) return;
    S.tf = btn.dataset.tf;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('on', b.dataset.tf === S.tf));
    saveState(); initData();
  });

  // Sidebar tabs
  document.querySelectorAll('.sb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('on'));
      document.querySelectorAll('.sb-page').forEach(p => p.classList.remove('on'));
      tab.classList.add('on');
      const pg = document.getElementById('page-' + tab.dataset.page);
      if (pg) pg.classList.add('on');
    });
  });

  // Top Bar Actions
  D.btnDepth.addEventListener('click', () => {
    S.showDepth = !S.showDepth;
    D.btnDepth.classList.toggle('on', S.showDepth);
    D.depthDrawer.classList.toggle('open', S.showDepth);
    updateWSSubscriptions();
    if (S.showDepth) fetchOrderBook();
    saveState();
  });

  D.btnTheme.addEventListener('click', () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    D.body.setAttribute('data-theme', S.theme);
    D.btnTheme.textContent = S.theme === 'dark' ? '🌙' : '☀';
    saveState(); queueRender();
    toast(`Theme: ${S.theme}`, 'info', 2000);
  });

  D.btnSnap.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `ApexTrader_${S.coin}_${TF_MAP[S.tf]}_${Date.now()}.png`;
    a.href = D.mainCanvas.toDataURL('image/png');
    a.click();
    toast('Screenshot saved', 'success');
  });

  D.btnFull.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen();
  });

  D.btnSidebar.addEventListener('click', () => {
    S.sidebarOpen = !S.sidebarOpen;
    D.sidebar.classList.toggle('hidden', !S.sidebarOpen);
    D.btnSidebar.classList.toggle('on', S.sidebarOpen);
    if (D.sidebarBackdrop) D.sidebarBackdrop.classList.toggle('open', S.sidebarOpen);
    saveState();
    setTimeout(queueRender, 280);
  });

  const closeSidebar = () => {
    S.sidebarOpen = false;
    D.sidebar.classList.add('hidden');
    D.btnSidebar.classList.remove('on');
    if (D.sidebarBackdrop) D.sidebarBackdrop.classList.remove('open');
    saveState();
    setTimeout(queueRender, 280);
  };

  if (D.btnSidebarClose) D.btnSidebarClose.addEventListener('click', closeSidebar);
  if (D.sidebarBackdrop) D.sidebarBackdrop.addEventListener('click', closeSidebar);

  // Drawing tools selection
  const DRAW_INSTRS = {
    none:      'Click or drag on chart to pan.',
    crosshair: 'Precision crosshair mode.',
    trendline: 'Click + drag to draw a trend line.',
    hline:     'Click to drop a horizontal level.',
    vline:     'Click to drop a vertical marker.',
    rect:      'Click + drag to draw a rectangle box.',
    channel:   'Click + drag to draw a parallel channel.',
    fib:       'Drag from swing high to swing low.',
    fibext:    'Drag to set Fibonacci extension levels.',
  };

  function setDrawTool(tool) {
    S.drawTool = tool;
    document.querySelectorAll('.lbar-btn[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    document.querySelectorAll('.tp-btn[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    if (D.drawInstr) D.drawInstr.textContent = DRAW_INSTRS[tool] || '';
    D.mainCanvas.style.cursor = 'crosshair';
  }

  D.leftBar.addEventListener('click', e => {
    const btn = e.target.closest('.lbar-btn[data-tool]');
    if (!btn) return;
    setDrawTool(btn.dataset.tool);
  });

  D.toolPalette.addEventListener('click', e => {
    const btn = e.target.closest('.tp-btn[data-tool]');
    if (!btn) return;
    setDrawTool(btn.dataset.tool);
  });

  const clearDrawings = () => {
    S.drawings = []; S.currentDrawing = null; saveState(); queueRender();
    toast('Drawings cleared');
  };
  D.btnClearDrawings.addEventListener('click', clearDrawings);
  D.btnClearDrawingsSB.addEventListener('click', clearDrawings);

  // Smart S/R toggles
  D.chkSR.addEventListener('change', e => {
    S.overlays.smartSR = e.target.checked;
    D.overlayMenu.querySelector('[data-ov="smartSR"]')?.classList.toggle('on', S.overlays.smartSR);
    updateOverlayBadge();
    if (S.overlays.smartSR) fetchSrCandles();
    saveState(); queueRender();
  });

  D.selSrTf.addEventListener('change', e => {
    S.srTf = e.target.value;
    saveState();
    if (S.overlays.smartSR) fetchSrCandles();
  });

  // Market structure toggles
  document.querySelectorAll('.ms-toggle[data-ms]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.ms;
      S.msFlags[key] = !S.msFlags[key];
      el.classList.toggle('on', S.msFlags[key]);
      queueRender();
    });
  });

  // Indicator Settings Inputs
  document.querySelectorAll('.sb-section input[type=number]').forEach(inp => {
    inp.addEventListener('change', () => { IC.clear(); updateAI(); saveState(); queueRender(); });
  });

  D.inpBullColor.addEventListener('change', () => { S.bullColor = D.inpBullColor.value; queueRender(); });
  D.inpBearColor.addEventListener('change', () => { S.bearColor = D.inpBearColor.value; queueRender(); });

  // CSV Export for candle data
  if (D.btnExportCSV) {
    D.btnExportCSV.addEventListener('click', () => {
      if (!S.candles || !S.candles.length) {
        toast('No candle data to export', 'warn');
        return;
      }
      const csv = ['Timestamp,Open,High,Low,Close,Volume']
        .concat(S.candles.map(c => [
          new Date(c.t).toISOString(),
          c.o,
          c.h,
          c.l,
          c.c,
          c.v
        ].join(','))).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = `ApexTrader_${S.coin}_${TF_MAP[S.tf]}_${Date.now()}.csv`;
      a.click();
      toast('Candle data exported', 'success');
    });
  }

  // Keyboards
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const TF_KEYS = {'1':1,'2':3,'3':5,'4':15,'5':30,'6':60,'7':240,'8':1440,'9':10080};
    if (TF_KEYS[e.key]) {
      S.tf = String(TF_KEYS[e.key]);
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('on', b.dataset.tf===S.tf));
      saveState(); initData(); return;
    }
    switch(e.key.toLowerCase()) {
      case 'c': {
        const modes = ['candle','heikin','line','area','bar'];
        S.mode = modes[(modes.indexOf(S.mode)+1)%modes.length];
        const lbls = {candle:'Candle',heikin:'Heikin Ashi',line:'Line',area:'Area',bar:'OHLC Bars'};
        D.typeLabel.textContent = lbls[S.mode];
        saveState(); queueRender(); break;
      }
      case 'o': D.btnDepth.click(); break;
      case 't': D.btnTheme.click(); break;
      case 'f': D.btnFull.click(); break;
      case 'escape':
        S.viewStart = Math.max(0, S.candles.length-160);
        S.viewEnd   = S.candles.length;
        queueRender(); break;
      case '?':
        alert(`ApexTrader Pro — Keyboard Shortcuts\n\n1–9  : Timeframes (1m to 1W)\nC    : Cycle chart types\nO    : Toggle order book\nT    : Toggle theme\nF    : Fullscreen\nEsc  : Reset zoom\n?    : This help`);
        break;
    }
  });

  // Windows resize
  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(queueRender, 80);
  });

  // Pane Resize drag (Mouse & Touch support)
  document.querySelectorAll('.pane-resize').forEach(handle => {
    const pane = document.getElementById(handle.dataset.pane);
    if (!pane) return;

    // Mouse resize drag
    handle.addEventListener('mousedown', e => {
      const startY = e.clientY, startH = pane.offsetHeight;
      const onMove = mv => {
        const h = clamp(startH + (mv.clientY - startY), 60, 300);
        pane.style.height = h + 'px';
        queueRender();
      };
      const onUp = () => { window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Touch resize drag
    handle.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const startY = e.touches[0].clientY, startH = pane.offsetHeight;
      const onTouchMove = mv => {
        if (mv.touches.length !== 1) return;
        const h = clamp(startH + (mv.touches[0].clientY - startY), 60, 300);
        pane.style.height = h + 'px';
        queueRender();
      };
      const onTouchEnd = () => {
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd, { passive: true });
    }, { passive: true });
  });
}



// ─────────────────────────────────────────────
//  BOOT STRAP
// ─────────────────────────────────────────────
(async function boot() {
  if (Notification.permission === 'default') Notification.requestPermission();

  loadState();
  applyState();
  loadEvents();
  renderAlertList();

  // Expose global state and rendering for external scripting/testing
  window.S = S;
  window.saveState = saveState;
  window.queueRender = queueRender;
  window.toast = toast;
  window.renderAlertList = renderAlertList;

  // Initialize modular handlers
  initListeners();
  initWatchlist();
  initAlerts();
  initEvents();
  initNewsFilter();
  initChartInteractions();
  initRiskCalculator();
  initPaperTradingSidebar();

  // Register coordination hooks
  registerWatchlistInitDataCallback(initData);
  registerRenderQueuer(queueRender, initData);
  registerApiRenderQueuer(queueRender);
  registerSrUpdateCallback(queueRender);



  fetchCoinsList();
  fetchFearGreed();
  fetchNews();

  await initData();

  // Check for Replay Mode parameter
  const urlParams = new URLSearchParams(window.location.search);
  const replayId = urlParams.get('replay');
  if (replayId) {
    await initReplayMode(parseInt(replayId, 10));
  }

  // Register interval loops
  setInterval(fetchFearGreed,  5 * 60 * 1000);  // 5min
  setInterval(fetchNews,       1 * 60 * 1000);  // 1min
  setInterval(fetchCoinsList,  10 * 1000);       // 10s
  setInterval(() => {
    if (S.overlays.smartSR) fetchSrCandles();
  }, 60 * 1000);  // 1min

  console.log('%cApexTrader Pro — Modular Boot Complete', 'color:#00d4ff;font-size:14px;font-weight:bold');
})();

// ─────────────────────────────────────────────
//  PAPER TRADING (charts sidebar)
// ─────────────────────────────────────────────
function initPaperTradingSidebar() {
  ensurePaperState();
  setupGlobalCloseHandler();

  initPaperEngine({
    toast,
    onChange: () => {
      queueRender();
      renderPaperAccountSummary('sb');
      renderPreTradeBanner();
    },
  });

  // Listen to backend push notifications for trade updates
  window.addEventListener('demo-trade-update', () => {
    syncDemoData().then(() => {
      queueRender();
      renderPaperAccountSummary('sb');
      renderPreTradeBanner();
    });
  });

  // Call initial backend sync
  syncDemoData().then(() => {
    renderPaperAccountSummary('sb');
    renderPreTradeBanner();
  });

  const btnBuy = document.getElementById('btnSbBuy');
  const btnSell = document.getElementById('btnSbSell');
  if (!btnBuy || !btnSell) return;

  btnBuy.addEventListener('click', async () => {
    btnBuy.disabled = true;
    try {
      await openPaperPosition('LONG', getPaperOrderOpts());
    } finally {
      btnBuy.disabled = false;
    }
  });

  btnSell.addEventListener('click', async () => {
    btnSell.disabled = true;
    try {
      await openPaperPosition('SHORT', getPaperOrderOpts());
    } finally {
      btnSell.disabled = false;
    }
  });

  document.getElementById('btnSbCloseHalf')?.addEventListener('click', async () => {
    await closeHalfPosition();
  });
  document.getElementById('btnSbCloseAll')?.addEventListener('click', async () => {
    await closeAllPositions(getLivePrice());
  });
  document.getElementById('btnSbMoveSL')?.addEventListener('click', async () => {
    await moveSlToBreakeven();
  });
  document.getElementById('btnSbTrail')?.addEventListener('click', async () => {
    await trailStop(getLivePrice());
  });
  document.getElementById('btnSbReverse')?.addEventListener('click', async () => {
    await reversePosition(getLivePrice(), getPaperOrderOpts());
  });
  document.getElementById('btnSbReset')?.addEventListener('click', async () => {
    await resetPaperAccount();
  });

  const lev = document.getElementById('riskLeverage');
  const levVal = document.getElementById('riskLevVal');
  if (lev && levVal) {
    lev.addEventListener('input', () => { levVal.textContent = `${lev.value}x`; });
  }

  renderPaperAccountSummary('sb');
  renderPreTradeBanner();
}

async function initReplayMode(replayId) {
  try {
    const res = await fetch(`/demo/trades/${replayId}`);
    if (!res.ok) {
      toast(`Failed to load replay for trade #${replayId}`, 'error');
      return;
    }
    const trade = await res.json();

    const h = {
      id: trade.id,
      symbol: trade.symbol,
      type: trade.side === 'BUY' ? 'LONG' : 'SHORT',
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      sl: trade.sl,
      tp: trade.tp,
      pnl: trade.pnl,
      fees: trade.fees,
      openTime: trade.entry_time,
      closeTime: trade.exit_time,
      grade: trade.ai_reasoning_snapshot?.grade || (trade.pnl >= 0 ? 'B' : 'D'),
      summary: trade.ai_reasoning_snapshot?.summary || trade.user_notes || 'Manual Close',
      aiNotes: trade.ai_reasoning_snapshot?.ai_notes || 'Standard Trade',
      recommendation: trade.ai_reasoning_snapshot?.recommendation || 'Respect invalidation levels.',
      tags: trade.ai_reasoning_snapshot?.tags || []
    };

    const entryIdx = findClosestCandleIndex(h.openTime);
    const exitIdx = findClosestCandleIndex(h.closeTime);

    if (entryIdx !== -1) {
      const midpoint = exitIdx !== -1 ? Math.round((entryIdx + exitIdx) / 2) : entryIdx;
      const w = S.viewEnd - S.viewStart || 160;
      S.viewStart = Math.max(0, midpoint - Math.round(w / 2));
      S.viewEnd = Math.min(S.candles.length, S.viewStart + w);
    }

    S.replayTrade = h;

    const overlay = document.getElementById('replayOverlayCard');
    const content = document.getElementById('replayContent');
    if (overlay && content) {
      const isWin = h.pnl >= 0;
      const tagsHtml = h.tags.map(t => `<span style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:3px;padding:2px 5px;font-size:8.5px;color:var(--text-2);">${t}</span>`).join(' ');

      content.innerHTML = `
        <div style="font-weight:700;font-size:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <span>Trade #${h.id} (${h.symbol})</span>
          <span style="background:var(--gold);color:#000;font-weight:900;padding:2px 6px;border-radius:4px;font-size:10px;">GRADE ${h.grade}</span>
        </div>
        <div class="replay-metric-grid">
          <div class="replay-metric">
            <span class="replay-metric-lbl">Side</span>
            <span class="replay-metric-val" style="color:${h.type === 'LONG' ? 'var(--green)' : 'var(--red)'};">${h.type}</span>
          </div>
          <div class="replay-metric">
            <span class="replay-metric-lbl">P&L</span>
            <span class="replay-metric-val" style="color:${isWin ? 'var(--green)' : 'var(--red)'};">${isWin ? '+' : ''}${fmtUSD(h.pnl)}</span>
          </div>
          <div class="replay-metric">
            <span class="replay-metric-lbl">Entry</span>
            <span class="replay-metric-val">${fmtUSD(h.entryPrice)}</span>
          </div>
          <div class="replay-metric">
            <span class="replay-metric-lbl">Exit</span>
            <span class="replay-metric-val">${fmtUSD(h.exitPrice)}</span>
          </div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;margin-bottom:8px;">
          <div style="font-weight:700;margin-bottom:3px;color:var(--text-2);">${isWin ? '✅ Win Analysis' : '❌ Loss Analysis'}</div>
          <div style="color:var(--text-2);margin-bottom:6px;line-height:1.4;">${h.summary}</div>
          <div style="color:var(--text-3);line-height:1.4;margin-bottom:6px;">🔬 ${h.aiNotes}</div>
          ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${tagsHtml}</div>` : ''}
        </div>
        <div style="border-top:1px dashed rgba(255,255,255,0.05);padding-top:8px;margin-top:8px;">
          <div style="font-weight:700;margin-bottom:3px;color:var(--gold);">💡 AI Coach Advice</div>
          <div style="color:var(--text-3);font-style:italic;line-height:1.4;">${h.recommendation}</div>
        </div>
      `;
      overlay.style.display = 'flex';

      document.getElementById('btnExitReplay').onclick = () => {
        S.replayTrade = null;
        overlay.style.display = 'none';
        queueRender();
        toast('Replay Mode closed', 'info');
      };
    }

    queueRender();
    toast(`Replaying Trade #${replayId}`, 'info');
  } catch (e) {
    console.error(e);
    toast('Error initializing Replay Mode', 'error');
  }
}

function findClosestCandleIndex(timeStr) {
  if (!timeStr || !S.candles) return -1;
  const targetMs = new Date(timeStr.replace(' ', 'T')).getTime();
  let closestIdx = -1;
  let minDiff = Infinity;
  for (let i = 0; i < S.candles.length; i++) {
    const diff = Math.abs(S.candles[i].t - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}
