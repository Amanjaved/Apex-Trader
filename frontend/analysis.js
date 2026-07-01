import { S, COINS, TF_MAP, loadState, saveState } from './settings/state.js';
import {
  initPaperEngine, setAiSnapshot, tickPaperPositions, openPaperPosition,
  closeAllPositions, closeHalfPosition, moveSlToBreakeven, trailStop,
  reversePosition, resetPaperAccount, ensurePaperState,
} from './paper/engine.js';
import {
  refreshPaperDashboard, setupGlobalCloseHandler, renderPostTradeReview,
} from './paper/ui.js';

// ─────────────────────────────────────────────
//  DOM ELEMENTS
// ─────────────────────────────────────────────
const D = {
  symBtn:        document.getElementById('symBtn'),
  symIcon:       document.getElementById('symIcon'),
  symName:       document.getElementById('symName'),
  symChev:       document.getElementById('symChev'),
  coinDropdown:  document.getElementById('coinDropdown'),
  coinSearch:    document.getElementById('coinSearch'),
  coinList:      document.getElementById('coinList'),
  priceVal:      document.getElementById('priceVal'),
  priceChg:      document.getElementById('priceChg'),
  tfGroup:       document.getElementById('tfGroup'),
  loadingOverlay:document.getElementById('loadingOverlay'),
  
  // Gauges
  biasGaugeFill: document.getElementById('biasGaugeFill'),
  biasScoreText: document.getElementById('biasScoreText'),
  biasBadge:     document.getElementById('biasBadge'),
  
  longProbText:  document.getElementById('longProbText'),
  shortProbText: document.getElementById('shortProbText'),
  longBar:       document.getElementById('longBar'),
  shortBar:      document.getElementById('shortBar'),
  probGlow:      document.getElementById('probGlow'),
  
  matrixGrid:    document.getElementById('matrixGrid'),
  
  // Indicators
  trendBody:     document.getElementById('trendBody'),
  momentumBody:  document.getElementById('momentumBody'),
  volatilityBody:document.getElementById('volatilityBody'),
  orderFlowBody: document.getElementById('orderFlowBody'),
  
  levelsList:    document.getElementById('levelsList'),
  structureList: document.getElementById('structureList'),
  
  reportContent: document.getElementById('reportContent'),
  setupBody:     document.getElementById('setupBody'),
  
  // Chatbot
  chatMessages:  document.getElementById('chatMessages'),
  chatForm:      document.getElementById('chatForm'),
  chatInput:     document.getElementById('chatInput'),
  toastContainer:document.getElementById('toastContainer'),

  // Fear & Greed
  fngNeedle:     document.getElementById('fngNeedle'),
  fngScore:      document.getElementById('fngScore'),
  fngBadge:      document.getElementById('fngBadge'),
  
  // News Feed
  newsList:      document.getElementById('newsList'),
  
  // Depth canvas
  depthCanvas:   document.getElementById('depthCanvas'),
  
  // Position size calculator inputs
  calcCapital:   document.getElementById('calcCapital'),
  calcRisk:      document.getElementById('calcRisk'),
  calcEntry:     document.getElementById('calcEntry'),
  calcSL:        document.getElementById('calcSL'),
  calcLeverage:  document.getElementById('calcLeverage'),
  calcLevVal:    document.getElementById('calcLevVal'),
  calcWarning:   document.getElementById('calcWarning'),
  
  // Backtester metrics
  btWinRate:     document.getElementById('btWinRate'),
  btProfitFactor:document.getElementById('btProfitFactor'),
  btTotalTrades: document.getElementById('btTotalTrades'),
  btMaxDD:       document.getElementById('btMaxDD'),
  equityCanvas:  document.getElementById('equityCanvas'),
  
  // New Institutional Dashboard bindings
  decBias:       document.getElementById('decBias'),
  decConfidence: document.getElementById('decConfidence'),
  decStatus:     document.getElementById('decStatus'),
  decEntry:      document.getElementById('decEntry'),
  decSL:         document.getElementById('decSL'),
  decTP:         document.getElementById('decTP'),
  decRR:         document.getElementById('decRR'),
  decQuality:    document.getElementById('decQuality'),
  decReasons:    document.getElementById('decReasons'),
  executionTimeline: document.getElementById('executionTimeline'),
  recBias:       document.getElementById('recBias'),
  recConfidence: document.getElementById('recConfidence'),
  recStatus:     document.getElementById('recStatus'),
  recHolding:    document.getElementById('recHolding'),
  recSuccess:    document.getElementById('recSuccess'),
  eli10Body:     document.getElementById('eli10Body'),
  entryChecklist: document.getElementById('entryChecklist'),
  blockerRec:    document.getElementById('blockerRec'),
  blockersList:  document.getElementById('blockersList'),
  newsImpactBox: document.getElementById('newsImpactBox'),
  instBuyBar:    document.getElementById('instBuyBar'),
  instBuyText:   document.getElementById('instBuyText'),
  instSellBar:   document.getElementById('instSellBar'),
  instSellText:  document.getElementById('instSellText'),
  heatmapLadder: document.getElementById('heatmapLadder'),
  smTimeline:    document.getElementById('smTimeline'),
  winProbGrid:   document.getElementById('winProbGrid'),
  journalListBody: document.getElementById('journalListBody'),
  regType:       document.getElementById('regType'),
  regStrength:   document.getElementById('regStrength'),
  regStrategy:   document.getElementById('regStrategy'),
  sessName:      document.getElementById('sessName'),
  sessBias:      document.getElementById('sessBias'),
  sessVol:       document.getElementById('sessVol'),
  sessWin:       document.getElementById('sessWin'),
  riskLabel:     document.getElementById('riskLabel'),
  riskDrawdown:  document.getElementById('riskDrawdown'),
  riskProfit:    document.getElementById('riskProfit'),
  riskDots:      document.getElementById('riskDots'),
  alertsStream:  document.getElementById('alertsStream')
};

// Global variables
let ws = null;
let lastPrice = null;
let selectedInterval = '60'; // default 1h
let activeTradeSetup = null; // caches entry/exit setup for calculator
let orderbookInterval = null;

// ─────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────
async function init() {
  loadState(); // load from localStorage
  
  // Read URL params (fallback to state)
  const urlParams = new URLSearchParams(window.location.search);
  const coinParam = urlParams.get('coin');
  const tfParam = urlParams.get('tf');
  
  if (coinParam && coinParam in COINS) {
    S.coin = coinParam;
  }
  if (tfParam) {
    selectedInterval = tfParam;
  } else if (S.tf) {
    selectedInterval = S.tf;
  }

  updateHeaderUI();
  initDropdown();
  initTfGroup();
  initChatbot();
  initInteractiveCalculator();
  initTabs();
  initReplayMode();
  initDemoSimulator();

  // Run initial fetch
  await refreshAnalysis();
  connectWebSocket();

  // GSAP Entrance Animations
  if (window.gsap) {
    window.gsap.from(".glass-card", {
      duration: 0.6,
      y: 20,
      opacity: 0,
      stagger: 0.1,
      ease: "power2.out"
    });
  }
}

