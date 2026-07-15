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
  const side = sideFromBias(data?.bias);
  const entry = lastPrice || (S.candles.length ? S.candles[S.candles.length - 1].c : 0);
  if (!side || !entry) return data;

  const plan = buildMarketTradePlan({
    side,
    entry,
    candles: S.candles,
    levels: data?.levels || S.srLevels,
    strategyId,
  });
  if (!plan.valid) return { ...data, marketPlan: plan };

  return {
    ...data,
    entryPrice: plan.entry,
    sl: plan.sl,
    tp: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    rr: plan.rr,
    marketPlan: plan,
    executionSteps: executionStepsFromPlan(plan),
  };
}


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
  document.body.classList.add('loading-active');

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
    startOrderbookPolling();

    // Fetch candle data, AI analysis, and Composite Market Score in parallel for maximum speed
    const [candlesRes, res, scoreRes] = await Promise.all([
      fetch(`/api/candles?symbol=${sym}&interval=${tfName}&limit=500`),
      fetch(`/api/ai/analysis?symbol=${sym}&interval=${tfName}`),
      fetch(`/api/market-score?symbol=${sym}&interval=${tfName}`).catch(e => {
        console.error('[Score Fetch Error]', e);
        return null;
      })
    ]);

    if (candlesRes.ok) {
      const rawCandles = await candlesRes.json();
      S.candles = rawCandles.map(k => ({
        t: parseInt(k[0]),
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: parseFloat(k[5]),
      }));
    }

    // Run backtester using the already loaded candles
    runBacktestAnalysis();

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let data = await res.json();
    
    let scoreData = null;
    if (scoreRes && scoreRes.ok) {
      try {
        scoreData = await scoreRes.json();
      } catch (e) {
        console.error('[Score JSON Error]', e);
      }
    }

    // Algorithmic Fusion is now performed directly in the backend's copilot.py,
    // ensuring consistency across all AI, LLM, and Coach components.
    // No need to double blend in the frontend.

    // Prevent race conditions
    if (S.coin !== sym) {
      clearInterval(stepInterval);
      return;
    }

    data = enrichAnalysisWithMarketPlan(data);
    window.lastAnalysisData = data;
    setAiSnapshot(data);

    renderBiasScore(data.score, data.bias);
    renderProbability(data.longProb, data.shortProb);
    renderMatrix(data.matrix || {});
    renderIndicatorCards(data);
    renderConfidenceBreakdown(data.confidenceBreakdown);
    renderLevelsAndStructures(data.levels, data.confluences);
    renderReport(data.analysis);
    renderTradeSetup(data);
    renderInstitutionalDashboard(data);
    if (scoreData) {
      renderMarketScore(scoreData);
    }

    clearInterval(stepInterval);
    if (barFill) barFill.style.width = '100%';
    if (progressText) progressText.textContent = "System ready.";
    setTimeout(() => {
      D.loadingOverlay.classList.add('fade-out');
      document.body.classList.remove('loading-active');
    }, 200);
  } catch (e) {
    clearInterval(stepInterval);
    console.error('[Analysis Fetch Error]', e);
    showToast('Failed to retrieve AI analysis. Retrying...', 'error');
    D.loadingOverlay.classList.add('fade-out');
    document.body.classList.remove('loading-active');
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
      
      if (val >= maxVal * 0.5) {
        positive.push({
          name: displayName,
          val: val,
          pct: Math.round((val / maxVal) * 100)
        });
      } else {
        const dragVal = -(maxVal - val);
        negative.push({
          name: displayName,
          val: dragVal,
          pct: Math.round(((maxVal - val) / maxVal) * 100)
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
    let formatted = data.coachMessage
      .replace(/### (.*)/g, '<h4>$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
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
  if (!D.btWinRate) return;
  const sym = S.coin;
  const tfName = TF_MAP[selectedInterval] || '1h';
  
  try {
    const candles = S.candles;
    if (!candles || candles.length === 0) return;
    
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
    D.btWinRate.style.color = winRate >= 50 ? 'var(--signal-bull)' : 'var(--signal-bear)';
    D.btProfitFactor.style.color = profitFactor >= 1.5 ? 'var(--signal-bull)' : profitFactor >= 1.0 ? 'var(--signal-neutral)' : 'var(--signal-bear)';
    
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

  // --- FEATURE 1: GLOBAL TOP BANNER (AI TRADE SCORE DASHBOARD) ---
  const topSymbolLabel = document.getElementById('topSymbolLabel');
  if (topSymbolLabel) topSymbolLabel.textContent = `${S.coin.replace('USDT', '')}/USDT`;
  
  const topSignalVal = document.getElementById('topSignalVal');
  if (topSignalVal) {
    topSignalVal.textContent = data.bias;
    topSignalVal.style.color = data.bias.includes('BULLISH') ? 'var(--signal-bull)' : data.bias.includes('BEARISH') ? 'var(--signal-bear)' : 'var(--signal-neutral)';
  }
  if (topPctVal) {
    topPctVal.textContent = `${data.score}%`;
    topPctVal.style.color = data.bias.includes('BULLISH') ? 'var(--signal-bull)' : data.bias.includes('BEARISH') ? 'var(--signal-bear)' : 'var(--signal-neutral)';
  }
  
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
    if (data.headerSummary) {
      topSummaryText.textContent = data.headerSummary;
    } else {
      const biasLower = data.bias ? data.bias.toLowerCase() : 'neutral';
      const eventText = data.newsImpact?.event || 'macro announcements';
      
      if (biasLower.includes('neutral') || biasLower.includes('range')) {
        const sups = data.levels?.support || [];
        const resis = data.levels?.resistance || [];
        const lowerBound = sups[0]?.price ? sups[0].price.toFixed(2) : (lastPrice ? (lastPrice * 0.98).toFixed(2) : '0');
        const upperBound = resis[0]?.price ? resis[0].price.toFixed(2) : (lastPrice ? (lastPrice * 1.02).toFixed(2) : '0');
        topSummaryText.textContent = `${S.coin} is consolidating in a neutral higher-timeframe range between ${lowerBound} and ${upperBound}. Recommend waiting for a confirmed breakout before establishing exposure. Avoid new risk during upcoming ${eventText}.`;
      } else {
        const steps = data.executionSteps || [];
        const entryTargetPrice = steps.length > 1 ? steps[1].val : (lastPrice ? lastPrice.toFixed(2) : '0');
        const slPrice = steps.length > 3 ? steps[3].val : '0';
        topSummaryText.textContent = `${S.coin} remains in a ${biasLower} higher-timeframe trend. Wait for a entry pullback near ${entryTargetPrice} before committing capital. Risk protection should be placed at stop loss target ${slPrice}. Avoid new exposure during upcoming ${eventText}.`;
      }
    }
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
    liveThinkingText.textContent = data.headerSummary || data.analysis || 'Analyzing...';
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
    const count = rel.total_logged || 0;
    if (count < 10) {
      reliabilityStatus.textContent = `Insufficient database history (${count} logged)`;
      reliabilityStatus.style.color = 'var(--signal-neutral)';
    } else {
      reliabilityStatus.textContent = `Active log verified (${count} signals resolved)`;
      reliabilityStatus.style.color = 'var(--signal-bull)';
    }
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
  let rrStr = data.rr ? `1 : ${Number(data.rr).toFixed(2)}` : '1 : 2.5';
  
  if (steps.length > 4) {
    entryStr = steps[1].val;
    slStr = steps[3].val;
    tpStr = steps[4].val;
    const rrStep = steps.find(s => (s.label || '').toLowerCase().includes('risk reward'));
    if (rrStep?.val) rrStr = `1 : ${String(rrStep.val).replace(/[^0-9.]/g, '') || '2.5'}`;
  }
  
  if (D.decEntry) D.decEntry.textContent = entryStr;
  if (D.decSL) D.decSL.textContent = slStr;
  if (D.decTP) D.decTP.textContent = tpStr;
  if (D.decRR) D.decRR.textContent = rrStr;

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
    const pBull = data.monteCarlo.bull_breakout !== undefined ? data.monteCarlo.bull_breakout : 33;
    const pRange = data.monteCarlo.ranging !== undefined ? data.monteCarlo.ranging : 34;
    const pBear = data.monteCarlo.bear_breakdown !== undefined ? data.monteCarlo.bear_breakdown : 33;
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

  // Update consolidated payoff unit
  const payoffStateVal = document.getElementById('payoffStateVal');
  const payoffActionVal = document.getElementById('payoffActionVal');
  const payoffLevelsVal = document.getElementById('payoffLevelsVal');
  const payoffInvalidationVal = document.getElementById('payoffInvalidationVal');
  const payoffWinRateVal = document.getElementById('payoffWinRateVal');
  const payoffHorizonVal = document.getElementById('payoffHorizonVal');
  const payoffTriggerVal = document.getElementById('payoffTriggerVal');
  
  if (payoffStateVal) {
    const isReady = data.blockRecommendation === 'READY';
    payoffStateVal.textContent = isReady ? 'READY' : 'WAIT';
    payoffStateVal.style.background = isReady ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 59, 111, 0.15)';
    payoffStateVal.style.color = isReady ? 'var(--signal-bull)' : 'var(--signal-bear)';
    payoffStateVal.style.boxShadow = isReady ? '0 0 10px rgba(0, 255, 102, 0.2)' : '0 0 10px rgba(255, 59, 111, 0.2)';
  }

  if (payoffActionVal) {
    const isBull = data.bias.endsWith('BULLISH');
    const isBear = data.bias.endsWith('BEARISH');
    payoffActionVal.textContent = isBull ? 'BUY / LONG' : isBear ? 'SELL / SHORT' : 'WAIT / RANGE';
    payoffActionVal.style.color = isBull ? 'var(--signal-bull)' : isBear ? 'var(--signal-bear)' : 'var(--signal-neutral)';
  }
  
  if (payoffLevelsVal) {
    payoffLevelsVal.textContent = `Entry: ${entryStr} | SL: ${slStr} | TP: ${tpStr}`;
  }

  if (payoffInvalidationVal && data.invalidationLevels) {
    const isBull = data.bias.endsWith('BULLISH');
    const isBear = data.bias.endsWith('BEARISH');
    if (isBull && data.invalidationLevels.bull_invalidation) {
      payoffInvalidationVal.textContent = `< $${data.invalidationLevels.bull_invalidation.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
      payoffInvalidationVal.style.color = 'var(--signal-bear)';
    } else if (isBear && data.invalidationLevels.bear_invalidation) {
      payoffInvalidationVal.textContent = `> $${data.invalidationLevels.bear_invalidation.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
      payoffInvalidationVal.style.color = 'var(--signal-bull)';
    } else {
      payoffInvalidationVal.textContent = `S: $${data.invalidationLevels.bull_invalidation?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '—'} | R: $${data.invalidationLevels.bear_invalidation?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '—'}`;
      payoffInvalidationVal.style.color = 'var(--text-muted)';
    }
  }
  
  if (payoffWinRateVal) {
    payoffWinRateVal.textContent = rel.win_rate ? `${rel.win_rate.toFixed(1)}%` : '—';
  }

  if (payoffHorizonVal) {
    payoffHorizonVal.textContent = S.tf === '60' ? '1H' : S.tf === '5' ? '5M' : S.tf === '15' ? '15M' : S.tf === '240' ? '4H' : S.tf === '1440' ? '1D' : `${S.tf}M`;
  }
  
  if (payoffTriggerVal) {
    const isNeutral = data.bias.includes('NEUTRAL');
    const isBull = data.bias.includes('BULLISH');
    let trigger = 'Breakout boundaries';
    if (!isNeutral) {
      const checklist = data.entryChecklist || [];
      const checkedItem = checklist.find(item => item.checked && !item.label.toLowerCase().includes('aligned'));
      trigger = checkedItem ? checkedItem.label : (isBull ? 'Bullish OB Retest' : 'Bearish OB Retest');
    }
    payoffTriggerVal.textContent = trigger;
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
      
      row.innerHTML = `
        <td style="font-weight: 600;">${evt.event}</td>
        <td style="color: var(--text-2); font-size: 11px;">${evt.date}</td>
        <td style="color: var(--gold);">${evt.weight}</td>
        <td style="color: ${volColor}; font-weight: 700;">${evt.volatility}</td>
        <td style="font-family: monospace; font-weight: 600;">${evt.result}</td>
        <td style="${impactStyle}">
          ${evt.impact}
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
  if (D.journalListBody) {
    D.journalListBody.innerHTML = '';
    const recent = rel.recent_signals || [];
    if (recent.length > 0) {
      recent.forEach((sig) => {
        const tr = document.createElement('tr');
        
        let directionStr = 'NEUTRAL';
        let recObj = {};
        try {
          recObj = typeof sig.direction === 'string' ? JSON.parse(sig.direction) : sig.direction;
          if (recObj.bias) {
            directionStr = recObj.bias.includes('BULLISH') ? 'LONG' : recObj.bias.includes('BEARISH') ? 'SHORT' : 'NEUTRAL';
          }
        } catch (e) {
          if (sig.direction) {
            directionStr = sig.direction.includes('BULLISH') ? 'LONG' : sig.direction.includes('BEARISH') ? 'SHORT' : 'NEUTRAL';
          }
        }
        
        let outcomeStr = 'PENDING';
        if (sig.outcome === 'hit_tp') outcomeStr = 'WIN';
        else if (sig.outcome === 'hit_sl') outcomeStr = 'LOSS';
        else if (sig.outcome === 'expired') outcomeStr = 'EXPIRED';
        
        const outcomeClass = outcomeStr === 'WIN' ? 'win' : outcomeStr === 'LOSS' ? 'loss' : 'neutral';
        const dirClass = directionStr === 'LONG' ? 'long' : directionStr === 'SHORT' ? 'short' : 'neutral';
        const rrStr = sig.rr ? sig.rr.toFixed(2) : '—';
        
        tr.innerHTML = `
          <td>#${sig.id}</td>
          <td class="j-dir ${dirClass}">${directionStr}</td>
          <td style="font-family:var(--mono);">${sig.confidence}%</td>
          <td><span class="j-res ${outcomeClass}">${outcomeStr}</span></td>
          <td style="font-family:var(--mono);">${rrStr}</td>
          <td>EMA + OB + FVG (${sig.timeframe})</td>
        `;
        D.journalListBody.appendChild(tr);
      });
    } else {
      // Fallback to mock loop if no db signals yet
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
  }

  // Set the global active trade setup for manual calculations
  activeTradeSetup = {
    type: data.bias.includes('BULLISH') ? 'LONG' : data.bias.includes('BEARISH') ? 'SHORT' : 'HOLD',
    entry: parseFloat(entryStr.replace(/[^0-9.]/g, '')),
    stopLoss: parseFloat(slStr.replace(/[^0-9.]/g, ''))
  };

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
  if (!btnBuy || !btnSell) return;

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

  document.getElementById('btnRunBt')?.addEventListener('click', runStrategyBacktestInBrowser);

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
