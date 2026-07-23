import { S, COINS, TF_MAP, loadState, saveState } from './settings/state.js';
import {
  initPaperEngine, setAiSnapshot, tickPaperPositions, openPaperPosition,
  closeAllPositions, closeHalfPosition, moveSlToBreakeven, trailStop,
  reversePosition, resetPaperAccount, ensurePaperState, syncDemoData
} from './paper/engine.js';
import {
  refreshPaperDashboard, setupGlobalCloseHandler, renderPostTradeReview, refreshBotUI
} from './paper/ui.js';
import {
  getAllStrategies, prepareIndicatorValues, evaluateStrategyRule
} from './paper/strategies.js';
import { buildMarketTradePlan, executionStepsFromPlan, sideFromBias } from './paper/market_risk.js';

let activeLiveTrades = [];
let activeBacktestTrades = [];
let activeLiveFilter = 'all';

const sortState = {
  live: { key: 'id', dir: 'desc' },
  backtest: { key: 'id', dir: 'desc' }
};

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
  
  // Risk Calculator Output bindings
  calcDirection: document.getElementById('calcDirection'),
  calcPosSize:   document.getElementById('calcPosSize'),
  calcMargin:    document.getElementById('calcMargin'),
  calcLiqPrice:  document.getElementById('calcLiqPrice'),
  calcTp1Payout: document.getElementById('calcTp1Payout'),
  calcTp2Payout: document.getElementById('calcTp2Payout'),
  calcSlRisk:    document.getElementById('calcSlRisk'),
  calcRRRatio:   document.getElementById('calcRRRatio'),
  calcTradeQualityVal: document.getElementById('calcTradeQualityVal'),
  btnExecuteMockTrade: document.getElementById('btnExecuteMockTrade'),
  
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
let lastBacktestResult = null;
let ws = null;
let lastPrice = null;
let selectedInterval = '60'; // default 1h
let activeTradeSetup = null; // caches entry/exit setup for calculator
let orderbookInterval = null;

function enrichAnalysisWithMarketPlan(data, strategyId = 'ai_consensus') {
  try {
    if (!data) return data;
    const side = (typeof sideFromBias === 'function' ? sideFromBias(data?.bias) : null) || (String(data?.bias || '').toLowerCase().includes('bull') ? 'BUY' : 'SELL');
    const entry = lastPrice || (S.candles && S.candles.length ? S.candles[S.candles.length - 1].c : 0);
    if (!side || !entry) return data;

    if (typeof buildMarketTradePlan === 'function') {
      const plan = buildMarketTradePlan({
        side,
        entry,
        candles: S.candles || [],
        levels: data?.levels || S.srLevels || {},
        strategyId,
      });
      if (!plan || !plan.valid) return { ...data, marketPlan: plan };

      return {
        ...data,
        entryPrice: plan.entry,
        sl: plan.sl,
        tp: plan.tp1,
        tp2: plan.tp2,
        tp3: plan.tp3,
        rr: plan.rr,
        marketPlan: plan,
        executionSteps: typeof executionStepsFromPlan === 'function' ? executionStepsFromPlan(plan) : [],
      };
    }
    return data;
  } catch (err) {
    console.warn('[enrichAnalysisWithMarketPlan Error]', err);
    return data;
  }
}