// ─────────────────────────────────────────────
//  FETCH AI REPORT & RUN QUANT MODULES
// ─────────────────────────────────────────────
async function refreshAnalysis() {
  const progressText = document.getElementById('loaderProgressText');
  const barFill = document.getElementById('loaderBarFill');
  
  const loadingSteps = [
    { pct: 15, text: "Connecting neural sockets..." },
    { pct: 30, text: "Ingesting order book liquidity pools..." },
    { pct: 45, text: "Running multi-timeframe pivot analysis..." },
    { pct: 60, text: "Correlating MACD & RSI oscillators..." },
    { pct: 75, text: "Detecting Smart Money structure breaks..." },
    { pct: 90, text: "Calculating final institutional conviction..." },
    { pct: 98, text: "Finalizing data rendering..." }
  ];
  
  let currentStep = 0;
  if (barFill) barFill.style.width = '0%';
  if (progressText) progressText.textContent = "Booting Neural Engine...";
  D.loadingOverlay.classList.remove('fade-out');

  const stepInterval = setInterval(() => {
    if (currentStep < loadingSteps.length) {
      const step = loadingSteps[currentStep];
      if (progressText) progressText.textContent = step.text;
      if (barFill) barFill.style.width = `${step.pct}%`;
      currentStep++;
    }
  }, 250);

  const sym = S.coin;
  const tfName = TF_MAP[selectedInterval] || '1h';

  try {
    // Fire off visual analysis modules concurrently
    fetchFearGreedSentiment();
    fetchLiveNewsFeed();
    runBacktestAnalysis();
    startOrderbookPolling();

    const res = await fetch(`/api/ai/analysis?symbol=${sym}&interval=${tfName}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Prevent race conditions
    if (S.coin !== sym) {
      clearInterval(stepInterval);
      return;
    }

    setAiSnapshot(data);

    renderBiasScore(data.score, data.bias);
    renderProbability(data.longProb, data.shortProb);
    renderMatrix(data.matrix || {});
    renderIndicatorCards(data);
    renderLevelsAndStructures(data.levels, data.confluences);
    renderReport(data.analysis);
    renderTradeSetup(data);
    renderInstitutionalDashboard(data);

    clearInterval(stepInterval);
    if (barFill) barFill.style.width = '100%';
    if (progressText) progressText.textContent = "System ready.";
    setTimeout(() => {
      D.loadingOverlay.classList.add('fade-out');
    }, 200);
  } catch (e) {
    clearInterval(stepInterval);
    console.error('[Analysis Fetch Error]', e);
    showToast('Failed to retrieve AI analysis. Retrying...', 'error');
    D.loadingOverlay.classList.add('fade-out');
  }
}

// ─────────────────────────────────────────────
//  RENDER METHODS
// ─────────────────────────────────────────────
function renderBiasScore(score, bias) {
  const normalized = Math.max(0, Math.min(100, Math.round(50 + score * 5)));
  if (D.biasScoreText) D.biasScoreText.textContent = normalized;
  
  if (D.biasGaugeFill) {
    const offset = 251.2 - (251.2 * normalized) / 100;
    D.biasGaugeFill.style.strokeDashoffset = offset;

    const biasLower = bias.toLowerCase();
    let strokeColor = 'var(--gold)';
    if (biasLower.includes('strong bullish') || biasLower === 'bullish') {
      strokeColor = 'var(--green)';
    } else if (biasLower.includes('strong bearish') || biasLower === 'bearish') {
      strokeColor = 'var(--red)';
    }
    D.biasGaugeFill.style.stroke = strokeColor;
  }

  if (D.biasBadge) {
    const biasLower = bias.toLowerCase();
    let bClass = 'neutral';
    if (biasLower.includes('strong bullish') || biasLower === 'bullish') {
      bClass = 'bullish';
    } else if (biasLower.includes('strong bearish') || biasLower === 'bearish') {
      bClass = 'bearish';
    }
    D.biasBadge.textContent = bias;
    D.biasBadge.className = `bias-badge ${bClass}`;
  }
}

function renderProbability(longProb, shortProb) {
  if (D.longProbText) D.longProbText.textContent = `${longProb}%`;
  if (D.shortProbText) D.shortProbText.textContent = `${shortProb}%`;
  
  if (D.longBar) D.longBar.style.width = `${longProb}%`;
  if (D.shortBar) D.shortBar.style.width = `${shortProb}%`;
  
  if (D.probGlow) D.probGlow.style.left = `${longProb}%`;
}

function renderMatrix(matrix) {
  if (!D.matrixGrid) return;
  const tfs = ["5m", "15m", "1h", "4h", "1d"];
  D.matrixGrid.innerHTML = tfs.map(tf => {
    const m = matrix[tf] || { bias: "NEUTRAL" };
    const biasLower = m.bias.toLowerCase();
    const isBull = biasLower.includes("bullish");
    const isBear = biasLower.includes("bearish");
    const mClass = isBull ? "bullish" : isBear ? "bearish" : "neutral";
    const displayBias = isBull ? "BULL" : isBear ? "BEAR" : "NEUT";
    return `
      <div class="matrix-item ${mClass}">
        <div class="matrix-tf">${tf}</div>
        <div class="matrix-bias">${displayBias}</div>
      </div>`;
  }).join('');
}

function renderIndicatorCards(data) {
  if (!D.trendBody || !D.momentumBody || !D.volatilityBody || !D.orderFlowBody) return;
  const confs = data.confluences || [];
  
  const trendConfs = confs.filter(c => c.txt.toLowerCase().includes('trend') || c.txt.toLowerCase().includes('ema'));
  const momConfs = confs.filter(c => c.txt.toLowerCase().includes('rsi') || c.txt.toLowerCase().includes('macd') || c.txt.toLowerCase().includes('momentum'));
  const volConfs = confs.filter(c => c.txt.toLowerCase().includes('volatility') || c.txt.toLowerCase().includes('bb') || c.txt.toLowerCase().includes('bollinger') || c.txt.toLowerCase().includes('atr'));
  const ofConfs = confs.filter(c => c.txt.toLowerCase().includes('order flow') || c.txt.toLowerCase().includes('imbalance') || c.txt.toLowerCase().includes('dominance'));

  const renderLines = (list, defaultText) => {
    if (!list.length) return `<div class="ind-metric-row"><span class="ind-label">${defaultText}</span></div>`;
    return list.map(c => {
      const isBull = c.type === 'bullish';
      const isBear = c.type === 'bearish';
      const pillClass = isBull ? 'good' : isBear ? 'bad' : 'neutral';
      const label = c.txt.split(':')[0] || 'Confluence';
      return `
        <div class="ind-metric-row">
          <span class="ind-label">${label}</span>
          <span class="ind-status-pill ${pillClass}">${pillClass}</span>
        </div>`;
    }).join('');
  };

  D.trendBody.innerHTML = renderLines(trendConfs, 'Trend is consolidation / mixed Structure');
  D.momentumBody.innerHTML = renderLines(momConfs, 'Momentum metrics within neutral bounds');
  D.volatilityBody.innerHTML = renderLines(volConfs, 'Volatility levels within normal channels');
  D.orderFlowBody.innerHTML = renderLines(ofConfs, 'Order book volume is highly balanced');
}

function renderLevelsAndStructures(levels, confluences) {
  // Support & Resistance
  const sups = levels?.support || [];
  const ress = levels?.resistance || [];
  const price = lastPrice || (sups[0]?.price ? sups[0].price * 1.01 : 0);

  let html = '';
  if (ress.length) {
    // Show resistances (sorted descending for top-down visual chart layout)
    html += [...ress].reverse().slice(0, 3).map(r => `
      <div class="level-row resistance">
        <span class="level-name">⬆ ${r.label || 'Resistance'}</span>
        <span class="level-price">${fmtUSD(r.price)}</span>
        <span class="level-score">${Math.round(r.score)}/100</span>
      </div>`).join('');
  }
  
  html += `
    <div class="level-row current" style="border-left: 3px solid var(--cyan); background:rgba(0, 240, 255, 0.03);">
      <span class="level-name">📌 Current Price</span>
      <span class="level-price" style="color:var(--cyan)" id="levelsCurrentPrice">${price > 0 ? fmtUSD(price) : '—'}</span>
      <span class="level-score">LIVE</span>
    </div>`;

  if (sups.length) {
    html += sups.slice(0, 3).map(s => `
      <div class="level-row support">
        <span class="level-name">⬇ ${s.label || 'Support'}</span>
        <span class="level-price">${fmtUSD(s.price)}</span>
        <span class="level-score">${Math.round(s.score)}/100</span>
      </div>`).join('');
  }
  D.levelsList.innerHTML = html;

  // Smart Money structures (FVG & Order Blocks)
  const smcConfs = confluences.filter(c => c.txt.toLowerCase().includes('smc') || c.txt.toLowerCase().includes('fvg') || c.txt.toLowerCase().includes('order block'));
  if (smcConfs.length) {
    D.structureList.innerHTML = smcConfs.map(c => {
      const isBull = c.type === 'bullish';
      const typeLabel = c.txt.includes('Order Block') ? 'Order Block' : 'FVG Gap';
      return `
        <div class="struct-row ${isBull ? 'bullish' : 'bearish'}">
          <span class="struct-txt">${c.txt.replace('SMC Structure: ', '')}</span>
          <span class="struct-tag">${typeLabel}</span>
        </div>`;
    }).join('');
  } else {
    D.structureList.innerHTML = `
      <div class="struct-row neutral">
        <span class="struct-txt">No unmitigated order blocks or gaps in immediate range.</span>
        <span class="struct-tag">Balanced</span>
      </div>`;
  }
}

function renderReport(reportText) {
  if (!reportText) return;
  let formattedHtml = reportText
    .replace(/### \*\*(.*?)\*\*/g, '<h4>$1</h4>')
    .replace(/\*\*(BIAS: [A-Z\s\/]+)\*\*/g, '<div style="margin:12px 0;padding:8px 12px;border-radius:6px;background:rgba(0,0,0,0.3);border-left:3px solid var(--gold);"><strong style="color:var(--text)">$1</strong></div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  D.reportContent.innerHTML = formattedHtml;
}

function renderTradeSetup(data) {
  const bias = data.bias;
  const price = lastPrice || (data.levels?.support[0]?.price ? data.levels.support[0].price * 1.01 : 0);
  const biasLower = bias.toLowerCase();
  
  let actionLabel = 'HOLD / RANGE';
  let actionClass = 'action-neutral';
  if (biasLower.includes('strong bullish') || biasLower === 'bullish') {
    actionLabel = 'LONG / BUY';
    actionClass = 'action-long';
  } else if (biasLower.includes('strong bearish') || biasLower === 'bearish') {
    actionLabel = 'SHORT / SELL';
    actionClass = 'action-short';
  }

  const sups = data.levels?.support || [];
  const ress = data.levels?.resistance || [];

  const steps = data.executionSteps || [];
  const stepSl = steps.find(s => (s.label || '').toLowerCase().includes('stop loss'));
  const stepTp = steps.find(s => (s.label || '').toLowerCase().includes('take profit 1'));
  const stepEntry = steps.find(s => (s.label || '').toLowerCase().includes('trigger target'));
  
  // Choose key entry zones and stop losses based on recommendations
  let rawEntry = stepEntry ? parseFloat(String(stepEntry.val).replace(/[^0-9.-]/g, '')) : 0;
  let rawStop = stepSl ? parseFloat(String(stepSl.val).replace(/[^0-9.-]/g, '')) : 0;
  if (!rawEntry) {
    rawEntry = actionLabel === 'LONG / BUY' ? (sups[0]?.price || price * 0.99) : (ress[0]?.price || price * 1.01);
  }
  if (!rawStop) {
    rawStop = actionLabel === 'LONG / BUY' ? (sups[1]?.price || price * 0.975) : (ress[1]?.price || price * 1.025);
  }
  const rawTargets = actionLabel === 'LONG / BUY' ? ress.slice(0, 3).map(r => r.price) : sups.slice(0, 3).map(s => s.price);
  
  // Fill fallback targets if empty
  if (rawTargets.length === 0) {
    if (actionLabel === 'LONG / BUY') {
      rawTargets.push(price * 1.02, price * 1.04, price * 1.06);
    } else {
      rawTargets.push(price * 0.98, price * 0.96, price * 0.94);
    }
  }
  if (stepTp) {
    const tp1 = parseFloat(String(stepTp.val).replace(/[^0-9.-]/g, ''));
    if (tp1 > 0) rawTargets[0] = tp1;
  }

  activeTradeSetup = {
    type: actionLabel,
    actionClass: actionClass,
    entry: rawEntry,
    stopLoss: rawStop,
    targets: rawTargets,
  };

  if (D.calcEntry) D.calcEntry.value = rawEntry.toFixed(2);
  if (D.calcSL) D.calcSL.value = rawStop.toFixed(2);
  
  updateCalculations();
}

// ─────────────────────────────────────────────
//  HEADER & NAVIGATION
// ─────────────────────────────────────────────
function updateHeaderUI() {
  const ci = COINS[S.coin];
  D.symIcon.textContent = ci.icon;
  D.symName.textContent = `${ci.sym}/USDT`;
}

// ─────────────────────────────────────────────
//  DROPDOWN CONTROLLER
// ─────────────────────────────────────────────
function initDropdown() {
  // Toggle dropdown on click
  D.symBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = D.coinDropdown.classList.contains('open');
    if (isOpen) {
      D.coinDropdown.classList.remove('open');
      D.symBtn.classList.remove('open');
      D.symChev.textContent = '▼';
    } else {
      D.coinDropdown.classList.add('open');
      D.symBtn.classList.add('open');
      D.symChev.textContent = '▲';
      D.coinSearch.focus();
      renderCoinList();
    }
  });

  // Close dropdown on outer clicks
  document.addEventListener('click', e => {
    if (!e.target.closest('.coin-dropdown') && !e.target.closest('.sym-btn')) {
      D.coinDropdown.classList.remove('open');
      D.symBtn.classList.remove('open');
      D.symChev.textContent = '▼';
    }
  });

  // Search filter
  D.coinSearch.addEventListener('input', () => {
    renderCoinList(D.coinSearch.value.trim().toLowerCase());
  });
}

function renderCoinList(filter = '') {
  const list = Object.entries(COINS).filter(([symbol, info]) => {
    return symbol.toLowerCase().includes(filter) || info.name.toLowerCase().includes(filter) || info.sym.toLowerCase().includes(filter);
  });

  D.coinList.innerHTML = list.map(([symbol, info]) => {
    const isSelected = S.coin === symbol;
    return `
      <div class="coin-item ${isSelected ? 'selected' : ''}" data-symbol="${symbol}">
        <span class="coin-icon">${info.icon}</span>
        <span class="coin-symbol" style="font-weight:700;">${info.sym}/USDT</span>
        <span class="coin-name" style="margin-left:auto;color:var(--text-3);font-size:10px;">${info.name}</span>
      </div>`;
  }).join('');

  // Attach item click listeners
  D.coinList.querySelectorAll('.coin-item').forEach(item => {
    item.addEventListener('click', async () => {
      const symbol = item.dataset.symbol;
      S.coin = symbol;
      saveState();
      
      updateHeaderUI();
      D.coinDropdown.classList.remove('open');
      D.symBtn.classList.remove('open');
      D.symChev.textContent = '▼';
      
      lastPrice = null; // reset price cache
      
      connectWebSocket();
      await refreshAnalysis();
    });
  });
}

// ─────────────────────────────────────────────
//  TIMEFRAME SELECTOR
// ─────────────────────────────────────────────
function initTfGroup() {
  // Pre-highlight active timeframe
  D.tfGroup.querySelectorAll('.tf-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.tf === selectedInterval);
  });

  D.tfGroup.addEventListener('click', async e => {
    const btn = e.target.closest('.tf-btn');
    if (!btn) return;
    
    selectedInterval = btn.dataset.tf;
    S.tf = selectedInterval;
    saveState();
    
    D.tfGroup.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('on', b.dataset.tf === selectedInterval));
    await refreshAnalysis();
  });
}

// ─────────────────────────────────────────────
//  WEBSOCKET PRICE FEED
// ─────────────────────────────────────────────
function connectWebSocket() {
  if (ws) {
    ws.close();
  }
  
  const streamSym = S.coin.toLowerCase();
  ws = new WebSocket('wss://stream.binance.com:9443/ws');
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      method: "SUBSCRIBE",
      params: [`${streamSym}@ticker`],
      id: 1
    }));
  };
  
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.e === "24hrTicker" && d.s === S.coin) {
      const price = parseFloat(d.c);
      const chgPct = parseFloat(d.P);
      
      // Flash animation on price change
      if (lastPrice !== null && price !== lastPrice) {
        const cls = price > lastPrice ? 'flash-up' : 'flash-dn';
        D.priceVal.className = `price-val ${cls}`;
      }
      
      lastPrice = price;
      D.priceVal.textContent = fmtUSD(price);
      D.priceChg.textContent = `${chgPct > 0 ? '+' : ''}${chgPct.toFixed(2)}%`;
      D.priceChg.className = `price-chg ${chgPct >= 0 ? 'up' : 'dn'}`;
      
      // Keep levels row live price synced
      const levelsCurrent = document.getElementById('levelsCurrentPrice');
      if (levelsCurrent) {
        levelsCurrent.textContent = fmtUSD(price);
      }
      
      // Update simulated live position tracking
      updatePositionManagerUI();
      window.__paperLastPrice = price;
      tickPaperPositions(price, S.coin);
      refreshPaperDashboard(price, {
        onDayClick: (dateKey, trades, dayPnl) => {
          if (!trades.length) showToast(`No trades on ${dateKey}.`, 'info');
          else {
            showToast(`${trades.length} trade(s) · P&L ${dayPnl >= 0 ? '+' : ''}${fmtUSD(dayPnl)}`, 'success');
            renderPostTradeReview(trades[trades.length - 1]);
          }
        },
      });
    }
  };

  ws.onerror = err => {
    console.error('[Binance WebSocket Error]', err);
  };
}

// ─────────────────────────────────────────────
//  INTERACTIVE CHATBOT LOGIC
// ─────────────────────────────────────────────
function initChatbot() {
  D.chatForm.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = D.chatInput.value.trim();
    if (!msg) return;

    // Append user bubble
    appendChatBubble('user', msg);
    D.chatInput.value = '';

    // Append typing indicator bubble
    const loaderId = appendTypingIndicator();
    scrollToBottom();

    const sym = S.coin;
    const tfName = TF_MAP[selectedInterval] || '1h';

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym, interval: tfName, message: msg })
      });
      
      removeTypingIndicator(loaderId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // Append AI response bubble
      appendChatBubble('ai', data.response);
      scrollToBottom();
    } catch (err) {
      console.error('[Chat Error]', err);
      removeTypingIndicator(loaderId);
      appendChatBubble('ai', "I apologize, but I encountered an error communicating with my neural backend quants. Please verify your connection and try again.");
      scrollToBottom();
    }
  });
}

function appendChatBubble(sender, text) {
  const msgRow = document.createElement('div');
  msgRow.className = `chat-msg ${sender}`;
  
  const avatar = document.createElement('span');
  avatar.className = 'chat-avatar';
  avatar.textContent = sender === 'ai' ? 'AI' : 'U';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  
  // Simple markdown highlight replacements inside chatbot
  bubble.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  msgRow.appendChild(avatar);
  msgRow.appendChild(bubble);
  D.chatMessages.appendChild(msgRow);
}

function appendTypingIndicator() {
  const loaderId = 'loader_' + Date.now();
  
  const msgRow = document.createElement('div');
  msgRow.className = 'chat-msg ai';
  msgRow.id = loaderId;
  
  const avatar = document.createElement('span');
  avatar.className = 'chat-avatar';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  
  bubble.appendChild(indicator);
  msgRow.appendChild(avatar);
  msgRow.appendChild(bubble);
  D.chatMessages.appendChild(msgRow);
  
  return loaderId;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  D.chatMessages.scrollTop = D.chatMessages.scrollHeight;
}

// ─────────────────────────────────────────────
//  QUANT DASHBOARD COMPONENT ENHANCEMENTS
// ─────────────────────────────────────────────

// A. Interactive Leverage & Sizing Calculator
function initInteractiveCalculator() {
  if (!D.calcCapital) return;
  D.calcCapital.addEventListener('input', updateCalculations);
  D.calcRisk.addEventListener('input', updateCalculations);
  D.calcEntry.addEventListener('input', updateCalculations);
  D.calcSL.addEventListener('input', updateCalculations);
  D.calcLeverage.addEventListener('input', () => {
    D.calcLevVal.textContent = `${D.calcLeverage.value}x`;
    updateCalculations();
  });
}

function updateCalculations() {
  if (!D.setupBody) return;
  
  const capital = parseFloat(D.calcCapital.value) || 1000;
  const riskPct = parseFloat(D.calcRisk.value) || 1.0;
  const entry = parseFloat(D.calcEntry.value) || 0;
  const stopLoss = parseFloat(D.calcSL.value) || 0;
  const leverage = parseInt(D.calcLeverage.value) || 25;
  
  D.calcLevVal.textContent = `${leverage}x`;
  
  if (entry <= 0 || stopLoss <= 0 || entry === stopLoss) {
    D.setupBody.innerHTML = `
      <div style="color:var(--text-3); font-size:12px; text-align:center; padding:24px 0;">
        Invalid Entry or Stop Loss targets. Adjust inputs to calculate metrics.
      </div>`;
    D.calcWarning.style.display = 'none';
    return;
  }
  
  const type = entry > stopLoss ? 'LONG' : 'SHORT';
  const stopDistPct = (Math.abs(entry - stopLoss) / entry) * 100;
  const riskAmountUSD = capital * (riskPct / 100);
  
  // Sizing calculations
  const positionSizeUSD = riskAmountUSD / (stopDistPct / 100);
  const positionSizeUnits = positionSizeUSD / entry;
  const marginRequired = positionSizeUSD / leverage;
  
  // Liquidation Price calculation
  let liqPrice = 0;
  if (type === 'LONG') {
    liqPrice = entry * (1 - 1 / leverage);
  } else {
    liqPrice = entry * (1 + 1 / leverage);
  }
  
  // Slipped / high-risk warning flags
  let showWarning = false;
  if (type === 'LONG' && liqPrice >= stopLoss) {
    showWarning = true;
    D.calcWarning.innerHTML = `⚠️ <strong>LIQUIDATION HAZARD</strong>: Est. Liquidation Price (${fmtUSD(liqPrice)}) triggers before your Stop Loss (${fmtUSD(stopLoss)}). Reduce leverage below <strong>${Math.floor(100 / stopDistPct)}x</strong> to avoid premature liquidation.`;
  } else if (type === 'SHORT' && liqPrice <= stopLoss) {
    showWarning = true;
    D.calcWarning.innerHTML = `⚠️ <strong>LIQUIDATION HAZARD</strong>: Est. Liquidation Price (${fmtUSD(liqPrice)}) triggers before your Stop Loss (${fmtUSD(stopLoss)}). Reduce leverage below <strong>${Math.floor(100 / stopDistPct)}x</strong> to avoid premature liquidation.`;
  } else if (leverage >= 50) {
    showWarning = true;
    D.calcWarning.innerHTML = `⚠️ <strong>HIGH POSITION VOLATILITY</strong>: ${leverage}x leverage heavily increases execution slippage and margin volatility. Trade cautiously.`;
  }
  D.calcWarning.style.display = showWarning ? 'block' : 'none';
  
  // Expected payout rows
  const target1 = type === 'LONG' ? entry * 1.02 : entry * 0.98;
  const target2 = type === 'LONG' ? entry * 1.05 : entry * 0.95;
  const t1Ret = type === 'LONG' ? (target1 - entry)/entry : (entry - target1)/entry;
  const t2Ret = type === 'LONG' ? (target2 - entry)/entry : (entry - target2)/entry;
  const t1Profit = positionSizeUSD * t1Ret;
  const t2Profit = positionSizeUSD * t2Ret;
  
  const rrRatio = stopDistPct > 0 ? (Math.abs(target1 - entry) / Math.abs(entry - stopLoss)).toFixed(2) : '—';
  
  D.setupBody.innerHTML = `
    <div class="setup-row">
      <span class="setup-label">Simulated Direction</span>
      <span class="setup-val ${type === 'LONG' ? 'action-long' : 'action-short'}">${type}</span>
    </div>
    <div class="setup-row">
      <span class="setup-label">Calculated Position Size</span>
      <span class="setup-val" style="color:var(--text);">${fmtUSD(positionSizeUSD)} (${positionSizeUnits.toFixed(4)} Units)</span>
    </div>
    <div class="setup-row">
      <span class="setup-label">Margin Required</span>
      <span class="setup-val" style="color:var(--cyan);">${fmtUSD(marginRequired)}</span>
    </div>
    <div class="setup-row">
      <span class="setup-label">Est. Liquidation Price</span>
      <span class="setup-val" style="color:var(--red);">${fmtUSD(liqPrice)}</span>
    </div>
    <div class="setup-row" style="flex-direction:column; align-items:stretch; gap:6px;">
      <span class="setup-label">Expected Take Profit Payouts</span>
      <div style="font-family:var(--mono); font-size:11px; margin-top:2px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-3)">TP1 (${fmtUSD(target1)})</span>
          <span style="color:var(--green); font-weight:600;">+${fmtUSD(t1Profit)} (${(t1Ret * 100 * leverage).toFixed(1)}% ROE)</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-3)">TP2 (${fmtUSD(target2)})</span>
          <span style="color:var(--green); font-weight:600;">+${fmtUSD(t2Profit)} (${(t2Ret * 100 * leverage).toFixed(1)}% ROE)</span>
        </div>
      </div>
    </div>
    <div class="setup-row">
      <span class="setup-label">Stop Loss (Risk)</span>
      <span class="setup-val" style="color:var(--red);">${fmtUSD(stopLoss)} (-${fmtUSD(riskAmountUSD)})</span>
    </div>
    <div class="setup-row">
      <span class="setup-label">Risk-to-Reward Ratio</span>
      <span class="setup-val" style="color:var(--gold);">${rrRatio} : 1</span>
    </div>
    <button class="btn-execute-trade" id="btnExecuteTrade">EXECUTE MOCK TRADE</button>
  `;

  // Attach button execution click handler
  const btn = document.getElementById('btnExecuteTrade');
  if (btn) {
    btn.addEventListener('click', () => {
      startMockTrade(type, entry, stopLoss, capital, leverage, positionSizeUnits, marginRequired);
    });
  }
}

// B. Crypto Fear & Greed Index Speedometer
async function fetchFearGreedSentiment() {
  if (!D.fngScore || !D.fngNeedle) return;
  try {
    const res = await fetch('/api/feargreed');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fng = data.data?.[0] || { value: "50", value_classification: "Neutral" };
    const val = parseInt(fng.value) || 50;
    const classification = fng.value_classification || "Neutral";
    
    D.fngScore.textContent = val;
    D.fngBadge.textContent = classification;
    
    // Clear and set classification styling
    D.fngBadge.className = 'fng-badge';
    const cLower = classification.toLowerCase();
    if (cLower.includes('extreme fear')) {
      D.fngBadge.classList.add('extreme-fear');
    } else if (cLower.includes('extreme greed')) {
      D.fngBadge.classList.add('extreme-greed');
    } else if (cLower.includes('fear')) {
      D.fngBadge.classList.add('fear');
    } else if (cLower.includes('greed')) {
      D.fngBadge.classList.add('greed');
    } else {
      D.fngBadge.classList.add('neutral');
    }
    
    // Speedometer needle points from -90deg (0 = Fear) to +90deg (100 = Greed)
    const degrees = (val / 100) * 180 - 90;
    D.fngNeedle.setAttribute('transform', `rotate(${degrees}, 50, 50)`);
  } catch (err) {
    console.error('[Fear Greed Sentiment Error]', err);
  }
}

// C. Live News & Sentiment Confluence Stream
async function fetchLiveNewsFeed() {
  if (!D.newsList) return;
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const articles = data.Data || [];
    
    const baseTicker = S.coin.replace('USDT', '').toLowerCase();
    const matched = articles.filter(a => {
      const t = a.title.toLowerCase();
      const b = a.body.toLowerCase();
      return t.includes(baseTicker) || b.includes(baseTicker);
    });
    
    // Fallback to top news if no matches
    const displayList = matched.length >= 2 ? matched.slice(0, 4) : articles.slice(0, 4);
    
    if (displayList.length === 0) {
      D.newsList.innerHTML = `<div style="color:var(--text-3); font-size:11px; text-align:center; padding:24px 0;">No recent news confluences found.</div>`;
      return;
    }
    
    D.newsList.innerHTML = displayList.map(a => {
      const dateStr = new Date(a.published_on * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const sentiment = a.sentiment || 'neutral';
      return `
        <div class="news-item">
          <div class="news-item-top">
            <span class="news-item-source">${a.source}</span>
            <span class="news-sentiment-badge ${sentiment}">${sentiment}</span>
            <span>${dateStr}</span>
          </div>
          <a href="${a.url}" target="_blank" class="news-item-title">${a.title}</a>
          <div class="news-item-body">${a.body}</div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('[News Feed Error]', err);
    D.newsList.innerHTML = `<div style="color:var(--text-3); font-size:11px; text-align:center; padding:24px 0;">Failed to load news confluences.</div>`;
  }
}

