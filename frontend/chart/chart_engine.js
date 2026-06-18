import { S, COINS, TF_MAP, saveState, var_cyan, var_green, var_red, var_amber, var_purple, var_text, var_text3, var_grid, var_blue_hex, var_bg } from '../settings/state.js';
import { D, CTX } from '../settings/dom.js';
import { getEMA, getSMA, getBB, getRSI, getMACD, getATR, getStoch, getVWAP, getIchimoku, getOBV, toHeikin, detectOrderBlocks, detectFVG, detectMarketStructure, detectPatterns, detectSignals, getCloses } from '../indicators/indicators.js';
import { drawUserOverlays } from '../drawings/drawings.js';
import { addAlert } from '../alerts/alerts.js';

// Padding sizing tokens
export const PAD = { t: 22, r: 78, b: 26, l: 6 };

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

function fmtTime(ts, tf) {
  const d = new Date(ts);
  if (tf >= 1440) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (tf >= 240)  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                          d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function clamp(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }

function getInpVal(el, def) {
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

// Resizing logic
export function resizeCanvas(canvas) {
  const parent = canvas.parentNode;
  const rect = parent.getBoundingClientRect();
  const W = Math.floor(rect.width);
  const H = Math.floor(rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for performance

  if (canvas._W !== W || canvas._H !== H || canvas._dpr !== dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._W = W; canvas._H = H; canvas._dpr = dpr;
  }
  return { W, H };
}

// ── timestamp → canvas X coordinate ──
export function timestampToX(t, s, W) {
  if (!s.layout || !s.candles.length) return null;
  const { toX, n } = s.layout;
  let lo = 0, hi = s.candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.candles[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  const relIdx = lo - s.viewStart;
  if (relIdx < 0 || relIdx >= n) return null;
  return toX(relIdx);
}

// ── coordinate conversions ──
export function getXY(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function xyToCandle(x, y) {
  const L = S.layout;
  if (!L) return { idx:-1, price:0 };
  const step = L.cw / L.n;
  const idx = Math.floor((x - L.PAD.l) / step);
  const price = L.pLo + (1 - (y - L.PAD.t) / L.ch) * L.pSpan;
  return { idx, absIdx: S.viewStart + idx, price };
}

// Global queueRender callbacks registration
let queueRenderCallback = null;
let initDataCallback = null;

export function registerRenderQueuer(qr, id) {
  queueRenderCallback = qr;
  initDataCallback = id;
}

// ── Main Chart ──
export function drawMainChart() {
  const { W, H } = resizeCanvas(D.mainCanvas);
  const ctx = CTX.main;
  ctx.clearRect(0, 0, W, H);

  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  const vis = S.candles.slice(S.viewStart, S.viewEnd);
  const n = vis.length;
  if (n === 0) return;

  const haFull = (S.mode === 'heikin') ? toHeikin(S.candles) : null;
  const cd = haFull ? haFull.slice(S.viewStart, S.viewEnd) : vis;

  const closes = getCloses();
  let pMax = -Infinity, pMin = Infinity;
  for (let i = 0; i < n; i++) {
    if (cd[i].h > pMax) pMax = cd[i].h;
    if (cd[i].l < pMin) pMin = cd[i].l;
  }
  if (S.overlays.bb) {
    const { upper, lower } = getBB(closes, getInpVal(D.inpBbPeriod,20), getInpVal(D.inpBbStd,2));
    for (let i = S.viewStart; i < S.viewEnd; i++) {
      if (upper[i] > pMax) pMax = upper[i];
      if (lower[i] < pMin) pMin = lower[i];
    }
  }
  const pRange = pMax - pMin || 1;
  const pPad   = pRange * 0.06;
  const pLo    = pMin - pPad;
  const pHi    = pMax + pPad;
  const pSpan  = pHi - pLo;

  const toY = p  => PAD.t + ch * (1 - (p  - pLo) / pSpan);
  const toX = i  => PAD.l + (i + 0.5) * (cw / n);
  const barW = Math.max(1.5, (cw / n) * 0.72);

  S.layout = { PAD, cw, ch, n, toY, toX, pLo, pHi, pSpan, W, H, barW };

  // ── GRID ──
  ctx.strokeStyle = var_grid();
  ctx.fillStyle   = var_text3();
  ctx.font        = `10px ${document.documentElement.style.getPropertyValue('--mono') || 'monospace'}`;
  ctx.lineWidth   = 0.5;

  for (let i = 0; i <= 6; i++) {
    const p = pLo + (i / 6) * pSpan;
    const y = toY(p);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillText(fmtUSD(p), W - PAD.r + 4, y + 3.5);
  }
  const tStep = Math.max(1, Math.ceil(n / 8));
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i += tStep) {
    const x = toX(i);
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
    ctx.fillText(fmtTime(cd[i].t, +S.tf), x, H - PAD.b + 16);
  }

  // ── OVERLAYS: BB ──
  if (S.overlays.bb) {
    const { upper, mid, lower } = getBB(closes, getInpVal(D.inpBbPeriod,20), getInpVal(D.inpBbStd,2));
    const u = upper.slice(S.viewStart, S.viewEnd);
    const m = mid.slice(S.viewStart, S.viewEnd);
    const l = lower.slice(S.viewStart, S.viewEnd);

    ctx.fillStyle = 'rgba(59,130,246,0.04)';
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(u[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(u[i]));
    for (let i = n-1; i >= 0; i--) ctx.lineTo(toX(i), toY(l[i]));
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = 'rgba(59,130,246,0.35)'; ctx.lineWidth = 1;
    const drawLine = arr => {
      ctx.beginPath(); ctx.moveTo(toX(0), toY(arr[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(arr[i]));
      ctx.stroke();
    };
    drawLine(u); drawLine(m); drawLine(l);
  }

  // ── OVERLAYS: Ichimoku ──
  if (S.overlays.ichimoku) {
    const ich = getIchimoku(S.candles);
    const tk = ich.tenkan.slice(S.viewStart, S.viewEnd);
    const kj = ich.kijun.slice(S.viewStart, S.viewEnd);
    const sa = ich.sA.slice(S.viewStart, S.viewEnd);
    const sb = ich.sB.slice(S.viewStart, S.viewEnd);
    for (let i = 0; i < n-1; i++) {
      const bull = sa[i] >= sb[i];
      ctx.fillStyle = bull ? 'rgba(0,255,136,0.05)' : 'rgba(255,51,102,0.05)';
      ctx.beginPath();
      ctx.moveTo(toX(i),   toY(sa[i]));
      ctx.lineTo(toX(i+1), toY(sa[i+1]));
      ctx.lineTo(toX(i+1), toY(sb[i+1]));
      ctx.lineTo(toX(i),   toY(sb[i]));
      ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 1;
    const drawIchi = (arr, color) => {
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(toX(0), toY(arr[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(arr[i]));
      ctx.stroke();
    };
    drawIchi(tk, 'rgba(239,68,68,0.7)');
    drawIchi(kj, 'rgba(59,130,246,0.7)');
    drawIchi(sa, 'rgba(0,255,136,0.4)');
    drawIchi(sb, 'rgba(255,51,102,0.4)');
  }

  // ── OVERLAYS: EMA / SMA / VWAP ──
  const drawOverlayLine = (arr, color, lw = 1.3) => {
    const vis = arr.slice(S.viewStart, S.viewEnd);
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      if (!started) { ctx.moveTo(toX(i), toY(vis[i])); started = true; }
      else ctx.lineTo(toX(i), toY(vis[i]));
    }
    ctx.stroke();
  };
  if (S.overlays.ema) {
    drawOverlayLine(getEMA(closes, getInpVal(D.inpEmaFast,20)), 'rgba(0,212,255,0.85)', 1.4);
    drawOverlayLine(getEMA(closes, getInpVal(D.inpEmaSlow,50)), 'rgba(139,92,246,0.85)', 1.4);
  }
  if (S.overlays.sma)  drawOverlayLine(getSMA(closes, getInpVal(D.inpSmaPeriod,20)), 'rgba(255,170,0,0.85)');
  if (S.overlays.vwap) drawOverlayLine(getVWAP(S.candles), 'rgba(249,115,22,0.9)', 1.5);

  // ── OVERLAYS: Smart S/R Zones ──
  if (S.overlays.smartSR && S.srLevels) {
    const srTfLbl = TF_MAP[S.srTf] || '1d';
    const re = W - PAD.r;
    ctx.font = '8px monospace';
    (S.srLevels.demand || []).forEach(z => {
      const x1 = timestampToX(z.t_start, S, W);
      if (x1 === null || x1 >= re) return;
      const xv = Math.max(PAD.l, x1);
      const y1 = toY(z.high), y2 = toY(z.low);
      ctx.fillStyle = 'rgba(0,255,136,0.04)';
      ctx.fillRect(xv, Math.min(y1,y2), re-xv, Math.abs(y2-y1));
      ctx.strokeStyle = 'rgba(0,255,136,0.15)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(xv, Math.min(y1,y2), re-xv, Math.abs(y2-y1));
    });
    (S.srLevels.supply || []).forEach(z => {
      const x1 = timestampToX(z.t_start, S, W);
      if (x1 === null || x1 >= re) return;
      const xv = Math.max(PAD.l, x1);
      const y1 = toY(z.high), y2 = toY(z.low);
      ctx.fillStyle = 'rgba(255,51,102,0.04)';
      ctx.fillRect(xv, Math.min(y1,y2), re-xv, Math.abs(y2-y1));
      ctx.strokeStyle = 'rgba(255,51,102,0.15)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(xv, Math.min(y1,y2), re-xv, Math.abs(y2-y1));
    });
    (S.srLevels.support || []).slice(-6).forEach(sl => {
      const y = toY(sl.price);
      ctx.strokeStyle='rgba(0,255,136,0.4)'; ctx.lineWidth=0.8;
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(re,y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(0,255,136,0.7)'; ctx.textAlign='right';
      ctx.fillText(`S(${srTfLbl})`, re-3, y-2);
    });
    (S.srLevels.resistance || []).slice(-6).forEach(sh => {
      const y = toY(sh.price);
      ctx.strokeStyle='rgba(255,51,102,0.4)'; ctx.lineWidth=0.8;
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(re,y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(255,51,102,0.7)'; ctx.textAlign='right';
      ctx.fillText(`R(${srTfLbl})`, re-3, y-2);
    });
  }

  // ── OVERLAYS: Order Blocks ──
  if (S.overlays.orderBlocks) {
    const { bullOBs, bearOBs } = detectOrderBlocks(S.candles);
    bullOBs.forEach(ob => {
      const xi = ob.i - S.viewStart;
      if (xi < 0 || xi >= n) return;
      const y1 = toY(ob.high), y2 = toY(ob.low);
      ctx.fillStyle = 'rgba(0,255,136,0.07)';
      ctx.fillRect(toX(xi), Math.min(y1,y2), (W-PAD.r)-toX(xi), Math.abs(y2-y1));
      ctx.strokeStyle='rgba(0,255,136,0.25)'; ctx.lineWidth=1;
      ctx.strokeRect(toX(xi), Math.min(y1,y2), (W-PAD.r)-toX(xi), Math.abs(y2-y1));
      ctx.fillStyle=var_green(); ctx.font='8px monospace'; ctx.textAlign='left';
      ctx.fillText('Bull OB', toX(xi)+2, Math.min(y1,y2)+9);
    });
    bearOBs.forEach(ob => {
      const xi = ob.i - S.viewStart;
      if (xi < 0 || xi >= n) return;
      const y1 = toY(ob.high), y2 = toY(ob.low);
      ctx.fillStyle = 'rgba(255,51,102,0.07)';
      ctx.fillRect(toX(xi), Math.min(y1,y2), (W-PAD.r)-toX(xi), Math.abs(y2-y1));
      ctx.strokeStyle='rgba(255,51,102,0.25)'; ctx.lineWidth=1;
      ctx.strokeRect(toX(xi), Math.min(y1,y2), (W-PAD.r)-toX(xi), Math.abs(y2-y1));
      ctx.fillStyle=var_red(); ctx.font='8px monospace'; ctx.textAlign='left';
      ctx.fillText('Bear OB', toX(xi)+2, Math.min(y1,y2)+9);
    });
  }

  // ── OVERLAYS: Fair Value Gaps ──
  if (S.overlays.fvg) {
    const { bullFVG, bearFVG } = detectFVG(S.candles);
    bullFVG.forEach(fvg => {
      const xi = fvg.i - S.viewStart;
      if (xi < 0 || xi >= n) return;
      const y1 = toY(fvg.top), y2 = toY(fvg.bot);
      ctx.fillStyle='rgba(0,255,136,0.06)';
      ctx.fillRect(toX(xi)-barW, Math.min(y1,y2), (W-PAD.r)-toX(xi)+barW, Math.abs(y2-y1));
    });
    bearFVG.forEach(fvg => {
      const xi = fvg.i - S.viewStart;
      if (xi < 0 || xi >= n) return;
      const y1 = toY(fvg.top), y2 = toY(fvg.bot);
      ctx.fillStyle='rgba(255,51,102,0.06)';
      ctx.fillRect(toX(xi)-barW, Math.min(y1,y2), (W-PAD.r)-toX(xi)+barW, Math.abs(y2-y1));
    });
  }

  // ── DRAW CANDLES / LINE / AREA / BAR ──
  if (S.mode === 'line' || S.mode === 'area') {
    ctx.strokeStyle = var_cyan(); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(toX(0), toY(cd[0].c));
    for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(cd[i].c));
    ctx.stroke();
    if (S.mode === 'area') {
      ctx.lineTo(toX(n-1), H - PAD.b);
      ctx.lineTo(toX(0),   H - PAD.b);
      ctx.closePath();
      const gr = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
      gr.addColorStop(0, 'rgba(0,212,255,0.18)');
      gr.addColorStop(1, 'rgba(0,212,255,0.01)');
      ctx.fillStyle = gr; ctx.fill();
    }
  } else {
    for (let i = 0; i < n; i++) {
      const c = cd[i];
      const x = toX(i);
      const isUp = c.c >= c.o;
      const bull = S.bullColor; const bear = S.bearColor;
      ctx.strokeStyle = isUp ? bull : bear;
      ctx.fillStyle   = isUp ? bull : bear;

      if (S.mode === 'bar') {
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, toY(c.o)); ctx.lineTo(x - barW*0.4, toY(c.o)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, toY(c.c)); ctx.lineTo(x + barW*0.4, toY(c.c)); ctx.stroke();
      } else {
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
        const top  = toY(Math.max(c.o, c.c));
        const bot  = toY(Math.min(c.o, c.c));
        const bh   = Math.max(1.5, bot - top);
        ctx.fillRect(x - barW/2, top, barW, bh);
        if (i === S.hoverIdx) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x - barW/2 - 1, top - 1, barW + 2, bh + 2);
        }
      }
    }
  }

  // ── PATTERN LABELS ──
  const pats = detectPatterns(S.candles).slice(S.viewStart, S.viewEnd);
  ctx.font = 'bold 11px sans-serif';
  for (let i = 0; i < n; i++) {
    const p = pats[i]; if (!p) continue;
    const y = p.pos === 'above' ? toY(cd[i].h) - 12 : toY(cd[i].l) + 14;
    ctx.fillStyle = p.color; ctx.textAlign = 'center';
    ctx.fillText(p.label, toX(i), y);
  }

  // ── TRADE SIGNALS ──
  const sigs = detectSignals(S.candles).slice(S.viewStart, S.viewEnd);
  ctx.font = 'bold 10px sans-serif';
  for (let i = 0; i < n; i++) {
    const s = sigs[i]; if (!s) continue;
    const y = s.type === 'BUY' ? toY(cd[i].l) + 22 : toY(cd[i].h) - 18;
    ctx.fillStyle = s.type === 'BUY' ? var_green() : var_red();
    ctx.textAlign = 'center';
    ctx.fillText(s.label, toX(i), y);
  }

  // ── MARKET STRUCTURE LABELS ──
  if (S.overlays.marketStructure) {
    const msLabels = detectMarketStructure(S.candles).slice(S.viewStart, S.viewEnd);
    ctx.font = 'bold 9px monospace';
    for (let i = 0; i < n; i++) {
      const ms = msLabels[i]; if (!ms) continue;
      const y = ms.pos === 'above' ? toY(cd[i].h) - 18 : toY(cd[i].l) + 18;
      ctx.fillStyle = ms.color; ctx.textAlign = 'center';
      ctx.fillText(ms.type, toX(i), y);
    }
  }

  // ── ALERT LINES ──
  ctx.font = '9px monospace';
  S.alerts.forEach(a => {
    if (a.price < pLo || a.price > pHi) return;
    const y = toY(a.price);
    ctx.strokeStyle = a.triggered ? 'rgba(0,255,136,0.5)' : 'rgba(255,51,102,0.5)';
    ctx.setLineDash([4,4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W-PAD.r, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = a.triggered ? var_green() : var_red();
    ctx.textAlign = 'left';
    ctx.fillText(`⚡ ${fmtUSD(a.price)}`, PAD.l+4, y-3);
  });

  // ── USER DRAWINGS ──
  drawUserOverlays(ctx, toX, toY, W, H);

  // ── LIVE PRICE LINE ──
  const liveC = S.candles[S.candles.length - 1].c;
  const liveY = toY(liveC);
  ctx.strokeStyle = 'rgba(0,212,255,0.5)'; ctx.lineWidth = 0.8;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(PAD.l, liveY); ctx.lineTo(W-PAD.r, liveY); ctx.stroke();
  ctx.setLineDash([]);
  const lbl = fmtUSD(liveC);
  const tw = ctx.measureText(lbl).width;
  ctx.fillStyle = 'rgba(0,212,255,0.18)';
  ctx.fillRect(W-PAD.r+2, liveY-8, tw+10, 16);
  ctx.fillStyle = var_cyan(); ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
  ctx.fillText(lbl, W-PAD.r+5, liveY+3.5);

  // ── CROSSHAIR & TOOLTIP ──
  if (S.hoverIdx >= 0 && S.hoverIdx < n) {
    const x = toX(S.hoverIdx);
    ctx.strokeStyle = S.theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.6; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H-PAD.b); ctx.stroke();
    ctx.setLineDash([]);

    const c = cd[S.hoverIdx];
    const sigs2 = detectSignals(S.candles);
    const sig = sigs2[S.viewStart + S.hoverIdx];
    const pat = detectPatterns(S.candles)[S.viewStart + S.hoverIdx];
    const df  = (c.c - c.o);
    const pctf = c.o ? (df / c.o * 100).toFixed(2) : '0';
    const up = df >= 0;
    D.ohlcTooltip.style.display = 'block';
    D.ohlcTooltip.innerHTML = `
      <span style="color:var(--text-2)">${fmtTime(c.t, +S.tf)}</span>&nbsp;
      O:<b class="ot-o">${fmtUSD(c.o)}</b>&nbsp;
      H:<b class="ot-h">${fmtUSD(c.h)}</b>&nbsp;
      L:<b class="ot-l">${fmtUSD(c.l)}</b>&nbsp;
      C:<b style="color:${up?'var(--green)':'var(--red)'}">${fmtUSD(c.c)}</b>&nbsp;
      <span class="ot-v">Vol:${fmtVol(c.v)}</span>&nbsp;
      <span style="color:${up?'var(--green)':'var(--red)'};">${up?'+':''}${pctf}%</span>
      ${pat ? `&nbsp;<span style="color:${pat.color}">${pat.desc}</span>` : ''}
      ${sig ? `&nbsp;<b style="color:${sig.type==='BUY'?'var(--green)':'var(--red)'}">${sig.type}</b>` : ''}
    `;
  } else {
    D.ohlcTooltip.style.display = 'none';
  }
}

// ── Volume Sub-Pane ──
export function drawVolChart() {
  const { W, H } = resizeCanvas(D.volCanvas);
  const ctx = CTX.vol;
  ctx.clearRect(0, 0, W, H);
  const vp = { t:4, r:78, b:4, l:PAD.l };
  const cw = W - vp.l - vp.r, ch = H - vp.t - vp.b;
  const vis = S.candles.slice(S.viewStart, S.viewEnd);
  const n = vis.length; if (!n) return;
  const maxV = Math.max(...vis.map(c=>c.v), 1);
  const step = cw / n;
  const bw = Math.max(1, step * 0.72);
  const toX = i => vp.l + (i + 0.5) * step;
  for (let i = 0; i < n; i++) {
    const c = vis[i];
    const bh = (c.v / maxV) * ch;
    const isUp = c.c >= c.o;
    const alpha = i === S.hoverIdx ? 0.85 : 0.35;
    ctx.fillStyle = isUp ? `rgba(38,166,154,${alpha})` : `rgba(239,83,80,${alpha})`;
    ctx.fillRect(toX(i) - bw/2, H - vp.b - bh, bw, bh);
  }
  ctx.fillStyle = var_text3(); ctx.font = '8px monospace'; ctx.textAlign = 'left';
  ctx.fillText(fmtVol(maxV), W - vp.r + 4, vp.t + 8);
  D.volLabel.textContent = `Volume  ${vis[vis.length-1] ? fmtVol(vis[vis.length-1].v) : ''}`;
}

// ── RSI Sub-Pane ──
export function drawRsiChart() {
  const { W, H } = resizeCanvas(D.rsiCanvas);
  const ctx = CTX.rsi;
  ctx.clearRect(0, 0, W, H);
  const rp = { t:8, r:78, b:8, l:PAD.l };
  const cw = W - rp.l - rp.r, ch = H - rp.t - rp.b;
  const closes = getCloses();
  const period = getInpVal(D.inpRsiPeriod, 14);
  const full = getRSI(closes, period);
  const vis  = full.slice(S.viewStart, S.viewEnd);
  const n = vis.length; if (!n) return;
  const toY = v => rp.t + ch * (1 - v/100);
  const toX = i => rp.l + (i+0.5) * (cw/n);

  ctx.fillStyle = 'rgba(139,92,246,0.04)';
  ctx.fillRect(rp.l, toY(70), cw, toY(30)-toY(70));
  [30, 50, 70].forEach(lv => {
    ctx.strokeStyle = lv === 50 ? 'rgba(255,255,255,0.07)' : 'rgba(139,92,246,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(rp.l, toY(lv)); ctx.lineTo(W-rp.r, toY(lv)); ctx.stroke();
    ctx.fillStyle = var_text3(); ctx.font = '8px monospace'; ctx.textAlign = 'left';
    ctx.fillText(lv, W-rp.r+4, toY(lv)+3);
  });

  ctx.lineWidth = 1.4;
  for (let i = 1; i < n; i++) {
    const v = vis[i]; if (!v) continue;
    ctx.strokeStyle = v > 70 ? var_red() : v < 30 ? var_green() : var_purple();
    ctx.beginPath(); ctx.moveTo(toX(i-1), toY(vis[i-1]||50)); ctx.lineTo(toX(i), toY(v)); ctx.stroke();
  }
  const cur = vis[n-1];
  if (cur) {
    const cy = toY(cur);
    ctx.fillStyle = cur > 70 ? var_red() : cur < 30 ? var_green() : var_purple();
    ctx.beginPath(); ctx.arc(W-rp.r+4, cy, 3, 0, Math.PI*2); ctx.fill();
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
    ctx.fillText(cur.toFixed(1), W-rp.r+10, cy+3);
  }
  D.rsiLabel.textContent = `RSI(${period})  ${vis[n-1]?.toFixed(1)||'—'}`;
}

// ── MACD Sub-Pane ──
export function drawMacdChart() {
  const { W, H } = resizeCanvas(D.macdCanvas);
  const ctx = CTX.macd;
  ctx.clearRect(0, 0, W, H);
  const mp = { t:6, r:78, b:6, l:PAD.l };
  const cw = W-mp.l-mp.r, ch = H-mp.t-mp.b;
  const closes = getCloses();
  const { macdLine, sigLine, hist } = getMACD(closes,
    getInpVal(D.inpMacdFast,12), getInpVal(D.inpMacdSlow,26), getInpVal(D.inpMacdSig,9));
  const vM = macdLine.slice(S.viewStart,S.viewEnd);
  const vS = sigLine.slice(S.viewStart,S.viewEnd);
  const vH = hist.slice(S.viewStart,S.viewEnd);
  const n = vM.length; if (!n) return;
  const maxA = Math.max(...vM.map(Math.abs),...vS.map(Math.abs),...vH.map(Math.abs), 0.0001);
  const toY = v => mp.t + ch/2 - (v/maxA)*(ch/2);
  const toX = i => mp.l + (i+0.5)*(cw/n);
  const bw  = Math.max(1,(cw/n)*0.72);

  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(mp.l,toY(0)); ctx.lineTo(W-mp.r,toY(0)); ctx.stroke();

  for (let i=0;i<n;i++) {
    const v=vH[i]; const z=toY(0);
    ctx.fillStyle = v>=0?'rgba(38,166,154,0.5)':'rgba(239,83,80,0.5)';
    ctx.fillRect(toX(i)-bw/2, Math.min(toY(v),z), bw, Math.abs(toY(v)-z)||1);
  }
  ctx.lineWidth=1.2;
  const dLine=(arr,col)=>{
    ctx.strokeStyle=col; ctx.beginPath(); ctx.moveTo(toX(0),toY(arr[0]));
    for(let i=1;i<n;i++) ctx.lineTo(toX(i),toY(arr[i]));
    ctx.stroke();
  };
  dLine(vM, var_cyan()); dLine(vS, var_red());
}

// ── Stochastic Sub-Pane ──
export function drawStochChart() {
  const { W, H } = resizeCanvas(D.stochCanvas);
  const ctx = CTX.stoch;
  ctx.clearRect(0, 0, W, H);
  const sp = { t:8, r:78, b:8, l:PAD.l };
  const cw = W-sp.l-sp.r, ch = H-sp.t-sp.b;
  const { k, d } = getStoch(S.candles, 14, 3);
  const vK = k.slice(S.viewStart,S.viewEnd), vD = d.slice(S.viewStart,S.viewEnd);
  const n = vK.length; if (!n) return;
  const toY = v => sp.t + ch*(1-v/100);
  const toX = i => sp.l + (i+0.5)*(cw/n);
  ctx.fillStyle='rgba(255,255,255,0.02)';
  ctx.fillRect(sp.l, toY(80), cw, toY(20)-toY(80));
  [20,50,80].forEach(lv=>{
    ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(sp.l,toY(lv)); ctx.lineTo(W-sp.r,toY(lv)); ctx.stroke();
    ctx.fillStyle=var_text3(); ctx.font='8px monospace'; ctx.textAlign='left';
    ctx.fillText(lv, W-sp.r+4, toY(lv)+3);
  });
  const dLine=(arr,col,lw=1.2)=>{
    ctx.strokeStyle=col; ctx.lineWidth=lw;
    ctx.beginPath(); ctx.moveTo(toX(0),toY(arr[0]));
    for(let i=1;i<n;i++) ctx.lineTo(toX(i),toY(arr[i]));
    ctx.stroke();
  };
  dLine(vK, var_cyan()); dLine(vD, var_amber(), 1);
}

// ── OBV Sub-Pane ──
export function drawObvChart() {
  const { W, H } = resizeCanvas(D.obvCanvas);
  const ctx = CTX.obv;
  ctx.clearRect(0, 0, W, H);
  const op = { t:6, r:78, b:6, l:PAD.l };
  const cw = W-op.l-op.r, ch = H-op.t-op.b;
  const full = getOBV(S.candles);
  const vis  = full.slice(S.viewStart, S.viewEnd);
  const n = vis.length; if (!n) return;
  const mx = Math.max(...vis), mn = Math.min(...vis);
  const range = mx-mn||1;
  const toY = v => op.t + ch*(1-(v-mn)/range);
  const toX = i => op.l + (i+0.5)*(cw/n);
  ctx.strokeStyle = var_cyan(); ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.moveTo(toX(0),toY(vis[0]));
  for(let i=1;i<n;i++) ctx.lineTo(toX(i),toY(vis[i]));
  ctx.stroke();
  ctx.fillStyle=var_text3(); ctx.font='8px monospace'; ctx.textAlign='left';
  ctx.fillText(fmtVol(vis[n-1]), W-op.r+4, op.t+8);
}

// ── Minimap ──
export function drawMinimap() {
  const { W, H } = resizeCanvas(D.minimapCanvas);
  const ctx = CTX.minimap;
  ctx.clearRect(0, 0, W, H);
  const n = S.candles.length; if (!n) return;
  const closes = getCloses();
  const mx = Math.max(...closes), mn = Math.min(...closes), range = mx-mn||1;
  const toY = v => 2 + (H-4)*(1-(v-mn)/range);
  const toX = i => (i/n)*W;

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(toX(0),toY(closes[0]));
  for(let i=1;i<n;i++) ctx.lineTo(toX(i),toY(closes[i]));
  ctx.stroke();

  const xs = toX(S.viewStart), xe = toX(S.viewEnd);
  ctx.fillStyle='rgba(0,212,255,0.07)';
  ctx.fillRect(xs, 0, xe-xs, H);
  ctx.strokeStyle='rgba(0,212,255,0.5)'; ctx.lineWidth=1.5;
  ctx.strokeRect(xs, 0, xe-xs, H);
}

// ─────────────────────────────────────────────
//  INTERACTION SETUP
// ─────────────────────────────────────────────
export function initChartInteractions() {
  D.mainCanvas.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    const { x, y } = getXY(e, D.mainCanvas);
    const { absIdx, price } = xyToCandle(x, y);

    if (S.drawTool !== 'none' && S.drawTool !== 'crosshair') {
      const colors = { trendline:var_amber(), hline:var_red(), vline:'rgba(255,255,255,0.4)',
                       rect:var_blue_hex(), channel:var_cyan(), fib:var_green(), fibext:var_cyan() };
      S.currentDrawing = { type:S.drawTool, x1:absIdx, y1:price, color:colors[S.drawTool]||var_amber() };
      if (S.drawTool === 'hline' || S.drawTool === 'vline') {
        S.drawings.push({ ...S.currentDrawing });
        S.currentDrawing = null;
        S.drawTool = 'none';
        document.querySelectorAll('.lbar-btn[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === 'none'));
        document.querySelectorAll('.tp-btn[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === 'none'));
        saveState();
      }
      if (queueRenderCallback) queueRenderCallback();
    } else {
      S.isPanning = true;
      S.panStartX = e.clientX;
      S.panStartView = S.viewStart;
      D.mainCanvas.style.cursor = 'grabbing';
    }
  });

  D.mainCanvas.addEventListener('mousemove', e => {
    const { x, y } = getXY(e, D.mainCanvas);
    const L = S.layout;
    if (!L) return;
    const step = L.cw / L.n;
    const idx = Math.floor((x - L.PAD.l) / step);
    S.hoverIdx = (x >= L.PAD.l && x <= L.PAD.l + L.cw) ? idx : -1;

    if (S.currentDrawing) {
      const { absIdx, price } = xyToCandle(x, y);
      S.currentDrawing.x2 = absIdx;
      S.currentDrawing.y2 = price;
    }
    if (S.isPanning) {
      const dx = Math.round((e.clientX - S.panStartX) / step);
      const w  = S.viewEnd - S.viewStart;
      let ns = S.panStartView - dx;
      ns = clamp(ns, 0, Math.max(0, S.candles.length - w));
      S.viewStart = ns;
      S.viewEnd   = ns + w;
    }
    if (queueRenderCallback) queueRenderCallback();
  });

  D.mainCanvas.addEventListener('mouseup', e => {
    if (S.isPanning) { S.isPanning = false; D.mainCanvas.style.cursor = 'crosshair'; }
    if (S.currentDrawing) {
      if (S.currentDrawing.x2 !== undefined) S.drawings.push({ ...S.currentDrawing });
      S.currentDrawing = null;
      S.drawTool = 'none';
      document.querySelectorAll('.lbar-btn[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === 'none'));
      document.querySelectorAll('.tp-btn[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === 'none'));
      saveState();
    }
    if (queueRenderCallback) queueRenderCallback();
  });

  D.mainCanvas.addEventListener('mouseleave', () => {
    S.hoverIdx = -1; S.isPanning = false;
    D.mainCanvas.style.cursor = 'crosshair';
    if (queueRenderCallback) queueRenderCallback();
  });

  D.mainCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!S.layout) return;
    const factor  = e.deltaY < 0 ? 0.88 : 1.12;
    const w       = S.viewEnd - S.viewStart;
    const newW    = clamp(Math.round(w * factor), 10, S.candles.length);
    const { x }   = getXY(e, D.mainCanvas);
    const ratio   = (x - S.layout.PAD.l) / S.layout.cw;
    const shift   = Math.round((w - newW) * ratio);
    let ns = S.viewStart + shift;
    ns = clamp(ns, 0, Math.max(0, S.candles.length - newW));
    S.viewStart = ns;
    S.viewEnd   = ns + newW;
    if (queueRenderCallback) queueRenderCallback();
  }, { passive: false });

  // Touch Support
  let _touchDist = 0;
  let _touchStartX = 0;
  let _touchStartView = 0;
  let _isTouchPanning = false;

  D.mainCanvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      _touchDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      _isTouchPanning = false;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      _touchStartX = touch.clientX;
      _touchStartView = S.viewStart;
      _isTouchPanning = true;

      const { x, y } = getXY(touch, D.mainCanvas);
      const L = S.layout;
      if (L) {
        const step = L.cw / L.n;
        const idx = Math.floor((x - L.PAD.l) / step);
        S.hoverIdx = (x >= L.PAD.l && x <= L.PAD.l + L.cw) ? idx : -1;
      }
      if (queueRenderCallback) queueRenderCallback();
    }
  }, { passive: true });

  D.mainCanvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const d2 = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      const factor = _touchDist / (d2 || 1);
      const w = S.viewEnd - S.viewStart;
      const nw = clamp(Math.round(w * factor), 10, S.candles.length);
      S.viewStart = clamp(S.viewStart, 0, S.candles.length - nw);
      S.viewEnd   = S.viewStart + nw;
      _touchDist  = d2;
      if (queueRenderCallback) queueRenderCallback();
    } else if (e.touches.length === 1 && _isTouchPanning) {
      const touch = e.touches[0];
      const L = S.layout;
      if (!L) return;
      const step = L.cw / L.n;
      const dx = Math.round((touch.clientX - _touchStartX) / step);
      const w  = S.viewEnd - S.viewStart;
      let ns = _touchStartView - dx;
      ns = clamp(ns, 0, Math.max(0, S.candles.length - w));
      S.viewStart = ns;
      S.viewEnd   = ns + w;

      const { x } = getXY(touch, D.mainCanvas);
      const idx = Math.floor((x - L.PAD.l) / step);
      S.hoverIdx = (x >= L.PAD.l && x <= L.PAD.l + L.cw) ? idx : -1;

      if (queueRenderCallback) queueRenderCallback();
    }
  }, { passive: true });

  D.mainCanvas.addEventListener('touchend', () => {
    _isTouchPanning = false;
    _touchDist = 0;
  }, { passive: true });

  // Minimap Navigation
  D.minimapPanel.addEventListener('mousedown', e => {
    const nav = ev => {
      const r   = D.minimapPanel.getBoundingClientRect();
      const cx  = clamp(ev.clientX - r.left, 0, r.width);
      const rat = cx / r.width;
      const tc  = Math.round(rat * S.candles.length);
      const w   = S.viewEnd - S.viewStart;
      S.viewStart = clamp(tc - Math.round(w/2), 0, S.candles.length - w);
      S.viewEnd   = S.viewStart + w;
      if (queueRenderCallback) queueRenderCallback();
    };
    nav(e);
    const up = () => { window.removeEventListener('mousemove', nav); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', nav);
    window.addEventListener('mouseup', up);
  });

  // Context Menu
  D.mainCanvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!S.layout) return;
    const { price } = xyToCandle(e.clientX - D.mainCanvas.getBoundingClientRect().left,
                                  e.clientY - D.mainCanvas.getBoundingClientRect().top);
    D.ctxPrice.textContent = fmtUSD(price);
    D.ctxPrice.dataset.price = price;
    D.ctxMenu.style.left = `${e.clientX}px`;
    D.ctxMenu.style.top  = `${e.clientY}px`;
    D.ctxMenu.style.display = 'block';
  });
  D.ctxAlert.addEventListener('click', () => {
    addAlert(parseFloat(D.ctxPrice.dataset.price));
    D.ctxMenu.style.display = 'none';
  });
  D.ctxCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(parseFloat(D.ctxPrice.dataset.price).toFixed(2));
    D.ctxMenu.style.display = 'none';
  });
  D.ctxReset.addEventListener('click', () => {
    S.viewStart = Math.max(0, S.candles.length - 160);
    S.viewEnd   = S.candles.length;
    if (queueRenderCallback) queueRenderCallback();
    D.ctxMenu.style.display = 'none';
  });
  D.ctxMenu.addEventListener('click', e => {
    const tf = e.target.closest('.ctx-tf');
    if (!tf) return;
    S.tf = tf.dataset.tf;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('on', b.dataset.tf === S.tf));
    saveState();
    if (initDataCallback) initDataCallback();
    D.ctxMenu.style.display = 'none';
  });

  document.addEventListener('click', () => {
    D.ctxMenu.style.display = 'none';
  });
}