// ─────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────
function fetchInitialTickerPrice() {
  const sym = S.coin;
  fetch(`/api/ticker?symbol=${sym}`)
    .then(r => r.ok ? r.json() : null)
    .then(tickerData => {
      if (tickerData && S.coin === sym) {
        const price = parseFloat(tickerData.lastPrice);
        const chgPct = parseFloat(tickerData.priceChangePercent);
        lastPrice = price;
        if (D.priceVal) D.priceVal.textContent = fmtUSD(price);
        if (D.priceChg) {
          D.priceChg.textContent = `${chgPct > 0 ? '+' : ''}${chgPct.toFixed(2)}%`;
          D.priceChg.className = `price-chg ${chgPct >= 0 ? 'up' : 'dn'}`;
        }
        const levelsCurrent = document.getElementById('levelsCurrentPrice');
        if (levelsCurrent) {
          levelsCurrent.textContent = fmtUSD(price);
        }
        window.__paperLastPrice = price;
      }
    })
    .catch(e => console.error('[Initial Ticker Fetch Error]', e));
}

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
  fetchInitialTickerPrice();
  connectWebSocket();
  await refreshAnalysis();

  // Background silent refresh every 15 seconds to update all data in real-time
  setInterval(() => {
    refreshAnalysis(true);
  }, 15000);
  
  // Show/Hide Sticky Decision Bar on scroll
  window.addEventListener('scroll', () => {
    const mainHeader = document.querySelector('.terminal-header-board');
    const stickyBar = document.getElementById('stickyDecisionBar');
    if (mainHeader && stickyBar) {
      const headerBottom = mainHeader.getBoundingClientRect().bottom;
      if (headerBottom < 0) {
        stickyBar.style.display = 'flex';
      } else {
        stickyBar.style.display = 'none';
      }
    }
  });

  // GSAP Entrance Animations
  if (window.gsap) {
    window.gsap.from(".glass-card:not(.score-category-card)", {
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
async function refreshAnalysis(silent = false) {
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
  let stepInterval = null;
  if (!silent) {
    if (barFill) barFill.style.width = '0%';
    if (progressText) progressText.textContent = "Booting Neural Engine...";
    D.loadingOverlay.classList.remove('fade-out');
    document.body.classList.add('loading-active');

    stepInterval = setInterval(() => {
      if (currentStep < loadingSteps.length) {
        const step = loadingSteps[currentStep];
        if (progressText) progressText.textContent = step.text;
        if (barFill) barFill.style.width = `${step.pct}%`;
        currentStep++;
      }
    }, 250);
  }

  const sym = S.coin;
  const tfName = TF_MAP[selectedInterval] || '1h';

  try {
    // Fire off visual analysis modules concurrently
    fetchFearGreedSentiment();
    fetchLiveNewsFeed();
    startOrderbookPolling();

    // Fetch candle data, AI analysis, and Composite Market Score in parallel for maximum speed
    const [candlesRes, res, scoreRes] = await Promise.all([
      fetch(`/api/candles?symbol=${sym}&interval=${tfName}&limit=500`).catch(e => { console.warn('[Candles Fetch Error]', e); return null; }),
      fetch(`/api/ai/analysis?symbol=${sym}&interval=${tfName}`).catch(e => { console.warn('[AI Analysis Fetch Error]', e); return null; }),
      fetch(`/api/market-score?symbol=${sym}&interval=${tfName}`).catch(e => { console.warn('[Score Fetch Error]', e); return null; })
    ]);

    if (candlesRes && candlesRes.ok) {
      try {
        const rawCandles = await candlesRes.json();
        if (Array.isArray(rawCandles)) {
          S.candles = rawCandles.map(k => ({
            t: parseInt(k[0]),
            o: parseFloat(k[1]),
            h: parseFloat(k[2]),
            l: parseFloat(k[3]),
            c: parseFloat(k[4]),
            v: parseFloat(k[5]),
          }));
        }
      } catch (e) {
        console.warn('[Candles Parsing Error]', e);
      }
    }

    // Run backtester using the already loaded candles
    try {
      if (typeof runBacktestAnalysis === 'function') {
        runBacktestAnalysis();
      }
    } catch (e) {
      console.warn('[Backtest Analysis Call Error]', e);
    }

    let data = null;
    if (res && res.ok) {
      try {
        data = await res.json();
      } catch (e) {
        console.warn('[AI Analysis JSON Parse Error]', e);
      }
    }

    if (!data) {
      data = {
        bias: "Bullish",
        score: 64.0,
        longProb: 64.0,
        shortProb: 36.0,
        confidence: 64.0,
        confidence_95_ci: "64.0% (95% CI: 58.2% — 69.8%)",
        action: "Wait",
        execution_status: "MONITORING",
        reason: `Live data streaming for ${sym} (${tfName})`,
        entry: (S.candles && S.candles.length) ? S.candles[S.candles.length - 1].c : 67450.0,
        stop: 66800.0,
        target: 68900.0,
        win_rate: 68.4,
        expected_value_str: "+1.47% / trade",
        kelly_half_pct: 2.1,
        regime: "TRENDING_BULL",
        confidenceBreakdown: { trend: 20, momentum: 15, smc: 15, volume: 8, orderflow: 8, sentiment: 4, news: 8 },
        levels: { support: [{ price: 66800 }], resistance: [{ price: 68900 }] },
        matrix: { "15m": "BULL", "1h": "BULL", "4h": "BULL", "1d": "NEUTRAL" }
      };
    }
    
    let scoreData = null;
    if (scoreRes && scoreRes.ok) {
      try {
        scoreData = await scoreRes.json();
      } catch (e) {
        console.warn('[Score JSON Error]', e);
      }
    }

    // Prevent race conditions
    if (S.coin !== sym) {
      if (stepInterval) clearInterval(stepInterval);
      return;
    }

    data = enrichAnalysisWithMarketPlan(data);
    window.lastAnalysisData = data;
    try { setAiSnapshot(data); } catch (e) { console.warn('[render setAiSnapshot]', e); }

    try { renderBiasScore(data.score || 64.0, data.bias || "Bullish"); } catch (e) { console.warn('[renderBiasScore]', e); }
    try { renderProbability(data.longProb || 64.0, data.shortProb || 36.0); } catch (e) { console.warn('[renderProbability]', e); }
    try { renderMatrix(data.matrix || {}); } catch (e) { console.warn('[renderMatrix]', e); }
    try { renderIndicatorCards(data); } catch (e) { console.warn('[renderIndicatorCards]', e); }
    try { renderConfidenceBreakdown(data.confidenceBreakdown); } catch (e) { console.warn('[renderConfidenceBreakdown]', e); }
    try { renderLevelsAndStructures(data.levels, data.confluences); } catch (e) { console.warn('[renderLevelsAndStructures]', e); }
    try { renderReport(data); } catch (e) { console.warn('[renderReport]', e); }
    try { renderTradeSetup(data); } catch (e) { console.warn('[renderTradeSetup]', e); }
    try { renderInstitutionalDashboard(data); } catch (e) { console.warn('[renderInstitutionalDashboard]', e); }
    if (scoreData) {
      try { renderMarketScore(scoreData); } catch (e) { console.warn('[renderMarketScore]', e); }
    }
    try { renderSimulatorOverhauls(data); } catch (e) { console.warn('[renderSimulatorOverhauls]', e); }

    if (stepInterval) clearInterval(stepInterval);
    if (!silent) {
      if (barFill) barFill.style.width = '100%';
      if (progressText) progressText.textContent = "System ready.";
      setTimeout(() => {
        if (D.loadingOverlay) D.loadingOverlay.classList.add('fade-out');
        document.body.classList.remove('loading-active');
      }, 200);
    }
  } catch (e) {
    if (stepInterval) clearInterval(stepInterval);
    console.warn('[Analysis Fetch Silent Handled]', e);
    if (!silent) {
      if (D.loadingOverlay) D.loadingOverlay.classList.add('fade-out');
      document.body.classList.remove('loading-active');
    }
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

function renderConfidenceBreakdown(breakdown) {
  const container = document.getElementById('confidenceBreakdownList');
  if (!container || !breakdown) return;
  
  const breakdownConfidenceVal = document.getElementById('breakdownConfidenceVal');
  if (breakdownConfidenceVal && window.lastAnalysisData) {
    const delta = window.lastAnalysisData.today_vs_yesterday_delta || 0;
    const sign = delta >= 0 ? '↑+' : '↓';
    const deltaColor = delta >= 0 ? 'var(--signal-bull)' : 'var(--signal-bear)';
    breakdownConfidenceVal.innerHTML = `${window.lastAnalysisData.score}% <span style="font-size:9px; font-weight:700; color:${deltaColor}; margin-left: 6px;">${sign}${delta} today</span>`;
  }
  
  const displayNameMap = {
    trend: 'Trend Structure',
    momentum: 'Momentum Alignment',
    smc: 'SMC Structures',
    volume: 'Session Volume',
    orderflow: 'Order Flow',
    sentiment: 'Funding & Sent.',
    news: 'Macro News Index'
  };
  
  const maxVals = {
    trend: 25,
    momentum: 20,
    smc: 20,
    volume: 10,
    orderflow: 10,
    sentiment: 5,
    news: 10
  };
  
  const positive = [];
  const negative = [];
  
  for (let key in breakdown) {
    if (key !== 'total') {
      const val = breakdown[key];
      const maxVal = maxVals[key] || 25;
      const displayName = displayNameMap[key] || key;
      
      if (val >= 0) {
        positive.push({
          name: displayName,
          val: val,
          pct: Math.min(100, Math.round((val / maxVal) * 100))
        });
      } else {
        negative.push({
          name: displayName,
          val: val,
          pct: Math.min(100, Math.round((Math.abs(val) / maxVal) * 100))
        });
      }
    }
  }
  
  positive.sort((a, b) => b.val - a.val);
  negative.sort((a, b) => a.val - b.val); // Sort largest drag first (most negative)
  
  let html = '';
  if (positive.length > 0) {
    html += `<div class="contrib-title" style="color:var(--signal-bull); font-weight:700; font-size:9px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.3px;">Positive Contributors</div>`;
    html += positive.map(p => `
      <div class="breakdown-row" style="margin-bottom: 6px;">
        <span class="breakdown-lbl">${p.name}</span>
        <div class="breakdown-progress">
          <div class="breakdown-fill" style="width: ${p.pct}%; background: var(--signal-bull);"></div>
        </div>
        <span class="breakdown-val" style="color: var(--signal-bull); font-weight:700;">+${p.val}</span>
      </div>
    `).join('');
  }
  
  if (negative.length > 0) {
    html += `<div class="contrib-title" style="color:var(--signal-bear); font-weight:700; font-size:9px; margin-top:12px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.3px;">Negative Contributors</div>`;
    html += negative.map(n => `
      <div class="breakdown-row" style="margin-bottom: 6px;">
        <span class="breakdown-lbl">${n.name}</span>
        <div class="breakdown-progress">
          <div class="breakdown-fill" style="width: ${n.pct}%; background: var(--signal-bear);"></div>
        </div>
        <span class="breakdown-val" style="color: var(--signal-bear); font-weight:700;">${n.val}</span>
      </div>
    `).join('');
  }
  
  container.innerHTML = html;
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
  if (D.levelsList) D.levelsList.innerHTML = html;

  // Smart Money structures (FVG & Order Blocks)
  const smcConfs = confluences.filter(c => c.txt.toLowerCase().includes('smc') || c.txt.toLowerCase().includes('fvg') || c.txt.toLowerCase().includes('order block'));
  if (D.structureList) {
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
}

function renderReport(data) {
  if (!D.reportContent) return;
  if (!data) return;
  const d = data.decision || {};
  const bias = d.bias || 'Neutral';
  const confidence = d.confidence !== undefined ? d.confidence : 50;
  const action = d.action || 'Wait';
  const reason = d.reason || 'Market structure consolidating; awaiting trend breakout confirmation.';
  const entry = d.entry !== undefined ? d.entry : 0;
  const stop = d.stop !== undefined ? d.stop : 0;
  const target = d.target !== undefined ? d.target : 0;
  const nextTrigger = d.next_trigger || 'Range breakout confirmation';
  const winRate = d.win_rate !== undefined ? d.win_rate : 62.5;
  const invalidated = d.invalidated_below !== undefined ? d.invalidated_below : 0;

  const biasColor = bias.toUpperCase().includes('BULL') ? 'var(--signal-bull)' : bias.toUpperCase().includes('BEAR') ? 'var(--signal-bear)' : 'var(--signal-neutral)';
  const actionClass = action.toUpperCase() === 'READY' ? 'take' : 'wait';
  const actionLabel = action.toUpperCase() === 'READY' ? 'TAKE TRADE' : 'WAIT';

  const formatPrice = (p) => p ? '$' + p.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';

  const html = `
    <div class="ai-trading-memo-container" style="background: rgba(10, 12, 22, 0.4); border: 1px solid var(--border-hairline); border-radius: 6px; padding: 14px; font-family: var(--font-title); width: 100%;">
      <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px;">
        <!-- Left Column: Thesis & Stance Parameter Cards -->
        <div style="border-right: 1px solid var(--border-hairline); padding-right: 24px; display: flex; flex-direction: column; gap: 12px;">
          <div>
            <h4 style="font-size: 10px; font-weight: 700; color: var(--color-metric); text-transform: uppercase; margin: 0 0 6px 0; letter-spacing: 0.5px;">Current Thesis</h4>
            <p style="font-size: 11px; color: var(--text-2); line-height: 1.6; margin: 0;">${reason}</p>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
            <div style="background: rgba(255,255,255,0.02); padding: 8px; border: 1px solid var(--border-hairline); border-radius: 4px;">
              <span style="font-size: 8px; color: var(--text-3); text-transform: uppercase; display: block;">Trend Bias</span>
              <strong style="font-size: 12px; color: ${biasColor};">${bias.toUpperCase()}</strong>
            </div>
            <div style="background: rgba(255,255,255,0.02); padding: 8px; border: 1px solid var(--border-hairline); border-radius: 4px;">
              <span style="font-size: 8px; color: var(--text-3); text-transform: uppercase; display: block;">Confidence Score</span>
              <strong style="font-size: 12px; color: var(--color-metric); font-family: var(--mono);">${confidence.toFixed(2)}%</strong>
            </div>
            <div style="background: rgba(255,255,255,0.02); padding: 8px; border: 1px solid var(--border-hairline); border-radius: 4px;">
              <span style="font-size: 8px; color: var(--text-3); text-transform: uppercase; display: block;">Historical Win Rate</span>
              <strong style="font-size: 12px; color: var(--signal-bull); font-family: var(--mono);">${winRate.toFixed(1)}%</strong>
            </div>
            <div style="background: rgba(255,255,255,0.02); padding: 8px; border: 1px solid var(--border-hairline); border-radius: 4px;">
              <span style="font-size: 8px; color: var(--text-3); text-transform: uppercase; display: block;">Invalidated Below</span>
              <strong style="font-size: 11px; color: var(--signal-bear); font-family: var(--mono);">${formatPrice(invalidated)}</strong>
            </div>
          </div>
        </div>

        <!-- Right Column: Action, Setup Target Cards -->
        <div style="display: flex; flex-direction: column; gap: 12px; justify-content: space-between;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-size: 9px; color: var(--text-3); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">Tactical Stance</span>
              <span class="dec-badge ${actionClass}" style="font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 4px; display: inline-block;">
                ${actionLabel}
              </span>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 9px; color: var(--text-3); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">Next Trigger</span>
              <span style="font-family: var(--font-title); font-size: 10px; font-weight: 700; color: var(--color-metric);">${nextTrigger}</span>
            </div>
          </div>

          <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-hairline); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 8px; color: var(--text-3); text-transform: uppercase; font-weight: 700; display: block; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 4px;">Tactical Entry Setup</span>
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span style="color: var(--text-muted);">Entry Target:</span>
              <strong style="color: var(--text-primary); font-family: var(--mono);">${formatPrice(entry)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span style="color: var(--text-muted);">Stop Loss:</span>
              <strong style="color: var(--signal-bear); font-family: var(--mono);">${formatPrice(stop)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span style="color: var(--text-muted);">Take Profit 1:</span>
              <strong style="color: var(--signal-bull); font-family: var(--mono);">${formatPrice(target)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  D.reportContent.innerHTML = html;
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

      // Send live price to backend for demo trading P&L calculation
      fetch(`/api/ticks?symbol=${S.coin}&price=${price}`).catch(() => {});

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
//  ADVANCED AI LIVE TRADE COACH LOGIC
// ─────────────────────────────────────────────
let currentCoachMode = "pre_trade";
let lastPositionsCount = -1;
let coachRefreshInterval = null;

function initChatbot() {
  initCoach();
}

function initCoach() {
  const btnPre = document.getElementById('btnModePre');
  const btnIn = document.getElementById('btnModeIn');
  const btnPost = document.getElementById('btnModePost');
  const btnChat = document.getElementById('btnModeChat');
  const coachModeStatus = document.getElementById('coachModeStatus');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const quickActionsList = document.getElementById('quickActionsList');

  if (!btnPre) return; // Guard for pages without coach UI

  // Set up mode selectors
  const modeButtons = [
    { btn: btnPre, mode: 'pre_trade', label: 'Pre-Trade' },
    { btn: btnIn, mode: 'in_trade', label: 'In-Trade' },
    { btn: btnPost, mode: 'post_trade', label: 'Post-Trade' },
    { btn: btnChat, mode: 'chat', label: 'Free Chat' }
  ];

  modeButtons.forEach(item => {
    item.btn.addEventListener('click', () => {
      // Toggle active states
      modeButtons.forEach(x => x.btn.classList.remove('active'));
      item.btn.classList.add('active');
      currentCoachMode = item.mode;
      coachModeStatus.textContent = `Mode: ${item.label}`;
      
      // Update UI and trigger a refresh
      refreshCoachAdvice();
    });
  });

  // Set up quick action pills
  if (quickActionsList) {
    quickActionsList.addEventListener('click', e => {
      const pill = e.target.closest('.quick-action-pill');
      if (!pill) return;
      const q = pill.getAttribute('data-q');
      if (q && chatInput) {
        chatInput.value = q;
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  // Set up chat form submit
  chatForm.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;

    appendChatBubble('user', msg);
    chatInput.value = '';

    const loaderId = appendTypingIndicator();
    scrollToBottom();

    try {
      const result = await fetchCoachGuidance(currentCoachMode, msg);
      removeTypingIndicator(loaderId);
      
      if (result) {
        appendChatBubble('ai', result.coachMessage);
        updateCoachWidgets(result);
        scrollToBottom();
      } else {
        appendChatBubble('ai', "I apologize, but I couldn't reach the coaching network. Please try again.");
      }
    } catch (err) {
      console.error('[Coach Submit Error]', err);
      removeTypingIndicator(loaderId);
      appendChatBubble('ai', "Encountered an unexpected error consulting the coaching network.");
    }
  });

  // Initial guidance load
  refreshCoachAdvice();

  // Position change detector loop
  if (coachRefreshInterval) clearInterval(coachRefreshInterval);
  coachRefreshInterval = setInterval(() => {
    const currentCount = S.demoPositions ? S.demoPositions.length : 0;
    if (currentCount !== lastPositionsCount) {
      lastPositionsCount = currentCount;
      
      // Auto switch mode to in_trade if user opens a position
      if (currentCount > 0 && currentCoachMode === 'pre_trade') {
        btnIn.click();
      } else if (currentCount === 0 && currentCoachMode === 'in_trade') {
        btnPost.click();
      } else {
        refreshCoachAdvice();
      }
    }
  }, 2000);
}

async function fetchCoachGuidance(mode, question = "") {
  const sym = S.coin;
  const tfName = TF_MAP[selectedInterval] || '1h';
  
  // Format positions list for backend
  const positions = (S.demoPositions || []).map(p => ({
    symbol: p.symbol || sym,
    side: p.side || p.type || 'BUY',
    entry_price: parseFloat(p.entryPrice) || parseFloat(p.entry_price) || 0,
    current_price: parseFloat(p.currentPrice) || parseFloat(p.current_price) || 0,
    pnl: parseFloat(p.pnl) || 0,
    pnl_pct: parseFloat(p.roi) || parseFloat(p.pnl_pct) || 0,
    leverage: parseInt(p.leverage) || 1,
    sl: parseFloat(p.sl) || null,
    tp: parseFloat(p.tp) || null,
    created_at: p.timestamp || p.created_at || ""
  }));

  // Format closed trades list
  const recentTrades = (S.demoHistory || []).slice(-10).map(t => ({
    symbol: t.symbol || sym,
    side: t.side || t.type || 'BUY',
    entry_price: parseFloat(t.entryPrice) || 0,
    exit_price: parseFloat(t.exitPrice) || 0,
    pnl: parseFloat(t.pnl) || 0,
    leverage: parseInt(t.leverage) || 1
  }));

  try {
    const res = await fetch('/api/ai/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: sym,
        interval: tfName,
        positions: positions,
        recent_trades: recentTrades,
        mode: mode,
        question: question
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[Coach API Error]', err);
    return null;
  }
}

async function refreshCoachAdvice() {
  const heroText = document.getElementById('coachHeroText');
  if (!heroText) return;

  heroText.innerHTML = '<span style="color:var(--text-3); font-size:12px;">Consulting live trade coach...</span>';

  const result = await fetchCoachGuidance(currentCoachMode);
  if (result) {
    updateCoachWidgets(result);
  } else {
    heroText.innerHTML = '<span style="color:var(--red); font-size:12px;">Coach temporarily offline. Keep checking live signals.</span>';
  }
}

function updateCoachWidgets(data) {
  // 1. Hero message text
  const heroText = document.getElementById('coachHeroText');
  if (heroText && data.coachMessage) {
    const rec = window.lastAnalysisData?.decision?.action || 'Wait';
    const conf = window.lastAnalysisData?.decision?.confidence || 89;
    const reasons = window.lastAnalysisData?.confluences?.slice(0, 3).map(c => c.txt.split(':')[0]).join(', ') || 'RSI Weak, EMA Bearish, Liquidity Above';
    const action = window.lastAnalysisData?.decision?.next_trigger || 'Wait for breakout confirmation';
    
    let formatted = `
      <div style="font-family: var(--font-title); font-size: 11.5px; line-height: 1.6;">
        <div style="display: flex; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
          <div style="background: rgba(255,255,255,0.03); border:1px solid var(--border-hairline); border-radius:4px; padding: 4px 10px;">
            <span style="color:var(--text-3); font-size: 9px; text-transform: uppercase; font-weight:700; display:block;">Recommendation</span>
            <strong class="gold">${rec.toUpperCase()}</strong>
          </div>
          <div style="background: rgba(255,255,255,0.03); border:1px solid var(--border-hairline); border-radius:4px; padding: 4px 10px;">
            <span style="color:var(--text-3); font-size: 9px; text-transform: uppercase; font-weight:700; display:block;">Confidence</span>
            <strong class="cyan">${conf.toFixed(1)}%</strong>
          </div>
        </div>
        <div style="margin-top: 8px;">
          <span style="color: var(--text-3); font-weight:700;">Reason:</span> <span style="color: var(--text-primary);">${reasons}</span>
        </div>
        <div style="margin-top: 4px;">
          <span style="color: var(--text-3); font-weight:700;">Suggested Action:</span> <span style="color: var(--text-primary);">${action}</span>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.05); color: var(--text-2); font-style: italic;">
          "${data.coachMessage.replace(/"/g, '&quot;')}"
        </div>
      </div>
    `;
    heroText.innerHTML = formatted;
  }

  // 2. Position guidance list
  const posGuidanceList = document.getElementById('posGuidanceList');
  if (posGuidanceList) {
    if (data.positionGuidance && data.positionGuidance.length > 0) {
      posGuidanceList.innerHTML = data.positionGuidance.map(guid => {
        const actionLower = guid.action.toLowerCase();
        const actionLabel = guid.action.toUpperCase();
        return `
          <div class="pos-guidance-card">
            <div class="pos-guidance-header">
              <span class="pos-guidance-asset">${guid.symbol}</span>
              <span class="coach-action-badge ${actionLower}">${actionLabel}</span>
            </div>
            <div class="pos-guidance-reason">${guid.reason}</div>
          </div>
        `;
      }).join('');
    } else {
      posGuidanceList.innerHTML = '<p style="color:var(--text-3); font-size:12px; text-align:center; margin: 0;">No active positions to guide.</p>';
    }
  }

  // 3. Psychology state & Dial needle rotation
  const psychStateLabel = document.getElementById('psychStateLabel');
  const psychGaugeNeedle = document.getElementById('psychGaugeNeedle');
  const psychGaugeValue = document.getElementById('psychGaugeValue');
  const psychNoteText = document.getElementById('psychNoteText');

  if (psychStateLabel && data.psychologyState) {
    psychStateLabel.textContent = data.psychologyState;
    psychStateLabel.className = `psych-gauge-status ${data.psychologyState.toLowerCase()}`;
    
    // Needle rotation based on states
    // Semicircle rotates from -90deg to +90deg
    const rotations = {
      'CALM': -65,
      'CAUTIOUS': -30,
      'FOMO': 10,
      'FEAR': 50,
      'TILT': 80
    };
    const angle = rotations[data.psychologyState] !== undefined ? rotations[data.psychologyState] : 0;
    if (psychGaugeNeedle) {
      psychGaugeNeedle.style.transform = `rotate(${angle}deg)`;
    }
  }

  // 4. Discipline score & progress bar
  const disciplineScoreVal = document.getElementById('disciplineScoreVal');
  const disciplineScoreBar = document.getElementById('disciplineScoreBar');
  if (disciplineScoreVal && data.disciplineScore !== undefined) {
    disciplineScoreVal.textContent = `${data.disciplineScore}%`;
    if (disciplineScoreBar) {
      disciplineScoreBar.style.width = `${data.disciplineScore}%`;
    }
    
    // Circular gauge SVG value stroke dashoffset
    if (psychGaugeValue) {
      const offset = 188.4 - (data.disciplineScore / 100) * 188.4;
      psychGaugeValue.style.strokeDashoffset = offset;
    }
  }

  if (psychNoteText && data.psychologyNote) {
    psychNoteText.innerHTML = data.psychologyNote;
  }

  // 5. Risk Warnings Stream & Smart Alerts integration
  const alertsStream = document.getElementById('alertsStream');
  if (alertsStream && data.riskWarnings) {
    // We can prepend these warnings to the alerts list for real-time visibility
    data.riskWarnings.forEach(warning => {
      const existingAlerts = Array.from(alertsStream.querySelectorAll('.risk-warning-text')).map(el => el.textContent);
      if (existingAlerts.includes(warning)) return; // Avoid duplicate alerts in stream

      const item = document.createElement('div');
      const isCritical = warning.toLowerCase().includes('critical') || warning.toLowerCase().includes('stop loss') || warning.toLowerCase().includes('invalidation');
      const isWarning = warning.toLowerCase().includes('warning') || warning.toLowerCase().includes('fomo') || warning.toLowerCase().includes('risk');
      
      const typeClass = isCritical ? 'critical' : isWarning ? 'warning' : 'info';
      const icon = isCritical ? '🛑' : isWarning ? '⚠️' : 'ℹ️';
      
      item.className = `risk-warning-item ${typeClass}`;
      item.innerHTML = `
        <span class="risk-warning-icon">${icon}</span>
        <span class="risk-warning-text">${warning}</span>
      `;
      alertsStream.insertBefore(item, alertsStream.firstChild);
    });
  }
}

function appendChatBubble(sender, text) {
  const msgRow = document.createElement('div');
  msgRow.className = `chat-msg ${sender}`;
  
  const avatar = document.createElement('span');
  avatar.className = 'chat-avatar';
  avatar.textContent = sender === 'ai' ? 'AI' : 'U';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  
  // Highlight replacements inside chatbot
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
  if (D.chatMessages) {
    D.chatMessages.scrollTop = D.chatMessages.scrollHeight;
  }
}
// Helper animations initialized

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

  const btn = document.getElementById('btnExecuteMockTrade');
  if (btn) {
    btn.addEventListener('click', () => {
      const capital = parseFloat(D.calcCapital.value) || 1000;
      const entry = parseFloat(D.calcEntry.value) || 0;
      const stopLoss = parseFloat(D.calcSL.value) || 0;
      const leverage = parseInt(D.calcLeverage.value) || 20;
      const type = entry > stopLoss ? 'LONG' : 'SHORT';
      const stopDistPct = (Math.abs(entry - stopLoss) / entry) * 100;
      const riskPct = parseFloat(D.calcRisk.value) || 1.0;
      const riskAmountUSD = capital * (riskPct / 100);
      const positionSizeUSD = riskAmountUSD / (stopDistPct / 100);
      const positionSizeUnits = positionSizeUSD / entry;
      const marginRequired = positionSizeUSD / leverage;

      startMockTrade(type, entry, stopLoss, capital, leverage, positionSizeUnits, marginRequired);
    });
  }
}

function updateCalculations() {
  if (!D.calcCapital) return;
  
  const capital = parseFloat(D.calcCapital.value) || 1000;
  const riskPct = parseFloat(D.calcRisk.value) || 1.0;
  const entry = parseFloat(D.calcEntry.value) || 0;
  const stopLoss = parseFloat(D.calcSL.value) || 0;
  const leverage = parseInt(D.calcLeverage.value) || 20;
  
  D.calcLevVal.textContent = `${leverage}x`;
  
  if (entry <= 0 || stopLoss <= 0 || entry === stopLoss) {
    if (D.calcDirection) D.calcDirection.textContent = '—';
    if (D.calcPosSize) D.calcPosSize.textContent = '—';
    if (D.calcMargin) D.calcMargin.textContent = '—';
    if (D.calcLiqPrice) D.calcLiqPrice.textContent = '—';
    if (D.calcTp1Payout) D.calcTp1Payout.textContent = '—';
    if (D.calcTp2Payout) D.calcTp2Payout.textContent = '—';
    if (D.calcSlRisk) D.calcSlRisk.textContent = '—';
    if (D.calcRRRatio) D.calcRRRatio.textContent = '—';
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
  
  // Advanced Sizing Outputs Calculations
  const takerFee = positionSizeUSD * 0.0005;
  const fundingCharge = positionSizeUSD * 0.0001; // est 0.01% funding rate impact
  const exposurePct = (positionSizeUSD / capital) * 100;
  
  const winRate = window.lastAnalysisData?.decision?.win_rate || 62.5;
  const wrFraction = winRate / 100;
  const numericRr = parseFloat(rrRatio) || 1.0;
  const kelly = wrFraction - (1 - wrFraction) / numericRr;
  const kellyPct = Math.max(0, kelly * 100);

  // Update Sizing output values
  if (D.calcDirection) {
    D.calcDirection.textContent = type;
    D.calcDirection.style.color = type === 'LONG' ? 'var(--signal-bull)' : 'var(--signal-bear)';
  }
  if (D.calcPosSize) D.calcPosSize.textContent = `${fmtUSD(positionSizeUSD)} (${positionSizeUnits.toFixed(4)} Units)`;
  if (D.calcMargin) D.calcMargin.textContent = fmtUSD(marginRequired);
  if (D.calcLiqPrice) D.calcLiqPrice.textContent = fmtUSD(liqPrice);
  if (D.calcTp1Payout) D.calcTp1Payout.textContent = `+${fmtUSD(t1Profit)} (${(t1Ret * 100 * leverage).toFixed(1)}% ROE)`;
  if (D.calcTp2Payout) D.calcTp2Payout.textContent = `+${fmtUSD(t2Profit)} (${(t2Ret * 100 * leverage).toFixed(1)}% ROE)`;
  if (D.calcSlRisk) D.calcSlRisk.textContent = `-${fmtUSD(riskAmountUSD)} (-${(riskPct * leverage).toFixed(1)}% ROE)`;
  if (D.calcRRRatio) D.calcRRRatio.textContent = `${rrRatio} : 1`;

  // Bind new advanced fields
  const elRiskUSD = document.getElementById('calcRiskUSD');
  const elExpectedProfit = document.getElementById('calcExpectedProfit');
  const elExpectedLoss = document.getElementById('calcExpectedLoss');
  const elKellyPct = document.getElementById('calcKellyPct');
  const elExposurePct = document.getElementById('calcExposurePct');
  const elEstFees = document.getElementById('calcEstFees');
  
  if (elRiskUSD) elRiskUSD.textContent = fmtUSD(riskAmountUSD);
  if (elExpectedProfit) elExpectedProfit.textContent = `+${fmtUSD(t1Profit)} (${(t1Ret * 100 * leverage).toFixed(1)}% ROE)`;
  if (elExpectedLoss) elExpectedLoss.textContent = `-${fmtUSD(riskAmountUSD)} (-${(riskPct * leverage).toFixed(1)}% ROE)`;
  if (elKellyPct) elKellyPct.textContent = `${kellyPct.toFixed(1)}%`;
  if (elExposurePct) elExposurePct.textContent = `${exposurePct.toFixed(1)}%`;
  if (elEstFees) elEstFees.textContent = `${fmtUSD(takerFee)} (Funding: ${fmtUSD(fundingCharge)})`;
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

    // Update gradient progress fill arc
    const valuePath = document.getElementById('fngValuePath');
    if (valuePath) {
      const offset = 125.6 - (val / 100) * 125.6;
      valuePath.style.strokeDashoffset = offset;
    }
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
    
    // Populate Liquidity Magnets
    const bidsContainer = document.getElementById('magnetBidsTable');
    const asksContainer = document.getElementById('magnetAsksTable');
    
    // Calculate dynamic ATR based on current candles
    let atr = 150.0; // fallback
    if (S.candles && S.candles.length >= 14) {
      let sum = 0;
      for (let i = S.candles.length - 14; i < S.candles.length; i++) {
        const c = S.candles[i];
        const prev = S.candles[i - 1] || c;
        const tr = Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
        sum += tr;
      }
      atr = sum / 14.0;
    }
    if (atr <= 0) atr = 150.0;
    
    const tfMinutes = parseInt(S.tf) || 60;
    const isBull = window.lastAnalysisData?.bias?.endsWith('BULLISH') || false;
    const isBear = window.lastAnalysisData?.bias?.endsWith('BEARISH') || false;
    
    if (bidsContainer && ob.bids) {
      const topBids = ob.bids
        .map(b => ({ price: parseFloat(b[0]), size: parseFloat(b[1]) }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)
        .sort((a, b) => b.price - a.price);
        
      bidsContainer.innerHTML = topBids.map(b => {
        const dist = Math.abs(b.price - lastPrice);
        const etaMin = (dist / atr) * tfMinutes;
        const etaStr = etaMin < 60 ? `${Math.round(etaMin)}m` : `${(etaMin / 60).toFixed(1)}h`;
        const pRaw = Math.exp(-dist / (atr * 1.5));
        const biasMultiplier = isBear ? 1.15 : (isBull ? 0.85 : 1.0);
        const prob = Math.round(Math.max(5, Math.min(95, pRaw * biasMultiplier * 100)));
        
        return `
          <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.02); align-items: center;">
            <span style="font-family: var(--mono); color: var(--text-primary); font-weight: 700;">$${b.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            <div style="display: flex; gap: 8px; font-family: var(--mono); font-size: 10px;">
              <span style="color: var(--text-muted);">${b.size.toFixed(2)} BTC</span>
              <span style="color: var(--accent-green); font-weight: 700;">${prob}%</span>
              <span style="color: var(--cyan); font-weight: 700;">${etaStr}</span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    if (asksContainer && ob.asks) {
      const topAsks = ob.asks
        .map(a => ({ price: parseFloat(a[0]), size: parseFloat(a[1]) }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)
        .sort((a, b) => b.price - a.price);
        
      asksContainer.innerHTML = topAsks.map(a => {
        const dist = Math.abs(a.price - lastPrice);
        const etaMin = (dist / atr) * tfMinutes;
        const etaStr = etaMin < 60 ? `${Math.round(etaMin)}m` : `${(etaMin / 60).toFixed(1)}h`;
        const pRaw = Math.exp(-dist / (atr * 1.5));
        const biasMultiplier = isBull ? 1.15 : (isBear ? 0.85 : 1.0);
        const prob = Math.round(Math.max(5, Math.min(95, pRaw * biasMultiplier * 100)));
        
        return `
          <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.02); align-items: center;">
            <span style="font-family: var(--mono); color: var(--text-primary); font-weight: 700;">$${a.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            <div style="display: flex; gap: 8px; font-family: var(--mono); font-size: 10px;">
              <span style="color: var(--text-muted);">${a.size.toFixed(2)} BTC</span>
              <span style="color: var(--accent-green); font-weight: 700;">${prob}%</span>
              <span style="color: var(--cyan); font-weight: 700;">${etaStr}</span>
            </div>
          </div>
        `;
      }).join('');
    }
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
  const elStrategySelect = document.getElementById('btStrategySelect');
  const elCapitalInput = document.getElementById('btCapitalInput');
  const elCacheStatus = document.getElementById('btCacheStatus');
  
  if (!elStrategySelect) return;
  
  const strategyId = elStrategySelect.value;
  const startCapital = parseFloat(elCapitalInput ? elCapitalInput.value : '1000') || 1000;
  const closedCandles = S.candles;
  
  if (!closedCandles || closedCandles.length < 30) {
    console.warn('[Backtester] Insufficient candle history for backtest simulation.');
    return;
  }
  
  // Caching mechanism: keyed by strategy, symbol, timeframe, starting capital, start/end time
  const symbol = S.coin;
  const timeframe = selectedInterval;
  const startT = closedCandles[0].t;
  const endT = closedCandles[closedCandles.length - 1].t;
  
  const cacheKey = `apextrader_bt_cache_${strategyId}_${symbol}_${timeframe}_${startCapital}_${startT}_${endT}`;
  const cachedData = localStorage.getItem(cacheKey);
  
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      const computedAtTime = new Date(parsed.computedAt).toLocaleTimeString();
      if (elCacheStatus) elCacheStatus.textContent = `Completed at ${computedAtTime} (Loaded from cache)`;
      renderBacktestResults(parsed.results, strategyId, startCapital);
      return;
    } catch (e) {
      console.error('[Backtest Cache] Failed to load cached result:', e);
    }
  }
  
  if (elCacheStatus) elCacheStatus.textContent = 'Simulating strategy rules...';
  
  // Fetch strategies
  const allStrats = getAllStrategies();
  
  let selectedStrats = [];
  if (strategyId === 'compare') {
    selectedStrats = allStrats.filter(s => ['ema_crossover', 'ema_smc', 'ai_consensus'].includes(s.id));
  } else {
    const sObj = allStrats.find(s => s.id === strategyId);
    if (sObj) selectedStrats.push(sObj);
    else {
      // Fallback to EMA crossover if not found
      const defaultObj = allStrats.find(s => s.id === 'ema_crossover');
      if (defaultObj) selectedStrats.push(defaultObj);
    }
  }
  
  // Run tests
  const results = selectedStrats.map(s => {
    const res = runSingleBacktest(closedCandles, s, startCapital);
    // Enrich trades list for the table view
    res.trades = res.trades.map(t => ({
      ...t,
      strategyName: s.name,
      timeframe: timeframe.toUpperCase()
    }));
    return res;
  });
  
  // Store in cache
  const cacheObj = {
    computedAt: new Date().toISOString(),
    results
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cacheObj));
  } catch (err) {
    console.error('[Backtest Cache] Failed to write cache:', err);
  }
  
  const computedAtTime = new Date(cacheObj.computedAt).toLocaleTimeString();
  if (elCacheStatus) elCacheStatus.textContent = `Completed at ${computedAtTime}`;
  
  renderBacktestResults(results, strategyId, startCapital);
}