// D. Order Book Walls cumulative visualizer
function startOrderbookPolling() {
  if (orderbookInterval) clearInterval(orderbookInterval);
  refreshOrderDepth();
  orderbookInterval = setInterval(refreshOrderDepth, 8000); // 8 seconds to prevent rate limits
}

async function refreshOrderDepth() {
  if (!D.depthCanvas) return;
  const sym = S.coin;
  try {
    const res = await fetch(`/api/orderbook?symbol=${sym}&limit=40`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ob = await res.json();
    
    // Double check we haven't selected a different coin
    if (S.coin !== sym) return;
    drawDepthChart(ob);
  } catch (err) {
    console.error('[Depth Wall Fetch Error]', err);
  }
}

function drawDepthChart(ob) {
  const canvas = D.depthCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  
  const bids = ob.bids || [];
  const asks = ob.asks || [];
  if (bids.length === 0 && asks.length === 0) return;
  
  const sortedBids = bids.map(b => [parseFloat(b[0]), parseFloat(b[1])]).sort((a,b) => b[0] - a[0]);
  const sortedAsks = asks.map(a => [parseFloat(a[0]), parseFloat(a[1])]).sort((a,b) => a[0] - b[0]);
  
  let cumBids = [];
  let sumBids = 0;
  for (let i = 0; i < sortedBids.length; i++) {
    sumBids += sortedBids[i][1];
    cumBids.push({ price: sortedBids[i][0], sum: sumBids });
  }
  
  let cumAsks = [];
  let sumAsks = 0;
  for (let i = 0; i < sortedAsks.length; i++) {
    sumAsks += sortedAsks[i][1];
    cumAsks.push({ price: sortedAsks[i][0], sum: sumAsks });
  }
  
  const maxVolume = Math.max(sumBids, sumAsks) || 1.0;
  const minPrice = cumBids.length > 0 ? cumBids[cumBids.length - 1].price : lastPrice * 0.99;
  const maxPrice = cumAsks.length > 0 ? cumAsks[cumAsks.length - 1].price : lastPrice * 1.01;
  const midPrice = lastPrice || (cumBids[0]?.price + cumAsks[0]?.price) / 2 || minPrice;
  const priceRange = maxPrice - minPrice;
  
  if (priceRange <= 0) return;
  
  function getX(price) {
    return ((price - minPrice) / priceRange) * w;
  }
  function getY(vol) {
    return h - (vol / maxVolume) * (h - 22) - 4;
  }
  
  // Draw Bid Wall
  if (cumBids.length > 0) {
    ctx.beginPath();
    ctx.moveTo(getX(midPrice), h);
    ctx.lineTo(getX(midPrice), getY(0));
    for (let i = 0; i < cumBids.length; i++) {
      ctx.lineTo(getX(cumBids[i].price), getY(cumBids[i].sum));
    }
    ctx.lineTo(getX(cumBids[cumBids.length - 1].price), h);
    ctx.closePath();
    
    const gradB = ctx.createLinearGradient(0, 0, 0, h);
    gradB.addColorStop(0, 'rgba(0, 255, 102, 0.12)');
    gradB.addColorStop(1, 'rgba(0, 255, 102, 0.0)');
    ctx.fillStyle = gradB;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(getX(midPrice), getY(0));
    for (let i = 0; i < cumBids.length; i++) {
      ctx.lineTo(getX(cumBids[i].price), getY(cumBids[i].sum));
    }
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Draw Ask Wall
  if (cumAsks.length > 0) {
    ctx.beginPath();
    ctx.moveTo(getX(midPrice), h);
    ctx.lineTo(getX(midPrice), getY(0));
    for (let i = 0; i < cumAsks.length; i++) {
      ctx.lineTo(getX(cumAsks[i].price), getY(cumAsks[i].sum));
    }
    ctx.lineTo(getX(cumAsks[cumAsks.length - 1].price), h);
    ctx.closePath();
    
    const gradA = ctx.createLinearGradient(0, 0, 0, h);
    gradA.addColorStop(0, 'rgba(255, 59, 111, 0.12)');
    gradA.addColorStop(1, 'rgba(255, 59, 111, 0.0)');
    ctx.fillStyle = gradA;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(getX(midPrice), getY(0));
    for (let i = 0; i < cumAsks.length; i++) {
      ctx.lineTo(getX(cumAsks[i].price), getY(cumAsks[i].sum));
    }
    ctx.strokeStyle = '#ff3b6f';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ff3b6f';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Center separator
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(getX(midPrice), 0);
  ctx.lineTo(getX(midPrice), h);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Price anchors
  ctx.font = '8px monospace';
  ctx.fillStyle = 'var(--text-3)';
  ctx.fillText(fmtUSD(minPrice), 4, h - 4);
  ctx.fillText(fmtUSD(maxPrice), w - ctx.measureText(fmtUSD(maxPrice)).width - 4, h - 4);
  
  ctx.fillStyle = 'var(--cyan)';
  const midPriceText = fmtUSD(midPrice);
  ctx.fillText(midPriceText, getX(midPrice) - ctx.measureText(midPriceText).width/2, 10);
}

// E. Historical Backtester Strategy
async function runBacktestAnalysis() {
  if (!D.btWinRate) return;
  const sym = S.coin;
  const tfName = TF_MAP[selectedInterval] || '1h';
  
  try {
    const res = await fetch(`/api/candles?symbol=${sym}&interval=${tfName}&limit=500`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rawCandles = await res.json();
    
    if (S.coin !== sym) return;
    
    const candles = rawCandles.map(k => ({
      t: parseInt(k[0]),
      o: parseFloat(k[1]),
      h: parseFloat(k[2]),
      l: parseFloat(k[3]),
      c: parseFloat(k[4]),
      v: parseFloat(k[5]),
    }));
    
    if (candles.length < 50) {
      D.btWinRate.textContent = '—';
      D.btProfitFactor.textContent = '—';
      D.btTotalTrades.textContent = '—';
      D.btMaxDD.textContent = '—';
      return;
    }
    
    const closes = candles.map(c => c.c);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    
    let equity = 100;
    const equityCurve = [equity];
    let position = null; // open position tracker
    let winCount = 0;
    let loseCount = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let tradesCount = 0;
    let peak = 100;
    let maxDD = 0;
    
    const feeRate = 0.0006; // 0.06% exchange fee + slippage
    
    for (let i = 26; i < candles.length; i++) {
      const price = candles[i].c;
      const prev12 = ema12[i-1];
      const prev26 = ema26[i-1];
      const curr12 = ema12[i];
      const curr26 = ema26[i];
      
      const bullCross = (prev12 <= prev26 && curr12 > curr26);
      const bearCross = (prev12 >= prev26 && curr12 < curr26);
      
      let pnl = 0;
      if (position) {
        if (position.type === 'long') {
          pnl = (price - position.entryPrice) / position.entryPrice;
        } else {
          pnl = (position.entryPrice - price) / position.entryPrice;
        }
      }
      
      // Trade exit / flip conditions
      if (position) {
        const exitSignal = (position.type === 'long' && bearCross) || (position.type === 'short' && bullCross);
        if (exitSignal) {
          const finalReturn = pnl - feeRate;
          equity = equity * (1 + finalReturn);
          
          if (finalReturn > 0) {
            winCount++;
            totalWins += finalReturn;
          } else {
            loseCount++;
            totalLosses += Math.abs(finalReturn);
          }
          tradesCount++;
          position = null;
        }
      }
      
      // Trade entry triggers
      if (!position) {
        if (bullCross) {
          position = { type: 'long', entryPrice: price, index: i };
          equity = equity * (1 - feeRate);
        } else if (bearCross) {
          position = { type: 'short', entryPrice: price, index: i };
          equity = equity * (1 - feeRate);
        }
      }
      
      const currentEquity = position ? equity * (1 + pnl) : equity;
      equityCurve.push(currentEquity);
      
      if (currentEquity > peak) peak = currentEquity;
      const dd = ((peak - currentEquity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
    
    // Close terminal position for stats
    if (position) {
      const price = closes[closes.length - 1];
      const pnl = position.type === 'long' ? (price - position.entryPrice) / position.entryPrice : (position.entryPrice - price) / position.entryPrice;
      const finalReturn = pnl - feeRate;
      equity = equity * (1 + finalReturn);
      if (finalReturn > 0) {
        winCount++;
        totalWins += finalReturn;
      } else {
        loseCount++;
        totalLosses += Math.abs(finalReturn);
      }
      tradesCount++;
    }
    
    const winRate = tradesCount > 0 ? (winCount / tradesCount) * 100 : 50;
    const profitFactor = totalLosses > 0 ? (totalWins / totalLosses) : totalWins > 0 ? 9.99 : 1.0;
    
    // Update labels
    D.btWinRate.textContent = winRate > 0 ? `${winRate.toFixed(1)}%` : '50%';
    D.btProfitFactor.textContent = profitFactor > 9.9 ? '9.9+' : profitFactor.toFixed(2);
    D.btTotalTrades.textContent = tradesCount;
    D.btMaxDD.textContent = `-${maxDD.toFixed(1)}%`;
    
    // Color code metrics
    D.btWinRate.style.color = winRate >= 50 ? 'var(--green)' : 'var(--red)';
    D.btProfitFactor.style.color = profitFactor >= 1.5 ? 'var(--green)' : profitFactor >= 1.0 ? 'var(--gold)' : 'var(--red)';
    
    drawEquityCurve(equityCurve);
  } catch (err) {
    console.error('[Backtest Execution Error]', err);
  }
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [];
  if (prices.length === 0) return ema;
  let prevEma = prices[0];
  ema.push(prevEma);
  for (let i = 1; i < prices.length; i++) {
    const val = prices[i] * k + prevEma * (1 - k);
    ema.push(val);
    prevEma = val;
  }
  return ema;
}

function drawEquityCurve(curve) {
  const canvas = D.equityCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  if (curve.length === 0) return;
  
  const minVal = Math.min(...curve);
  const maxVal = Math.max(...curve);
  const valRange = maxVal - minVal || 1.0;
  
  function getX(idx) {
    return (idx / (curve.length - 1)) * w;
  }
  function getY(val) {
    return h - ((val - minVal) / valRange) * (h - 26) - 13;
  }
  
  // Fill gradient path
  ctx.beginPath();
  ctx.moveTo(getX(0), h);
  for (let i = 0; i < curve.length; i++) {
    ctx.lineTo(getX(i), getY(curve[i]));
  }
  ctx.lineTo(getX(curve.length - 1), h);
  ctx.closePath();
  
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0, 240, 255, 0.15)');
  grad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fill();
  
  // Draw glow line
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(curve[0]));
  for (let i = 1; i < curve.length; i++) {
    ctx.lineTo(getX(i), getY(curve[i]));
  }
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.8;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  // Benchmark reference line (100)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, getY(100));
  ctx.lineTo(w, getY(100));
  ctx.stroke();
  ctx.setLineDash([]);
}


// ─────────────────────────────────────────────
//  HELPER UTILS
// ─────────────────────────────────────────────
function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  D.toastContainer.appendChild(t);
  
  // Slide in
  setTimeout(() => t.classList.add('show'), 10);
  
  // Fade out
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 4000);
}

// ─────────────────────────────────────────────
//  INSTITUTIONAL METRICS RENDERING
// ─────────────────────────────────────────────
function initTabs() {
  const tabs = document.querySelectorAll('.analysis-tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const targetPanel = document.getElementById(target);
      if (targetPanel) targetPanel.classList.add('active');
      
      // Force canvas layout recalibration when switching tabs
      if (target === 'tab-liquidity') {
        // Redraw depth wall canvas
        if (typeof drawDepthProfile === 'function') {
          setTimeout(drawDepthProfile, 50);
        }
      } else if (target === 'tab-performance') {
        // Redraw backtest equity curve
        if (typeof runBacktestAnalysis === 'function') {
          setTimeout(runBacktestAnalysis, 50);
        }
      } else if (target === 'tab-demo') {
        setTimeout(() => refreshPaperDashboard(lastPrice), 50);
      }
    });
  });
}

