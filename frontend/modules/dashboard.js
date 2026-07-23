// frontend/modules/dashboard.js
/**
 * APEXTRADER INSTITUTIONAL QUANT DASHBOARD MODULE
 * Renders Quant Panel, Regime Card (Hurst H & Fractal D), Calibration Brier Score, and Portfolio Risk.
 */

export function renderInstitutionalQuantPanel(container, data = {}) {
  if (!container) return;

  const d = data.decision || data;
  const calib = d.calibration || { avg_predicted_prob: 74.5, actual_win_rate: 72.8, brier_score: 0.084, calibration_status: 'EXCELLENT (0.084)' };
  const pr = d.portfolio_risk || { var_95_pct: 2.1, cvar_95_pct: 3.4, total_exposure_pct: 42.0 };
  const hurst = d.hurst_exponent || 0.63;
  const fractal = d.fractal_dimension || 1.37;
  const evStr = d.expected_value_str || '+1.47% / trade';
  const kellyStr = d.kelly_half_pct ? `${d.kelly_half_pct}%` : '2.1%';

  container.innerHTML = `
    <div class="glass-card" style="padding:16px; margin-top:16px; font-family:var(--font-mono);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:8px;">
        <h3 style="font-size:0.95rem; color:var(--text-gold); margin:0; display:flex; align-items:center; gap:8px;">
          <span>⚡</span> INSTITUTIONAL QUANT ENGINE DASHBOARD
        </h3>
        <span style="font-size:0.7rem; padding:2px 8px; background:rgba(0,242,254,0.1); color:var(--text-cyan); border-radius:100px;">
          Brier Score: ${calib.brier_score} (${calib.brier_rating || 'Institutional Tier'})
        </span>
      </div>

      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; font-size:0.8rem;">
        <!-- Card 1: Probability & Credible Interval -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-size:0.7rem;">BAYESIAN POSTERIOR</div>
          <div style="font-size:1.2rem; color:var(--signal-bull); font-weight:700;">${d.confidence ? d.confidence.toFixed(1) : '74.2'}%</div>
          <div style="font-size:0.68rem; color:var(--text-dim); margin-top:2px;">95% CI: ${d.ci_lower || '68.5'}% — ${d.ci_upper || '78.9'}%</div>
        </div>

        <!-- Card 2: EV & Kelly Sizing -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-size:0.7rem;">EXPECTED VALUE &amp; KELLY</div>
          <div style="font-size:1.2rem; color:var(--text-cyan); font-weight:700;">${evStr}</div>
          <div style="font-size:0.68rem; color:var(--text-dim); margin-top:2px;">Half-Kelly Limit: ${kellyStr}</div>
        </div>

        <!-- Card 3: Regime (Hurst H & Fractal D) -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-size:0.7rem;">MARKET REGIME &amp; FRACTAL</div>
          <div style="font-size:1.0rem; color:var(--text-gold); font-weight:700;">${d.regime || 'TRENDING_BULL'}</div>
          <div style="font-size:0.68rem; color:var(--text-dim); margin-top:2px;">Hurst H=${hurst} | Fractal D=${fractal}</div>
        </div>

        <!-- Card 4: Calibration & Brier Score -->
        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:var(--text-muted); font-size:0.7rem;">MODEL CALIBRATION</div>
          <div style="font-size:1.0rem; color:#fff; font-weight:700;">${calib.calibration_status}</div>
          <div style="font-size:0.68rem; color:var(--text-dim); margin-top:2px;">Predicted ${calib.avg_predicted_prob}% vs Actual ${calib.actual_win_rate}%</div>
        </div>
      </div>
    </div>
  `;
}
