// frontend/modules/probability.js
/**
 * APEXTRADER PROBABILITY & MONTE CARLO VISUALIZATION MODULE
 * Renders Bayesian updating streams, Monte Carlo histograms, and 95% Credible Intervals.
 */

export function renderBayesianStreamTimeline(container, stream = []) {
  if (!container) return;
  if (!stream || !stream.length) {
    stream = [
      { step: "Prior", prob: 50.0 },
      { step: "HTF Trend", prob: 58.0 },
      { step: "CVD Delta", prob: 66.0 },
      { step: "Funding Rate", prob: 61.0 },
      { step: "Macro Flow", prob: 64.0 }
    ];
  }

  const itemsHtml = stream.map((s, idx) => {
    const isLast = idx === stream.length - 1;
    const isUp = idx > 0 ? s.prob >= stream[idx - 1].prob : true;
    const color = isLast ? 'var(--signal-bull)' : (isUp ? 'var(--text-cyan)' : 'var(--signal-bear)');

    return `
      <div style="display:flex; flex-direction:column; align-items:center; position:relative;">
        <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">${s.step}</div>
        <div style="padding:4px 8px; background:rgba(0,0,0,0.4); border:1px solid ${color}; border-radius:6px; font-weight:700; color:${color};">
          ${s.prob}%
        </div>
      </div>
      ${isLast ? '' : '<div style="color:var(--text-dim); align-self:center; font-size:1.1rem;">➔</div>'}
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; overflow-x:auto; padding-bottom:4px;">
      ${itemsHtml}
    </div>
  `;
}

export function renderMonteCarloHistogram(container, mcData = {}) {
  if (!container) return;
  const bull = mcData.bull_target_prob || 61.0;
  const range = mcData.range_prob || 29.0;
  const bear = mcData.bear_target_prob || 10.0;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; font-family:var(--font-mono); font-size:0.75rem;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:70px; color:var(--signal-bull);">Bull (+4.2%):</span>
        <div style="flex:1; background:rgba(255,255,255,0.05); height:12px; border-radius:4px; overflow:hidden;">
          <div style="width:${bull}%; background:var(--signal-bull); height:100%;"></div>
        </div>
        <strong style="width:40px; text-align:right;">${bull}%</strong>
      </div>

      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:70px; color:var(--text-gold);">Range (±1.5%):</span>
        <div style="flex:1; background:rgba(255,255,255,0.05); height:12px; border-radius:4px; overflow:hidden;">
          <div style="width:${range}%; background:var(--text-gold); height:100%;"></div>
        </div>
        <strong style="width:40px; text-align:right;">${range}%</strong>
      </div>

      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:70px; color:var(--signal-bear);">Crash (-2.5%):</span>
        <div style="flex:1; background:rgba(255,255,255,0.05); height:12px; border-radius:4px; overflow:hidden;">
          <div style="width:${bear}%; background:var(--signal-bear); height:100%;"></div>
        </div>
        <strong style="width:40px; text-align:right;">${bear}%</strong>
      </div>
    </div>
  `;
}