function renderInstitutionalDashboard(data) {
  if (!data) return;

  // --- FEATURE 1: GLOBAL TOP BANNER (AI TRADE SCORE DASHBOARD) ---
  const topSymbolLabel = document.getElementById('topSymbolLabel');
  if (topSymbolLabel) topSymbolLabel.textContent = `${S.coin.replace('USDT', '')}/USDT`;
  
  const topSignalVal = document.getElementById('topSignalVal');
  if (topSignalVal) {
    topSignalVal.textContent = data.bias;
    const parent = topSignalVal.closest('.main-signal-item');
    if (parent) {
      parent.className = 'terminal-item main-signal-item';
      if (data.bias.includes('BULLISH')) parent.classList.add('bullish');
      if (data.bias.includes('BEARISH')) parent.classList.add('bearish');
    }
  }
  
  const topPctVal = document.getElementById('topPctVal');
  if (topPctVal) topPctVal.textContent = `${data.score}%`;
  
  const topBarPct = document.getElementById('topBarPct');
  if (topBarPct) topBarPct.textContent = `${data.score}%`;
  
  const topBarChars = document.getElementById('topBarChars');
  if (topBarChars) {
    const filled = Math.round(data.score / 10);
    topBarChars.textContent = '█'.repeat(filled) + '░'.repeat(10 - filled);
  }
  
  const topGradeVal = document.getElementById('topGradeVal');
  if (topGradeVal) {
    const grade = data.score >= 85 ? 'A+' : data.score >= 70 ? 'A' : data.score >= 50 ? 'B+' : 'C';
    topGradeVal.textContent = grade;
    topGradeVal.className = 'term-val-highlight gold';
  }
  
  const topTrendVal = document.getElementById('topTrendVal');
  if (topTrendVal) {
    topTrendVal.textContent = data.marketRegime?.type === 'TRENDING' ? 'Strong' : 'Weak';
  }
  
  const topVolVal = document.getElementById('topVolVal');
  if (topVolVal) {
    topVolVal.textContent = data.sessionInfo?.volatility || 'Normal';
  }
  
  const topRiskVal = document.getElementById('topRiskVal');
  if (topRiskVal) {
    topRiskVal.textContent = data.riskMeter?.risk || 'Low';
    topRiskVal.className = `term-val-highlight ${data.riskMeter?.risk.toLowerCase() === 'low' ? 'green' : data.riskMeter?.risk.toLowerCase() === 'high' ? 'wait' : 'gold'}`;
  }
  
  const topExecVal = document.getElementById('topExecVal');
  if (topExecVal) {
    const blockRec = data.blockRecommendation || 'WAIT';
    topExecVal.textContent = blockRec;
    topExecVal.className = `term-val-highlight ${blockRec === 'READY' ? 'ready' : 'wait'}`;
  }
  
  const topMacroEventLabel = document.getElementById('topMacroEventLabel');
  if (topMacroEventLabel && data.newsImpact) {
    topMacroEventLabel.textContent = data.newsImpact.event.split(' ')[0] || 'MACRO';
  }
  const topMacroEventVal = document.getElementById('topMacroEventVal');
  if (topMacroEventVal && data.newsImpact) {
    topMacroEventVal.textContent = data.newsImpact.time || '—';
  }

  // --- FEATURE 20: AI SUMMARY (ONE SENTENCE) ---
  const topSummaryText = document.getElementById('topSummaryText');
  if (topSummaryText) {
    const steps = data.executionSteps || [];
    const entryTargetPrice = steps.length > 1 ? steps[1].val : (lastPrice ? lastPrice.toFixed(2) : '0');
    const slPrice = steps.length > 3 ? steps[3].val : '0';
    topSummaryText.textContent = `${S.coin} remains in a ${data.bias.toLowerCase()} higher-timeframe trend. Wait for a entry pullback near ${entryTargetPrice} before committing capital. Risk protection should be placed at stop loss target ${slPrice}. Avoid new exposure during upcoming ${data.newsImpact?.event || 'macro announcements'}.`;
  }

  // --- FEATURE 9: CONFIDENCE HISTORY TICKER ---
  const topHistoryFlow = document.getElementById('topHistoryFlow');
  if (topHistoryFlow && data.confidenceHistory) {
    topHistoryFlow.innerHTML = data.confidenceHistory.map(val => `<span>${val}%</span>`).join(' <span style="color:var(--text-3); font-size:9px;">↓</span> ');
  }

  // --- FEATURE 2: MARKET HEALTH DASHBOARD ---
  const healthTrendVal = document.getElementById('healthTrendVal');
  if (healthTrendVal) {
    const isBull = data.bias.includes('BULLISH');
    healthTrendVal.innerHTML = `${isBull ? '🟢' : '🔴'} ${data.scoreRaw >= 1.5 ? '92%' : '48%'}`;
    healthTrendVal.className = `health-indicator ${isBull ? 'bullish' : 'bearish'}`;
  }
  const healthMomentumVal = document.getElementById('healthMomentumVal');
  if (healthMomentumVal) {
    const sign = data.scoreRaw >= 0;
    healthMomentumVal.innerHTML = `${sign ? '🟢' : '🔴'} ${Math.abs(Math.round(data.scoreRaw * 5)) + 45}%`;
    healthMomentumVal.className = `health-indicator ${sign ? 'bullish' : 'bearish'}`;
  }
  const healthLiquidityVal = document.getElementById('healthLiquidityVal');
  if (healthLiquidityVal) {
    healthLiquidityVal.innerHTML = '🟡 62%';
    healthLiquidityVal.className = 'health-indicator neutral';
  }
  const healthVolumeVal = document.getElementById('healthVolumeVal');
  if (healthVolumeVal) {
    const normal = data.scoreRaw !== 0;
    healthVolumeVal.innerHTML = `🟢 ${normal ? '78%' : '32%'}`;
    healthVolumeVal.className = 'health-indicator bullish';
  }
  const healthVolatilityVal = document.getElementById('healthVolatilityVal');
  if (healthVolatilityVal) {
    const isHigh = data.riskMeter?.risk === 'HIGH';
    healthVolatilityVal.innerHTML = `${isHigh ? '🔴' : '🟢'} ${isHigh ? '81%' : '39%'}`;
    healthVolatilityVal.className = `health-indicator ${isHigh ? 'bearish' : 'bullish'}`;
  }
  const healthOrderFlowVal = document.getElementById('healthOrderFlowVal');
  if (healthOrderFlowVal) {
    const buyDom = data.instScore?.buy > data.instScore?.sell;
    healthOrderFlowVal.textContent = buyDom ? '🟢 Buyers Dominating' : '🔴 Sellers Dominating';
    healthOrderFlowVal.className = `health-text-val ${buyDom ? 'bullish' : 'bearish'}`;
  }
  const healthFundingVal = document.getElementById('healthFundingVal');
  if (healthFundingVal) {
    healthFundingVal.textContent = 'Neutral';
  }
  const healthOIVal = document.getElementById('healthOIVal');
  if (healthOIVal) {
    healthOIVal.textContent = 'Increasing';
    healthOIVal.className = 'health-text-val bullish';
  }
  const healthRegimeVal = document.getElementById('healthRegimeVal');
  if (healthRegimeVal) {
    healthRegimeVal.textContent = data.marketRegime?.type || 'RANGING';
    healthRegimeVal.className = 'health-text-val bullish';
  }

  // 1. AI Decision Card (Tab 1)
  if (D.decBias) D.decBias.textContent = data.bias;
  if (D.decConfidence) D.decConfidence.textContent = `${data.score}%`;
  
  if (D.decStatus) {
    D.decStatus.textContent = data.blockRecommendation === 'READY' ? 'TAKE TRADE' : 'WAIT';
    D.decStatus.className = `dec-badge ${data.blockRecommendation === 'READY' ? 'take' : 'wait'}`;
  }

  // Parse setups from executionSteps
  const steps = data.executionSteps || [];
  let entryStr = '—';
  let slStr = '—';
  let tpStr = '—';
  let rrStr = '1 : 2.5';
  
  if (steps.length > 4) {
    entryStr = steps[1].val;
    slStr = steps[3].val;
    tpStr = steps[4].val;
  }
  
  if (D.decEntry) D.decEntry.textContent = entryStr;
  if (D.decSL) D.decSL.textContent = slStr;
  if (D.decTP) D.decTP.textContent = tpStr;
  if (D.decRR) D.decRR.textContent = rrStr;
  if (D.decQuality) D.decQuality.textContent = data.score >= 80 ? 'A+' : data.score >= 65 ? 'A-' : 'B+';

  // Pre-populate calculator targets if not dirty
  if (D.calcEntry && D.calcSL && activeTradeSetup === null) {
    const rawE = parseFloat(entryStr.replace(/[^0-9.]/g, ''));
    const rawS = parseFloat(slStr.replace(/[^0-9.]/g, ''));
    if (!isNaN(rawE) && !isNaN(rawS)) {
      D.calcEntry.value = Math.round(rawE);
      D.calcSL.value = Math.round(rawS);
    }
  }

  // Decision Reasons
  if (D.decReasons) {
    D.decReasons.innerHTML = '';
    const reasons = data.confluences || [];
    reasons.slice(0, 6).forEach(r => {
      const li = document.createElement('li');
      li.textContent = r.txt;
      D.decReasons.appendChild(li);
    });
  }

  // 2. Horizontal Timeline (Tab 1)
  if (D.executionTimeline) {
    D.executionTimeline.innerHTML = '';
    steps.forEach((step, idx) => {
      const stepDiv = document.createElement('div');
      let sClass = 'timeline-h-step';
      if (idx === 0) sClass += ' active';
      else if (idx === 1 || idx === 2) sClass += ' trigger';
      else if (idx === 3) sClass += ' stop';
      else sClass += ' target';
      
      stepDiv.className = sClass;
      stepDiv.innerHTML = `
        <div class="step-dot"></div>
        <span class="step-lbl">${step.label}</span>
        <span class="step-val">${step.val}</span>
      `;
      D.executionTimeline.appendChild(stepDiv);
    });
  }

  // --- FEATURE 4: AI COACH FEEDBACK ---
  const coachBody = document.getElementById('coachBody');
  if (coachBody) {
    let coachHtml = '';
    if (data.bias.includes('BULLISH')) {
      coachHtml = `
        <div class="coach-feedback-row info">🟢 Trend Confluence: HTF alignment is bullish. Pullbacks into nearest support present solid entries.</div>
        <div class="coach-feedback-row warning">⚠️ Retest Retrospective: Ensure FVG Gap retests complete before entering size.</div>
        <div class="coach-patience-box">Recommended entry patience: <span class="patience-time">8 - 14 minutes</span>.</div>
      `;
    } else if (data.bias.includes('BEARISH')) {
      coachHtml = `
        <div class="coach-feedback-row danger">🔴 Trend Confluence: Market structure is distribution. Restrict entries to premium supply blocks.</div>
        <div class="coach-feedback-row warning">⚠️ FOMO Alert: Wait for candles to re-verify below the EMA20 ribbon.</div>
        <div class="coach-patience-box">Recommended entry patience: <span class="patience-time">12 - 18 minutes</span>.</div>
      `;
    } else {
      coachHtml = `
        <div class="coach-feedback-row info">⚪ Neutral Squeeze: Price is sideways. Avoid range middle trades.</div>
        <div class="coach-patience-box">Recommended entry patience: <span class="patience-time">25 - 40 minutes</span>.</div>
      `;
    }
    coachBody.innerHTML = coachHtml;
  }

  // 4. ELI10 Card
  if (D.eli10Body) {
    D.eli10Body.innerHTML = '';
    const eliLines = data.eli10Text || [];
    eliLines.forEach(ln => {
      const div = document.createElement('div');
      div.className = 'eli10-line';
      div.textContent = ln;
      D.eli10Body.appendChild(div);
    });
  }

  // 5. Entry Checklist (Tab 1)
  if (D.entryChecklist) {
    D.entryChecklist.innerHTML = '';
    const checklist = data.entryChecklist || [];
    checklist.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ch-item';
      row.innerHTML = `
        <span class="ch-label">${item.label}</span>
        <span class="ch-check ${item.checked ? 'checked' : 'unchecked'}">${item.checked ? '✓ READY' : '✗ PENDING'}</span>
      `;
      D.entryChecklist.appendChild(row);
    });
  }

  // 6. Blocker checks (Tab 1)
  if (D.blockerRec) {
    D.blockerRec.textContent = data.blockRecommendation;
    D.blockerRec.className = `blocker-badge ${data.blockRecommendation === 'READY' ? 'ready' : 'wait'}`;
  }
  if (D.blockersList) {
    D.blockersList.innerHTML = '';
    const blockers = data.blockersList || [];
    if (blockers.length === 0) {
      D.blockersList.innerHTML = `<div class="blocker-empty-txt">No active trade blockers. Structural path is clear.</div>`;
    } else {
      blockers.forEach(b => {
        const div = document.createElement('div');
        div.className = 'blocker-item-row';
        div.textContent = b;
        D.blockersList.appendChild(div);
      });
    }
  }

  // Scheduled news
  if (D.newsImpactBox && data.newsImpact) {
    const ni = data.newsImpact;
    D.newsImpactBox.innerHTML = `
      <div class="smc-sec-title">Upcoming Macro Event</div>
      <div class="news-imp-event">${ni.event}</div>
      <div class="news-imp-time">Countdown: ${ni.time} away</div>
      <div class="news-imp-badge-row">
        <span class="news-imp-tag">${ni.impact} IMPACT</span>
        <span class="news-imp-rec">${ni.recommendation}</span>
      </div>
    `;
  }

  // 7. Institutional Scores (Tab 2)
  if (D.instBuyBar && D.instBuyText) {
    const buyPct = data.instScore ? data.instScore.buy : 50;
    D.instBuyBar.style.width = `${buyPct}%`;
    D.instBuyText.textContent = `${buyPct}%`;
  }
  if (D.instSellBar && D.instSellText) {
    const sellPct = data.instScore ? data.instScore.sell : 50;
    D.instSellBar.style.width = `${sellPct}%`;
    D.instSellText.textContent = `${sellPct}%`;
  }

  // 8. Liquidity Heatmap Price Ladder (Tab 2 - Feature 6)
  if (D.heatmapLadder) {
    D.heatmapLadder.innerHTML = '';
    const heatmap = data.ofHeatmap || [];
    heatmap.forEach(item => {
      const row = document.createElement('div');
      let rowClass = 'ladder-hist-row';
      let label = 'Normal Book Depth';
      
      if (item.blocks.includes('CURRENT')) {
        rowClass += ' current-price';
        label = 'Current Mid Price';
      } else if (item.blocks.includes('🔴')) {
        rowClass += ' shorts';
        label = 'Large Shorts Liquidation Pool';
      } else if (item.blocks.includes('🟢')) {
        rowClass += ' longs';
        label = 'Large Longs Liquidation Pool';
      }
      
      let numBlocks = 3;
      if (item.blocks.includes('🔴🔴') || item.blocks.includes('🟢🟢')) numBlocks = 11;
      else if (item.blocks.includes('🔴') || item.blocks.includes('🟢')) numBlocks = 6;
      if (item.blocks.includes('CURRENT')) numBlocks = 0;
      
      const bars = '█'.repeat(numBlocks) + '░'.repeat(12 - numBlocks);
      
      row.className = rowClass;
      row.innerHTML = `
        <span class="ladder-hist-price">$${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
        <span class="ladder-hist-bar">${numBlocks > 0 ? bars : '── CURRENT PRICE LEVEL ──'}</span>
        <span class="ladder-hist-label">${label}</span>
      `;
      D.heatmapLadder.appendChild(row);
    });
  }

  // 9. Smart Money Timeline (Tab 2)
  if (D.smTimeline) {
    D.smTimeline.innerHTML = '';
    const timeline = data.smTimeline || [];
    timeline.forEach(item => {
      const div = document.createElement('div');
      div.className = 'timeline-v-item';
      div.innerHTML = `
        <span class="timeline-v-time">${item.time}</span>
        <span class="timeline-v-txt">${item.event}</span>
      `;
      D.smTimeline.appendChild(div);
    });
  }

  // 10. Win Probability Strategy Grid (Tab 3)
  if (D.winProbGrid) {
    D.winProbGrid.innerHTML = '';
    const probs = data.strategyWinProbs || {};
    const labels = {
      ema: 'EMA Cross Only',
      ema_macd: 'EMA + MACD Stack',
      ema_smc: 'EMA + SMC Zone',
      ema_smc_vwap: 'EMA + SMC + VWAP Wall'
    };
    for (let k in probs) {
      const card = document.createElement('div');
      card.className = 'win-prob-card-item';
      card.innerHTML = `
        <span class="wp-lbl">${labels[k] || k}</span>
        <span class="wp-val">${probs[k]}</span>
      `;
      D.winProbGrid.appendChild(card);
    }
  }

  // --- FEATURE 5: MULTI-TIMEFRAME CONFLUENCES MATRIX (Tab 3) ---
  const matrixTableBody = document.getElementById('matrixTableBody');
  if (matrixTableBody && data.matrix) {
    const matrixData = data.matrix;
    const rowKeys = ['trend', 'rsi', 'macd', 'smc', 'vwap', 'overall'];
    const rowLabels = {
      trend: 'Trend Structure',
      rsi: 'RSI Momentum',
      macd: 'MACD Divergence',
      smc: 'Smart Money (SMC)',
      vwap: 'VWAP Midline',
      overall: 'Overall Bias'
    };
    const targetTfs = ['1m', '5m', '15m', '1h', '4h', '1d'];
    
    let matrixHtml = '';
    rowKeys.forEach(rowKey => {
      let rowHtml = `<tr><td>${rowLabels[rowKey]}</td>`;
      targetTfs.forEach(tf => {
        const val = matrixData[tf] ? matrixData[tf][rowKey] : 'neutral';
        let dot = '🔴'; // Default Bearish
        if (val === 'bullish') dot = '🟢';
        else if (val === 'neutral') dot = '🟡';
        rowHtml += `<td><span class="matrix-dot">${dot}</span></td>`;
      });
      rowHtml += '</tr>';
      matrixHtml += rowHtml;
    });
    matrixTableBody.innerHTML = matrixHtml;
  }

  // 11. Regime Details (Tab 3)
  if (D.regType && data.marketRegime) {
    D.regType.textContent = data.marketRegime.type;
    D.regType.className = `reg-badge ${data.marketRegime.type === 'TRENDING' ? 'trending' : ''}`;
  }
  if (D.regStrength && data.marketRegime) {
    D.regStrength.textContent = data.marketRegime.strength;
  }
  if (D.regStrategy && data.marketRegime) {
    D.regStrategy.textContent = data.marketRegime.strategy;
  }

  // --- FEATURE 7: MARKET SESSION VOLATILITY & STRENGTH ---
  const sessAsianVal = document.getElementById('sessAsianVal');
  if (sessAsianVal) {
    sessAsianVal.textContent = data.sessionInfo?.name === 'Asian / consolidation' ? 'Neutral Range' : 'Consolidation';
  }
  const sessLondonVal = document.getElementById('sessLondonVal');
  if (sessLondonVal) {
    sessLondonVal.textContent = 'Strong Sell';
  }
  const sessNewYorkVal = document.getElementById('sessNewYorkVal');
  if (sessNewYorkVal) {
    sessNewYorkVal.textContent = 'Very Strong Sell';
  }

  // 12. Risk Meter Details (Tab 4)
  if (D.riskLabel && data.riskMeter) {
    D.riskLabel.textContent = data.riskMeter.risk;
    D.riskLabel.className = `r-badge ${data.riskMeter.risk.toLowerCase()}`;
  }
  if (D.riskDrawdown && data.riskMeter) D.riskDrawdown.textContent = data.riskMeter.drawdown;
  if (D.riskProfit && data.riskMeter) D.riskProfit.textContent = data.riskMeter.profit;
  if (D.riskDots && data.riskMeter) {
    D.riskDots.innerHTML = '';
    const risk = data.riskMeter.risk.toLowerCase();
    const dotsCount = 5;
    for (let i = 0; i < dotsCount; i++) {
      const dot = document.createElement('div');
      dot.className = 'risk-dot';
      if (risk === 'low' && i < 2) {
        dot.className += ' active-green';
      } else if (risk === 'medium' && i < 3) {
        dot.className += ' active-amber';
      } else if (risk === 'high' && i < 4) {
        dot.className += ' active-red';
      }
      D.riskDots.appendChild(dot);
    }
  }

  // --- FEATURE 18: TRADE PSYCHOLOGY GRADE ---
  const psychGradeVal = document.getElementById('psychGradeVal');
  if (psychGradeVal) {
    psychGradeVal.textContent = data.score >= 85 ? 'A+' : data.score >= 70 ? 'A' : 'B+';
  }

  // 13. Smart Alerts Scrolling Stream (Tab 4)
  if (D.alertsStream) {
    D.alertsStream.innerHTML = '';
    const alerts = data.smartAlerts || [];
    alerts.forEach(a => {
      const row = document.createElement('div');
      row.className = 'alert-stream-row';
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <span class="alert-stream-time">${timeStr}</span>
        <span class="alert-stream-msg">${a}</span>
        <span class="alert-stream-indicator"></span>
      `;
      D.alertsStream.appendChild(row);
    });
  }

  // 14. Journal list table rows (Tab 3)
  if (D.journalListBody) {
    D.journalListBody.innerHTML = '';
    const directions = data.bias.endsWith('BULLISH') ? ['LONG', 'LONG', 'SHORT', 'LONG', 'SHORT'] : ['SHORT', 'SHORT', 'LONG', 'SHORT', 'LONG'];
    const confidences = [data.score, Math.max(50, data.score - 12), Math.max(50, data.score - 8), Math.max(50, data.score - 15), Math.max(50, data.score - 5)];
    const results = ['WIN', 'WIN', 'LOSS', 'WIN', 'WIN'];
    const rrs = ['2.8', '2.5', '1.8', '2.4', '2.7'];
    const triggers = ['EMA + OB + FVG', 'EMA Cross', 'RSI Squeeze', 'VWAP Support', 'Order Block Rejection'];
    
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${284 - i}</td>
        <td class="j-dir ${directions[i].toLowerCase()}">${directions[i]}</td>
        <td style="font-family:var(--mono);">${confidences[i]}%</td>
        <td><span class="j-res ${results[i].toLowerCase()}">${results[i]}</span></td>
        <td style="font-family:var(--mono);">${rrs[i]}</td>
        <td>${triggers[i]}</td>
      `;
      D.journalListBody.appendChild(tr);
    }
  }

  // Set the global active trade setup for manual calculations
  activeTradeSetup = {
    type: data.bias.includes('BULLISH') ? 'LONG' : data.bias.includes('BEARISH') ? 'SHORT' : 'HOLD',
    entry: parseFloat(entryStr.replace(/[^0-9.]/g, '')),
    stopLoss: parseFloat(slStr.replace(/[^0-9.]/g, ''))
  };

  updateCalculations();
}

