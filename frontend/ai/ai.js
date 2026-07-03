import { S, COINS, TF_MAP } from '../settings/state.js';
import { D } from '../settings/dom.js';
import { getEMA, getRSI, getMACD, getBB, getATR, getCloses } from '../indicators/indicators.js';
import { setAiSnapshot } from '../paper/engine.js';
import { buildMarketTradePlan, executionStepsFromPlan, sideFromBias } from '../paper/market_risk.js';

function getInpVal(el, def) {
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

function clamp(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }

function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function enrichAiSnapshotWithMarketPlan(data) {
  const side = sideFromBias(data?.bias);
  const entry = S.candles.length ? S.candles[S.candles.length - 1].c : 0;
  if (!side || !entry) return data;

  const plan = buildMarketTradePlan({
    side,
    entry,
    candles: S.candles,
    levels: data?.levels || S.srLevels,
    strategyId: 'ai_consensus',
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

export async function updateAI() {
  const sym = S.coin;
  const tf = TF_MAP[S.tf] || '1h';

  try {
    const r = await fetch(`/api/ai/analysis?symbol=${sym}&interval=${tf}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let data = await r.json();

    // Prevent race conditions
    if (S.coin !== sym) return;

    data = enrichAiSnapshotWithMarketPlan(data);
    setAiSnapshot(data);

    if (data.executionSteps?.length) {
      const slStep = data.executionSteps.find(s => (s.label || '').toLowerCase().includes('stop loss'));
      const tpStep = data.executionSteps.find(s => (s.label || '').toLowerCase().includes('take profit 1'));
      if (slStep && D.riskStop) {
        const sl = parseFloat(String(slStep.val).replace(/[^0-9.-]/g, ''));
        if (sl > 0) D.riskStop.value = sl.toFixed(2);
      }
      if (tpStep && D.riskTP) {
        const tp = parseFloat(String(tpStep.val).replace(/[^0-9.-]/g, ''));
        if (tp > 0) D.riskTP.value = tp.toFixed(2);
      }
    }

    // 1. Update Trend Badge
    const biasLower = data.bias.toLowerCase();
    const tClass = biasLower.includes('strong bullish') || biasLower === 'bullish'
      ? 'bullish'
      : biasLower.includes('strong bearish') || biasLower === 'bearish'
      ? 'bearish'
      : 'neutral';
    
    D.aiTrendBadge.textContent = data.bias;
    D.aiTrendBadge.className = `ai-badge ${tClass}`;

    // 2. Render Confluences
    D.aiReasonsList.innerHTML = (data.confluences || []).map(rc => {
      const icon = rc.type === 'bullish' ? '✓' : rc.type === 'bearish' ? '✗' : '●';
      const cName = rc.type === 'bullish' ? 'ok' : rc.type === 'bearish' ? 'ko' : 'neutral';
      return `
        <div class="ai-reason ${cName}">
          <span>${icon}</span>
          <span>${rc.txt}</span>
        </div>`;
    }).join('');

    // 2.5 Render Confluence Matrix
    if (data.matrix && D.aiTfMatrix) {
      const tfs = ["5m", "15m", "1h", "4h", "1d"];
      D.aiTfMatrix.innerHTML = tfs.map(tf => {
        const m = data.matrix[tf] || { bias: "NEUTRAL" };
        const biasLower = m.bias.toLowerCase();
        const isBull = biasLower.includes("bullish");
        const isBear = biasLower.includes("bearish");
        const mClass = isBull ? "bullish" : isBear ? "bearish" : "neutral";
        const shortBias = isBull ? "BULL" : isBear ? "BEAR" : "NEUT";
        return `
          <div class="tf-matrix-item ${mClass}">
            <div style="font-size:9px;color:var(--text-3);margin-bottom:2px;">${tf}</div>
            <div style="font-size:10px;font-weight:700;">${shortBias}</div>
          </div>`;
      }).join('');
    }

    // 3. Probabilities
    D.aiLongProb.textContent = `${data.longProb}%`;
    D.aiShortProb.textContent = `${data.shortProb}%`;
    D.aiLongBar.style.width = `${data.longProb}%`;
    D.aiShortBar.style.width = `${data.shortProb}%`;

    // 4. Support/Resistance Levels
    const levels = data.levels || { support: [], resistance: [] };
    const price = S.candles.length ? S.candles[S.candles.length - 1].c : 0;
    D.aiLevelsList.innerHTML =
      (levels.resistance || []).slice(0, 3).reverse().map(r => `<div style="color:var(--red);font-size:10px;line-height:1.4;">⬆ ${r.label || 'R'}: ${fmtUSD(r.price)} <span style="color:var(--text-3);font-size:8px;">(${r.score ? r.score.toFixed(1) : '0.0'}/100)</span></div>`).join('') +
      `<div style="color:var(--cyan);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:3px 0;margin:2px 0;font-size:10px;">📌 Current: ${price > 0 ? fmtUSD(price) : '—'}</div>` +
      (levels.support || []).slice(0, 3).map(s => `<div style="color:var(--green);font-size:10px;line-height:1.4;">⬇ ${s.label || 'S'}: ${fmtUSD(s.price)} <span style="color:var(--text-3);font-size:8px;">(${s.score ? s.score.toFixed(1) : '0.0'}/100)</span></div>`).join('');

    // 5. Rich Recommendations Formatting
    let formattedHtml = data.analysis || '';
    formattedHtml = formattedHtml
      .replace(/### \*\*(.*?)\*\*/g, '<h4 style="margin:10px 0 4px 0;color:var(--text);font-size:11px;font-weight:600">$1</h4>')
      .replace(/\*\*(BIAS: [A-Z\s\/]+)\*\*/g, '<div style="margin:6px 0;padding:5px 8px;border-radius:4px;background:rgba(0,0,0,0.25);border-left:3px solid var(--border);"><strong style="color:var(--text)">$1</strong></div>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text)">$1</strong>');

    D.aiTradeIdea.innerHTML = formattedHtml;

  } catch (e) {
    console.warn('[AI Client] Backend analysis failed, loading fallback client calculation:', e);
    runFallbackAI();
  }
}

function runFallbackAI() {
  const n = S.candles.length;
  if (n < 50) return;
  const closes  = getCloses();
  const last    = S.candles[n-1];
  const price   = last.c;

  const emaF  = getEMA(closes, getInpVal(D.inpEmaFast,20));
  const emaS  = getEMA(closes, getInpVal(D.inpEmaSlow,50));
  const rsi   = getRSI(closes, getInpVal(D.inpRsiPeriod,14));
  const macdD = getMACD(closes, getInpVal(D.inpMacdFast,12), getInpVal(D.inpMacdSlow,26), getInpVal(D.inpMacdSig,9));
  const bb    = getBB(closes, getInpVal(D.inpBbPeriod,20), getInpVal(D.inpBbStd,2));
  const atr   = getATR(S.candles, 14);

  const efv = emaF[n-1], esv = emaS[n-1], rv = rsi[n-1];
  const mhv = macdD.hist[n-1], bbUv = bb.upper[n-1], bbLv = bb.lower[n-1], bbMv = bb.mid[n-1];
  const atrV = atr[n-1];

  let score = 0;
  const reasons = [];

  if (efv && esv) {
    const aboveFast = price > efv, aboveSlow = price > esv, fastAboveSlow = efv > esv;
    if (aboveFast && aboveSlow && fastAboveSlow) {
      score += 3;
      reasons.push({ ok:true,  txt:`Price above both EMAs + fast > slow (uptrend structure)` });
    } else if (!aboveFast && !aboveSlow && !fastAboveSlow) {
      score -= 3;
      reasons.push({ ok:false, txt:`Price below both EMAs + fast < slow (downtrend structure)` });
    } else {
      reasons.push({ ok:null,  txt:`Mixed EMA structure (choppy range)` });
    }
  }
  if (rv) {
    if (rv > 70)      { score -= 1; reasons.push({ ok:false, txt:`RSI ${rv.toFixed(1)} — Overbought, elevated reversal risk` }); }
    else if (rv < 30) { score += 2; reasons.push({ ok:true,  txt:`RSI ${rv.toFixed(1)} — Oversold, watch for bounce` }); }
    else if (rv > 50) { score += 1; reasons.push({ ok:true,  txt:`RSI ${rv.toFixed(1)} — Bullish momentum zone` }); }
    else              { score -= 1; reasons.push({ ok:false, txt:`RSI ${rv.toFixed(1)} — Bearish momentum zone` }); }
  }
  if (mhv !== undefined && !isNaN(mhv)) {
    const bull = mhv > 0;
    score += bull ? 2 : -2;
    reasons.push({ ok:bull, txt:`MACD histogram ${bull?'positive':'negative'} (${mhv.toFixed(4)})` });
  }
  if (bbMv && bbUv && bbLv) {
    if (price > bbUv)      { score -= 1; reasons.push({ ok:false, txt:`Price above upper BB — extended, potential mean-reversion` }); }
    else if (price < bbLv) { score += 1; reasons.push({ ok:true,  txt:`Price below lower BB — compressed, watch for reversal` }); }
    else if (price > bbMv) { score += 1; reasons.push({ ok:true,  txt:`Price above BB midline — upper half bias` }); }
    else                   { score -= 1; reasons.push({ ok:false, txt:`Price below BB midline — lower half bias` }); }
  }
  if (atrV) {
    const atrPct = (atrV / price) * 100;
    reasons.push({ ok:null, txt:`ATR: ${fmtUSD(atrV)} (${atrPct.toFixed(2)}% of price) — ${atrPct>3?'high':'normal'} volatility` });
  }

  let trend = 'NEUTRAL', tClass = 'neutral';
  if (score >= 3)       { trend = 'BULLISH';       tClass = 'bullish'; }
  else if (score >= 1)  { trend = 'MILD BULLISH';  tClass = 'bullish'; }
  else if (score <= -3) { trend = 'BEARISH';        tClass = 'bearish'; }
  else if (score <= -1) { trend = 'MILD BEARISH';  tClass = 'bearish'; }

  const shift   = clamp(score * 6, -40, 40);
  const longPct = clamp(50 + shift, 10, 90);
  const shrtPct = 100 - longPct;

  D.aiTrendBadge.textContent = trend;
  D.aiTrendBadge.className   = `ai-badge ${tClass}`;
  D.aiReasonsList.innerHTML  = reasons.map(r => `
    <div class="ai-reason ${r.ok===true?'ok':r.ok===false?'ko':'neutral'}">
      <span>${r.ok===true?'✓':r.ok===false?'✗':'●'}</span>
      <span>${r.txt}</span>
    </div>`).join('');
  D.aiLongProb.textContent   = `${longPct}%`;
  D.aiShortProb.textContent  = `${shrtPct}%`;
  D.aiLongBar.style.width    = `${longPct}%`;
  D.aiShortBar.style.width   = `${shrtPct}%`;

  if (S.srLevels.support?.length || S.srLevels.resistance?.length) {
    const sup  = (S.srLevels.support  ||[]).slice(0, 3);
    const res  = (S.srLevels.resistance||[]).slice(0, 3).reverse();
    D.aiLevelsList.innerHTML =
      res.map(r=>`<div style="color:var(--red);font-size:10px;line-height:1.4;">⬆ ${r.label || 'R'}: ${fmtUSD(r.price)} <span style="color:var(--text-3);font-size:8px;">(${r.score ? r.score.toFixed(1) : '0.0'}/100)</span></div>`).join('') +
      `<div style="color:var(--cyan);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:3px 0;margin:2px 0;font-size:10px;">📌 Current: ${fmtUSD(price)}</div>` +
      sup.map(s=>`<div style="color:var(--green);font-size:10px;line-height:1.4;">⬇ ${s.label || 'S'}: ${fmtUSD(s.price)} <span style="color:var(--text-3);font-size:8px;">(${s.score ? s.score.toFixed(1) : '0.0'}/100)</span></div>`).join('');
  }

  const idea = score >= 3
    ? `<b style="color:var(--green)">LONG BIAS:</b> Trend, momentum, and structure all align bullishly. Consider entries on pullbacks to EMA${getInpVal(D.inpEmaFast,20)} or BB midline with stop below EMA${getInpVal(D.inpEmaSlow,50)}.`
    : score <= -3
    ? `<b style="color:var(--red)">SHORT BIAS:</b> Multiple bearish confluences present. Consider short positions on retests with stop above recent swing high.`
    : `<b style="color:var(--text-2)">NEUTRAL:</b> Mixed signals — wait for clearer direction, volatility compression, or a structural break before committing.`;
  D.aiTradeIdea.innerHTML = idea;

  const fallbackData = {
    bias: trend,
    score: Math.round(longPct >= shrtPct ? longPct : shrtPct),
    longProb: longPct,
    shortProb: shrtPct,
    confluences: reasons.map(r => ({ type: r.ok === true ? 'bullish' : r.ok === false ? 'bearish' : 'neutral', txt: r.txt })),
    levels: S.srLevels || { support: [], resistance: [] },
    analysis: idea,
  };
  const enriched = enrichAiSnapshotWithMarketPlan(fallbackData);
  setAiSnapshot(enriched);
  const plan = enriched.marketPlan;
  if (plan?.valid) {
    if (D.riskStop) D.riskStop.value = plan.sl.toFixed(2);
    if (D.riskTP) D.riskTP.value = plan.tp1.toFixed(2);
  }
}