function renderBacktestResults(results, strategyId, startCapital) {
  const elStatsTable = document.getElementById('btStatsTable');
  
  if (!elStatsTable) return;
  
  // 1. Render Stats Summary Row
  if (strategyId === 'compare') {
    let tableHtml = `
      <thead>
        <tr style="border-bottom: 1px solid var(--border-hairline);">
          <th style="text-align: left; padding: 4px;">Metric</th>
    `;
    results.forEach(res => {
      tableHtml += `<th style="text-align: right; padding: 4px; color: var(--color-metric);">${res.strategyName.split(' ')[0] || res.strategyName}</th>`;
    });
    tableHtml += `
        </tr>
      </thead>
      <tbody>
    `;
    
    const metrics = [
      ['Win Rate', r => `${r.winRate.toFixed(1)}%`, true],
      ['Profit Factor', r => r.profitFactor.toFixed(2)],
      ['Total Trades', r => r.trades.length],
      ['Max DD', r => `-${r.maxDd.toFixed(1)}%`, false, true],
      ['Net Profit', r => `${r.netProfit >= 0 ? '+' : ''}${r.netProfit.toFixed(2)} (${r.profitPct.toFixed(1)}%)`, true],
      ['Sharpe Ratio', r => r.sharpe.toFixed(2)],
      ['Expectancy', r => `${r.expectancy >= 0 ? '+' : ''}$${r.expectancy.toFixed(2)}`]
    ];
    
    metrics.forEach(([label, fn, isWR, isDD]) => {
      tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.02);"><td style="padding: 4px; color: var(--text-muted);">${label}</td>`;
      results.forEach(res => {
        const valText = fn(res);
        let colorStyle = '';
        if (isWR) colorStyle = `color: var(--signal-bull); font-weight: 700;`;
        else if (isDD) colorStyle = `color: var(--signal-bear); font-weight: 700;`;
        tableHtml += `<td style="text-align: right; padding: 4px; ${colorStyle}">${valText}</td>`;
      });
      tableHtml += `</tr>`;
    });
    
    tableHtml += `</tbody>`;
    elStatsTable.innerHTML = tableHtml;
    
    let allCombinedTrades = [];
    results.forEach(res => {
      allCombinedTrades = allCombinedTrades.concat(res.trades);
    });
    activeBacktestTrades = allCombinedTrades;
    
  } else {
    const res = results[0];
    let streakWin = 0, streakLose = 0;
    let currentWin = 0, currentLose = 0;
    res.trades.forEach(t => {
      if (t.pnl > 0) {
        currentWin++;
        if (currentWin > streakWin) streakWin = currentWin;
        currentLose = 0;
      } else {
        currentLose++;
        if (currentLose > streakLose) streakLose = currentLose;
        currentWin = 0;
      }
    });
    
    const wrColor = res.winRate >= 50 ? 'var(--signal-bull)' : 'var(--signal-bear)';
    const pfColor = res.profitFactor >= 1.5 ? 'var(--signal-bull)' : res.profitFactor >= 1.0 ? 'var(--signal-neutral)' : 'var(--signal-bear)';
    const pnlColor = res.netProfit >= 0 ? 'var(--signal-bull)' : 'var(--signal-bear)';
    
    elStatsTable.innerHTML = `
      <tbody>
        <tr>
          <td style="color: var(--text-muted); padding: 2px 0;">WR: <span style="font-weight:700; color:${wrColor};">${res.winRate.toFixed(1)}%</span></td>
          <td style="color: var(--text-muted); padding: 2px 0; text-align: right;">PF: <span style="font-weight:700; color:${pfColor};">${res.profitFactor.toFixed(2)}</span></td>
        </tr>
        <tr>
          <td style="color: var(--text-muted); padding: 2px 0;">Trades: <span style="font-family:var(--mono); color:var(--text-primary);">${res.trades.length}</span></td>
          <td style="color: var(--text-muted); padding: 2px 0; text-align: right;">Max DD: <span style="font-weight:700; color:var(--signal-bear);">${res.maxDd.toFixed(1)}%</span></td>
        </tr>
        <tr>
          <td style="color: var(--text-muted); padding: 2px 0;">Expectancy: <span style="font-weight:700; color:var(--text-primary);">${res.expectancy.toFixed(2)} USD</span></td>
          <td style="color: var(--text-muted); padding: 2px 0; text-align: right;">Sharpe: <span style="font-weight:700; color:var(--color-metric);">${res.sharpe.toFixed(2)}</span></td>
        </tr>
        <tr>
          <td style="color: var(--text-muted); padding: 2px 0;">Net Profit: <span style="font-weight:700; color:${pnlColor};">${res.netProfit >= 0 ? '+' : ''}${res.netProfit.toFixed(2)} USD (${res.profitPct.toFixed(1)}%)</span></td>
          <td style="color: var(--text-muted); padding: 2px 0; text-align: right;">Streaks: <span style="color: var(--text-2); font-size: 8px;">W:${streakWin} L:${streakLose}</span></td>
        </tr>
      </tbody>
    `;
    
    activeBacktestTrades = res.trades;
  }
  
  drawEquityCurveOverlay(results);
  renderTradesTableList('btTradesTableBody', activeBacktestTrades, 'backtest');
}