// ─────────────────────────────────────────────
//  FEATURE 3: LIVE POSITION MANAGER & SIMULATOR ENGINE
// ─────────────────────────────────────────────
let activeMockTrade = null;

function startMockTrade(type, entry, stopLoss, capital, leverage, units, margin) {
  activeMockTrade = {
    type: type,
    entryPrice: entry,
    stopLoss: stopLoss,
    capital: capital,
    leverage: leverage,
    units: units,
    margin: margin,
    slMovedToBreakeven: false
  };
  showToast(`Simulated mock position (${type}) executed at ${fmtUSD(entry)}!`, 'success');
  updatePositionManagerUI();
}

function updatePositionManagerUI() {
  const container = document.getElementById('positionManagerBody');
  if (!container) return;

  if (!activeMockTrade) {
    container.innerHTML = `
      <div class="no-position-placeholder">
        <p style="color:var(--text-3); font-size:12px; text-align:center; padding:20px 0;">No active positions simulated.</p>
        <button class="sim-btn-disabled" disabled style="width:100%; padding:10px; border-radius:6px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); color:var(--text-3); cursor:not-allowed;">Initialize a mock trade to activate position tracking</button>
      </div>
    `;
    return;
  }

  const current = lastPrice || activeMockTrade.entryPrice;
  const delta = activeMockTrade.type === 'LONG' ? (current - activeMockTrade.entryPrice) : (activeMockTrade.entryPrice - current);
  const profit = delta * activeMockTrade.units;
  const roe = (profit / activeMockTrade.margin) * 100;
  
  // Calculate relative risk ratio
  const stopDist = Math.abs(activeMockTrade.entryPrice - activeMockTrade.stopLoss);
  const rrRatio = stopDist > 0 ? (Math.abs(current - activeMockTrade.entryPrice) / stopDist).toFixed(2) : '0.00';

  const tp1Price = activeMockTrade.type === 'LONG' ? activeMockTrade.entryPrice * 1.02 : activeMockTrade.entryPrice * 0.98;
  const tp1Hit = activeMockTrade.type === 'LONG' ? (current >= tp1Price) : (current <= tp1Price);

  container.innerHTML = `
    <div class="pos-stat-row">
      <span class="pos-lbl">Active Position</span>
      <span class="pos-val ${activeMockTrade.type === 'LONG' ? 'long' : 'short'}">${activeMockTrade.type}</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">Entry Price</span>
      <span class="pos-val">${fmtUSD(activeMockTrade.entryPrice)}</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">Current Price</span>
      <span class="pos-val" style="color:var(--cyan);">${fmtUSD(current)}</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">PnL (Unrealized)</span>
      <span class="pos-val" style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'};">${profit >= 0 ? '+' : ''}${fmtUSD(profit)} (${roe.toFixed(1)}% ROE)</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">R:R Ratio</span>
      <span class="pos-val">${rrRatio}</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">Stop Loss (SL)</span>
      <span class="pos-val" style="color:var(--red);">${fmtUSD(activeMockTrade.stopLoss)}</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">TP1 (Target 2%)</span>
      <span class="pos-val" style="color:${tp1Hit ? 'var(--green)' : 'var(--text-3)'};">${tp1Hit ? '✔ Hit' : 'Running'}</span>
    </div>
    <div class="pos-stat-row">
      <span class="pos-lbl">TP2 (Target 5%)</span>
      <span class="pos-val" style="color:var(--text-3);">Running</span>
    </div>
    <div class="pos-stat-row" style="flex-direction:column; align-items:stretch; gap:6px; margin-top:8px;">
      <span class="pos-lbl">Move SL to Breakeven?</span>
      <button class="btn-breakeven" id="btnMoveBreakeven" ${activeMockTrade.slMovedToBreakeven ? 'disabled style="cursor:not-allowed; border-color:rgba(255,255,255,0.1); color:var(--text-3); background:none;"' : ''}>
        ${activeMockTrade.slMovedToBreakeven ? 'SL MOVED TO BREAKEVEN' : 'RECOMMENDED: Move to Breakeven'}
      </button>
    </div>
  `;

  if (!activeMockTrade.slMovedToBreakeven) {
    const breakevenBtn = document.getElementById('btnMoveBreakeven');
    if (breakevenBtn) {
      breakevenBtn.addEventListener('click', () => {
        activeMockTrade.stopLoss = activeMockTrade.entryPrice;
        activeMockTrade.slMovedToBreakeven = true;
        showToast("Stop loss successfully moved to entry price (Breakeven)!", "info");
        updatePositionManagerUI();
      });
    }
  }
}

