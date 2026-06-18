import { S, COINS } from '../settings/state.js';
import { D } from '../settings/dom.js';
import { getEMA, getRSI, getMACD, getBB, getATR, getCloses } from '../indicators/indicators.js';

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

export function updateAI() {
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

  // 1. Price vs EMA structure
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
  // 2. RSI momentum
  if (rv) {
    if (rv > 70)      { score -= 1; reasons.push({ ok:false, txt:`RSI ${rv.toFixed(1)} — Overbought, elevated reversal risk` }); }
    else if (rv < 30) { score += 2; reasons.push({ ok:true,  txt:`RSI ${rv.toFixed(1)} — Oversold, watch for bounce` }); }
    else if (rv > 50) { score += 1; reasons.push({ ok:true,  txt:`RSI ${rv.toFixed(1)} — Bullish momentum zone` }); }
    else              { score -= 1; reasons.push({ ok:false, txt:`RSI ${rv.toFixed(1)} — Bearish momentum zone` }); }
  }
  // 3. MACD histogram
  if (mhv !== undefined && !isNaN(mhv)) {
    const bull = mhv > 0;
    score += bull ? 2 : -2;
    reasons.push({ ok:bull, txt:`MACD histogram ${bull?'positive':'negative'} (${mhv.toFixed(4)})` });
  }
  // 4. BB position
  if (bbMv && bbUv && bbLv) {
    if (price > bbUv)      { score -= 1; reasons.push({ ok:false, txt:`Price above upper BB — extended, potential mean-reversion` }); }
    else if (price < bbLv) { score += 1; reasons.push({ ok:true,  txt:`Price below lower BB — compressed, watch for reversal` }); }
    else if (price > bbMv) { score += 1; reasons.push({ ok:true,  txt:`Price above BB midline — upper half bias` }); }
    else                   { score -= 1; reasons.push({ ok:false, txt:`Price below BB midline — lower half bias` }); }
  }
  // 5. ATR-based volatility
  if (atrV) {
    const atrPct = (atrV / price) * 100;
    reasons.push({ ok:null, txt:`ATR: ${fmtUSD(atrV)} (${atrPct.toFixed(2)}% of price) — ${atrPct>3?'high':'normal'} volatility` });
  }

  // Determine bias
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

  // Auto-detected key levels
  if (S.srLevels.support?.length || S.srLevels.resistance?.length) {
    const sup  = (S.srLevels.support  ||[]).slice(-3).reverse();
    const res  = (S.srLevels.resistance||[]).slice(-3).reverse();
    D.aiLevelsList.innerHTML =
      res.map(r=>`<div style="color:var(--red)">⬆ R: ${fmtUSD(r.price)}</div>`).join('') +
      `<div style="color:var(--cyan);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:3px 0;margin:2px 0;">📌 Current: ${fmtUSD(price)}</div>` +
      sup.map(s=>`<div style="color:var(--green)">⬇ S: ${fmtUSD(s.price)}</div>`).join('');
  }
  // Trade idea
  const idea = score >= 3
    ? `<b style="color:var(--green)">LONG BIAS:</b> Trend, momentum, and structure all align bullishly. Consider entries on pullbacks to EMA${getInpVal(D.inpEmaFast,20)} or BB midline with stop below EMA${getInpVal(D.inpEmaSlow,50)}.`
    : score <= -3
    ? `<b style="color:var(--red)">SHORT BIAS:</b> Multiple bearish confluences present. Consider short positions on retests with stop above recent swing high.`
    : `<b style="color:var(--text-2)">NEUTRAL:</b> Mixed signals — wait for clearer direction, volatility compression, or a structural break before committing.`;
  D.aiTradeIdea.innerHTML = idea;
}
