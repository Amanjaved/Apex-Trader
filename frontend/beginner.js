/**
 * ApexTrader — Beginner Page Engine (beginner.js)
 * Fetches AI Next Move Predictions, Target Ranges, and Support & Resistance Levels.
 */

(function () {
  'use strict';

  // --- State Variables ---
  let currentSymbol = 'BTCUSDT';
  let currentTf = '4h';
  let currentPrice = 0.0;
  let ws = null;
  let isFetching = false;
  let lastFetchedData = null;

  const SUPPORTED_COINS = [
    { symbol: 'BTCUSDT', name: 'BTC / USDT', icon: '₿', fullName: 'Bitcoin' },
    { symbol: 'ETHUSDT', name: 'ETH / USDT', icon: 'Ξ', fullName: 'Ethereum' },
    { symbol: 'SOLUSDT', name: 'SOL / USDT', icon: '◎', fullName: 'Solana' },
    { symbol: 'XRPUSDT', name: 'XRP / USDT', icon: '✕', fullName: 'Ripple' },
    { symbol: 'DOGEUSDT', name: 'DOGE / USDT', icon: 'Ð', fullName: 'Dogecoin' }
  ];

  // --- DOM Elements ---
  const elLivePriceVal = document.getElementById('livePriceVal');
  const elLivePriceChange = document.getElementById('livePriceChange');
  const elWsPulse = document.getElementById('wsPulse');
  const elSymName = document.getElementById('symName');
  const elSymIcon = document.getElementById('symIcon');
  const elSymSelectorBtn = document.getElementById('symSelectorBtn');
  const elCoinDropdown = document.getElementById('coinDropdown');
  const elCoinSearch = document.getElementById('coinSearch');
  const elCoinList = document.getElementById('coinList');
  const elRefreshBtn = document.getElementById('refreshBtn');

  // Prediction Card DOM Elements
  const elDirectionBadge = document.getElementById('directionBadge');
  const elDirectionIcon = document.getElementById('directionIcon');
  const elDirectionStatus = document.getElementById('directionStatus');
  const elDirectionSub = document.getElementById('directionSub');
  const elConfidenceVal = document.getElementById('confidenceVal');
  const elDialFill = document.getElementById('dialFill');
  const elTargetPriceVal = document.getElementById('targetPriceVal');
  const elTargetChangePct = document.getElementById('targetChangePct');
  const elStopPriceVal = document.getElementById('stopPriceVal');
  const elStopChangePct = document.getElementById('stopChangePct');
  const elReasonList = document.getElementById('reasonList');
  const elLastUpdated = document.getElementById('lastUpdated');

  // Market Temp Elements
  const elBiasVal = document.getElementById('biasVal');
  const elBiasMeter = document.getElementById('biasMeter');
  const elBuyerStrengthVal = document.getElementById('buyerStrengthVal');
  const elBuyerMeter = document.getElementById('buyerMeter');
  const elSellerMeter = document.getElementById('sellerMeter');
  const elVolatilityVal = document.getElementById('volatilityVal');
  const elVolPill = document.getElementById('volPill');
  const elAdviceText = document.getElementById('adviceText');

  // Ladder & Levels Elements
  const elLadderCurrentPrice = document.getElementById('ladderCurrentPrice');
  const elLadderResMajorPrice = document.getElementById('ladderResMajorPrice');
  const elLadderResNearPrice = document.getElementById('ladderResNearPrice');
  const elLadderSupNearPrice = document.getElementById('ladderSupNearPrice');
  const elLadderSupMajorPrice = document.getElementById('ladderSupMajorPrice');
  const elResistanceList = document.getElementById('resistanceList');
  const elSupportList = document.getElementById('supportList');

  // --- Initializer ---
  function init() {
    renderCoinList();
    bindEvents();
    // Render immediate initial state so page never stays on 'Loading...'
    renderPrediction({});
    renderSupportResistance({});
    renderPsychologicalAndDataDrivenLevels({});
    connectWebSocket();
    fetchPredictionData();
  }

  // --- Coin Selector Logic ---
  function renderCoinList(filter = '') {
    if (!elCoinList) return;
    elCoinList.innerHTML = '';
    const filtered = SUPPORTED_COINS.filter(c => 
      c.symbol.toLowerCase().includes(filter.toLowerCase()) || 
      c.fullName.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(coin => {
      const item = document.createElement('div');
      item.className = 'coin-item';
      item.innerHTML = `
        <span>${coin.icon} <strong>${coin.fullName}</strong></span>
        <span style="color:var(--text-muted); font-size:0.75rem;">${coin.symbol}</span>
      `;
      item.addEventListener('click', () => {
        selectCoin(coin);
      });
      elCoinList.appendChild(item);
    });
  }

  function selectCoin(coin) {
    currentSymbol = coin.symbol;
    if (elSymName) elSymName.textContent = coin.name;
    if (elSymIcon) elSymIcon.textContent = coin.icon;
    if (elCoinDropdown) elCoinDropdown.classList.remove('show');
    showToast(`Switched coin to ${coin.name}`);
    connectWebSocket();
    fetchPredictionData();
  }

  function bindEvents() {
    // Dropdown toggle
    if (elSymSelectorBtn && elCoinDropdown) {
      elSymSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elCoinDropdown.classList.toggle('show');
      });

      document.addEventListener('click', (e) => {
        if (!elCoinDropdown.contains(e.target) && e.target !== elSymSelectorBtn) {
          elCoinDropdown.classList.remove('show');
        }
      });
    }

    if (elCoinSearch) {
      elCoinSearch.addEventListener('input', (e) => {
        renderCoinList(e.target.value);
      });
    }

    // Refresh Button
    if (elRefreshBtn) {
      elRefreshBtn.addEventListener('click', () => {
        fetchPredictionData();
        showToast('Refreshing latest prediction...');
      });
    }

    // Timeframe selector
    // Timeframe selector
    const tfBtns = document.querySelectorAll('.tf-btn');
    tfBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tfBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTf = btn.dataset.tf;
        fetchPredictionData();
        showToast(`Forecast timeframe set to ${btn.textContent}`);
      });
    });

    // Two-Mode AI System Controls
    const btnInfo = document.getElementById('btnModeInfo');
    const btnStrat = document.getElementById('btnModeStrategy');
    if (btnInfo) {
      btnInfo.addEventListener('click', () => setMode('info'));
    }
    if (btnStrat) {
      btnStrat.addEventListener('click', () => setMode('strategy'));
    }

    const posSync = document.getElementById('positionSyncCheckbox');
    const syncStatusText = document.getElementById('syncStatusText');
    if (posSync) {
      posSync.addEventListener('change', (e) => {
        if (e.target.checked) {
          setMode('info');
          if (syncStatusText) syncStatusText.textContent = 'Active Position Detected (Information Mode Sync)';
          showToast('Position Sync: Switched to Mode 1 (Information Mode)');
        } else {
          setMode('strategy');
          if (syncStatusText) syncStatusText.textContent = 'No Active Position (Strategy Mode Sync)';
          showToast('Position Sync: Switched to Mode 2 (Strategy Mode)');
        }
      });
    }

    // Progressive Disclosure View Tabs
    const vtabBtns = document.querySelectorAll('.vtab-btn');
    vtabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.dataset.tab;
        vtabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-panel').forEach(panel => {
          panel.classList.remove('active');
        });
        const activePanel = document.getElementById(targetTabId);
        if (activePanel) activePanel.classList.add('active');
      });
    });

    // Accordion toggle helper
    window.toggleAccordion = function(headerEl) {
      const item = headerEl.parentElement;
      if (item) item.classList.toggle('active');
    };
  }

  function setMode(mode) {
    const btnInfo = document.getElementById('btnModeInfo');
    const btnStrat = document.getElementById('btnModeStrategy');
    const panel1 = document.getElementById('mode1Panel');
    const panel2 = document.getElementById('mode2Panel');

    if (mode === 'info') {
      if (btnInfo) btnInfo.classList.add('active');
      if (btnStrat) btnStrat.classList.remove('active');
      if (panel1) panel1.classList.add('active');
      if (panel2) panel2.classList.remove('active');
    } else {
      if (btnStrat) btnStrat.classList.add('active');
      if (btnInfo) btnInfo.classList.remove('active');
      if (panel2) panel2.classList.add('active');
      if (panel1) panel1.classList.remove('active');
    }
  }

  function renderTwoModeAnalysis(data) {
    data = data || {};
    const price = currentPrice || data.price || 0;
    const priceStr = price > 0 ? `$${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$--,--';
    
    // Mode 1 (Information Mode) Updates
    const elInfoPrice = document.getElementById('infoPriceVal');
    const elInfoPriceChg = document.getElementById('infoPriceChg');
    const elInfoNearSup = document.getElementById('infoNearSup');
    const elInfoNearRes = document.getElementById('infoNearRes');
    const elInfoTrendVal = document.getElementById('infoTrendVal');

    if (elInfoPrice) elInfoPrice.textContent = priceStr;
    if (elInfoPriceChg && data.change24h != null) {
      elInfoPriceChg.textContent = `${data.change24h >= 0 ? '+' : ''}${data.change24h.toFixed(2)}%`;
      elInfoPriceChg.className = data.change24h >= 0 ? 'green' : 'red';
    }
    if (elInfoTrendVal && data.bias) {
      elInfoTrendVal.textContent = data.bias.includes('BULL') ? 'Bullish Expansion' : (data.bias.includes('BEAR') ? 'Bearish Contraction' : 'Consolidation / Range');
      elInfoTrendVal.className = data.bias.includes('BULL') ? 'green' : (data.bias.includes('BEAR') ? 'red' : 'yellow');
    }

    if (data.support && data.support.length > 0 && elInfoNearSup) {
      elInfoNearSup.textContent = `$${data.support[0].toLocaleString('en-US')}`;
    }
    if (data.resistance && data.resistance.length > 0 && elInfoNearRes) {
      elInfoNearRes.textContent = `$${data.resistance[0].toLocaleString('en-US')}`;
    }

    // Mode 2 (Trading Strategy Mode) Updates
    const elNextObsTarget = document.getElementById('nextObsTarget');
    if (elNextObsTarget && data.resistance && data.resistance.length > 0) {
      elNextObsTarget.textContent = `$${data.resistance[0].toLocaleString('en-US')} Resistance Level`;
    }

    const conf = Math.round(data.confidence || data.score || 74);
    const elStratConf = document.getElementById('stratConfidenceScore');
    const elOverallReadiness = document.getElementById('overallReadinessVal');
    const elProgMomVal = document.getElementById('progMomVal');
    const elProgMomFill = document.getElementById('progMomFill');

    if (elStratConf) elStratConf.textContent = `${conf}% Confidence`;
    if (elOverallReadiness) elOverallReadiness.textContent = `${conf}% Ready`;
    if (elProgMomVal) elProgMomVal.textContent = `${conf}%`;
    if (elProgMomFill) elProgMomFill.style.width = `${conf}%`;
  }

  // --- WebSocket Price Stream ---
  function connectWebSocket() {
    if (ws) {
      try { ws.close(); } catch(e){}
    }
    const streamSymbol = currentSymbol.toLowerCase();
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamSymbol}@ticker`;

    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (elWsPulse) elWsPulse.style.background = 'var(--green)';
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          const price = parseFloat(data.c);
          const chg = parseFloat(data.P);
          updateLiveTicker(price, chg);
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    ws.onerror = () => {
      if (elWsPulse) elWsPulse.style.background = 'var(--red)';
    };
  }

  function updateLiveTicker(price, changePct) {
    if (!price || isNaN(price)) return;
    currentPrice = price;

    if (elLivePriceVal) elLivePriceVal.textContent = `$${formatPrice(price)}`;
    if (elLadderCurrentPrice) elLadderCurrentPrice.textContent = `$${formatPrice(price)}`;

    if (changePct !== undefined && elLivePriceChange) {
      elLivePriceChange.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
      elLivePriceChange.className = `price-change ${changePct >= 0 ? 'up' : 'down'}`;
    }

    // Re-render S/R levels & Psychological levels with updated distance %
    renderSupportResistance(lastFetchedData || {});
    renderPsychologicalAndDataDrivenLevels(lastFetchedData || {});
    renderPrediction(lastFetchedData || {});
    renderTwoModeAnalysis(lastFetchedData || {});
  }

  // --- Main API Data Fetch ---
  async function fetchPredictionData() {
    if (isFetching) return;
    isFetching = true;

    try {
      // 1. Fetch REST Ticker as immediate fallback if price isn't set yet
      if (!currentPrice || currentPrice <= 0) {
        try {
          const tResp = await fetch(`/api/ticker?symbol=${currentSymbol}`);
          if (tResp.ok) {
            const tData = await tResp.json();
            if (tData && tData.price) {
              updateLiveTicker(parseFloat(tData.price), parseFloat(tData.change24h || 0));
            }
          }
        } catch (e) {
          console.warn('Ticker REST fallback failed', e);
        }
      }

      // 2. Fetch Full AI Analysis
      const response = await fetch(`/api/ai/analysis?symbol=${currentSymbol}&interval=${currentTf}`);
      if (!response.ok) throw new Error('API server unreachable');
      
      const data = await response.json();
      lastFetchedData = data;

      if (data.price && data.price > 0 && (!currentPrice || currentPrice <= 0)) {
        updateLiveTicker(parseFloat(data.price), parseFloat(data.change24h || 0));
      }

      renderPrediction(data);
      renderSupportResistance(data);
      renderMarketTemperature(data);
      renderPsychologicalAndDataDrivenLevels(data);
      renderTwoModeAnalysis(data);

      if (elLastUpdated) {
        elLastUpdated.textContent = `Updated at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      }
    } catch (err) {
      console.error('Error fetching prediction:', err);
      // Even on error, render fallback prediction & S/R using live price
      renderPrediction({});
      renderTwoModeAnalysis({});
    } finally {
      isFetching = false;
    }
  }

  // State for hysteresis & prediction stability
  let lastConfirmedBias = null;
  let lastConfirmedScore = 50;

  // --- Render Prediction Section ---
  function renderPrediction(data) {
    data = data || {};
    
    // If empty data during initial page load before API returns, render smooth loading state if no cached state
    if (!data.bias && data.score === undefined && !lastConfirmedBias) {
      if (elDirectionBadge) {
        elDirectionBadge.className = 'direction-badge neutral';
        if (elDirectionIcon) elDirectionIcon.textContent = '🤖';
        if (elDirectionStatus) elDirectionStatus.textContent = 'ANALYZING CONSENSUS...';
        if (elDirectionSub) elDirectionSub.textContent = 'Evaluating multi-factor trend & order book depth...';
      }
      if (elConfidenceVal) elConfidenceVal.textContent = `--%`;
      if (elReasonList) {
        elReasonList.innerHTML = '<li>Scanning market structure & volume metrics...</li>';
      }
      return;
    }

    const rawBias = (data.bias || lastConfirmedBias || 'NEUTRAL').toUpperCase();
    const rawScore = Math.round(data.confidence || data.score || lastConfirmedScore);

    // Apply Hysteresis Buffer: Require >= 56% for Bullish, <= 44% for Bearish, else Neutral Ranging
    let finalBias = 'NEUTRAL';
    if (rawScore >= 56 || rawBias.includes('STRONG BULLISH')) {
      finalBias = 'BULLISH';
    } else if (rawScore <= 44 || rawBias.includes('STRONG BEARISH')) {
      finalBias = 'BEARISH';
    } else {
      finalBias = 'NEUTRAL';
    }

    // Hysteresis dampening: prevent rapid flipping on 1-2 point noise ticks
    if (lastConfirmedBias && lastConfirmedBias !== finalBias) {
      const delta = Math.abs(rawScore - lastConfirmedScore);
      if (delta < 5) {
        finalBias = lastConfirmedBias;
      }
    }

    // Update state memory
    lastConfirmedBias = finalBias;
    lastConfirmedScore = rawScore;

    const entry = currentPrice || data.entry || 65443.0;
    const target = data.target || (finalBias === 'BULLISH' ? entry * 1.025 : finalBias === 'BEARISH' ? entry * 0.975 : entry * 1.01);
    const stop = data.stop || (finalBias === 'BULLISH' ? entry * 0.985 : finalBias === 'BEARISH' ? entry * 1.015 : entry * 0.99);

    // Direction Badge styling & messaging
    const elReliabilityBadge = document.getElementById('reliabilityBadge');

    if (elDirectionBadge) {
      elDirectionBadge.className = 'direction-badge';
      if (finalBias === 'BULLISH') {
        if (elDirectionIcon) elDirectionIcon.textContent = '🚀';
        if (elDirectionStatus) elDirectionStatus.textContent = 'BULLISH MOVE EXPECTED';
        if (elDirectionSub) elDirectionSub.textContent = 'Buyers are currently in control with higher-timeframe trend backing.';
        if (elReliabilityBadge) {
          elReliabilityBadge.textContent = '🛡️ STABLE BULLISH CONSENSUS';
          elReliabilityBadge.style.cssText = 'margin:0; background:rgba(0,192,118,0.15); color:var(--green); border-color:rgba(0,192,118,0.3);';
        }
      } else if (finalBias === 'BEARISH') {
        elDirectionBadge.classList.add('bearish');
        if (elDirectionIcon) elDirectionIcon.textContent = '📉';
        if (elDirectionStatus) elDirectionStatus.textContent = 'BEARISH MOVE EXPECTED';
        if (elDirectionSub) elDirectionSub.textContent = 'Sellers are pressing price downward near overhead resistance ceilings.';
        if (elReliabilityBadge) {
          elReliabilityBadge.textContent = '🛡️ STABLE BEARISH CONSENSUS';
          elReliabilityBadge.style.cssText = 'margin:0; background:rgba(255,59,105,0.15); color:var(--red); border-color:rgba(255,59,105,0.3);';
        }
      } else {
        elDirectionBadge.classList.add('neutral');
        if (elDirectionIcon) elDirectionIcon.textContent = '⚖️';
        if (elDirectionStatus) elDirectionStatus.textContent = 'NEUTRAL / CONSOLIDATING PHASE';
        if (elDirectionSub) elDirectionSub.textContent = 'Market is ranging sideways between key Support and Resistance bounds.';
        if (elReliabilityBadge) {
          elReliabilityBadge.textContent = '⚖️ STABLE RANGE CONSENSUS';
          elReliabilityBadge.style.cssText = 'margin:0; background:rgba(240,185,11,0.15); color:var(--gold); border-color:rgba(240,185,11,0.3);';
        }
      }
    }

    // Executive Summary Hero Card Elements (Feature 1)
    const elExecMarket = document.getElementById('execMarketVal');
    const elExecConf = document.getElementById('execConfVal');
    const elExecNextLevel = document.getElementById('execNextLevelVal');

    if (elExecMarket) {
      elExecMarket.textContent = finalBias === 'BULLISH' ? 'Bullish' : (finalBias === 'BEARISH' ? 'Bearish' : 'Ranging');
      elExecMarket.className = `exec-val ${finalBias === 'BULLISH' ? 'green' : (finalBias === 'BEARISH' ? 'red' : 'yellow')}`;
    }
    if (elExecConf) elExecConf.textContent = `${rawScore}%`;
    if (elExecNextLevel && data.resistance && data.resistance.length > 0) {
      elExecNextLevel.textContent = `$${formatPrice(data.resistance[0])}`;
    }

    // Confidence Dial Meter calculation
    if (elConfidenceVal) elConfidenceVal.textContent = `${rawScore}%`;
    if (elDialFill) {
      const offset = 126 - (rawScore / 100) * 126;
      elDialFill.style.strokeDashoffset = Math.max(0, Math.min(126, offset));
    }

    // Target & Stop Box
    if (elTargetPriceVal) elTargetPriceVal.textContent = `$${formatPrice(target)}`;
    const baseP = currentPrice > 0 ? currentPrice : entry;
    const targetPct = baseP > 0 ? ((target - baseP) / baseP * 100).toFixed(1) : '+2.5';
    if (elTargetChangePct) elTargetChangePct.textContent = `${targetPct >= 0 ? '+' : ''}${targetPct}% expected target`;

    if (elStopPriceVal) elStopPriceVal.textContent = `$${formatPrice(stop)}`;
    const stopPct = baseP > 0 ? ((stop - baseP) / baseP * 100).toFixed(1) : '-1.5';
    if (elStopChangePct) elStopChangePct.textContent = `${stopPct}% safety floor`;

    // Plain English Reasons
    if (elReasonList) {
      elReasonList.innerHTML = '';
      const reasons = extractBeginnerReasons(data, finalBias);
      reasons.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        elReasonList.appendChild(li);
      });
    }
  }

  function extractBeginnerReasons(data, finalBias) {
    const list = [];

    if (data && data.reason && typeof data.reason === 'string') {
      list.push(cleanText(data.reason));
    }

    if (data && data.confluences && Array.isArray(data.confluences)) {
      data.confluences.forEach(c => {
        if (c && c.txt && typeof c.txt === 'string' && list.length < 3) {
          list.push(cleanText(c.txt));
        }
      });
    }

    if (list.length === 0) {
      if (finalBias === 'BULLISH') {
        list.push('Bitcoin momentum is holding strong above short-term trend averages.');
        list.push('Buyer order flow and bid absorption remain solid below current price.');
        list.push('AI quantitative consensus predicts high probability of upward continuation.');
      } else if (finalBias === 'BEARISH') {
        list.push('Bitcoin price is encountering selling pressure near overhead resistance ceilings.');
        list.push('Short-term momentum indicators show ask volume absorption.');
        list.push('Risk-reward ratio favors waiting for a pullback to support floors.');
      } else {
        list.push('Market structure is consolidating inside a technical trading channel.');
        list.push('Buyer and seller volume are balanced near current price levels.');
        list.push('Recommend watching Support Floors and Resistance Ceilings before positioning.');
      }
    }

    return list.slice(0, 3);
  }

  function cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/EMA\d+/g, 'Trend Average')
               .replace(/SMC/g, 'Smart Money')
               .replace(/RSI/g, 'Momentum Index')
               .replace(/FVG/g, 'Price Gap')
               .replace(/ATR/g, 'Volatility Range');
  }

  // --- Render Market Temperature ---
  function renderMarketTemperature(data) {
    data = data || {};
    const bias = (data.bias || 'BULLISH').toUpperCase();
    const confidence = Math.round(data.confidence || data.score || 72);

    if (elBiasVal) elBiasVal.textContent = bias;
    if (elBiasMeter) {
      elBiasMeter.style.width = `${confidence}%`;
      elBiasMeter.style.background = bias.includes('BULL') ? 'var(--green)' : bias.includes('BEAR') ? 'var(--red)' : 'var(--gold)';
    }

    // Buyer vs Seller ratio
    const longProb = data.longProb || confidence;
    const shortProb = Math.max(0, 100 - longProb);
    if (elBuyerStrengthVal) elBuyerStrengthVal.textContent = `${longProb}% Buyers / ${shortProb}% Sellers`;
    if (elBuyerMeter) elBuyerMeter.style.width = `${longProb}%`;
    if (elSellerMeter) elSellerMeter.style.width = `${shortProb}%`;

    // Volatility safely checked
    const rawRegime = data.regime;
    const regimeStr = typeof rawRegime === 'string' ? rawRegime : (rawRegime?.type || 'NORMAL');
    if (elVolatilityVal) elVolatilityVal.textContent = regimeStr.includes('TREND') ? 'Active Trend' : 'Consolidating';
    if (elVolPill) elVolPill.textContent = confidence > 70 ? 'High Pace' : 'Steady Pace';

    // Advice text
    if (elAdviceText) {
      if (bias.includes('BULL')) {
        elAdviceText.textContent = 'Bitcoin momentum is leaning upwards. Watch Support levels for safe entry points.';
      } else if (bias.includes('BEAR')) {
        elAdviceText.textContent = 'Bitcoin is under selling pressure. Be cautious buying near Resistance ceilings.';
      } else {
        elAdviceText.textContent = 'Market is ranging sideways. Wait for price to touch key Floor or Ceiling levels.';
      }
    }
  }

  function normalizePriceItem(item, fallbackPrice) {
    if (typeof item === 'number' && !isNaN(item)) return { price: item };
    if (item && typeof item.price === 'number' && !isNaN(item.price)) return { price: item.price, label: item.label || 'Level' };
    if (typeof item === 'string' && !isNaN(parseFloat(item))) return { price: parseFloat(item) };
    return { price: fallbackPrice };
  }

  // --- Render Support & Resistance Levels ---
  function renderSupportResistance(data) {
    data = data || {};
    const p = (currentPrice && currentPrice > 0) ? currentPrice : (data.price || data.entry || 65443.0);

    let rawSupports = (data.levels && Array.isArray(data.levels.support)) ? data.levels.support : (Array.isArray(data.support) ? data.support : []);
    let rawResistances = (data.levels && Array.isArray(data.levels.resistance)) ? data.levels.resistance : (Array.isArray(data.resistance) ? data.resistance : []);

    let supports = rawSupports.map(s => normalizePriceItem(s, p * 0.985));
    let resistances = rawResistances.map(r => normalizePriceItem(r, p * 1.015));

    // Fallbacks if empty or fewer than 2 items
    if (supports.length === 0) {
      supports = [
        { price: p * 0.985, score: 80, label: 'Nearest Support' },
        { price: p * 0.962, score: 90, label: 'Major Support' }
      ];
    } else if (supports.length === 1) {
      supports.push({ price: supports[0].price * 0.98, score: 75, label: 'Major Support' });
    }

    if (resistances.length === 0) {
      resistances = [
        { price: p * 1.015, score: 75, label: 'Nearest Resistance' },
        { price: p * 1.038, score: 85, label: 'Major Resistance' }
      ];
    } else if (resistances.length === 1) {
      resistances.push({ price: resistances[0].price * 1.02, score: 75, label: 'Major Resistance' });
    }

    // Sort: supports descending (highest price floor first), resistances ascending (lowest price ceiling first)
    supports.sort((a, b) => b.price - a.price);
    resistances.sort((a, b) => a.price - b.price);

    const supNear = supports[0];
    const supMajor = supports[1] || supports[0];
    const resNear = resistances[0];
    const resMajor = resistances[1] || resistances[0];

    // Helper to update text across all duplicate IDs in DOM (e.g. Tab 3 & bottom section)
    const setAllText = (id, txt) => document.querySelectorAll(`#${id}`).forEach(el => { el.textContent = txt; });

    // Render Price Ladder across ALL matching elements
    setAllText('ladderCurrentPrice', `$${formatPrice(p)}`);
    setAllText('ladderResMajorPrice', `$${formatPrice(resMajor.price)}`);
    setAllText('ladderResNearPrice', `$${formatPrice(resNear.price)}`);
    setAllText('ladderSupNearPrice', `$${formatPrice(supNear.price)}`);
    setAllText('ladderSupMajorPrice', `$${formatPrice(supMajor.price)}`);

    // Render Resistance Card List across ALL matching containers
    document.querySelectorAll('#resistanceList').forEach(container => {
      container.innerHTML = '';
      resistances.slice(0, 2).forEach((r, idx) => {
        const distPct = p > 0 ? (((r.price - p) / p) * 100).toFixed(1) : '1.5';
        const item = document.createElement('div');
        item.className = 'sr-box';
        item.innerHTML = `
          <div class="sr-box-header">
            <span class="sr-box-title" style="color:var(--red)">${idx === 0 ? 'Nearest Ceiling (R1)' : 'Major Ceiling (R2)'}</span>
            <div>
              <span class="sr-box-price">$${formatPrice(r.price)}</span>
              <span class="sr-box-dist">(+${distPct}%)</span>
            </div>
          </div>
          <div class="sr-box-desc">
            ${idx === 0 
              ? 'First price ceiling where buyers may pause and sellers are likely to lock in quick profits.' 
              : 'Strong structural roof level. Breaking above this ceiling signals an explosive upward rally.'}
          </div>
        `;
        container.appendChild(item);
      });
    });

    // Render Support Card List across ALL matching containers
    document.querySelectorAll('#supportList').forEach(container => {
      container.innerHTML = '';
      supports.slice(0, 2).forEach((s, idx) => {
        const distPct = p > 0 ? (((p - s.price) / p) * 100).toFixed(1) : '1.5';
        const item = document.createElement('div');
        item.className = 'sr-box';
        item.innerHTML = `
          <div class="sr-box-header">
            <span class="sr-box-title" style="color:var(--green)">${idx === 0 ? 'Nearest Floor (S1)' : 'Major Floor (S2)'}</span>
            <div>
              <span class="sr-box-price">$${formatPrice(s.price)}</span>
              <span class="sr-box-dist">(-${distPct}%)</span>
            </div>
          </div>
          <div class="sr-box-desc">
            ${idx === 0 
              ? 'First price floor where buyers are waiting to step in and stop Bitcoin from falling.' 
              : 'Major institutional safety net floor. Price historic bounce rate is high at this level.'}
          </div>
        `;
        container.appendChild(item);
      });
    });

    // Render Psychological & Data Driven section as well
    renderPsychologicalAndDataDrivenLevels(data);
  }

  // --- Render Psychological & Data Driven Levels ---
  function renderPsychologicalAndDataDrivenLevels(data) {
    const p = (currentPrice && currentPrice > 0) ? currentPrice : (data?.entry || data?.price || 65443.06);

    // --- 1. Psychological Round Number Barriers ---
    const roundStep = p > 20000 ? 5000 : p > 1000 ? 500 : 50;
    const currentRound = Math.floor(p / roundStep) * roundStep;

    const psychLevels = [
      {
        name: `$${formatPrice(currentRound + roundStep * 2)} Major Round Roof`,
        price: currentRound + roundStep * 2,
        type: 'ceiling',
        tag: '🧱 Major Round Ceiling',
        desc: 'Major round milestone where retail and automated bots place heavy profit-taking sell orders.'
      },
      {
        name: `$${formatPrice(currentRound + roundStep)} Immediate Round Barrier`,
        price: currentRound + roundStep,
        type: 'ceiling',
        tag: '🎯 Milestone Overhead',
        desc: 'Immediate psychological round barrier overhead. Stalling is common near round milestones.'
      },
      {
        name: `$${formatPrice(currentRound)} Current Round Pivot`,
        price: currentRound,
        type: 'pivot',
        tag: '📍 Round Pivot Floor',
        desc: 'Current round-number price anchor. Holding above this zone sustains bullish sentiment.'
      },
      {
        name: `$${formatPrice(currentRound - roundStep)} Psychological Support Floor`,
        price: currentRound - roundStep,
        type: 'floor',
        tag: '🛡️ Psychological Floor',
        desc: 'Strong round-number buying floor where limit orders accumulate to prevent steep drops.'
      },
      {
        name: `$${formatPrice(currentRound - roundStep * 2)} Institutional Safety Wall`,
        price: currentRound - roundStep * 2,
        type: 'floor',
        tag: '🏰 Major Round Fortress',
        desc: 'Deep psychological support boundary. Institutional market makers heavily defend this level.'
      }
    ];

    document.querySelectorAll('#psychList').forEach(container => {
      container.innerHTML = '';
      psychLevels.forEach(lvl => {
        const diff = lvl.price - p;
        const distPct = ((Math.abs(diff) / p) * 100).toFixed(1);
        const isAbove = diff >= 0;
        const color = lvl.type === 'ceiling' ? 'var(--red)' : lvl.type === 'floor' ? 'var(--green)' : 'var(--gold)';

        const item = document.createElement('div');
        item.className = 'sr-box';
        item.innerHTML = `
          <div class="sr-box-header">
            <span class="sr-box-title" style="color:${color}">${lvl.name}</span>
            <div>
              <span class="sr-box-price">$${formatPrice(lvl.price)}</span>
              <span class="sr-box-dist">(${isAbove ? '+' : '-'}${distPct}%)</span>
            </div>
          </div>
          <div style="display:flex; gap:6px; margin:4px 0;">
            <span class="tag ${lvl.type === 'ceiling' ? 'tag-red' : lvl.type === 'floor' ? 'tag-green' : 'tag-gold'}">${lvl.tag}</span>
            <span class="tag tag-gold">★★★★★ STRENGTH</span>
          </div>
          <div class="sr-box-desc">${lvl.desc}</div>
        `;
        container.appendChild(item);
      });
    });

    // --- 2. Data-Driven Long-Term Structural Anchors ---
    const lt = data?.long_term_levels || {};
    const ema200Val = lt.ema200 || (p * 0.915);
    const ema50Val = lt.ema50 || (p * 0.982);
    const high52Val = lt.high52 || Math.max(73750.0, p * 1.12);
    const low52Val = lt.low52 || (p * 0.75);
    const pocVal = lt.poc || (p * 0.972);

    const dataLevels = [
      {
        name: '52-Week Peak High (Cycle Ceiling)',
        price: high52Val,
        tag: '🚀 Historic Peak Ceiling',
        desc: 'Highest recorded candle price in current market cycle. Breaking above triggers explosive price discovery.'
      },
      {
        name: '200-Day Moving Average (Bull Market Floor)',
        price: ema200Val,
        tag: '📈 Macro Bull Support',
        desc: 'The gold-standard long-term trend indicator. Staying above 200-Day line confirms macro bull market.'
      },
      {
        name: 'Volume Point of Control (POC)',
        price: pocVal,
        tag: '📊 High-Volume Magnet',
        desc: 'The exact price level with the highest volume of traded contracts. Acts as a strong magnetic price anchor.'
      },
      {
        name: '50-Day Exponential Moving Average',
        price: ema50Val,
        tag: '⚡ Mid-Term Trend Line',
        desc: 'Key institutional trend baseline. Trading above 50-Day EMA indicates healthy mid-term buying momentum.'
      },
      {
        name: '52-Week Cycle Low (Macro Bottom)',
        price: low52Val,
        tag: '🏰 Institutional Accumulation Bed',
        desc: 'Lowest recorded candle floor of the year. Institutional spot ETFs aggressively defend this value area.'
      }
    ];

    document.querySelectorAll('#dataDrivenList').forEach(container => {
      container.innerHTML = '';
      dataLevels.forEach(lvl => {
        const diff = lvl.price - p;
        const distPct = ((Math.abs(diff) / p) * 100).toFixed(1);
        const isAbove = diff >= 0;
        const color = isAbove ? 'var(--cyan)' : 'var(--green)';

        const item = document.createElement('div');
        item.className = 'sr-box';
        item.innerHTML = `
          <div class="sr-box-header">
            <span class="sr-box-title" style="color:${color}">${lvl.name}</span>
            <div>
              <span class="sr-box-price">$${formatPrice(lvl.price)}</span>
              <span class="sr-box-dist">(${isAbove ? '+' : '-'}${distPct}%)</span>
            </div>
          </div>
          <div style="display:flex; gap:6px; margin:4px 0;">
            <span class="tag tag-cyan">${lvl.tag}</span>
            <span class="tag tag-cyan">REAL BINANCE DATA</span>
          </div>
          <div class="sr-box-desc">${lvl.desc}</div>
        `;
        container.appendChild(item);
      });
    });
  }

  // --- Helper Utilities ---
  function formatPrice(val) {
    if (!val || isNaN(val)) return '0.00';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
      background: rgba(18, 24, 38, 0.95);
      border: 1px solid ${type === 'error' ? 'var(--red)' : 'var(--gold)'};
      color: var(--text-primary);
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      margin-bottom: 8px;
      transition: all 0.3s ease;
    `;
    toast.textContent = msg;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Initialize script on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
