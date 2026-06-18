import { S, var_amber, var_blue_hex, var_cyan, var_green } from '../settings/state.js';

// Formatter for Fibonacci tool
function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── User Drawing Overlays ──
export function drawUserOverlays(ctx, toX, toY, W, H) {
  const PAD_l = 6;
  const PAD_r = 78;
  const PAD_t = 22;
  const PAD_b = 26;

  const all = S.currentDrawing ? [...S.drawings, S.currentDrawing] : S.drawings;
  all.forEach(d => {
    ctx.save();
    ctx.strokeStyle = d.color || var_amber();
    ctx.fillStyle   = d.fillColor || 'rgba(255,170,0,0.05)';
    ctx.lineWidth   = 1.5;
    const x1 = toX(d.x1 - S.viewStart);
    const y1 = toY(d.y1);
    if (d.type === 'trendline' && d.x2 !== undefined) {
      const x2 = toX(d.x2 - S.viewStart), y2 = toY(d.y2);
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    } else if (d.type === 'hline') {
      ctx.beginPath(); ctx.moveTo(PAD_l, y1); ctx.lineTo(W-PAD_r, y1); ctx.stroke();
    } else if (d.type === 'vline') {
      ctx.beginPath(); ctx.moveTo(x1, PAD_t); ctx.lineTo(x1, H-PAD_b); ctx.stroke();
    } else if (d.type === 'rect' && d.x2 !== undefined) {
      const x2 = toX(d.x2 - S.viewStart), y2 = toY(d.y2);
      ctx.fillRect(x1,y1,x2-x1,y2-y1);
      ctx.strokeRect(x1,y1,x2-x1,y2-y1);
    } else if (d.type === 'channel' && d.x2 !== undefined) {
      const x2 = toX(d.x2 - S.viewStart), y2 = toY(d.y2);
      const midY = (y1 + y2) / 2;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y1+(y2-y1)); ctx.stroke();
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(x1,midY); ctx.lineTo(x2,midY+(y2-y1)/2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x1,y2); ctx.lineTo(x2,y2); ctx.stroke();
    } else if ((d.type === 'fib' || d.type === 'fibext') && d.x2 !== undefined) {
      const x2 = toX(d.x2 - S.viewStart), y2 = toY(d.y2);
      const high = Math.max(d.y1, d.y2), low = Math.min(d.y1, d.y2), range = high - low;
      const levels = d.type === 'fib'
        ? [0, 0.236, 0.382, 0.5, 0.618, 0.764, 1.0]
        : [0, 1.272, 1.414, 1.618, 2.0, 2.618];
      const colors = ['rgba(255,255,255,0.3)','rgba(255,170,0,0.6)','rgba(0,212,255,0.6)',
                       'rgba(139,92,246,0.6)','rgba(0,255,136,0.6)','rgba(255,51,102,0.6)','rgba(255,255,255,0.3)'];
      levels.forEach((lvl, idx) => {
        const p = d.type === 'fib' ? high - lvl * range : high + lvl * range;
        const y = toY(p);
        ctx.strokeStyle = colors[idx % colors.length];
        ctx.lineWidth = lvl === 0 || lvl === 1 ? 1.2 : 0.8;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.fillStyle = colors[idx % colors.length];
        ctx.font = '8px monospace'; ctx.textAlign = 'right';
        ctx.fillText(`${(lvl*100).toFixed(1)}% ${fmtUSD(p)}`, x2-3, y-2);
      });
    }
    ctx.restore();
  });
}