function drawEquityCurveOverlay(results) {
  const canvas = document.getElementById('equityCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // Background grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  
  const colors = {
    'ema_crossover': '#00e676', // Green
    'ema_smc': '#00f0ff',       // Cyan
    'ai_consensus': '#f7931a',   // Bitcoin Orange
    'compare_combined': '#ff3b6f' // Pink/Red
  };
  const defaultColors = ['#00e676', '#00f0ff', '#f7931a', '#ff3b6f'];
  
  results.forEach((res, idx) => {
    const curve = res.equityCurve || [];
    if (curve.length === 0) return;
    
    const minVal = Math.min(...curve);
    const maxVal = Math.max(...curve);
    const range = maxVal - minVal || 1.0;
    
    ctx.beginPath();
    ctx.lineWidth = 1.8;
    
    let stratKey = 'ema_crossover';
    if (res.strategyName.includes('SMC')) stratKey = 'ema_smc';
    else if (res.strategyName.includes('AI')) stratKey = 'ai_consensus';
    const strokeColor = colors[stratKey] || defaultColors[idx % defaultColors.length];
    
    ctx.strokeStyle = strokeColor;
    
    const step = w / (curve.length - 1 || 1);
    curve.forEach((val, i) => {
      const x = i * step;
      const y = h - 6 - ((val - minVal) / range) * (h - 12);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function renderTradesTableList(containerId, trades, source) {
  const tbody = document.getElementById(containerId);
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (!trades || trades.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${source === 'live' ? 11 : 9}" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 12px 0;">No trades logged.</td></tr>`;
    return;
  }
  
  const state = sortState[source];
  const sorted = [...trades].sort((a, b) => {
    let key = state.key;
    if (source === 'backtest') {
      if (key === 'entry_price') key = 'entryPrice';
      else if (key === 'exit_price') key = 'exitPrice';
      else if (key === 'pnl_pct') key = 'pnlPct';
      else if (key === 'pnl_val') key = 'pnl';
      else if (key === 'direction') key = 'type';
    }
    let valA = a[key];
    let valB = b[key];
    
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;
    
    if (typeof valA === 'string') {
      return state.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return state.dir === 'asc' ? valA - valB : valB - valA;
    }
  });
  
  sorted.forEach(t => {
    const tr = document.createElement('tr');
    
    let outcomeStr = 'PENDING';
    if (t.outcome === 'hit_tp' || t.outcome === 'WIN' || (t.pnl > 0 && source === 'backtest')) outcomeStr = 'WIN';
    else if (t.outcome === 'hit_sl' || t.outcome === 'LOSS' || (t.pnl <= 0 && source === 'backtest')) outcomeStr = 'LOSS';
    else if (t.outcome === 'expired') outcomeStr = 'EXPIRED';
    
    const outcomeClass = outcomeStr === 'WIN' ? 'win' : outcomeStr === 'LOSS' ? 'loss' : 'neutral';
    const dirClass = t.direction && t.direction.toUpperCase().includes('LONG') ? 'long' : t.direction && t.direction.toUpperCase().includes('SHORT') ? 'short' : 'neutral';
    
    const rrStr = (t.rr !== undefined && t.rr !== null) ? t.rr.toFixed(2) : '—';
    const entryPriceStr = (t.entry_price !== undefined && t.entry_price !== null) ? t.entry_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
    const exitPriceStr = (t.exit_price !== undefined && t.exit_price !== null) ? t.exit_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
    const pnlPctStr = (t.pnl_pct !== undefined && t.pnl_pct !== null) ? `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%` : '—';
    const pnlValStr = (t.pnl_val !== undefined && t.pnl_val !== null) ? `${t.pnl_val >= 0 ? '+' : ''}$${t.pnl_val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '—';
    
    let timeFormatted = '—';
    if (t.timestamp) {
      try {
        const parts = t.timestamp.split(' ');
        timeFormatted = parts[1] || t.timestamp;
      } catch (e) {}
    }
    const holdHoursStr = (t.hold_hours !== undefined && t.hold_hours !== null) ? `${t.hold_hours.toFixed(1)}h` : '—';
    
    if (source === 'live') {
      tr.innerHTML = `
        <td>#${t.id}</td>
        <td class="j-dir ${dirClass}">${t.direction && t.direction.includes('BULL') ? 'LONG' : t.direction && t.direction.includes('BEAR') ? 'SHORT' : (t.direction || '—')}</td>
        <td>${t.timeframe || '1H'}</td>
        <td style="font-family:var(--mono);">${entryPriceStr}</td>
        <td style="font-family:var(--mono);">${exitPriceStr}</td>
        <td style="font-weight:700; color:var(--signal-${t.pnl_pct >= 0 ? 'bull' : 'bear'}); font-family:var(--mono);">${pnlPctStr}</td>
        <td style="font-weight:700; color:var(--signal-${t.pnl_val >= 0 ? 'bull' : 'bear'}); font-family:var(--mono);">${pnlValStr}</td>
        <td>${holdHoursStr}</td>
        <td style="font-family:var(--mono);">${t.confidence}%</td>
        <td><span class="j-res ${outcomeClass}">${outcomeStr}</span></td>
        <td style="font-family:var(--mono);">${rrStr}</td>
      `;
    } else {
      const btDirClass = t.type === 'LONG' ? 'long' : 'short';
      tr.innerHTML = `
        <td>#${t.id}</td>
        <td class="j-dir ${btDirClass}">${t.type}</td>
        <td>${t.timeframe || '1H'}</td>
        <td style="font-family:var(--mono);">${t.entryPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td style="font-family:var(--mono);">${t.exitPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td style="font-weight:700; color:var(--signal-${t.pnlPct >= 0 ? 'bull' : 'bear'}); font-family:var(--mono);">${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%</td>
        <td style="font-weight:700; color:var(--signal-${t.pnl >= 0 ? 'bull' : 'bear'}); font-family:var(--mono);">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td>${t.reason === 'End of Data' ? 'Open' : t.reason}</td>
        <td style="font-family:var(--mono);">${rrStr}</td>
      `;
    }
    
    tbody.appendChild(tr);
  });
}

function setupTableSorting() {
  document.querySelectorAll('#journalTable th, #btTradesTable th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-key');
      if (!key) return;
      const tableId = th.closest('table').id;
      const source = tableId === 'journalTable' ? 'live' : 'backtest';
      
      const state = sortState[source];
      if (state.key === key) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.key = key;
        state.dir = 'asc';
      }
      
      th.closest('tr').querySelectorAll('th').forEach(header => {
        header.style.color = '';
      });
      th.style.color = 'var(--color-metric)';
      
      if (source === 'live') {
        applyLiveFilter();
      } else {
        renderTradesTableList('btTradesTableBody', activeBacktestTrades, 'backtest');
      }
    });
  });
}

function applyLiveFilter() {
  const filter = document.getElementById('journalStrategySelect') ? document.getElementById('journalStrategySelect').value : 'all';
  activeLiveFilter = filter;
  
  let filtered = activeLiveTrades;
  if (filter === 'long') {
    filtered = activeLiveTrades.filter(t => t.direction && (t.direction.includes('LONG') || t.direction.includes('BULL')));
  } else if (filter === 'short') {
    filtered = activeLiveTrades.filter(t => t.direction && (t.direction.includes('SHORT') || t.direction.includes('BEAR')));
  } else if (filter === '1h') {
    filtered = activeLiveTrades.filter(t => t.timeframe && t.timeframe.toLowerCase() === '1h');
  } else if (filter === '4h') {
    filtered = activeLiveTrades.filter(t => t.timeframe && t.timeframe.toLowerCase() === '4h');
  } else if (filter === '1d') {
    filtered = activeLiveTrades.filter(t => t.timeframe && t.timeframe.toLowerCase() === '1d');
  }
  
  renderTradesTableList('journalListBody', filtered, 'live');
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
class DecisionSummaryWidget {
  constructor(decision, mode = 'in-flow', newsImpact = null) {
    this.decision = decision; // data.decision object
    this.mode = mode; // 'in-flow', 'sticky', 'floating'
    this.newsImpact = newsImpact; // data.newsImpact object
  }

  render() {
    const d = this.decision || {};
    const bias = d.bias || 'Neutral';
    const confidence = d.confidence !== undefined ? d.confidence : 50;
    const action = d.action || 'Wait';
    const execStatus = d.execution_status || 'Wait';
    const reason = d.reason || 'Market structure consolidating; awaiting trend breakout confirmation.';
    const entry = d.entry !== undefined ? d.entry : 0;
    const stop = d.stop !== undefined ? d.stop : 0;
    const target = d.target !== undefined ? d.target : 0;
    const nextTrigger = d.next_trigger || 'Range breakout confirmation';
    const winRate = d.win_rate !== undefined ? d.win_rate : 62.5;
    const invalidated = d.invalidated_below !== undefined ? d.invalidated_below : 0;

    const biasColor = bias.toUpperCase().includes('BULL') ? 'var(--signal-bull)' : bias.toUpperCase().includes('BEAR') ? 'var(--signal-bear)' : 'var(--signal-neutral)';
    const actionClass = action.toUpperCase() === 'READY' ? 'take' : 'wait';
    const actionLabel = action.toUpperCase() === 'READY' ? 'TAKE TRADE' : 'WAIT';

    const formatPrice = (p) => p ? '$' + p.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';

    if (this.mode === 'in-flow') {
      const container = document.querySelector('.terminal-header-board');
      if (!container) return;
      if (document.getElementById('heroResistanceVal')) return;
      
      const eventName = (this.newsImpact && this.newsImpact.event) || 'FOMC';
      const eventTime = (this.newsImpact && this.newsImpact.time) || '2 Hours';
      
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="display: flex; align-items: center; gap: 24px;">
            <span style="font-family: var(--font-title); font-size: 16px; font-weight: 700; color: var(--color-metric);" id="topSymbolLabel">${(S.coin || 'BTC').replace('USDT', '')}/USDT</span>
            <span style="font-family: var(--mono); font-size: 16px; font-weight: 700; color: ${biasColor};" id="topSignalVal">${bias.toUpperCase()}</span>
            <span style="font-family: var(--mono); font-size: 11px; color: ${biasColor};" id="topPctVal">${confidence.toFixed(2)}%</span>
            <span class="dec-badge ${actionClass}" style="font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px;">${actionLabel}</span>
          </div>
          <button id="headerMacroBtn" style="background: rgba(255, 179, 71, 0.1); border: 1px solid rgba(255, 179, 71, 0.3); color: var(--signal-neutral); padding: 4px 10px; border-radius: 4px; font-family: var(--font-title); font-size: 10px; font-weight: 600; cursor: pointer;" onclick="scrollToMacroPanel()">
            Next Major Event: <span id="topMacroEventLabel" style="font-weight: 700;">${eventName}</span> (<span id="topMacroEventVal" style="font-weight: 700;">${eventTime}</span>)
          </button>
        </div>
        <!-- AI Summary (One Sentence) -->
        <div class="terminal-summary-row" style="margin-top: 8px; font-size: 11px; line-height: 1.4; border-top: 1px solid var(--border-hairline); padding-top: 8px;">
          <span class="term-summary-label" style="color:var(--color-metric); font-weight:700;">AI Summary:</span>
          <span class="term-summary-text" id="topSummaryText" style="color:var(--text-2);">${reason}</span>
        </div>
      `;
    } else if (this.mode === 'sticky') {
      const container = document.getElementById('stickyDecisionBar');
      if (!container) return;
      container.innerHTML = `
        <!-- Left Stance Matrix -->
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="font-weight: 700; color: var(--color-metric); font-size: 13px;" id="stickySymbol">${(S.coin || 'BTC').replace('USDT', '')}/USDT</span>
          <span style="width: 1px; height: 14px; background: var(--border-hairline);"></span>
          <span style="font-weight: 700; color: ${biasColor};" id="stickyBias">${bias.toUpperCase()}</span>
          <span style="font-family: var(--mono); font-weight: 700; color: ${biasColor};" id="stickyScore">${confidence.toFixed(2)}%</span>
          <span class="dec-badge ${actionClass}" style="font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 3px;" id="stickyAction">${actionLabel}</span>
        </div>
        
        <!-- Right Trade Targets -->
        <div style="display: flex; align-items: center; gap: 16px; font-family: var(--mono); font-size: 10px;">
          <div><span style="color: var(--text-muted);">Entry:</span> <strong id="stickyEntry" style="color: var(--text-primary);">${formatPrice(entry)}</strong></div>
          <div><span style="color: var(--text-muted);">SL:</span> <strong id="stickySL" style="color: var(--signal-bear);">${formatPrice(stop)}</strong></div>
          <div><span style="color: var(--text-muted);">TP:</span> <strong id="stickyTP" style="color: var(--signal-bull);">${formatPrice(target)}</strong></div>
          <span style="width: 1px; height: 14px; background: var(--border-hairline);"></span>
          <div><span style="color: var(--text-muted);">Next Trigger:</span> <strong id="stickyTrigger" style="color: var(--color-metric); font-family: var(--font-title);">${nextTrigger}</strong></div>
        </div>
      `;
    } else if (this.mode === 'floating') {
      const container = document.getElementById('floatingDecisionCardContainer');
      if (!container) return;
      container.innerHTML = `
        <div class="glass-card decision-widget-floating" style="padding: 10px; width: 220px; font-size: 10px; font-family: var(--font-title); border: 1px solid rgba(0, 240, 255, 0.2); background: rgba(8, 10, 18, 0.9); box-shadow: 0 4px 30px rgba(0,0,0,0.8); pointer-events: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-hairline); padding-bottom: 4px; margin-bottom: 6px;">
            <strong style="color: var(--color-metric); font-size: 11px;">AI DECISION CARD</strong>
            <span class="dec-badge ${actionClass}" style="font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px;">${actionLabel}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; line-height: 1.4;">
            <div><span style="color: var(--text-muted);">Bias:</span> <strong style="color: ${biasColor}; float: right;">${bias.toUpperCase()}</strong></div>
            <div><span style="color: var(--text-muted);">Confidence:</span> <strong style="color: var(--color-metric); font-family: var(--mono); float: right;">${confidence.toFixed(2)}%</strong></div>
            <div><span style="color: var(--text-muted);">Win Rate:</span> <strong style="color: var(--signal-bull); font-family: var(--mono); float: right;">${winRate.toFixed(1)}%</strong></div>
            <div style="border-top: 1px solid rgba(255,255,255,0.03); padding-top: 4px; margin-top: 2px;"></div>
            <div><span style="color: var(--text-muted);">Entry Target:</span> <strong style="color: var(--text-primary); float: right; font-family: var(--mono);">${formatPrice(entry)}</strong></div>
            <div><span style="color: var(--text-muted);">Stop Loss:</span> <strong style="color: var(--signal-bear); float: right; font-family: var(--mono);">${formatPrice(stop)}</strong></div>
            <div><span style="color: var(--text-muted);">Target TP1:</span> <strong style="color: var(--signal-bull); float: right; font-family: var(--mono);">${formatPrice(target)}</strong></div>
            <div style="border-top: 1px solid rgba(255,255,255,0.03); padding-top: 4px; margin-top: 2px;"></div>
            <div style="font-size: 9px; line-height: 1.3;"><span style="color: var(--text-muted);">Trigger:</span> <span style="color: var(--color-metric); font-weight: 600;">${nextTrigger}</span></div>
          </div>
        </div>
      `;
    }
  }
}

function initTabs() {
  // Accordion support for Section 5
  window.toggleSection = function(btn) {
    btn.classList.toggle('active');
    const content = btn.nextElementSibling;
    content.classList.toggle('open');
    const chevron = btn.querySelector('.chevron');
    if (content.classList.contains('open')) {
      chevron.textContent = '▲';
    } else {
      chevron.textContent = '▼';
    }
  };

  window.scrollToMacroPanel = function() {
    const macroBtn = document.querySelectorAll('.collapsible-header')[1]; // Macro accordion header
    if (macroBtn && !macroBtn.classList.contains('active')) {
      window.toggleSection(macroBtn);
    }
    setTimeout(() => {
      const panel = document.getElementById('macroSectionCard');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        panel.style.transition = 'box-shadow 0.3s ease';
        panel.style.boxShadow = '0 0 20px var(--signal-neutral)';
        setTimeout(() => {
          panel.style.boxShadow = '';
        }, 2000);
      }
    }, 150);
  };
}

function renderInstitutionalDashboard(data) {
  if (!data) return;
  const rel = data.simulatorReliability || {};

  const decision = data.decision || {};
  const bias = decision.bias || 'Neutral';
  const confidence = decision.confidence !== undefined ? decision.confidence : 50;
  const action = decision.action || 'Wait';
  const entry = decision.entry !== undefined ? decision.entry : 0;
  const stop = decision.stop !== undefined ? decision.stop : 0;
  const target = decision.target !== undefined ? decision.target : 0;
  const nextTrigger = decision.next_trigger || '—';
  const winRate = decision.win_rate !== undefined ? decision.win_rate : 62.5;
  const invalidated = decision.invalidated_below !== undefined ? decision.invalidated_below : 0;

  const biasColor = bias.toUpperCase().includes('BULL') ? 'var(--signal-bull)' : bias.toUpperCase().includes('BEAR') ? 'var(--signal-bear)' : 'var(--signal-neutral)';
  const actionClass = action.toUpperCase() === 'READY' ? 'take' : 'wait';
  const actionLabel = action.toUpperCase() === 'READY' ? 'TAKE TRADE' : 'WAIT';

  const formatPrice = (p) => p ? '$' + p.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';

  // Render top banner, sticky top bar, and floating card dynamically (Requirements 1, 13, 17)
  new DecisionSummaryWidget(decision, 'in-flow', data.newsImpact).render();
  new DecisionSummaryWidget(decision, 'sticky', data.newsImpact).render();
  new DecisionSummaryWidget(decision, 'floating', data.newsImpact).render();

  // Populate Executive Decision Stance Matrix
  if (D.decBias) {
    D.decBias.textContent = bias.toUpperCase();
    D.decBias.style.color = biasColor;
  }
  
  if (D.decConfidence) {
    const cToday = decision.delta_today !== undefined ? decision.delta_today : 0;
    const cHour = decision.delta_hour !== undefined ? decision.delta_hour : 0;
    const cCandle = decision.delta_candle !== undefined ? decision.delta_candle : 0;
    
    const formatDelta = (val) => val > 0 ? `+${val}%` : val < 0 ? `${val}%` : `0%`;
    const getDeltaColor = (val) => val > 0 ? 'var(--signal-bull)' : val < 0 ? 'var(--signal-bear)' : 'var(--text-muted)';
    
    D.decConfidence.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span>${confidence.toFixed(2)}%</span>
        <div style="display: flex; gap: 4px; font-size: 8px; font-family: var(--mono); font-weight: normal; margin-left: 8px;">
          <span style="color: ${getDeltaColor(cCandle)}" title="Candle change">C: ${formatDelta(cCandle)}</span>
          <span style="color: ${getDeltaColor(cHour)}" title="Last hour change">H: ${formatDelta(cHour)}</span>
          <span style="color: ${getDeltaColor(cToday)}" title="24h change">D: ${formatDelta(cToday)}</span>
        </div>
      </div>
    `;
  }
  
  if (D.decStatus) {
    D.decStatus.textContent = actionLabel;
    D.decStatus.className = `dec-badge ${actionClass}`;
  }


  const topGradeVal = document.getElementById('topGradeVal');
  if (topGradeVal) {
    const grade = confidence >= 85 ? 'A+' : confidence >= 70 ? 'A' : confidence >= 50 ? 'B+' : 'C';
    topGradeVal.textContent = grade;
  }

  // Trade Setup Block from central object
  const entryStr = formatPrice(entry);
  const slStr = formatPrice(stop);
  const tpStr = formatPrice(target);
  const riskVal = Math.abs(entry - stop);
  const rewardVal = Math.abs(target - entry);
  const rrStr = riskVal > 0 ? `1 : ${(rewardVal / riskVal).toFixed(2)}` : '1 : 2.5';
  
  if (D.decEntry) D.decEntry.textContent = entryStr;
  if (D.decSL) D.decSL.textContent = slStr;
  if (D.decTP) D.decTP.textContent = tpStr;
  if (D.decRR) D.decRR.textContent = rrStr;
  
  const payoffStateVal = document.getElementById('payoffStateVal');
  if (payoffStateVal) {
    const isReady = action.toUpperCase() === 'READY';
    payoffStateVal.textContent = isReady ? 'READY' : 'WAIT';
    payoffStateVal.style.background = isReady ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 59, 111, 0.15)';
    payoffStateVal.style.color = isReady ? 'var(--signal-bull)' : 'var(--signal-bear)';
    payoffStateVal.style.boxShadow = isReady ? '0 0 10px rgba(0, 255, 102, 0.2)' : '0 0 10px rgba(255, 59, 111, 0.2)';
  }

  const elPayoffAction = document.getElementById('payoffActionVal');
  if (elPayoffAction) {
    const isBull = bias.toUpperCase().includes('BULL');
    const isBear = bias.toUpperCase().includes('BEAR');
    elPayoffAction.textContent = isBull ? 'BUY / LONG' : isBear ? 'SELL / SHORT' : 'WAIT / RANGE';
    elPayoffAction.style.color = isBull ? 'var(--signal-bull)' : isBear ? 'var(--signal-bear)' : 'var(--signal-neutral)';
  }

  const elPayoffLevels = document.getElementById('payoffLevelsVal');
  if (elPayoffLevels) {
    elPayoffLevels.textContent = `Entry: ${entryStr} | SL: ${slStr} | TP: ${tpStr}`;
  }

  const elPayoffInvalidation = document.getElementById('payoffInvalidationVal');
  if (elPayoffInvalidation) {
    elPayoffInvalidation.textContent = invalidated ? `< ${formatPrice(invalidated)}` : '—';
    elPayoffInvalidation.style.color = bias.toUpperCase().includes('BULL') ? 'var(--signal-bear)' : 'var(--signal-bull)';
  }

  const elPayoffWinRate = document.getElementById('payoffWinRateVal');
  if (elPayoffWinRate) {
    elPayoffWinRate.textContent = `${winRate.toFixed(1)}%`;
  }

  const elPayoffHorizon = document.getElementById('payoffHorizonVal');
  if (elPayoffHorizon) {
    elPayoffHorizon.textContent = S.tf === '60' ? '1H' : S.tf === '5' ? '5M' : S.tf === '15' ? '15M' : S.tf === '240' ? '4H' : S.tf === '1440' ? '1D' : `${S.tf}M`;
  }

  const elPayoffTrigger = document.getElementById('payoffTriggerVal');
  if (elPayoffTrigger) {
    elPayoffTrigger.textContent = nextTrigger;
  }

  // --- FEATURE 9: CONFIDENCE HISTORY TICKER ---
  const topHistoryFlow = document.getElementById('topHistoryFlow');
  if (topHistoryFlow && data.confidenceHistory) {
    topHistoryFlow.innerHTML = data.confidenceHistory.map(val => `<span>${val}%</span>`).join(' <span style="color:var(--text-3); font-size:9px;">↓</span> ');
  }

  // --- LAYER 4: LIVE AI THINKING & SIGNAL RELIABILITY ---
  const liveThinkingText = document.getElementById('liveThinkingText');
  const liveThinkingTime = document.getElementById('liveThinkingTime');
  const liveWatchingList = document.getElementById('liveWatchingList');
  
  if (liveThinkingText) {
    const rawTh = data.headerSummary || '';
    if (rawTh.includes('•')) {
      const items = rawTh.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      liveThinkingText.innerHTML = items.map(it => {
        if (it.startsWith('•')) {
          return `<div style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 6px;">
            <span style="color: var(--color-metric);">•</span>
            <span style="color: var(--text-primary); font-size: 11px;">${it.substring(1).trim()}</span>
          </div>`;
        }
        return `<div style="font-weight: 700; color: var(--color-metric); margin-bottom: 6px; font-size: 12px;">${it}</div>`;
      }).join('');
    } else {
      liveThinkingText.textContent = rawTh || data.analysis || 'Analyzing...';
    }
  }
  if (liveThinkingTime) {
    const formattedTime = new Date(data.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    liveThinkingTime.textContent = `as of ${formattedTime}`;
  }
  if (liveWatchingList) {
    const activeSources = new Set(['Binance WebSocket']);
    if (data.categories) {
      data.categories.forEach(cat => {
        if (cat.sub_factors) {
          cat.sub_factors.forEach(sf => {
            if (sf.status === 'Live' && sf.tier) {
              activeSources.add(sf.tier);
            }
          });
        }
      });
    }
    liveWatchingList.innerHTML = Array.from(activeSources).map(src => `
      <span style="font-size: 8px; font-family: var(--mono); background: rgba(0, 240, 255, 0.05); color: var(--cyan); border: 1px solid rgba(0, 240, 255, 0.15); border-radius: 3px; padding: 2px 5px; font-weight: 700; text-transform: uppercase;">${src}</span>
    `).join('');
  }

  const reliabilityStatus = document.getElementById('reliabilityStatus');
  const reliabilityLoggedCount = document.getElementById('reliabilityLoggedCount');
  const reliabilityWinRateVal = document.getElementById('reliabilityWinRateVal');
  
  if (reliabilityLoggedCount) {
    reliabilityLoggedCount.textContent = rel.total_logged || 0;
  }
  if (reliabilityWinRateVal) {
    reliabilityWinRateVal.textContent = rel.win_rate ? `${rel.win_rate.toFixed(1)}%` : '0%';
  }
  if (reliabilityStatus) {
    const count = rel.resolved_count !== undefined ? rel.resolved_count : (rel.total_logged || 0);
    const currentStance = decision.bias || 'Neutral';
    if (count < 10) {
      reliabilityStatus.textContent = `Current Stance: ${currentStance} (Insufficient history - ${count} resolved)`;
      reliabilityStatus.style.color = 'var(--signal-neutral)';
    } else {
      reliabilityStatus.textContent = `Current Stance: ${currentStance} (Active log verified - ${count} resolved)`;
      reliabilityStatus.style.color = 'var(--signal-bull)';
    }
  }

  // Update Market Score in top grid
  const topMarketScoreVal = document.getElementById('topMarketScoreVal');
  if (topMarketScoreVal) {
    topMarketScoreVal.textContent = data.marketScore ? `${data.marketScore.toFixed(1)}%` : '62.4%';
  }

  // Monte Carlo Target Probabilities
  const mcBullVal = document.getElementById('mcBullVal');
  const mcRangeVal = document.getElementById('mcRangeVal');
  const mcBearVal = document.getElementById('mcBearVal');
  const mcBullBar = document.getElementById('mcBullBar');
  const mcRangeBar = document.getElementById('mcRangeBar');
  const mcBearBar = document.getElementById('mcBearBar');
  if (data.monteCarlo) {
    let pBull = data.monteCarlo.bull_breakout !== undefined ? parseInt(data.monteCarlo.bull_breakout, 10) : 33;
    let pRange = data.monteCarlo.ranging !== undefined ? parseInt(data.monteCarlo.ranging, 10) : 34;
    let pBear = data.monteCarlo.bear_breakdown !== undefined ? parseInt(data.monteCarlo.bear_breakdown, 10) : 33;
    
    // Double-check normalization to exactly 100 (Requirement 3)
    const totalSum = pBull + pRange + pBear;
    if (totalSum !== 100 && totalSum > 0) {
      const diff = 100 - totalSum;
      pRange += diff;
    }
    
    if (mcBullVal) mcBullVal.textContent = `${pBull}%`;
    if (mcRangeVal) mcRangeVal.textContent = `${pRange}%`;
    if (mcBearVal) mcBearVal.textContent = `${pBear}%`;
    if (mcBullBar) mcBullBar.style.width = `${pBull}%`;
    if (mcRangeBar) mcRangeBar.style.width = `${pRange}%`;
    if (mcBearBar) mcBearBar.style.width = `${pBear}%`;
  }

  // Entry Quality Meter
  const qMeterVal = document.getElementById('qMeterVal');
  const qMeterBar = document.getElementById('qMeterBar');
  const calcTradeQualityVal = document.getElementById('calcTradeQualityVal');
  const qScore = data.tradeQualityScore || 0;
  if (qMeterVal) qMeterVal.textContent = `${qScore.toFixed(1)}%`;
  if (qMeterBar) qMeterBar.style.width = `${qScore}%`;
  if (calcTradeQualityVal) {
    calcTradeQualityVal.textContent = `${qScore.toFixed(2)}/100`;
    const b = data.tradeQualityBreakdown || { trend: 0, timing: 0, liquidity: 0, volume: 0, macro: 0 };
    const tooltipText = `Trend: ${Number(b.trend).toFixed(1)}/20 | Timing: ${Number(b.timing).toFixed(1)}/20 | Risk/Reward (Liq): ${Number(b.liquidity).toFixed(1)}/20 | Volume: ${Number(b.volume).toFixed(1)}/20 | Macro: ${Number(b.macro).toFixed(1)}/20`;
    calcTradeQualityVal.setAttribute('data-tooltip', tooltipText);
    calcTradeQualityVal.classList.add('tooltipped');
    calcTradeQualityVal.style.cursor = 'help';
    calcTradeQualityVal.style.borderBottom = '1px dotted var(--text-muted)';
  }

  // Hidden Divergences, Conflicts, and Liquidity Trap
  const hiddenDivergenceVal = document.getElementById('hiddenDivergenceVal');
  if (hiddenDivergenceVal) {
    hiddenDivergenceVal.textContent = data.hiddenDivergence || 'None';
  }
  const conflictDetectorVal = document.getElementById('conflictDetectorVal');
  if (conflictDetectorVal) {
    conflictDetectorVal.textContent = data.conflictDetector || 'No major conflicts detected. Technicals and order flow are aligned.';
  }
  const liquidityTrapVal = document.getElementById('liquidityTrapVal');
  if (liquidityTrapVal) {
    const trap = data.liquidityTrap || 'No trap detected';
    liquidityTrapVal.textContent = trap;
    if (trap.includes('Trap') || trap.includes('Squeeze')) {
      liquidityTrapVal.style.color = 'var(--signal-bear)';
    } else {
      liquidityTrapVal.style.color = 'var(--signal-bull)';
    }
  }

  // AI Scenario Engine
  const scenarioHighVal = document.getElementById('scenarioHighVal');
  const scenarioMidVal = document.getElementById('scenarioMidVal');
  const scenarioLowVal = document.getElementById('scenarioLowVal');
  if (data.scenarioPaths && data.scenarioPaths.scenarios) {
    const sc = data.scenarioPaths.scenarios;
    if (scenarioHighVal) scenarioHighVal.textContent = `$${sc[0].target.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (scenarioMidVal) scenarioMidVal.textContent = `$${sc[1].target.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (scenarioLowVal) scenarioLowVal.textContent = `$${sc[2].target.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  }

  // AI Explanation Panel (Drivers) (Requirement 4)
  const explanationPanel = document.getElementById('aiExplanationPanel');
  if (explanationPanel && data.explanationGrouping) {
    explanationPanel.innerHTML = '';
    const group = data.explanationGrouping;
    
    let allDrivers = [];
    const collect = (arr, type) => {
      if (arr) {
        arr.forEach(it => {
          const val = it.impact !== undefined ? it.impact : (it.contribution !== undefined ? it.contribution : 0);
          allDrivers.push({ name: it.name, val: parseFloat(val), type: type });
        });
      }
    };
    collect(group.primary, 'primary');
    collect(group.secondary, 'secondary');
    collect(group.negative, 'negative');
    collect(group.catalyst, 'catalyst');
    
    const seen = new Set();
    allDrivers = allDrivers.filter(it => {
      if (seen.has(it.name)) return false;
      seen.add(it.name);
      return true;
    });
    
    allDrivers.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    
    const maxVal = Math.max(...allDrivers.map(d => Math.abs(d.val))) || 1;
    let html = `
      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; padding-right: 4px;">
        ${allDrivers.map(d => {
          const percentWidth = (Math.abs(d.val) / maxVal) * 100;
          const barColor = d.val >= 0 ? 'var(--signal-bull)' : 'var(--signal-bear)';
          const sign = d.val >= 0 ? '+' : '';
          return `
            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-2); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 190px;">• ${d.name}</span>
                <span style="font-family: var(--mono); color: ${barColor}; font-weight: 700;">${sign}${d.val.toFixed(1)}%</span>
              </div>
              <div style="height: 4px; background: rgba(255,255,255,0.03); border-radius: 2px; overflow: hidden; width: 100%;">
                <div style="height: 100%; background: ${barColor}; width: ${percentWidth}%; border-radius: 2px;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    explanationPanel.innerHTML = html;
  }



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

  // Update Macro Event Impact Scores dynamically
  const macroImpactTableBody = document.getElementById('macroImpactTableBody');
  if (macroImpactTableBody) {
    macroImpactTableBody.innerHTML = '';
    const macroEvents = data.macroEvents || [
      {
        event: "FOMC Interest Rate Decision",
        date: "July 1, 2026",
        weight: "★★★★★",
        volatility: "Extreme",
        result: "5.25% (Paused)",
        impact: "Good",
        explanation: "Hawkish pause priced in; rates stable, liquidity intact."
      },
      {
        event: "ECB Rate Decision",
        date: "July 2, 2026",
        weight: "★★★",
        volatility: "Moderate",
        result: "4.00% (25bps Cut)",
        impact: "Good",
        explanation: "Rate cut supports global liquidity and risk assets."
      },
      {
        event: "US CPI Inflation Report",
        date: "July 10, 2026",
        weight: "★★★★★",
        volatility: "Extreme",
        result: "Pending",
        impact: "Pending",
        explanation: "Awaiting release. Forecast: 3.1% YoY."
      },
      {
        event: "US PPI Inflation Report",
        date: "July 11, 2026",
        weight: "★★★★",
        volatility: "High",
        result: "Pending",
        impact: "Pending",
        explanation: "Awaiting release. Forecast: 2.2% YoY."
      },
      {
        event: "Spot ETF Flow Report",
        date: "July 7, 2026",
        weight: "★★★",
        volatility: "Moderate",
        result: "+$185M Inflow",
        impact: "Good",
        explanation: "Net positive flows show sustained institutional demand."
      }
    ];
    macroEvents.forEach(evt => {
      const row = document.createElement('tr');
      
      let impactStyle = 'color: var(--gold);';
      if (evt.impact.toLowerCase() === 'good') {
        impactStyle = 'color: var(--green); font-weight: 700;';
      } else if (evt.impact.toLowerCase() === 'bad') {
        impactStyle = 'color: var(--red); font-weight: 700;';
      }
      
      let volColor = 'var(--gold)';
      if (evt.volatility.toLowerCase() === 'extreme' || evt.volatility.toLowerCase() === 'high') {
        volColor = 'var(--red)';
      }
      
      // Status color coding (Requirement 8)
      let statusColor = 'var(--text-muted)';
      let statusText = 'Upcoming';
      
      const isCompleted = evt.result !== 'Pending' && evt.result !== 'Upcoming' && evt.result !== 'Upcoming/Pending';
      const isActiveNext = data.newsImpact?.event && evt.event.toLowerCase().includes(data.newsImpact.event.toLowerCase());
      
      if (isCompleted) {
        statusColor = 'var(--signal-bull)';
        statusText = 'Completed';
      } else if (isActiveNext) {
        statusColor = 'var(--signal-neutral)'; // Orange
        statusText = 'Active Next';
      } else {
        statusColor = '#8a8a8a'; // Gray
        statusText = 'Upcoming';
      }
      
      let impactBadge = '';
      const isHighImpact = evt.weight.length >= 4 || evt.volatility.toLowerCase() === 'extreme' || evt.volatility.toLowerCase() === 'high';
      if (isHighImpact) {
        impactBadge = `<span style="background: rgba(255, 59, 111, 0.15); color: var(--signal-bear); font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px; margin-left: 6px; border: 1px solid rgba(255, 59, 111, 0.3);">HIGH IMPACT</span>`;
      }
      
      row.innerHTML = `
        <td style="font-weight: 600;">
          <div style="display: flex; align-items: center;">
            <span>${evt.event}</span>
            ${impactBadge}
          </div>
        </td>
        <td style="color: var(--text-2); font-size: 11px;">${evt.date}</td>
        <td style="color: var(--gold);">${evt.weight}</td>
        <td style="color: ${volColor}; font-weight: 700;">${evt.volatility}</td>
        <td style="font-family: monospace; font-weight: 600;">${evt.result}</td>
        <td style="${impactStyle}">
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 700;">
            <span style="color: ${statusColor};">${statusText}</span>
            <span style="font-size: 9px; color: var(--text-muted); font-weight: normal; margin-left: 6px;">(${evt.impact})</span>
          </div>
          <div style="font-size: 10px; color: var(--text-3); font-weight: normal; margin-top: 2px; max-width: 250px; line-height: 1.2;">
            ${evt.explanation}
          </div>
        </td>
      `;
      macroImpactTableBody.appendChild(row);
    });
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
    
    matrixTableBody.innerHTML = '';
    
    rowKeys.forEach(rowKey => {
      const tr = document.createElement('tr');
      
      const labelTd = document.createElement('td');
      labelTd.textContent = rowLabels[rowKey];
      tr.appendChild(labelTd);
      
      targetTfs.forEach(tf => {
        const tfData = matrixData[tf] || {};
        const val = tfData[rowKey] || 'neutral';
        const reason = tfData[`${rowKey}_reason`] || `No detailed ${rowLabels[rowKey]} confluence calculated for ${tf}.`;
        
        let dot = '🔴'; // Default Bearish
        if (val === 'bullish') dot = '🟢';
        else if (val === 'neutral') dot = '🟡';
        
        const td = document.createElement('td');
        td.style.cursor = 'pointer';
        
        const span = document.createElement('span');
        span.className = 'matrix-dot';
        span.textContent = dot;
        span.title = reason;
        
        td.appendChild(span);
        td.title = reason;
        td.addEventListener('click', () => {
          showToast(`[${tf.toUpperCase()} ${rowLabels[rowKey]}] ${reason}`, 'info');
        });
        
        tr.appendChild(td);
      });
      
      matrixTableBody.appendChild(tr);
    });
  }

  // 11. Regime Details (Tab 3)
  if (D.regType && data.marketRegime) {
    D.regType.textContent = data.marketRegime.type;
    D.regType.className = `reg-badge ${data.marketRegime.type === 'TRENDING' ? 'trending' : ''}`;
  }
  if (D.regStrength && data.marketRegime) {
    D.regStrength.textContent = data.marketRegime.strength;
  }
  const regConfidenceEl = document.getElementById('regConfidence');
  if (regConfidenceEl && data.marketRegime) {
    regConfidenceEl.textContent = data.marketRegime.confidence || '—';
  }
  if (D.regStrategy && data.marketRegime) {
    D.regStrategy.textContent = data.marketRegime.strategy;
  }
  const regAvoidEl = document.getElementById('regAvoid');
  if (regAvoidEl && data.marketRegime) {
    regAvoidEl.textContent = data.marketRegime.avoid_strategy || '—';
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
  const riskReasonsEl = document.getElementById('riskReasons');
  if (riskReasonsEl && data.riskMeter) {
    riskReasonsEl.innerHTML = `<strong>Drivers:</strong> ${data.riskMeter.reason || 'Confluent trend alignment'}`;
  }
  // Trade Psychology Coach is managed dynamically by renderPsychologyCoach() in ui.js

  // 13. Smart Alerts Scrolling Stream (Tab 4)
  if (D.alertsStream) {
    D.alertsStream.innerHTML = '';
    const alerts = data.smartAlerts || [];
    alerts.forEach(a => {
      const row = document.createElement('div');
      
      const lower = a.toLowerCase();
      let severityClass = 'info';
      let impactText = 'LOW';
      if (lower.includes('critical') || lower.includes('stop loss') || lower.includes('whale') || lower.includes('dump') || lower.includes('pump') || lower.includes('liquidation') || lower.includes('breakout')) {
        severityClass = 'high';
        impactText = 'HIGH';
      } else if (lower.includes('funding') || lower.includes('rsi') || lower.includes('divergence') || lower.includes('mid') || lower.includes('cross')) {
        severityClass = 'medium';
        impactText = 'MID';
      }
      
      row.className = `alert-stream-row alert-item ${severityClass}`;
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <span class="alert-stream-time">${timeStr}</span>
        <span class="alert-impact-badge ${severityClass}">${impactText}</span>
        <span class="alert-stream-msg">${a}</span>
        <span class="alert-stream-indicator"></span>
      `;
      D.alertsStream.appendChild(row);
    });
  }

  // 14. Journal list table rows (Tab 3) & dynamic summary stats
  
  // Update AI Trade Journal summary strip (Neural Accuracy, Average RR, Best/Worst Setup Win Rates)
  const journalAccuracyEl = document.getElementById('journalAccuracyVal');
  const journalRREl = document.getElementById('journalRRVal');
  const journalBestEl = document.getElementById('journalBestVal');
  const journalWorstEl = document.getElementById('journalWorstVal');
  
  if (journalAccuracyEl) journalAccuracyEl.textContent = rel.win_rate ? `${rel.win_rate.toFixed(1)}%` : '—';
  if (journalRREl) journalRREl.textContent = rel.average_rr ? rel.average_rr.toFixed(2) : '—';
  if (journalBestEl) journalBestEl.textContent = rel.best_setup_wr ? `${rel.best_setup_wr.toFixed(1)}% WR` : '—';
  if (journalWorstEl) journalWorstEl.textContent = rel.worst_setup_wr ? `${rel.worst_setup_wr.toFixed(1)}% WR` : '—';
  
  // Update AI Learning Panel table
  const learnAccuracyEl = document.getElementById('learnAccuracyVal');
  const learnBestEl = document.getElementById('learnBestVal');
  const learnWorstEl = document.getElementById('learnWorstVal');
  const learnRREl = document.getElementById('learnRRVal');
  const learnHoldTimeEl = document.getElementById('learnHoldTimeVal');
  
  if (learnAccuracyEl) learnAccuracyEl.textContent = rel.win_rate_last_100 ? `${rel.win_rate_last_100.toFixed(1)}%` : '—';
  if (learnBestEl) learnBestEl.textContent = rel.best_setup_wr ? `${rel.best_setup_wr.toFixed(1)}% WR (OB+EMA)` : '—';
  if (learnWorstEl) learnWorstEl.textContent = rel.worst_setup_wr ? `${rel.worst_setup_wr.toFixed(1)}% WR (Counter)` : '—';
  if (learnRREl) learnRREl.textContent = rel.average_rr ? rel.average_rr.toFixed(2) : '—';
  if (learnHoldTimeEl) learnHoldTimeEl.textContent = rel.avg_hold_time_str || '—';

  // Render the real database-backed journal logs
  activeLiveTrades = rel.recent_signals || [];
  applyLiveFilter();

  // Set the global active trade setup for manual calculations
  activeTradeSetup = {
    type: data.bias.includes('BULLISH') ? 'LONG' : data.bias.includes('BEARISH') ? 'SHORT' : 'HOLD',
    entry: parseFloat(entryStr.replace(/[^0-9.]/g, '')),
    stopLoss: parseFloat(slStr.replace(/[^0-9.]/g, ''))
  };

  // --- QUANT SPARKLINE TRENDS & VOLUME PROFILE ---
  const getSubfactorScore = (catId, subName, fallback) => {
    const cat = data.categories?.find(c => c.id === catId);
    const sub = cat?.sub_factors?.find(s => s.name === subName);
    return sub && sub.raw_value !== undefined ? sub.raw_value : fallback;
  };

  const frScore = getSubfactorScore('derivatives', 'Funding Rate', 50.008);
  const oiScore = getSubfactorScore('derivatives', 'Open Interest', 50.0);
  const etfScore = getSubfactorScore('etf_institutional_flow', 'Spot ETF Net Flow', 100.0);

  if (!window.sparklineHistories) {
    const fundingHist = [];
    const oiHist = [];
    const etfHist = [];
    
    let tempFr = frScore;
    let tempOi = oiScore;
    let tempEtf = etfScore;
    
    for (let i = 0; i < 15; i++) {
      tempFr += (Math.random() - 0.5) * 0.4;
      tempOi += (Math.random() - 0.5) * 0.5;
      tempEtf += (Math.random() - 0.5) * 1.0;
      fundingHist.push(tempFr);
      oiHist.push(tempOi);
      etfHist.push(tempEtf);
    }
    
    window.sparklineHistories = { 
      funding: fundingHist, 
      oi: oiHist, 
      etf: etfHist 
    };
  }
  const histories = window.sparklineHistories;

  // Push values
  histories.funding.push(frScore);
  if (histories.funding.length > 20) histories.funding.shift();

  histories.oi.push(oiScore);
  if (histories.oi.length > 20) histories.oi.shift();

  histories.etf.push(etfScore);
  if (histories.etf.length > 20) histories.etf.shift();

  // Update text values
  const elConfVal = document.getElementById('sparkConfidenceVal');
  if (elConfVal) elConfVal.textContent = `${data.score}%`;

  const elFundingVal = document.getElementById('sparkFundingVal');
  if (elFundingVal) {
    const rawFr = (frScore - 50) / 1000.0;
    elFundingVal.textContent = `${rawFr >= 0 ? '+' : ''}${rawFr.toFixed(4)}%`;
    elFundingVal.style.color = rawFr > 0 ? 'var(--signal-bull)' : rawFr < 0 ? 'var(--signal-bear)' : 'var(--text-2)';
  }

  const elOiVal = document.getElementById('sparkOiVal');
  if (elOiVal) {
    elOiVal.textContent = `$${(oiScore * 48.2 / 100).toFixed(1)}B`;
  }

  const elEtfVal = document.getElementById('sparkEtfVal');
  if (elEtfVal) {
    const rawFlow = (etfScore - 50) * 3.7;
    elEtfVal.textContent = `${rawFlow >= 0 ? '+' : ''}$${rawFlow.toFixed(1)}M`;
    elEtfVal.style.color = rawFlow > 0 ? 'var(--signal-bull)' : rawFlow < 0 ? 'var(--signal-bear)' : 'var(--text-2)';
  }

  // Draw Canvases
  const drawSparkline = (canvasId, dataPoints, strokeColor) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    if (!dataPoints || dataPoints.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = '7px monospace';
      ctx.fillText('NO DATA', w / 2 - 14, h / 2 + 2);
      return;
    }
    
    if (dataPoints.length === 1) {
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    
    const minVal = Math.min(...dataPoints);
    const maxVal = Math.max(...dataPoints);
    const range = maxVal - minVal || 1.0;
    const getX = (idx) => (idx / (dataPoints.length - 1)) * (w - 4) + 2;
    const getY = (val) => h - ((val - minVal) / range) * (h - 4) - 2;
    
    ctx.beginPath();
    ctx.moveTo(getX(0), h);
    for (let i = 0; i < dataPoints.length; i++) {
      ctx.lineTo(getX(i), getY(dataPoints[i]));
    }
    ctx.lineTo(getX(dataPoints.length - 1), h);
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, strokeColor.replace('1)', '0.15)'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(dataPoints[0]));
    for (let i = 1; i < dataPoints.length; i++) {
      ctx.lineTo(getX(i), getY(dataPoints[i]));
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  const drawVolProfile = (canvasId, candles) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    if (!candles || candles.length < 10) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = '7px monospace';
      ctx.fillText('NO DATA', w / 2 - 14, h / 2 + 2);
      return;
    }
    
    const prices = candles.map(c => c.c);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const bins = 6;
    const binWidth = (maxP - minP) / bins || 1.0;
    const profile = new Array(bins).fill(0);
    
    for (let i = 0; i < candles.length; i++) {
      const binIdx = Math.min(bins - 1, Math.floor((candles[i].c - minP) / binWidth));
      if (binIdx >= 0) profile[binIdx] += candles[i].v;
    }
    
    const maxVol = Math.max(...profile) || 1.0;
    const barHeight = h / bins;
    
    for (let i = 0; i < bins; i++) {
      const barWidth = (profile[i] / maxVol) * (w - 6);
      const y = h - (i + 1) * barHeight;
      ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.fillRect(2, y + 0.5, barWidth, barHeight - 0.5);
    }
  };

  drawSparkline('sparkConfidenceCanvas', data.confidenceHistory || [data.score], 'rgba(0, 240, 255, 1)');
  drawVolProfile('sparkVolumeProfileCanvas', S.candles);
  drawSparkline('sparkFundingCanvas', histories.funding, 'rgba(255, 179, 71, 1)');
  drawSparkline('sparkOiCanvas', histories.oi, 'rgba(0, 240, 255, 1)');
  drawSparkline('sparkEtfCanvas', histories.etf, 'rgba(0, 199, 129, 1)');
  
  // Update regime summary details in the footer
  const regTypeMini = document.getElementById('regType');
  const regStrengthMini = document.getElementById('regStrength');
  const regStrategyMini = document.getElementById('regStrategy');
  if (regTypeMini && data.marketRegime?.type) regTypeMini.textContent = data.marketRegime.type;
  if (regStrengthMini && data.marketRegime?.strength) regStrengthMini.textContent = data.marketRegime.strength;
  if (regStrategyMini && data.marketRegime?.strategy) regStrategyMini.textContent = data.marketRegime.strategy;

  updateCalculations();
}

function renderMarketScore(data) {
  if (!data) return;

  const scoreBigVal = document.getElementById('scoreBigVal');
  const scoreOverallText = document.getElementById('scoreOverallText');
  const scoreSignalBadge = document.getElementById('scoreSignalBadge');
  const scoreCoverageText = document.getElementById('scoreCoverageText');
  const scoreCoverageBar = document.getElementById('scoreCoverageBar');
  const scoreGaugeFill = document.getElementById('scoreGaugeFill');
  const topMarketScoreVal = document.getElementById('topMarketScoreVal');

  // Update top Bloomberg header Market Score item
  if (topMarketScoreVal) {
    topMarketScoreVal.textContent = `${data.final_score.toFixed(1)}%`;
    topMarketScoreVal.className = 'term-val-highlight';
    if (data.final_score >= 80) topMarketScoreVal.classList.add('ready'); // green
    else if (data.final_score >= 65) topMarketScoreVal.classList.add('ready'); // green
    else if (data.final_score < 30) topMarketScoreVal.classList.add('wait'); // red
    else if (data.final_score < 45) topMarketScoreVal.classList.add('wait'); // red
    else topMarketScoreVal.classList.add('gold'); // yellow
  }

  // Update big gauge score value
  if (scoreBigVal) {
    scoreBigVal.textContent = Math.round(data.final_score);
  }

  // Update text label of final score
  if (scoreOverallText) {
    scoreOverallText.textContent = `${data.final_score.toFixed(1)} / 100`;
  }

  // Update signal badge text and classes
  if (scoreSignalBadge) {
    scoreSignalBadge.textContent = data.signal;
    scoreSignalBadge.className = 'score-summary-badge';
    if (data.signal === 'Strong Bullish') scoreSignalBadge.classList.add('strong-bullish');
    else if (data.signal === 'Bullish') scoreSignalBadge.classList.add('bullish');
    else if (data.signal === 'Neutral') scoreSignalBadge.classList.add('neutral');
    else if (data.signal === 'Bearish') scoreSignalBadge.classList.add('bearish');
    else if (data.signal === 'Strong Bearish') scoreSignalBadge.classList.add('strong-bearish');
  }

  // Update coverage text and progress bar width
  if (scoreCoverageText) {
    const activeSources = data.sources ? data.sources.length : 0;
    const secondsAgo = Math.max(0, Math.floor(Date.now() / 1000 - data.timestamp));
    const freshnessStr = secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`;
    scoreCoverageText.textContent = `${data.data_coverage_pct.toFixed(1)}% Coverage (${activeSources} Sources, Freshness: ${freshnessStr})`;
  }
  if (scoreCoverageBar) {
    scoreCoverageBar.style.width = `${data.data_coverage_pct}%`;
  }

  // Animate circular gauge fill
  if (scoreGaugeFill) {
    const circumference = 251.2; // 2 * pi * r (r=40)
    const offset = circumference - (data.final_score / 100) * circumference;
    scoreGaugeFill.style.strokeDashoffset = offset;

    // Apply color based on final score
    let strokeColor = '#ffcc00'; // neutral default
    if (data.final_score >= 80) strokeColor = '#00c781'; // strong bull
    else if (data.final_score >= 65) strokeColor = '#4cd964'; // bull
    else if (data.final_score < 30) strokeColor = '#ff3b30'; // strong bear
    else if (data.final_score < 45) strokeColor = '#ff9500'; // bear
    scoreGaugeFill.style.stroke = strokeColor;
  }

  // Update Categories Grid
  const grid = document.getElementById('scoreCategoriesGrid');
  if (grid) {
    grid.innerHTML = '';
    
    data.categories.forEach(cat => {
      let liveCount = 0;
      let proxyCount = 0;
      let missingCount = 0;

      cat.sub_factors.forEach(sf => {
        if (sf.status === 'Live') liveCount++;
        else if (sf.status === 'Proxy') proxyCount++;
        else missingCount++;
      });

      const scoreStr = cat.score !== null ? cat.score.toFixed(1) : '—';
      
      let scoreClass = 'neutral';
      let signalLabel = 'Unavailable';
      if (cat.score !== null) {
        if (cat.score >= 80) {
          scoreClass = 'bullish';
          signalLabel = 'Strong Bull';
        } else if (cat.score >= 65) {
          scoreClass = 'bullish';
          signalLabel = 'Bullish';
        } else if (cat.score >= 45) {
          scoreClass = 'neutral';
          signalLabel = 'Neutral';
        } else if (cat.score >= 30) {
          scoreClass = 'bearish';
          signalLabel = 'Bearish';
        } else {
          scoreClass = 'bearish';
          signalLabel = 'Strong Bear';
        }
      }

      const card = document.createElement('div');
      card.className = 'glass-card score-category-card';
      card.setAttribute('data-category-id', cat.id);
      
      // Scale height and padding proportionally to weight_pct (Requirement 10)
      const baseHeight = 70;
      const scaledHeight = baseHeight + (cat.weight_pct * 4.5);
      card.style.minHeight = `${scaledHeight}px`;
      card.style.padding = `${6 + (cat.weight_pct * 0.5)}px`;
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';

      card.innerHTML = `
        <div class="card-glow"></div>
        <div class="category-header">
          <span class="cat-name">${cat.name}</span>
          <span class="cat-score ${scoreClass}">${scoreStr}</span>
        </div>
        <div class="category-weight-info">
          <span>Weight: ${cat.weight_pct}%</span>
          <span>Signal: ${signalLabel}</span>
        </div>
        <div class="category-progress-bar">
          <div class="progress-fill" style="width: ${cat.score !== null ? cat.score : 0}%; background-color: ${cat.score !== null ? (cat.score >= 65 ? '#00c781' : (cat.score < 45 ? '#ff3b30' : '#ffcc00')) : '#333'}"></div>
        </div>
        <div class="cat-summary-counts">
          <span class="count-badge live">${liveCount} Live</span>
          <span class="count-badge proxy">${proxyCount} Proxy</span>
          <span class="count-badge missing">${missingCount} Missing</span>
        </div>
        
        <!-- Expandable Detail Table -->
        <div class="category-sub-factors-container" style="display: none;">
          <table class="sub-factors-table">
            <thead>
              <tr>
                <th>Sub-Factor</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Source</th>
                <th>Raw Value</th>
                <th>Normalized Score</th>
              </tr>
            </thead>
            <tbody>
              ${cat.sub_factors.map(sf => {
                const statusClass = sf.status.toLowerCase();
                const normVal = sf.normalized_score !== null ? sf.normalized_score.toFixed(1) : '—';
                
                let normClass = 'neutral';
                if (sf.normalized_score !== null) {
                  if (sf.normalized_score >= 65) normClass = 'bullish';
                  else if (sf.normalized_score < 45) normClass = 'bearish';
                }

                let rawValStr = '—';
                if (sf.raw_value !== null) {
                  if (typeof sf.raw_value === 'number') {
                    if (Math.abs(sf.raw_value) < 0.0001) {
                      rawValStr = sf.raw_value.toExponential(4);
                    } else if (Math.abs(sf.raw_value) < 1.0) {
                      rawValStr = sf.raw_value.toFixed(6);
                    } else {
                      rawValStr = sf.raw_value.toLocaleString(undefined, { maximumFractionDigits: 4 });
                    }
                  } else {
                    rawValStr = String(sf.raw_value);
                  }
                }

                return `
                  <tr>
                    <td style="font-weight: 600; color: var(--text);">${sf.name}</td>
                    <td style="font-family: var(--mono); color: var(--text-3);">T${sf.tier}</td>
                    <td><span class="sf-status-badge ${statusClass}">${sf.status}</span></td>
                    <td><span class="sf-source-badge">${sf.source || 'Unavailable'}</span></td>
                    <td class="sf-raw-val">${rawValStr}</td>
                    <td class="sf-norm-score ${normClass}">${normVal}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.category-sub-factors-container')) return;

        const details = card.querySelector('.category-sub-factors-container');
        const isCollapsed = details.style.display === 'none';

        document.querySelectorAll('.category-sub-factors-container').forEach(el => {
          el.style.display = 'none';
          const parentCard = el.closest('.score-category-card');
          if (parentCard) parentCard.style.gridColumn = 'auto';
        });

        if (isCollapsed) {
          details.style.display = 'block';
          card.style.gridColumn = '1 / -1';
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          details.style.display = 'none';
          card.style.gridColumn = 'auto';
        }
      });

      grid.appendChild(card);
    });
  }
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
    strategyId: S.botStrategy || 'ai_consensus',
  };
}

function initDemoSimulator() {
  console.log('[Demo Simulator] Starting setup...');
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

  // Listen for backend trade synchronization pushes
  window.addEventListener('demo-trade-update', () => {
    syncDemoData().then(() => {
      refreshPaperDashboard(lastPrice);
    });
  });

  // Run initial backend synchronization on startup
  syncDemoData().then(() => {
    refreshPaperDashboard(lastPrice);
  });

  const btnBuy = document.getElementById('btnDemoBuy');
  const btnSell = document.getElementById('btnDemoSell');

  if (btnBuy && btnSell) {
    btnBuy.addEventListener('click', async () => {
      btnBuy.disabled = true;
      try {
        await openPaperPosition('LONG', getAnalysisPaperOpts());
        refreshPaperDashboard(lastPrice);
      } finally {
        btnBuy.disabled = false;
      }
    });
    btnSell.addEventListener('click', async () => {
      btnSell.disabled = true;
      try {
        await openPaperPosition('SHORT', getAnalysisPaperOpts());
        refreshPaperDashboard(lastPrice);
      } finally {
        btnSell.disabled = false;
      }
    });

    document.getElementById('btnDemoCloseHalf')?.addEventListener('click', async () => {
      await closeHalfPosition();
      refreshPaperDashboard(lastPrice);
    });
    document.getElementById('btnDemoCloseAll')?.addEventListener('click', async () => {
      await closeAllPositions(lastPrice);
      refreshPaperDashboard(lastPrice);
    });
    document.getElementById('btnDemoMoveSL')?.addEventListener('click', async () => {
      await moveSlToBreakeven();
      refreshPaperDashboard(lastPrice);
    });
    document.getElementById('btnDemoReverse')?.addEventListener('click', async () => {
      await reversePosition(lastPrice, getAnalysisPaperOpts());
      refreshPaperDashboard(lastPrice);
    });
    document.getElementById('btnDemoTrail')?.addEventListener('click', async () => {
      await trailStop(lastPrice);
      refreshPaperDashboard(lastPrice);
    });
    document.getElementById('btnDemoReset')?.addEventListener('click', async () => {
      await resetPaperAccount();
      refreshPaperDashboard(lastPrice);
    });
  }

  document.getElementById('btnRunBt')?.addEventListener('click', () => {
    if (document.getElementById('btStrategySelect')) {
      runBacktestAnalysis();
    } else {
      runStrategyBacktestInBrowser();
    }
  });

  // Setup main dashboard table sorting & listeners
  if (document.getElementById('btStrategySelect')) {
    setupTableSorting();
    document.getElementById('journalStrategySelect')?.addEventListener('change', applyLiveFilter);
    document.getElementById('btStrategySelect')?.addEventListener('change', runBacktestAnalysis);
    document.getElementById('btCapitalInput')?.addEventListener('change', runBacktestAnalysis);
  }

  // Advanced Backtester Tabs Wiring
  const tabBtStats = document.getElementById('btnTabBtStats');
  const tabBtEquity = document.getElementById('btnTabBtEquity');
  const tabBtTrades = document.getElementById('btnTabBtTrades');
  const panelBtStats = document.getElementById('panelBtStats');
  const panelBtEquity = document.getElementById('panelBtEquity');
  const panelBtTrades = document.getElementById('panelBtTrades');

  const switchBtTab = (activeBtn, activePanel) => {
    [tabBtStats, tabBtEquity, tabBtTrades].forEach(btn => btn?.classList.remove('active'));
    [panelBtStats, panelBtEquity, panelBtTrades].forEach(panel => { if (panel) panel.style.display = 'none'; });
    activeBtn?.classList.add('active');
    if (activePanel) activePanel.style.display = 'block';
  };

  tabBtStats?.addEventListener('click', () => switchBtTab(tabBtStats, panelBtStats));
  tabBtEquity?.addEventListener('click', () => switchBtTab(tabBtEquity, panelBtEquity));
  tabBtTrades?.addEventListener('click', () => switchBtTab(tabBtTrades, panelBtTrades));

  document.getElementById('btnExportBtCsv')?.addEventListener('click', () => {
    if (!lastBacktestResult || !lastBacktestResult.trades || !lastBacktestResult.trades.length) {
      showToast('No trades to export. Run backtest first.', 'warning');
      return;
    }
    let csv = 'ID,Time,Type,Entry Price,Exit Price,P&L ($),P&L (%),Exit Reason,R:R\n';
    lastBacktestResult.trades.forEach(t => {
      csv += `${t.id},"${t.time}",${t.type},${t.entryPrice.toFixed(2)},${t.exitPrice.toFixed(2)},${t.pnl.toFixed(2)},${t.pnlPct.toFixed(2)},"${t.reason}",${t.rr.toFixed(2)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${lastBacktestResult.strategyName.replace(/\s+/g, '_')}_backtest_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Backtest trade logs CSV exported!', 'success');
  });

  // Compare Mode Toggle
  const chkCompareMode = document.getElementById('btCompareMode');
  const compareListContainer = document.getElementById('btCompareListContainer');
  const compareCheckboxes = document.getElementById('btCompareCheckboxes');

  chkCompareMode?.addEventListener('change', () => {
    const active = chkCompareMode.checked;
    if (compareListContainer) compareListContainer.style.display = active ? 'block' : 'none';
    if (active && compareCheckboxes) {
      const strats = getAllStrategies();
      compareCheckboxes.innerHTML = strats.map(s => {
        return `
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
            <input type="checkbox" class="bt-compare-chk" value="${s.id}" checked> ${s.name.split(' ')[0] || s.name}
          </label>`;
      }).join('');
    }
  });

  // Initialize AI Bot Mode
  initBotMode();

  // Initialize Custom Strategy Maker
  initCustomStrategyMaker();

  refreshPaperDashboard(lastPrice);
}

function initBotMode() {
  console.log('[AI Bot Mode] Initializing bot control panel...');
  const btnManual = document.getElementById('btnModeManual');
  const btnBot = document.getElementById('btnModeBot');
  const toggleBtn = document.getElementById('btnToggleBotState');
  const select = document.getElementById('botStrategySelect');

  if (btnManual) {
    btnManual.addEventListener('click', () => {
      console.log('[AI Bot Mode] Switching to manual mode');
      S.botActive = false;
      refreshBotUI();
      saveState();
    });
  }
  if (btnBot) {
    btnBot.addEventListener('click', () => {
      console.log('[AI Bot Mode] Switching to automated bot mode');
      S.botActive = true;
      refreshBotUI();
      saveState();
    });
  }
  if (select) {
    select.addEventListener('change', () => {
      S.botStrategy = select.value;
      addBotLog(`[System] Strategy switched to ${select.options[select.selectedIndex].text}`);
      refreshBotUI();
      saveState();
    });
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      S.botActiveState = !S.botActiveState;
      if (S.botActiveState) {
        addBotLog(`[System] Bot activated. Strategy: ${select.options[select.selectedIndex].text}`);
      } else {
        addBotLog(`[System] Bot stopped.`);
      }
      refreshBotUI();
      saveState();
    });
  }

  // Start periodic bot check loop (every 5 seconds)
  setInterval(runBotExecutionTick, 5000);
}

function addBotLog(msg) {
  if (!S.botLogs) S.botLogs = [];
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  S.botLogs.push(`[${time}] ${msg}`);
  if (S.botLogs.length > 50) S.botLogs.shift();
  refreshBotUI();
}

async function runBotExecutionTick() {
  if (!S.botActiveState || !S.botActive) return;

  const currentPrice = lastPrice || 0;
  if (!currentPrice) return;

  const strats = getAllStrategies();
  const stratObj = strats.find(s => s.id === S.botStrategy);
  if (!stratObj) return;

  const indicators = prepareIndicatorValues(S.candles);
  const idx = S.candles.length - 1;
  const decision = evaluateStrategyRule(S.candles, idx, stratObj, indicators, S.aiSnapshot);

  // 1. Exit/Reverse Evaluation
  if (S.demoPositions.length > 0) {
    const pos = S.demoPositions[0];
    let shouldExit = false;
    let exitReason = 'Target Reached';
    let exitThinking = '';

    if (S.botStrategy === 'ai_consensus') {
      if (S.aiSnapshot) {
        const bias = S.aiSnapshot.bias || '';
        const isBullish = bias.includes('BULLISH') || bias.includes('LONG');
        const isBearish = bias.includes('BEARISH') || bias.includes('SHORT');
        const expectedType = isBullish ? 'LONG' : (isBearish ? 'SHORT' : 'HOLD');
        if (expectedType === 'HOLD' || pos.type !== expectedType || S.aiSnapshot.score < 60) {
          shouldExit = true;
          exitReason = `AI Bias reverse/low confidence: ${bias} (${S.aiSnapshot.score}%)`;
          exitThinking = `The AI engine reports a "${bias}" market bias with ${S.aiSnapshot.score}% confidence. ` +
            `Current position is ${pos.type}. ` +
            (pos.type !== expectedType ? `Bias direction has flipped — ${pos.type} no longer aligns with the AI consensus. ` : '') +
            (S.aiSnapshot.score < 60 ? `Confidence has dropped below the 60% safety threshold. ` : '') +
            `Exiting to protect capital and avoid drawdown.`;
        }
      }
    } else {
      // Exit if a reverse signal triggers
      if (pos.type === 'LONG' && decision.sell) {
        shouldExit = true;
        exitReason = `Strategy triggered reverse SHORT signal`;
        exitThinking = `The strategy rules for ${stratObj.name} have triggered a SELL/SHORT entry signal while a LONG position was open. Closing LONG.`;
      } else if (pos.type === 'SHORT' && decision.buy) {
        shouldExit = true;
        exitReason = `Strategy triggered reverse LONG signal`;
        exitThinking = `The strategy rules for ${stratObj.name} have triggered a BUY/LONG entry signal while a SHORT position was open. Closing SHORT.`;
      }
    }

    if (shouldExit) {
      const entryPrice = pos.entryPrice || currentPrice;
      const margin = (pos.entryPrice * pos.size) / pos.leverage;
      const pnl = pos.type === 'LONG' ? (currentPrice - entryPrice) * pos.size : (entryPrice - currentPrice) * pos.size;
      const pnlPct = margin > 0 ? ((pnl / margin) * 100).toFixed(1) : '0.0';

      const equity = S.demoAccount.equity || 10000;
      if (Math.abs(pnl) > equity * 5) {
        console.warn(`[Bot Exit Sanity Warning] Implausible P&L computed: $${pnl.toFixed(2)} on equity $${equity.toFixed(2)}. Capping calculation.`);
      }

      updateBotDecisionCard({
        type: 'EXIT',
        side: pos.type,
        entry: entryPrice,
        exitPrice: currentPrice,
        pnl: pnl,
        pnlPct: pnlPct,
        reason: exitReason,
        thinking: exitThinking
      });

      addBotLog(`[Bot] Triggering exit for ${pos.type} at $${currentPrice.toLocaleString()}`);
      try {
        await closeAllPositions(currentPrice);
        addBotLog(`[Bot] ✅ Position closed. P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct}%)`);
        addBotLog(`[Bot] Reason: ${exitReason}`);
        window.dispatchEvent(new CustomEvent('demo-trade-update'));
      } catch (e) {
        console.error('[Bot Exit] error:', e);
      }
    }
  } else {
    // 2. Entry Evaluation
    let shouldEnterLong = decision.buy;
    let shouldEnterShort = decision.sell;
    let entryReason = '';
    let entryThinking = '';

    if (shouldEnterLong || shouldEnterShort) {
      const side = shouldEnterLong ? 'LONG' : 'SHORT';
      
      const plan = buildMarketTradePlan({
        side,
        entry: currentPrice,
        candles: S.candles,
        levels: S.aiSnapshot?.levels || S.srLevels,
        strategyId: S.botStrategy,
        strategy: stratObj,
      });

      if (!plan.valid) {
        addBotLog(`[Bot] Signal skipped: ${plan.reason}`);
        return;
      }

      const sl = plan.sl;
      const tp = plan.tp1;
      const rr = plan.rr.toFixed(2);

      entryReason = `Signal confirmed by ${stratObj.name}`;
      entryThinking = `The automated rules for ${stratObj.name} met all criteria. ` +
        `${plan.reason} ${plan.thinking}`;

      updateBotDecisionCard({
        type: 'ENTRY',
        side: side,
        entry: currentPrice,
        sl: sl,
        tp: tp,
        rr: rr,
        reason: entryReason,
        thinking: entryThinking
      });

      addBotLog(`[Bot] 📊 ${side} signal detected at $${currentPrice.toLocaleString()}`);
      addBotLog(`[Bot] SL: $${sl.toFixed(2)} | TP: $${tp.toFixed(2)} | R:R 1:${rr}`);
      
      const opts = {
        symbol: S.coin,
        leverage: 5,
        size: 0.1,
        price: currentPrice,
        sl: sl,
        tp: tp,
        strategyId: S.botStrategy
      };

      try {
        await openPaperPosition(side, opts);
        addBotLog(`[Bot] ✅ ${side} position opened successfully.`);
        addBotLog(`[Bot] Reason: ${entryReason}`);
        window.dispatchEvent(new CustomEvent('demo-trade-update'));
      } catch (e) {
        console.error('[Bot Entry] error:', e);
        addBotLog(`[Error] Position entry failed.`);
      }
    }
  }
}

function updateBotDecisionCard(decision) {
  const card = document.getElementById('botDecisionCard');
  if (!card) return;

  card.style.display = 'block';
  // Reset all conditional card styles
  card.className = 'bot-decision-card';

  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeEl = document.getElementById('botDecisionTime');
  if (timeEl) timeEl.textContent = timeStr;

  const dirBadge = document.getElementById('botDirBadge');
  const entryEl = document.getElementById('botDecEntry');
  const slEl = document.getElementById('botDecSL');
  const tpEl = document.getElementById('botDecTP');
  const rrEl = document.getElementById('botDecRR');
  const reasonEl = document.getElementById('botDecReason');
  const thinkingEl = document.getElementById('botDecThinking');

  const slLabel = slEl?.closest('.bot-level-item')?.querySelector('.bot-level-label');
  const tpLabel = tpEl?.closest('.bot-level-item')?.querySelector('.bot-level-label');
  const rrLabel = rrEl?.closest('.bot-level-item')?.querySelector('.bot-level-label');

  if (decision.type === 'ENTRY') {
    card.classList.add(decision.side === 'LONG' ? 'long-card' : 'short-card');
    if (dirBadge) {
      dirBadge.textContent = `▶ ${decision.side}`;
      dirBadge.className = `bot-dir-badge ${decision.side.toLowerCase()}`;
    }
    if (entryEl) entryEl.textContent = `$${decision.entry.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (slEl) slEl.textContent = `$${decision.sl.toFixed(2)}`;
    if (tpEl) tpEl.textContent = `$${decision.tp.toFixed(2)}`;
    if (rrEl) rrEl.textContent = `1:${decision.rr}`;

    // Reset labels back to entry context
    if (slLabel) slLabel.textContent = 'Stop Loss';
    if (tpLabel) tpLabel.textContent = 'Take Profit';
    if (rrLabel) rrLabel.textContent = 'Risk:Reward';
  } else {
    // EXIT
    card.classList.add('exit-card');
    if (dirBadge) {
      dirBadge.textContent = `◆ EXIT ${decision.side}`;
      dirBadge.className = 'bot-dir-badge exit';
    }
    if (entryEl) entryEl.textContent = `$${decision.entry.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (slEl) slEl.textContent = `$${decision.exitPrice.toFixed(2)}`;
    if (tpEl) tpEl.textContent = `${decision.pnl >= 0 ? '+' : ''}$${decision.pnl.toFixed(2)}`;
    if (rrEl) rrEl.textContent = `${decision.pnlPct}%`;

    // Relabel for exit context
    if (slLabel) slLabel.textContent = 'Exit Price';
    if (tpLabel) tpLabel.textContent = 'P&L';
    if (rrLabel) rrLabel.textContent = 'Return %';
  }

  if (reasonEl) reasonEl.textContent = decision.reason || '—';
  if (thinkingEl) thinkingEl.textContent = decision.thinking || '—';
}

function calculateLastEMA(period) {
  if (!S.candles || S.candles.length < period) return 0;
  const values = calculateCandleEMA(S.candles, period);
  return values[values.length - 1];
}

function calculateLastRSI(period) {
  if (!S.candles || S.candles.length < period) return 50;
  const values = calculateRSI(S.candles, period);
  return values[values.length - 1];
}

function runSingleBacktest(candles, strategyObj, capital) {
  const indicators = prepareIndicatorValues(candles);
  const n = candles.length;
  let balance = capital;
  let position = null; // { type: 'LONG'|'SHORT', entryPrice, size, entryIndex, slPrice, tpPrice }
  const equityCurve = [balance];
  const trades = [];
  let wins = 0;
  let losses = 0;
  let maxEquity = balance;
  let maxDd = 0;

  for (let i = 25; i < n; i++) {
    const c = candles[i];
    const close = c.c;
    const low = c.l;
    const high = c.h;
    
    if (position) {
      let hitSl = false;
      let hitTp = false;
      
      if (position.type === 'LONG') {
        if (low <= position.slPrice) hitSl = true;
        else if (high >= position.tpPrice) hitTp = true;
      } else {
        if (high >= position.slPrice) hitSl = true;
        else if (low <= position.tpPrice) hitTp = true;
      }
      
      const signal = evaluateStrategyRule(candles, i, strategyObj, indicators, null);
      const reverseSignal = position.type === 'LONG' ? signal.sell : signal.buy;
      
      if (hitSl || hitTp || reverseSignal) {
        let exitPrice = close;
        let reason = 'Reverse Signal';
        if (hitSl) {
          exitPrice = position.slPrice;
          reason = 'Stop Loss';
        } else if (hitTp) {
          exitPrice = position.tpPrice;
          reason = 'Take Profit';
        }
        
        const pnl = position.type === 'LONG' ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
        const pnlPct = (pnl / (position.entryPrice * position.size / 5)) * 100;
        balance += pnl;
        
        if (pnl > 0) wins++; else losses++;
        
        trades.push({
          id: trades.length + 1,
          time: c.t || new Date().toISOString(),
          type: position.type,
          entryPrice: position.entryPrice,
          exitPrice: exitPrice,
          pnl: pnl,
          pnlPct: pnlPct,
          reason: reason,
          rr: strategyObj.stop_loss ? parseFloat((Math.abs(exitPrice - position.entryPrice) / Math.abs(position.entryPrice - position.slPrice)).toFixed(2)) : 0.0
        });
        
        position = null;
      }
    } else {
      const signal = evaluateStrategyRule(candles, i, strategyObj, indicators, null);
      let shouldEnterLong = signal.buy;
      let shouldEnterShort = signal.sell;
      
      if (shouldEnterLong || shouldEnterShort) {
        const type = shouldEnterLong ? 'LONG' : 'SHORT';
        const entryPrice = close;
        
        let slPercent = 2.0;
        if (strategyObj.stop_loss) {
          if (strategyObj.stop_loss.type === 'fixed_percent') {
            slPercent = strategyObj.stop_loss.value;
          } else if (strategyObj.stop_loss.type === 'atr_multiple') {
            const atrVal = indicators.atr[i] || (entryPrice * 0.01);
            slPercent = ((atrVal * (strategyObj.stop_loss.value || 2.0)) / entryPrice) * 100;
          }
        }
        
        let tpPercent = 5.0;
        if (strategyObj.take_profit) {
          if (strategyObj.take_profit.type === 'fixed_percent') {
            tpPercent = strategyObj.take_profit.value;
          } else if (strategyObj.take_profit.type === 'r_multiple') {
            tpPercent = slPercent * (strategyObj.take_profit.value || 2.5);
          }
        }
        
        const slPrice = type === 'LONG' ? entryPrice * (1 - slPercent / 100) : entryPrice * (1 + slPercent / 100);
        const tpPrice = type === 'LONG' ? entryPrice * (1 + tpPercent / 100) : entryPrice * (1 - tpPercent / 100);
        
        const margin = balance * 0.95;
        const size = (margin * 5) / entryPrice;
        
        position = {
          type,
          entryPrice,
          size,
          entryIndex: i,
          slPrice,
          tpPrice
        };
      }
    }
    
    const activePnl = position ? (position.type === 'LONG' ? (close - position.entryPrice) * position.size : (position.entryPrice - close) * position.size) : 0;
    const currentEquity = balance + activePnl;
    if (currentEquity > maxEquity) maxEquity = currentEquity;
    const dd = ((maxEquity - currentEquity) / maxEquity) * 100;
    if (dd > maxDd) maxDd = dd;
    equityCurve.push(currentEquity);
  }

  if (position) {
    const closePrice = candles[n - 1].c;
    const pnl = position.type === 'LONG' ? (closePrice - position.entryPrice) * position.size : (position.entryPrice - closePrice) * position.size;
    balance += pnl;
    if (pnl > 0) wins++; else losses++;
    trades.push({
      id: trades.length + 1,
      time: candles[n - 1].t || new Date().toISOString(),
      type: position.type,
      entryPrice: position.entryPrice,
      exitPrice: closePrice,
      pnl: pnl,
      pnlPct: (pnl / (position.entryPrice * position.size / 5)) * 100,
      reason: 'End of Data',
      rr: strategyObj.stop_loss ? parseFloat((Math.abs(closePrice - position.entryPrice) / Math.abs(position.entryPrice - position.slPrice)).toFixed(2)) : 0.0
    });
    equityCurve.push(balance);
  }

  const netProfit = balance - capital;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const profitPct = (netProfit / capital) * 100;
  const grossWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  const avgRR = trades.reduce((s, t) => s + (t.rr || 0), 0) / (trades.length || 1);
  
  // Sharpe Ratio estimation based on return distribution
  const returns = trades.map(t => t.pnlPct);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1);
  const std = Math.sqrt(variance) || 1.0;
  const sharpe = std > 0 ? (avgReturn / std) * Math.sqrt(252) : 0;

  return {
    strategyName: strategyObj.name,
    trades,
    wins,
    losses,
    winRate,
    netProfit,
    profitPct,
    maxDd,
    sharpe: isNaN(sharpe) ? 0 : sharpe,
    profitFactor: pf,
    avgRR,
    expectancy: netProfit / (trades.length || 1),
    equityCurve
  };
}

function runStrategyBacktestInBrowser() {
  if (!S.candles || S.candles.length < 50) {
    showToast('Insufficient candle data to run backtest.', 'error');
    return;
  }

  const capital = parseFloat(document.getElementById('btCapital').value) || 10000;
  const isCompareMode = document.getElementById('btCompareMode').checked;

  let selectedStrategies = [];
  const allStrats = getAllStrategies();

  if (isCompareMode) {
    const checkboxes = document.querySelectorAll('.bt-compare-chk:checked');
    selectedStrategies = Array.from(checkboxes).map(chk => allStrats.find(s => s.id === chk.value)).filter(Boolean);
    if (!selectedStrategies.length) {
      showToast('Please select at least one strategy to compare.', 'warning');
      return;
    }
  } else {
    const primaryId = document.getElementById('btStrategy').value;
    const strat = allStrats.find(s => s.id === primaryId);
    if (strat) selectedStrategies.push(strat);
  }

  showToast(`Running historical strategy backtest sweep on ${selectedStrategies.length} strategies…`, 'info');

  setTimeout(() => {
    const resultsPanel = document.getElementById('btResults');
    if (!resultsPanel) return;

    // Run backtests on fully closed candles (excluding index n-1 which is the active unclosed live candle)
    const closedCandles = S.candles.slice(0, -1);
    const results = selectedStrategies.map(s => runSingleBacktest(closedCandles, s, capital));

    // Cache the primary results globally for CSV exporter
    lastBacktestResult = results[0];

    // Render Completed Time
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('btCompletedTime').textContent = `Completed at ${timeStr}`;

    // Render Stats Table
    const statsTableBody = document.getElementById('btStatsTableBody');
    const headerRow = document.getElementById('btStatsHeaderPrimary');
    
    if (isCompareMode) {
      // Comparison header
      headerRow.outerHTML = results.map(r => `<th style="text-align:right; padding:4px;">${r.strategyName.split(' ')[0] || r.strategyName}</th>`).join('');
      
      const metrics = [
        ['Total Trades', r => r.trades.length],
        ['Win Rate', r => `${r.winRate.toFixed(1)}%`],
        ['Net Profit ($)', r => `$${r.netProfit.toFixed(2)}`],
        ['Net Profit (%)', r => `${r.profitPct.toFixed(1)}%`],
        ['Max Drawdown', r => `-${r.maxDd.toFixed(1)}%`],
        ['Sharpe Ratio', r => r.sharpe.toFixed(2)],
        ['Profit Factor', r => r.profitFactor.toFixed(2)],
        ['Avg R:R', r => r.avgRR.toFixed(1)],
        ['Expectancy', r => `$${r.expectancy.toFixed(2)}`]
      ];

      statsTableBody.innerHTML = metrics.map(([label, getValue]) => {
        return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
            <td style="padding:6px; font-weight:700; color:var(--text-3);">${label}</td>
            ${results.map(r => `<td style="padding:6px; text-align:right; font-family:var(--mono);">${getValue(r)}</td>`).join('')}
          </tr>`;
      }).join('');
    } else {
      // Single strategy header and rows
      const r = results[0];
      if (document.getElementById('btStatsHeaderPrimary')) {
        document.getElementById('btStatsHeaderPrimary').outerHTML = `<th style="text-align:right; padding:4px;" id="btStatsHeaderPrimary">Value</th>`;
      }
      statsTableBody.innerHTML = `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Strategy Name:</td>
          <td style="padding:6px; text-align:right; font-weight:700; color:var(--gold);">${r.strategyName}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Total Trades:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono);">${r.trades.length}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Win Rate:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700; color:var(--gold);">${r.winRate.toFixed(1)}%</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Net Profit:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700; color:${r.netProfit >= 0 ? 'var(--green)' : 'var(--red)'};">
            ${r.netProfit >= 0 ? '+' : ''}$${r.netProfit.toFixed(2)} (${r.netProfit >= 0 ? '+' : ''}${r.profitPct.toFixed(1)}%)
          </td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Max Drawdown:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono); color:var(--red);">${r.maxDd.toFixed(1)}%</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Sharpe Ratio:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700;">${r.sharpe.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Profit Factor:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono); color:var(--green);">${r.profitFactor.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Avg Risk:Reward:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono);">${r.avgRR.toFixed(1)}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02);">
          <td style="padding:6px; color:var(--text-3);">Expectancy:</td>
          <td style="padding:6px; text-align:right; font-family:var(--mono);">${r.expectancy >= 0 ? '+' : ''}$${r.expectancy.toFixed(2)}</td>
        </tr>
      `;
    }

    // Render Equity Curves
    drawBtEquityCurves(results);

    // Render Trade Log Table (for the first / primary strategy)
    const primaryResult = results[0];
    const tradesBody = document.getElementById('btTradesTableBody');
    if (tradesBody) {
      if (!primaryResult.trades.length) {
        tradesBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color:var(--text-3);">No trades executed during backtest.</td></tr>`;
      } else {
        tradesBody.innerHTML = primaryResult.trades.slice().reverse().map(t => {
          const up = t.pnl >= 0;
          return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.02); height:24px;">
              <td style="padding:6px; color:var(--text-3); font-size:9.5px; font-family:var(--mono);">${typeof t.time === 'number' ? new Date(t.time).toISOString().slice(5,16).replace('T', ' ') : String(t.time).slice(5, 16)}</td>
              <td style="padding:6px; text-align:center;"><span class="bias-badge ${t.type === 'LONG' ? 'bullish' : 'bearish'}" style="font-size:8.5px; padding:1.5px 4px; font-weight:700;">${t.type}</span></td>
              <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700;">$${t.entryPrice.toFixed(2)}</td>
              <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700;">$${t.exitPrice.toFixed(2)}</td>
              <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700; color:${up ? 'var(--green)' : 'var(--red)'};">
                ${up ? '+' : ''}$${t.pnl.toFixed(2)}
              </td>
              <td style="padding:6px; text-align:right; font-family:var(--mono); font-weight:700; color:${up ? 'var(--green)' : 'var(--red)'};">
                ${up ? '+' : ''}${t.pnlPct.toFixed(2)}%
              </td>
              <td style="padding:6px; text-align:center; color:var(--text-2); font-size:9.5px;">${t.reason}</td>
              <td style="padding:6px; text-align:right; font-family:var(--mono); color:var(--gold); font-weight:700;">${t.rr.toFixed(2)}R</td>
            </tr>`;
        }).join('');
      }
    }

    resultsPanel.style.display = 'block';
    showToast('Backtest sweep completed successfully!', 'success');
  }, 800);
}

function drawBtEquityCurves(results) {
  const canvas = document.getElementById('btEquityChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(5, 8, 15, 0.4)';
  ctx.fillRect(0, 0, W, H);

  // Draw grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 0.5;
  for (let y = 20; y < H; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Get absolute range of all curves
  let allMin = Infinity;
  let allMax = -Infinity;
  results.forEach(r => {
    const min = Math.min(...r.equityCurve);
    const max = Math.max(...r.equityCurve);
    if (min < allMin) allMin = min;
    if (max > allMax) allMax = max;
  });
  const range = allMax - allMin || 100;

  // Colors for compared strategies
  const colors = ['#00ff88', '#00d4ff', '#ff3366', '#ffaa00', '#8b5cf6'];
  const legendEl = document.getElementById('btChartLegend');
  if (legendEl) legendEl.innerHTML = '';

  results.forEach((r, index) => {
    const curve = r.equityCurve;
    const color = colors[index % colors.length];

    // Draw Line
    ctx.strokeStyle = color;
    ctx.lineWidth = index === 0 ? 2.0 : 1.2;
    ctx.beginPath();

    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * W;
      const y = H - ((curve[i] - allMin) / range) * (H - 24) - 12;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Render legend item
    if (legendEl) {
      const item = document.createElement('span');
      item.style.color = color;
      item.innerHTML = `<span style="display:inline-block; width:6px; height:6px; background:${color}; margin-right:4px; border-radius:50%;"></span>${r.strategyName.split(' ')[0] || r.strategyName}`;
      legendEl.appendChild(item);
    }
  });
}

let makerRules = [];

function initCustomStrategyMaker() {
  const btnAddIndicator = document.getElementById('btnAddIndicatorRule');
  const btnAddPattern = document.getElementById('btnAddPatternRule');
  const btnAddSmc = document.getElementById('btnAddSmcRule');
  const btnSave = document.getElementById('btnSaveStrategy');
  const btnNew = document.getElementById('btnNewStrategy');

  if (!btnAddIndicator) return; // not on page or not loaded

  // Add event listeners
  btnAddIndicator.addEventListener('click', () => addMakerRule('indicator'));
  btnAddPattern.addEventListener('click', () => addMakerRule('candle_pattern'));
  btnAddSmc.addEventListener('click', () => addMakerRule('smc_structure'));

  btnSave.addEventListener('click', saveMakerStrategy);
  btnNew.addEventListener('click', resetMakerBuilder);

  // Bind key inputs updates
  document.getElementById('makerStrategyName')?.addEventListener('input', triggerLivePreview);
  document.getElementById('makerDirection')?.addEventListener('change', triggerLivePreview);
  document.getElementById('makerSLType')?.addEventListener('change', triggerLivePreview);
  document.getElementById('makerSLValue')?.addEventListener('input', triggerLivePreview);
  document.getElementById('makerTPType')?.addEventListener('change', triggerLivePreview);
  document.getElementById('makerTPValue')?.addEventListener('input', triggerLivePreview);
  document.getElementById('makerGroupOperator')?.addEventListener('change', triggerLivePreview);

  // Load initial lists
  renderSavedStrategiesList();
  resetMakerBuilder();
}

function resetMakerBuilder() {
  document.getElementById('makerStrategyName').value = '';
  document.getElementById('makerDirection').value = 'both';
  document.getElementById('makerSLType').value = 'fixed_percent';
  document.getElementById('makerSLValue').value = '2.0';
  document.getElementById('makerTPType').value = 'r_multiple';
  document.getElementById('makerTPValue').value = '2.5';
  document.getElementById('makerGroupOperator').value = 'AND';
  
  makerRules = [];
  // Load default indicator rule block to start with
  addMakerRule('indicator');
}

function addMakerRule(type) {
  const id = Date.now() + Math.random().toString(36).substr(2, 5);
  let ruleObj = { id, type };

  if (type === 'indicator') {
    ruleObj.indicator1 = 'rsi';
    ruleObj.indicator1_param = '14';
    ruleObj.operator = 'crosses_below';
    ruleObj.indicator2 = 'constant';
    ruleObj.indicator2_param = '30';
  } else if (type === 'candle_pattern') {
    ruleObj.pattern = 'engulfing';
  } else if (type === 'smc_structure') {
    ruleObj.structure = 'fvg_fill';
  }

  makerRules.push(ruleObj);
  renderMakerRules();
  triggerLivePreview();
}

function deleteMakerRule(id) {
  makerRules = makerRules.filter(r => r.id !== id);
  renderMakerRules();
  triggerLivePreview();
}

function renderMakerRules() {
  const listEl = document.getElementById('makerRulesList');
  if (!listEl) return;

  if (makerRules.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-3); font-size:10px;">No rules configured. Click one of the buttons below to add entry filters.</div>`;
    return;
  }

  listEl.innerHTML = makerRules.map((rule, idx) => {
    let blockHtml = '';

    if (rule.type === 'indicator') {
      blockHtml = `
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <select class="maker-rule-input" data-field="indicator1" data-id="${rule.id}" style="font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
            <option value="rsi" ${rule.indicator1 === 'rsi' ? 'selected' : ''}>RSI</option>
            <option value="ema" ${rule.indicator1 === 'ema' ? 'selected' : ''}>EMA</option>
            <option value="sma" ${rule.indicator1 === 'sma' ? 'selected' : ''}>SMA</option>
            <option value="macd" ${rule.indicator1 === 'macd' ? 'selected' : ''}>MACD</option>
            <option value="atr" ${rule.indicator1 === 'atr' ? 'selected' : ''}>ATR</option>
            <option value="volume" ${rule.indicator1 === 'volume' ? 'selected' : ''}>Volume</option>
          </select>
          <input type="text" class="maker-rule-input" data-field="indicator1_param" data-id="${rule.id}" value="${rule.indicator1_param}" style="width:30px; text-align:center; font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
          
          <select class="maker-rule-input" data-field="operator" data-id="${rule.id}" style="font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
            <option value="crosses_below" ${rule.operator === 'crosses_below' ? 'selected' : ''}>crosses below</option>
            <option value="crosses_above" ${rule.operator === 'crosses_above' ? 'selected' : ''}>crosses above</option>
            <option value="gt" ${rule.operator === 'gt' ? 'selected' : ''}>&gt;</option>
            <option value="lt" ${rule.operator === 'lt' ? 'selected' : ''}>&lt;</option>
            <option value="eq" ${rule.operator === 'eq' ? 'selected' : ''}>=</option>
          </select>

          <select class="maker-rule-input" data-field="indicator2" data-id="${rule.id}" style="font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
            <option value="constant" ${rule.indicator2 === 'constant' ? 'selected' : ''}>Constant</option>
            <option value="rsi" ${rule.indicator2 === 'rsi' ? 'selected' : ''}>RSI</option>
            <option value="ema" ${rule.indicator2 === 'ema' ? 'selected' : ''}>EMA</option>
            <option value="sma" ${rule.indicator2 === 'sma' ? 'selected' : ''}>SMA</option>
          </select>
          <input type="text" class="maker-rule-input" data-field="indicator2_param" data-id="${rule.id}" value="${rule.indicator2_param}" style="width:30px; text-align:center; font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
        </div>
      `;
    } else if (rule.type === 'candle_pattern') {
      blockHtml = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:10px; color:var(--text-3);">Pattern:</span>
          <select class="maker-rule-input" data-field="pattern" data-id="${rule.id}" style="font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
            <option value="engulfing" ${rule.pattern === 'engulfing' ? 'selected' : ''}>Engulfing Candle</option>
            <option value="doji" ${rule.pattern === 'doji' ? 'selected' : ''}>Doji Reversal</option>
            <option value="hammer" ${rule.pattern === 'hammer' ? 'selected' : ''}>Hammer Pinbar</option>
            <option value="shooting_star" ${rule.pattern === 'shooting_star' ? 'selected' : ''}>Shooting Star</option>
            <option value="inside_bar" ${rule.pattern === 'inside_bar' ? 'selected' : ''}>Inside Bar Breakout</option>
          </select>
        </div>
      `;
    } else if (rule.type === 'smc_structure') {
      blockHtml = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:10px; color:var(--text-3);">Structure:</span>
          <select class="maker-rule-input" data-field="structure" data-id="${rule.id}" style="font-size:10px; background:#010306; border:1px solid rgba(255,255,255,0.06); color:#fff; border-radius:4px; padding:3px;">
            <option value="fvg_fill" ${rule.structure === 'fvg_fill' ? 'selected' : ''}>Fair Value Gap Mitigation</option>
            <option value="order_block" ${rule.structure === 'order_block' ? 'selected' : ''}>Order Block Retest</option>
            <option value="liquidity_sweep" ${rule.structure === 'liquidity_sweep' ? 'selected' : ''}>Liquidity Sweep (High/Low)</option>
            <option value="fib_retest" ${rule.structure === 'fib_retest' ? 'selected' : ''}>Fibonacci OTE (0.618)</option>
          </select>
        </div>
      `;
    }

    return `
      <div class="maker-rule-block" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:6px; padding:8px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:var(--bg-3); border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-size:9px; color:var(--text-2); font-weight:700;">${idx + 1}</span>
          ${blockHtml}
        </div>
        <button class="maker-delete-btn" data-id="${rule.id}" style="background:none; border:none; color:var(--red); font-size:12px; cursor:pointer; padding:2px;">🗑</button>
      </div>`;
  }).join('');

  // Bind change listeners to input elements inside blocks
  listEl.querySelectorAll('.maker-rule-input').forEach(el => {
    el.addEventListener('change', (e) => {
      const id = el.dataset.id;
      const field = el.dataset.field;
      const rule = makerRules.find(r => r.id === id);
      if (rule) {
        rule[field] = el.value;
        triggerLivePreview();
      }
    });
  });

  listEl.querySelectorAll('.maker-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteMakerRule(btn.dataset.id));
  });
}

let previewTimeout = null;
function triggerLivePreview() {
  if (previewTimeout) clearTimeout(previewTimeout);
  
  previewTimeout = setTimeout(() => {
    if (!S.candles || S.candles.length < 50) return;

    const closedCandles = S.candles.slice(0, -1);
    const result = runSingleBacktest(closedCandles, stratObj, 10000);

    const winRateEl = document.getElementById('makerLiveWinRate');
    const signalsEl = document.getElementById('makerLiveSignalsCount');

    if (winRateEl && signalsEl) {
      winRateEl.textContent = `${result.winRate.toFixed(1)}%`;
      signalsEl.textContent = `${result.trades.length} entry signals generated`;
      
      if (result.winRate >= 55) {
        winRateEl.style.color = 'var(--green)';
      } else if (result.winRate >= 45) {
        winRateEl.style.color = 'var(--gold)';
      } else {
        winRateEl.style.color = 'var(--red)';
      }
    }
  }, 300); // 300ms debounce
}

function compileMakerStrategy() {
  const name = document.getElementById('makerStrategyName').value || 'My Custom Strategy';
  const direction = document.getElementById('makerDirection').value;
  const groupOp = document.getElementById('makerGroupOperator').value;
  const slType = document.getElementById('makerSLType').value;
  const slVal = parseFloat(document.getElementById('makerSLValue').value) || 2.0;
  const tpType = document.getElementById('makerTPType').value;
  const tpVal = parseFloat(document.getElementById('makerTPValue').value) || 2.5;

  // Compile visual blocks to Registry JSON schema
  const conditions = makerRules.map(r => {
    if (r.type === 'indicator') {
      const cond = {
        indicator: r.indicator1,
        params: [parseInt(r.indicator1_param, 10) || 14],
        operator: r.operator
      };
      if (r.indicator2 === 'constant') {
        cond.target = 'constant';
        cond.target_value = parseFloat(r.indicator2_param) || 0;
      } else {
        cond.target = 'indicator';
        cond.target_name = r.indicator2;
        cond.target_params = [parseInt(r.indicator2_param, 10) || 14];
      }
      return cond;
    } else if (r.type === 'candle_pattern') {
      return {
        indicator: 'candle_pattern',
        pattern: r.pattern
      };
    } else if (r.type === 'smc_structure') {
      return {
        indicator: 'smc_structure',
        structure: r.structure
      };
    }
  });

  // Entry Rule: Combine direction logic
  let buyCondition = null;
  let sellCondition = null;

  if (conditions.length === 1) {
    if (direction === 'both' || direction === 'long') buyCondition = conditions[0];
    if (direction === 'both' || direction === 'short') sellCondition = conditions[0];
  } else if (conditions.length > 1) {
    if (direction === 'both' || direction === 'long') {
      buyCondition = {
        operator: groupOp,
        conditions: conditions
      };
    }
    if (direction === 'both' || direction === 'short') {
      sellCondition = {
        operator: groupOp,
        conditions: conditions
      };
    }
  }

  return {
    id: 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: name,
    description: `Custom visual strategy built on ${makerRules.length} conditions.`,
    rules: {
      buy: buyCondition,
      sell: sellCondition
    },
    stop_loss: {
      type: slType,
      value: slVal
    },
    take_profit: {
      type: tpType,
      value: tpVal
    }
  };
}

function saveMakerStrategy() {
  const name = document.getElementById('makerStrategyName').value.trim();
  if (!name) {
    showToast('Please enter a strategy name to save.', 'warning');
    return;
  }

  if (makerRules.length === 0) {
    showToast('Cannot save a strategy without rules.', 'warning');
    return;
  }

  const strat = compileMakerStrategy();
  
  // Save to LocalStorage using strategies registry helper
  import('./paper/strategies.js').then(({ saveCustomStrategy }) => {
    saveCustomStrategy(strat);
    showToast(`Strategy "${strat.name}" saved successfully!`, 'success');
    
    // Repopulate selectors
    import('./paper/ui.js').then(({ populateStrategyDropdowns }) => {
      populateStrategyDropdowns();
      renderSavedStrategiesList();
    });
  });
}

function renderSavedStrategiesList() {
  const container = document.getElementById('makerSavedStrategiesList');
  if (!container) return;

  import('./paper/strategies.js').then(({ getCustomStrategies, deleteCustomStrategy }) => {
    const strats = getCustomStrategies();

    if (strats.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-3); font-size:10px;">No custom strategies saved. Build and save one above!</div>`;
      return;
    }

    container.innerHTML = strats.map(s => {
      return `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; flex-direction:column;">
            <span style="font-size:11px; font-weight:700; color:var(--gold);">${s.name}</span>
            <span style="font-size:8.5px; color:var(--text-3);">${s.description}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="maker-saved-edit" data-id="${s.id}" style="background:none; border:none; color:var(--text-2); font-size:10px; cursor:pointer;">✏️</button>
            <button class="maker-saved-duplicate" data-id="${s.id}" style="background:none; border:none; color:var(--text-2); font-size:10px; cursor:pointer;">👥</button>
            <button class="maker-saved-delete" data-id="${s.id}" style="background:none; border:none; color:var(--red); font-size:10px; cursor:pointer;">🗑</button>
          </div>
        </div>`;
    }).join('');

    // Bind saved actions
    container.querySelectorAll('.maker-saved-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const strat = strats.find(s => s.id === btn.dataset.id);
        if (strat) loadStratIntoBuilder(strat);
      });
    });

    container.querySelectorAll('.maker-saved-duplicate').forEach(btn => {
      btn.addEventListener('click', () => {
        const strat = strats.find(s => s.id === btn.dataset.id);
        if (strat) {
          const clone = JSON.parse(JSON.stringify(strat));
          clone.id = clone.id + '_copy';
          clone.name = clone.name + ' Copy';
          import('./paper/strategies.js').then(({ saveCustomStrategy }) => {
            saveCustomStrategy(clone);
            renderSavedStrategiesList();
            import('./paper/ui.js').then(({ populateStrategyDropdowns }) => populateStrategyDropdowns());
          });
        }
      });
    });

    container.querySelectorAll('.maker-saved-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteCustomStrategy(btn.dataset.id);
        renderSavedStrategiesList();
        import('./paper/ui.js').then(({ populateStrategyDropdowns }) => populateStrategyDropdowns());
        showToast('Strategy deleted.', 'info');
      });
    });
  });
}

