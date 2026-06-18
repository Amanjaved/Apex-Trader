import { S, var_text } from '../settings/state.js';
import { D, CTX } from '../settings/dom.js';

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

function resizeCanvas(canvas) {
  const parent = canvas.parentNode;
  const rect = parent.getBoundingClientRect();
  const W = Math.floor(rect.width);
  const H = Math.floor(rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (canvas._W !== W || canvas._H !== H || canvas._dpr !== dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._W = W; canvas._H = H; canvas._dpr = dpr;
  }
  return { W, H };
}

// ── Depth Chart ──
export function drawDepthChart() {
  const { W, H } = resizeCanvas(D.depthCanvas);
  const ctx = CTX.depth;
  ctx.clearRect(0, 0, W, H);
  const { bids, asks } = S.orderBook;
  if (!bids.length || !asks.length) return;
  // Cumulative
  let bCum=[], aSum=0, bSum=0;
  bids.forEach(b=>{ bSum+=b[1]; bCum.push({p:b[0],v:bSum}); });
  let aCum=[];
  asks.forEach(a=>{ aSum+=a[1]; aCum.push({p:a[0],v:aSum}); });
  const maxV = Math.max(bSum,aSum)||1;
  const minP = bids[bids.length-1]?.p || 0;
  const maxP = asks[asks.length-1]?.p || 1;
  const pr   = maxP - minP || 1;
  const toX = p => ((p-minP)/pr)*W;
  const toY = v => H - (v/maxV)*(H-20);
  const mid = (bids[0].p + asks[0].p) / 2;
  // Bids
  ctx.fillStyle='rgba(38,166,154,0.1)'; ctx.strokeStyle='rgba(38,166,154,0.7)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(toX(minP), H);
  bCum.forEach(b=>ctx.lineTo(toX(b.p),toY(b.v)));
  ctx.lineTo(toX(mid),toY(0)); ctx.lineTo(toX(mid),H); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Asks
  ctx.fillStyle='rgba(239,83,80,0.1)'; ctx.strokeStyle='rgba(239,83,80,0.7)';
  ctx.beginPath(); ctx.moveTo(toX(mid),H); ctx.lineTo(toX(mid),toY(0));
  aCum.forEach(a=>ctx.lineTo(toX(a.p),toY(a.v)));
  ctx.lineTo(toX(maxP),H); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Stats
  ctx.fillStyle=var_text(); ctx.font='bold 10px monospace';
  ctx.fillText(`Spread: ${fmtUSD(asks[0].p-bids[0].p)} | Mid: ${fmtUSD(mid)} | Bid Vol: ${fmtVol(bSum)} | Ask Vol: ${fmtVol(aSum)}`, 10, 18);
}