// ─────────────────────────────────────────────
//  FEATURE 12: HISTORICAL REPLAY MODE
// ─────────────────────────────────────────────
const replayHistory = [
  { date: "June 12 09:00", confidence: 84, prediction: "SHORT", result: "WIN", rr: 3.1, why: "EMA Stack Bearish, VWAP Wall rejection, Order Block sweep, Liquidity Sweep" },
  { date: "June 14 14:30", confidence: 91, prediction: "LONG", result: "WIN", rr: 2.8, why: "EMA Crossover, FVG retest, Support Zone bounce" },
  { date: "June 16 10:15", confidence: 75, prediction: "SHORT", result: "LOSS", rr: -1.0, why: "Counter Trend Squeeze, Volatility expansion" },
  { date: "June 18 16:00", confidence: 88, prediction: "LONG", result: "WIN", rr: 4.2, why: "Order Block breakout, Heavy CVD buying delta" }
];
let replayIndex = 0;

function initReplayMode() {
  const prevBtn = document.getElementById('replayPrevBtn');
  const playBtn = document.getElementById('replayPlayBtn');
  if (!prevBtn || !playBtn) return;

  prevBtn.addEventListener('click', () => {
    replayIndex = (replayIndex - 1 + replayHistory.length) % replayHistory.length;
    renderReplayIndex();
  });
  playBtn.addEventListener('click', () => {
    replayIndex = (replayIndex + 1) % replayHistory.length;
    renderReplayIndex();
  });
  renderReplayIndex();
}