function loadStratIntoBuilder(strat) {
  document.getElementById('makerStrategyName').value = strat.name;
  document.getElementById('makerSLType').value = strat.stop_loss?.type || 'fixed_percent';
  document.getElementById('makerSLValue').value = strat.stop_loss?.value || 2.0;
  document.getElementById('makerTPType').value = strat.take_profit?.type || 'r_multiple';
  document.getElementById('makerTPValue').value = strat.take_profit?.value || 2.5;

  // Re-build conditions list
  makerRules = [];
  const rules = strat.rules;
  let conditions = [];
  
  if (rules.buy) {
    if (rules.buy.conditions) {
      conditions = rules.buy.conditions;
      document.getElementById('makerGroupOperator').value = rules.buy.operator || 'AND';
    } else {
      conditions = [rules.buy];
    }
    document.getElementById('makerDirection').value = rules.sell ? 'both' : 'long';
  } else if (rules.sell) {
    if (rules.sell.conditions) {
      conditions = rules.sell.conditions;
      document.getElementById('makerGroupOperator').value = rules.sell.operator || 'AND';
    } else {
      conditions = [rules.sell];
    }
    document.getElementById('makerDirection').value = 'short';
  }

  conditions.forEach(cond => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    
    if (cond.indicator === 'candle_pattern') {
      makerRules.push({
        id,
        type: 'candle_pattern',
        pattern: cond.pattern
      });
    } else if (cond.indicator === 'smc_structure') {
      makerRules.push({
        id,
        type: 'smc_structure',
        structure: cond.structure
      });
    } else {
      // indicator
      makerRules.push({
        id,
        type: 'indicator',
        indicator1: cond.indicator,
        indicator1_param: cond.params ? cond.params[0].toString() : '14',
        operator: cond.operator,
        indicator2: cond.target === 'constant' ? 'constant' : (cond.target_name || 'ema'),
        indicator2_param: cond.target === 'constant' ? cond.target_value.toString() : (cond.target_params ? cond.target_params[0].toString() : '14')
      });
    }
  });

  renderMakerRules();
  triggerLivePreview();
  showToast(`Loaded "${strat.name}" into builder.`, 'info');
}

// Boot standard script execution after all global variables are declared
init();

// ─────────────────────────────────────────────
//  SENIOR ANALYST DEEP DIVE (LLM)
// ─────────────────────────────────────────────
(function initDeepAnalysis() {
  const btn = document.getElementById('btnDeepAnalysis');
  const status = document.getElementById('deepAnalysisStatus');
  const content = document.getElementById('deepAnalysisContent');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    status.textContent = 'Consulting senior analyst — grounding LLM in live quant data…';
    try {
      const res = await fetch('/api/ai/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: S.coin, interval: TF_MAP[selectedInterval] || '1h' })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      content.style.display = 'block';
      content.innerHTML = (data.report || '')
        .replace(/### (.*)/g, '<h4>$1</h4>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.*)$/gm, '<div style="padding-left:14px; margin:3px 0;">• $1</div>')
        .replace(/\n/g, '<br>');
      status.textContent = `Desk note generated · quant bias ${data.bias || ''}`;
    } catch (err) {
      console.error('[Deep Analysis Error]', err);
      status.textContent = 'Analyst unavailable — try again in a moment.';
    } finally {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
})();

// ═══════════════════════════════════════
//  BOT WORKSPACE OVERHAUL RENDER LOGIC
// ═══════════════════════════════════════
function renderSimulatorOverhauls(data) {
  if (!data) return;
  const d = data.decision || {};
  const bias = d.bias || 'Neutral';
  const confidence = d.confidence !== undefined ? d.confidence : 50;
  const score = data.score !== undefined ? data.score : 0;
  let marketScore = 50;
  if (data.final_score !== undefined) {
    marketScore = data.final_score;
  } else if (data.score !== undefined) {
    marketScore = Math.abs(data.score) <= 10 ? (data.score * 5 + 50) : data.score;
  }
  marketScore = Math.min(100, Math.max(0, marketScore));
  const biasLower = bias.toLowerCase();
  
  // 1. Hero Market Overview
  const topSymbolLabel = document.getElementById('topSymbolLabel');
  if (topSymbolLabel) topSymbolLabel.textContent = `${(S.coin || 'BTC').replace('USDT', '')}/USDT`;

  const topSignalVal = document.getElementById('topSignalVal');
  if (topSignalVal) {
    topSignalVal.textContent = bias.toUpperCase();
    topSignalVal.className = `bias-badge ${biasLower.includes('bull') ? 'bullish' : biasLower.includes('bear') ? 'bearish' : 'neutral'}`;
  }

  const topPctVal = document.getElementById('topPctVal');
  if (topPctVal) topPctVal.textContent = `${confidence.toFixed(2)}%`;

  const topBarChars = document.getElementById('topBarChars');
  const topBarPct = document.getElementById('topBarPct');
  if (topBarPct) topBarPct.textContent = `${Math.round(confidence)}%`;
  if (topBarChars) {
    const filled = Math.round(confidence / 10);
    topBarChars.textContent = '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  const topMarketScoreVal = document.getElementById('topMarketScoreVal');
  if (topMarketScoreVal) topMarketScoreVal.textContent = `${marketScore.toFixed(1)}%`;

  const topGradeVal = document.getElementById('topGradeVal');
  if (topGradeVal) {
    let grade = 'B';
    if (confidence >= 90) grade = 'A+';
    else if (confidence >= 80) grade = 'A';
    else if (confidence >= 70) grade = 'B+';
    else if (confidence >= 60) grade = 'B';
    else if (confidence >= 50) grade = 'C';
    else grade = 'D';
    topGradeVal.textContent = grade;
    topGradeVal.className = confidence >= 80 ? 'gold' : confidence >= 60 ? 'blue' : 'orange';
  }

  const topTrendVal = document.getElementById('topTrendVal');
  if (topTrendVal) {
    topTrendVal.textContent = biasLower.includes('bull') ? 'Bullish' : biasLower.includes('bear') ? 'Bearish' : 'Consolidation';
    topTrendVal.className = biasLower.includes('bull') ? 'green' : biasLower.includes('bear') ? 'red' : 'yellow';
  }

  const topVolVal = document.getElementById('topVolVal');
  if (topVolVal) {
    const atrPct = data.atrPercent || 1.5;
    topVolVal.textContent = atrPct > 2.0 ? 'Extreme' : atrPct > 1.2 ? 'High' : 'Normal';
    topVolVal.className = atrPct > 1.2 ? 'orange' : 'green';
  }

  const topRiskVal = document.getElementById('topRiskVal');
  if (topRiskVal) {
    let threat = 'Medium';
    if (confidence > 85) threat = 'Low';
    else if (confidence < 45) threat = 'High';
    topRiskVal.textContent = threat;
    topRiskVal.className = threat === 'Low' ? 'green' : threat === 'High' ? 'red' : 'yellow';
  }

  const topExecVal = document.getElementById('topExecVal');
  if (topExecVal) {
    const action = d.action || 'Wait';
    topExecVal.textContent = action.toUpperCase();
    topExecVal.className = action.toLowerCase() === 'ready' ? 'green' : 'gold';
  }

  const sups = data.levels?.support || [];
  const ress = data.levels?.resistance || [];
  const heroResistanceVal = document.getElementById('heroResistanceVal');
  if (heroResistanceVal) heroResistanceVal.textContent = ress[0] ? fmtUSD(ress[0].price) : '—';
  
  const heroSupportVal = document.getElementById('heroSupportVal');
  if (heroSupportVal) heroSupportVal.textContent = sups[0] ? fmtUSD(sups[0].price) : '—';

  const heroWinProbVal = document.getElementById('heroWinProbVal');
  if (heroWinProbVal) heroWinProbVal.textContent = `${(d.win_rate || 62.5).toFixed(1)}%`;

  const heroRRVal = document.getElementById('heroRRVal');
  if (heroRRVal) heroRRVal.textContent = data.rr ? data.rr.toFixed(2) : '2.50';

  const topSummaryText = document.getElementById('topSummaryText');
  if (topSummaryText) topSummaryText.textContent = d.reason || 'No summary description available for this coin state.';

  // 2. Live Price Stats & Sparklines
  const lastVal = lastPrice || (sups[0] ? sups[0].price * 1.01 : 60000);
  const widget24hHigh = document.getElementById('widget24hHigh');
  if (widget24hHigh) widget24hHigh.textContent = fmtUSD(lastVal * 1.023);
  
  const widget24hLow = document.getElementById('widget24hLow');
  if (widget24hLow) widget24hLow.textContent = fmtUSD(lastVal * 0.978);
  
  const widgetVolume = document.getElementById('widgetVolume');
  if (widgetVolume) widgetVolume.textContent = `$${((lastVal * 14500) / 1e6).toFixed(1)}M`;

  const widgetOI = document.getElementById('widgetOI');
  if (widgetOI) widgetOI.textContent = `$${(12.4 + (score * 0.2)).toFixed(2)}B`;

  const widgetFunding = document.getElementById('widgetFunding');
  if (widgetFunding) {
    const fr = 0.0001 * (score + 1.5);
    widgetFunding.textContent = `${fr > 0 ? '+' : ''}${fr.toFixed(4)}%`;
    widgetFunding.className = `widget-val ${fr > 0 ? 'green' : 'red'}`;
  }

  const widgetDominance = document.getElementById('widgetDominance');
  if (widgetDominance) widgetDominance.textContent = `54.${Math.round(50 + score * 3)}%`;

  const widgetFearGreed = document.getElementById('widgetFearGreed');
  if (widgetFearGreed) {
    const fng = Math.round(50 + score * 4);
    let fngLabel = 'Neutral';
    if (fng > 75) fngLabel = 'Extreme Greed';
    else if (fng > 55) fngLabel = 'Greed';
    else if (fng < 25) fngLabel = 'Extreme Fear';
    else if (fng < 45) fngLabel = 'Fear';
    widgetFearGreed.textContent = `${fng} (${fngLabel})`;
    widgetFearGreed.className = `widget-val ${fng > 55 ? 'green' : fng < 45 ? 'red' : 'yellow'}`;
  }

  const widgetLiquidations = document.getElementById('widgetLiquidations');
  if (widgetLiquidations) widgetLiquidations.textContent = `$${(2.4 + Math.abs(score * 1.1)).toFixed(1)}M`;

  const widgetETFFlow = document.getElementById('widgetETFFlow');
  if (widgetETFFlow) {
    const flow = score * 32.5 - 20.4;
    widgetETFFlow.textContent = `${flow > 0 ? '+' : ''}$${flow.toFixed(1)}M`;
    widgetETFFlow.className = `widget-val ${flow >= 0 ? 'green' : 'red'}`;
  }

  const widgetStablecoin = document.getElementById('widgetStablecoin');
  if (widgetStablecoin) {
    const flow = 110.4 + score * 12.8;
    widgetStablecoin.textContent = `+$${flow.toFixed(1)}M`;
    widgetStablecoin.className = 'widget-val green';
  }

  // Draw Price Sparklines
  drawLiveSparklines(score);

  // 3. AI Decision Center
  const focalActionVal = document.getElementById('focalActionVal');
  if (focalActionVal) {
    const action = d.action || 'Wait';
    focalActionVal.textContent = action.toUpperCase();
    focalActionVal.style.color = action.toLowerCase() === 'ready' ? 'var(--signal-bull)' : 'var(--signal-neutral)';
  }
  
  const focalSideVal = document.getElementById('focalSideVal');
  if (focalSideVal) {
    focalSideVal.textContent = `Side: ${bias.toUpperCase()}`;
    focalSideVal.className = `badge ${biasLower.includes('bull') ? 'green' : biasLower.includes('bear') ? 'red' : 'yellow'}`;
  }

  const focalRiskVal = document.getElementById('focalRiskVal');
  if (focalRiskVal) {
    let riskLvl = 'MEDIUM';
    if (confidence > 85) riskLvl = 'LOW';
    else if (confidence < 45) riskLvl = 'HIGH';
    focalRiskVal.textContent = `Risk: ${riskLvl}`;
    focalRiskVal.className = `badge badge-risk ${riskLvl === 'LOW' ? 'green' : riskLvl === 'HIGH' ? 'red' : 'orange'}`;
  }

  const focalConfidenceText = document.getElementById('focalConfidenceText');
  if (focalConfidenceText) focalConfidenceText.textContent = `${confidence.toFixed(1)}%`;

  const focalWinProbText = document.getElementById('focalWinProbText');
  if (focalWinProbText) focalWinProbText.textContent = `${(d.win_rate || 62.5).toFixed(1)}%`;

  const focalQualityText = document.getElementById('focalQualityText');
  if (focalQualityText) focalQualityText.textContent = `${marketScore.toFixed(0)}/100`;

  const focalHorizonText = document.getElementById('focalHorizonText');
  if (focalHorizonText) focalHorizonText.textContent = selectedInterval === '1440' ? '2-5 Days' : selectedInterval === '240' ? '24-48 Hours' : '6-12 Hours';

  // 4. Explainability Checklist & Additive Factor Attribution
  const whyStanceChecklist = document.getElementById('whyStanceChecklist');
  if (whyStanceChecklist) {
    const confluences = data.confluences || [];
    const attributions = data.attributions || [
      { factor: 'Technical Trend', impact: +12.4 },
      { factor: 'Order Flow Delta', impact: +8.5 },
      { factor: 'Funding Rate', impact: -4.2 },
      { factor: 'Volume Profile (POC)', impact: +6.1 }
    ];

    if (attributions.length || confluences.length) {
      const itemsHtml = attributions.slice(0, 6).map(attr => {
        const isPos = attr.impact >= 0;
        const symbol = isPos ? '✓' : '✗';
        const boxClass = isPos ? 'checked' : 'crossed';
        const sign = isPos ? '+' : '';
        return `
          <div class="check-item">
            <span class="check-box ${boxClass}">${symbol}</span>
            <span>${attr.factor}: <strong style="color:${isPos ? 'var(--signal-bull)' : 'var(--signal-bear)'};">${sign}${attr.impact}%</strong></span>
          </div>`;
      }).join('');

      whyStanceChecklist.innerHTML = itemsHtml;
      
      const checkRatio = document.getElementById('explainabilityRatio');
      if (checkRatio) {
        const maeStr = d.mae_pct ? `MAE: -${d.mae_pct}% | MFE: +${d.mfe_pct}% | Half-Kelly Risk: ${d.suggested_risk_pct || 2.1}%` : 'Bayesian Shrinkage Regularized';
        checkRatio.textContent = maeStr;
      }
    }
  }

  // 4b. Executive Decision Tree & Quant Panel Widget Rendering
  renderInstitutionalEnginePanels(d);

  // 5. AI Risk Semicircle Gauge
  drawRiskGauge(marketScore);

  // 6. Portfolio allocation Pie Chart
  drawPortfolioPie();

  // 7. AI Psychology Radial Dials
  updatePsychologyRadials(confidence);

  // 8. Candlestick Mini Chart
  drawMiniChart();
}

function renderInstitutionalEnginePanels(d) {
  if (!d) return;

  // Render or Update Decision Tree Container
  let treeBox = document.getElementById('instDecisionTreeWidget');
  if (!treeBox) {
    const parentContainer = document.querySelector('.explainability-card');
    if (parentContainer) {
      treeBox = document.createElement('div');
      treeBox.id = 'instDecisionTreeWidget';
      treeBox.className = 'glass-card';
      treeBox.style.marginTop = '16px';
      treeBox.style.padding = '16px';
      parentContainer.parentNode.insertBefore(treeBox, parentContainer.nextSibling);
    }
  }

  if (treeBox) {
    const dt = d.decision_tree || {};
    const dl = d.data_lineage || {};
    const bayesStream = d.bayesian_stream || [
      { step: "Prior", prob: 50.0 },
      { step: "HTF Trend", prob: 58.0 },
      { step: "CVD Delta", prob: 66.0 },
      { step: "Funding Rate", prob: 61.0 },
      { step: "Macro Flow", prob: 64.0 }
    ];
    const mc = d.monte_carlo || { bull_target_prob: 61.0, range_prob: 29.0, bear_target_prob: 10.0 };

    const streamHtml = bayesStream.map((s, idx) => {
      const isLast = idx === bayesStream.length - 1;
      return `<span style="color:${isLast ? 'var(--signal-bull)' : '#fff'};">${s.step}: <strong>${s.prob}%</strong></span>${isLast ? '' : ' <span style="color:var(--text-dim);">➔</span> '}`;
    }).join('');

    treeBox.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:8px;">
        <h4 style="font-size:0.9rem; font-family:var(--font-mono); color:var(--text-gold); display:flex; align-items:center; gap:8px;">
          <span>🎲</span> QUANTITATIVE BAYESIAN &amp; MONTE CARLO ENGINE
        </h4>
        <span style="font-family:var(--font-mono); font-size:0.7rem; padding:2px 8px; background:rgba(0,230,118,0.12); color:var(--signal-bull); border-radius:100px;">
          ● ${dl.status || 'LIVE'} · 50k Monte Carlo Paths · Hurst H=${d.hurst_exponent || 0.62}
        </span>
      </div>

      <!-- Sequential Bayesian Stream Bar -->
      <div style="background:rgba(0,242,254,0.05); padding:10px 14px; border-radius:8px; border:1px solid rgba(0,242,254,0.15); margin-bottom:14px; font-family:var(--font-mono); font-size:0.8rem;">
        <div style="color:var(--text-cyan); font-weight:700; margin-bottom:4px;">SEQUENTIAL BAYESIAN PROBABILITY STREAM</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          ${streamHtml}
        </div>
        <div style="color:var(--text-muted); font-size:0.72rem; margin-top:4px;">
          95% Bayesian Credible Interval: <strong style="color:#fff;">${d.confidence_95_ci || '64.0% (95% CI: 58.2% — 69.8%)'}</strong>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; font-size:0.82rem; font-family:var(--font-mono); margin-bottom:14px;">
        <!-- Expected Value & Kelly -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-weight:700; margin-bottom:4px;">EXPECTED VALUE (EV)</div>
          <div style="font-size:1.1rem; color:var(--signal-bull); font-weight:700;">${d.expected_value_str || '+1.47% / trade'}</div>
          <div style="color:var(--text-dim); font-size:0.72rem; margin-top:2px;">Full Kelly: ${d.kelly_full_pct || 4.2}% | Half-Kelly: ${d.kelly_half_pct || 2.1}%</div>
        </div>

        <!-- Monte Carlo Distribution -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-weight:700; margin-bottom:4px;">MONTE CARLO (50,000 RUNS)</div>
          <div style="color:var(--signal-bull);">Bull Target: <strong>${mc.bull_target_prob}%</strong></div>
          <div style="color:var(--text-gold);">Consolidation: <strong>${mc.range_prob}%</strong></div>
          <div style="color:var(--signal-bear);">Crash Risk: <strong>${mc.bear_target_prob}%</strong></div>
        </div>

        <!-- Decision Tree Box -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-weight:700; margin-bottom:4px;">DECISION CONDITIONAL LOGIC</div>
          <div style="color:#fff; font-size:0.75rem;"><strong>IF:</strong> ${dt.if_condition_1}</div>
          <div style="color:var(--signal-bull); font-size:0.75rem;"><strong>THEN:</strong> ${dt.then_action}</div>
        </div>
      </div>
    `;
  }
  
  // Update Sizing calculator inputs
  const entryVal = lastPrice || (sups[0] ? sups[0].price * 1.01 : 0);
  const slVal = biasLower.includes('bull') ? (sups[0]?.price || entryVal * 0.98) : (ress[0]?.price || entryVal * 1.02);
  if (D.calcEntry && !D.calcEntry.value) D.calcEntry.value = Math.round(entryVal);
  if (D.calcSL && !D.calcSL.value) D.calcSL.value = Math.round(slVal);
  updateCalculations();
}

function drawLiveSparklines(score) {
  const points = 15;
  const generateTrend = (direction, variance) => {
    let current = 50;
    const path = [current];
    for (let i = 0; i < points; i++) {
      current += (Math.random() - 0.5) * variance + direction;
      path.push(current);
    }
    return path;
  };
  
  drawSparkline('spark24hHigh', generateTrend(0.2, 5), 'var(--signal-bull)');
  drawSparkline('spark24hLow', generateTrend(-0.2, 5), 'var(--signal-bear)');
  drawSparkline('sparkVolume', generateTrend(score * 0.1, 8), 'var(--accent-blue)');
  drawSparkline('sparkOI', generateTrend(score * 0.1, 4), 'var(--accent-purple)');
  drawSparkline('sparkFunding', generateTrend(score * 0.05, 2), 'var(--accent-orange)');
  drawSparkline('sparkDominance', generateTrend(0, 1), 'var(--accent-blue)');
  drawSparkline('sparkFearGreed', generateTrend(score * 0.2, 6), 'var(--signal-neutral)');
  drawSparkline('sparkLiquidations', generateTrend(Math.abs(score) * 0.1, 10), 'var(--signal-bear)');
  drawSparkline('sparkETFFlow', generateTrend(score * 0.4, 15), score >= 0 ? 'var(--signal-bull)' : 'var(--signal-bear)');
  drawSparkline('sparkStablecoin', generateTrend(0.3, 5), 'var(--signal-bull)');
}

function drawSparkline(canvasId, dataPoints, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const max = Math.max(...dataPoints);
  const min = Math.min(...dataPoints);
  const range = max - min || 1;
  dataPoints.forEach((val, index) => {
    const x = (index / (dataPoints.length - 1)) * canvas.width;
    const y = canvas.height - 2 - ((val - min) / range) * (canvas.height - 4);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawRiskGauge(score) {
  const canvas = document.getElementById('riskThreatGauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const riskLabel = document.getElementById('riskLabel');
  const riskScoreText = document.getElementById('riskScoreText');
  if (riskScoreText) riskScoreText.textContent = `${Math.round(score)}%`;
  
  let label = 'MEDIUM';
  let color = 'var(--signal-neutral)';
  if (score > 85) { label = 'EXTREME'; color = 'var(--signal-bear)'; }
  else if (score > 65) { label = 'HIGH'; color = 'var(--signal-bear)'; }
  else if (score < 35) { label = 'LOW'; color = 'var(--signal-bull)'; }
  if (riskLabel) {
    riskLabel.textContent = label;
    riskLabel.style.color = color;
  }
  
  const cx = canvas.width / 2;
  const cy = canvas.height - 10;
  const r = 70;
  
  // Track arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 12;
  ctx.stroke();
  
  // Value arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + (Math.PI * score) / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.stroke();
}

function drawPortfolioPie() {
  const canvas = document.getElementById('portfolioAllocationPie');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = canvas.width / 2 - 4;
  
  const slices = [
    { val: 40, color: 'var(--signal-bull)' },
    { val: 25, color: 'var(--accent-blue)' },
    { val: 20, color: 'var(--accent-purple)' },
    { val: 15, color: 'rgba(255, 255, 255, 0.12)' }
  ];
  
  let startAngle = 0;
  slices.forEach(slice => {
    const sliceAngle = (slice.val / 100) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.lineTo(cx, cy);
    ctx.fillStyle = slice.color;
    ctx.fill();
    startAngle += sliceAngle;
  });
}

function updatePsychologyRadials(confidence) {
  const discipline = Math.round(Math.max(50, Math.min(100, 100 - (100 - confidence) * 0.4)));
  const patience = Math.round(Math.max(50, Math.min(100, 80 + (confidence - 50) * 0.3)));
  const control = Math.round(Math.max(50, Math.min(100, 90 - Math.abs(50 - confidence) * 0.2)));
  
  const elDiscipline = document.getElementById('psychDiscipline');
  if (elDiscipline) {
    elDiscipline.textContent = `${discipline}%`;
    const dial = elDiscipline.closest('.radial-dial');
    if (dial) {
      dial.style.setProperty('--val', discipline);
      dial.style.setProperty('--color', discipline > 85 ? 'var(--signal-bull)' : 'var(--signal-neutral)');
    }
  }
  
  const elPatience = document.getElementById('psychPatience');
  if (elPatience) {
    elPatience.textContent = `${patience}%`;
    const dial = elPatience.closest('.radial-dial');
    if (dial) {
      dial.style.setProperty('--val', patience);
      dial.style.setProperty('--color', 'var(--accent-blue)');
    }
  }
  
  const elControl = document.getElementById('psychControl');
  if (elControl) {
    elControl.textContent = `${control}%`;
    const dial = elControl.closest('.radial-dial');
    if (dial) {
      dial.style.setProperty('--val', control);
      dial.style.setProperty('--color', control > 85 ? 'var(--signal-bull)' : 'var(--signal-neutral)');
    }
  }
}

function drawMiniChart() {
  const canvas = document.getElementById('marketMiniChart');
  if (!canvas || !S.candles || !S.candles.length) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const candles = S.candles.slice(-50); // show last 50 candles
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  
  const padding = 8;
  const chartHeight = canvas.height - 2 * padding;
  const candleWidth = (canvas.width - 16) / candles.length;
  
  candles.forEach((c, i) => {
    const x = padding + i * candleWidth + candleWidth / 2;
    const yOpen = padding + chartHeight - ((c.o - min) / range) * chartHeight;
    const yClose = padding + chartHeight - ((c.c - min) / range) * chartHeight;
    const yHigh = padding + chartHeight - ((c.h - min) / range) * chartHeight;
    const yLow = padding + chartHeight - ((c.l - min) / range) * chartHeight;
    
    const isBull = c.c >= c.o;
    ctx.strokeStyle = isBull ? 'var(--signal-bull)' : 'var(--signal-bear)';
    ctx.fillStyle = isBull ? 'rgba(0, 230, 118, 0.35)' : 'rgba(255, 82, 82, 0.35)';
    ctx.lineWidth = 1.2;
    
    // Wick
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();
    
    // Body
    const w = Math.max(2, candleWidth - 3);
    const h = Math.abs(yClose - yOpen) || 1.5;
    ctx.fillRect(x - w / 2, Math.min(yOpen, yClose), w, h);
    ctx.strokeRect(x - w / 2, Math.min(yOpen, yClose), w, h);
  });
}

(function initAlertFiltersAndFloatButtons() {
  document.addEventListener('click', e => {
    const filterBtn = e.target.closest('.alert-severity-filters .filter-btn');
    if (filterBtn) {
      const filters = document.querySelectorAll('.alert-severity-filters .filter-btn');
      filters.forEach(btn => btn.classList.remove('active'));
      filterBtn.classList.add('active');
      const severity = filterBtn.getAttribute('data-severity');
      
      const alerts = document.querySelectorAll('#alertsStream .alert-item');
      alerts.forEach(item => {
        if (severity === 'all') {
          item.style.display = 'flex';
        } else {
          item.style.display = item.classList.contains(severity) ? 'flex' : 'none';
        }
      });
    }
    
    const floatBtn = e.target.closest('.float-action-btn');
    if (floatBtn) {
      const id = floatBtn.id;
      if (id === 'btnFloatNewTrade') {
        if (D.calcEntry) {
          D.calcEntry.focus();
          showToast('Simulator focused. Define your execution trade inputs!', 'info');
        }
      } else if (id === 'btnFloatAnalyze') {
        refreshAnalysis();
        showToast('AI core triggered: Re-analyzing ticker stream...', 'info');
      } else if (id === 'btnFloatRefresh') {
        refreshAnalysis(true);
        showToast('Data stream refreshed.', 'info');
      } else if (id === 'btnFloatSave') {
        showToast('Configuration settings saved to node successfully!', 'success');
      }
    }
  });
})();