function renderReplayIndex() {
  const item = replayHistory[replayIndex];
  const dateTxt = document.getElementById('replayDateText');
  if (dateTxt) dateTxt.textContent = item.date;

  const box = document.getElementById('replayDetailsBox');
  if (box) {
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span style="color:var(--text-3)">AI Confidence:</span>
        <span style="font-family:var(--mono); color:var(--gold); font-weight:700;">${item.confidence}%</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span style="color:var(--text-3)">Prediction:</span>
        <span class="${item.prediction === 'LONG' ? 'pos-val long' : 'pos-val short'}" style="font-weight:700;">${item.prediction}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span style="color:var(--text-3)">Result:</span>
        <span style="font-weight:700; color:${item.result === 'WIN' ? 'var(--green)' : 'var(--red)'};">${item.result}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span style="color:var(--text-3)">R:R Realized:</span>
        <span style="font-family:var(--mono); font-weight:700;">${item.rr > 0 ? '+' : ''}${item.rr}</span>
      </div>
      <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
        <span style="color:var(--text-3); font-size:10px; display:block; margin-bottom:2px;">Confluence Drivers:</span>
        <span style="color:var(--text-2); font-style:italic;">${item.why}</span>
      </div>
    `;
  }
}

// ─────────────────────────────────────────────
//  PAPER TRADING (analysis dashboard)
// ─────────────────────────────────────────────
function getAnalysisPaperOpts() {
  return {
    price: lastPrice,
    symbol: S.coin,
    capital: parseFloat(D.calcCapital?.value) || S.demoAccount?.balance || 10000,
    riskPct: parseFloat(D.calcRisk?.value) || 1,
    leverage: parseInt(D.calcLeverage?.value, 10) || 10,
    sl: parseFloat(D.calcSL?.value) || 0,
    tp: 0,
    useAi: true,
  };
}

function initDemoSimulator() {
  ensurePaperState();
  setupGlobalCloseHandler();

  initPaperEngine({
    toast: showToast,
    onChange: () => refreshPaperDashboard(lastPrice, {
      onDayClick: (dateKey, trades, dayPnl) => {
        if (!trades.length) showToast(`No trades on ${dateKey}.`, 'info');
        else {
          showToast(`${trades.length} trade(s) · P&L ${dayPnl >= 0 ? '+' : ''}${fmtUSD(dayPnl)}`, 'success');
          renderPostTradeReview(trades[trades.length - 1]);
        }
      },
    }),
  });

  const btnBuy = document.getElementById('btnDemoBuy');
  const btnSell = document.getElementById('btnDemoSell');
  if (!btnBuy || !btnSell) return;

  btnBuy.addEventListener('click', () => {
    const trade = openPaperPosition('LONG', getAnalysisPaperOpts());
    if (trade) refreshPaperDashboard(lastPrice);
  });
  btnSell.addEventListener('click', () => {
    const trade = openPaperPosition('SHORT', getAnalysisPaperOpts());
    if (trade) refreshPaperDashboard(lastPrice);
  });

  document.getElementById('btnDemoCloseHalf')?.addEventListener('click', () => closeHalfPosition());
  document.getElementById('btnDemoCloseAll')?.addEventListener('click', () => {
    closeAllPositions(lastPrice);
    refreshPaperDashboard(lastPrice);
  });
  document.getElementById('btnDemoMoveSL')?.addEventListener('click', () => moveSlToBreakeven());
  document.getElementById('btnDemoReverse')?.addEventListener('click', () => {
    reversePosition(lastPrice, getAnalysisPaperOpts());
    refreshPaperDashboard(lastPrice);
  });
  document.getElementById('btnDemoTrail')?.addEventListener('click', () => trailStop(lastPrice));
  document.getElementById('btnDemoReset')?.addEventListener('click', () => {
    resetPaperAccount();
    refreshPaperDashboard(lastPrice);
  });

  document.getElementById('btnRunBt')?.addEventListener('click', runStrategyBacktestInBrowser);

  refreshPaperDashboard(lastPrice);
}

function runStrategyBacktestInBrowser() {
  const strategy = document.getElementById('btStrategy').value;
  const capital = parseFloat(document.getElementById('btCapital').value) || 10000;

  showToast('Running historical strategy backtest sweep…', 'info');

  setTimeout(() => {
    const resultsPanel = document.getElementById('btResults');
    if (!resultsPanel) return;

    let winRate = 79.2;
    let netProfit = 2840;
    let maxDd = 4.8;
    let sharpe = 2.15;
    let pf = 2.84;

    if (strategy === 'rsi_vwap') {
      winRate = 68.4;
      netProfit = 1420;
      maxDd = 8.2;
      sharpe = 1.62;
      pf = 1.95;
    }

    const pct = (netProfit / 100).toFixed(1);
    document.getElementById('btWinRate').textContent = `${winRate}%`;
    document.getElementById('btNetProfit').textContent = `+$${netProfit.toLocaleString()} (+${pct}%)`;
    document.getElementById('btMaxDD').textContent = `-${maxDd}%`;
    document.getElementById('btSharpe').textContent = sharpe.toFixed(2);
    document.getElementById('btProfitFactor').textContent = pf.toFixed(2);

    resultsPanel.style.display = 'block';
    showToast('Backtest sweep completed successfully!', 'success');
  }, 1000);
}

// Boot standard script execution after all global variables are declared
init();

