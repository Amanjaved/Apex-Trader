/* ═══════════════════════════════════════════════════════
   APEXTRADER PRO — LANDING PAGE CONTROLLER
   Premium 3D Bitcoin Trading Platform
   ═══════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════════
// 1. NAVBAR — scroll effect
// ══════════════════════════════════════════════════════
(function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
})();

// ══════════════════════════════════════════════════════
// 2. MOBILE MENU TOGGLE
// ══════════════════════════════════════════════════════
(function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const menu   = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    toggle.textContent = open ? '✕' : '☰';
  });
  document.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.textContent = '☰';
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
})();

// ══════════════════════════════════════════════════════
// 3. BACKGROUND PARTICLE NETWORK — gold + cyan nodes
// ══════════════════════════════════════════════════════
class ParticleGrid {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: null, y: null, radius: 140 };
    this.resize();
    this.spawnParticles();
    this.animate();

    window.addEventListener('resize', () => { this.resize(); this.spawnParticles(); }, { passive: true });
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; }, { passive: true });
    window.addEventListener('mouseleave', () => { this.mouse.x = null; this.mouse.y = null; }, { passive: true });
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawnParticles() {
    const count = Math.min(90, Math.floor((this.canvas.width * this.canvas.height) / 16000));
    this.particles = Array.from({ length: count }, () => ({
      x:  Math.random() * this.canvas.width,
      y:  Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r:  Math.random() * 1.4 + 0.8,
      // Alternate between gold and cyan particles
      gold: Math.random() > 0.6
    }));
  }

  animate() {
    const { ctx, canvas, particles, mouse } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      if (mouse.x !== null) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * force * 1.5;
          p.y += Math.sin(angle) * force * 1.5;
        }
      }

      // Draw dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.gold ? 'rgba(247,147,26,0.5)' : 'rgba(0,212,255,0.4)';
      ctx.fill();

      // Draw connections
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x, dy = p.y - p2.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 100) {
          const alpha = (1 - dist / 100) * 0.1;
          const color = (p.gold && p2.gold) ? `rgba(247,147,26,${alpha})` : `rgba(0,212,255,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(() => this.animate());
  }
}

// ══════════════════════════════════════════════════════
// 4. HERO LIVE CHART — floating dashboard panel canvas
// ══════════════════════════════════════════════════════
class HeroLiveChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.candles = [];
    this.n = 32;
    this.basePrice = 67000;
    this.currentPrice = 67284.50;
    this.initData();
    this.resize();
    this.animate();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    setInterval(() => this.tick(), 1400);
  }

  initData() {
    let last = this.basePrice;
    for (let i = 0; i < this.n; i++) {
      const open  = last + (Math.random() - 0.5) * 160;
      const close = open + (Math.random() - 0.5) * 220;
      const high  = Math.max(open, close) + Math.random() * 90;
      const low   = Math.min(open, close) - Math.random() * 90;
      this.candles.push({ open, close, high, low, buy: i === 8 || i === 24, sell: i === 17 });
      last = close;
    }
    this.currentPrice = last;
  }

  resize() {
    const rect = this.canvas.parentNode.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width  = '100%';
    this.canvas.style.height = '100%';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  tick() {
    const last = this.candles[this.candles.length - 1];
    last.close += (Math.random() - 0.5) * 55;
    last.high   = Math.max(last.high, last.close);
    last.low    = Math.min(last.low,  last.close);
    this.currentPrice = last.close;

    // Sync price displays
    const fmt = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hp = document.getElementById('heroPrice');
    const dp = document.getElementById('dashPrice');
    if (hp) hp.textContent = fmt(last.close);
    if (dp) dp.textContent = fmt(Math.round(last.close));

    if (Math.random() > 0.82) {
      this.candles.shift();
      const o = last.close;
      const c = o + (Math.random() - 0.5) * 100;
      this.candles.push({ open: o, close: c, high: Math.max(o,c)+Math.random()*50, low: Math.min(o,c)-Math.random()*50, buy: Math.random()>0.94, sell: Math.random()>0.95 });
    }
  }

  animate() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    if (!w || !h) { requestAnimationFrame(() => this.animate()); return; }

    this.ctx.clearRect(0, 0, w, h);

    let lo = Infinity, hi = -Infinity;
    for (const c of this.candles) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; }
    const range = hi - lo || 1;
    const padT = 18, padB = 14;
    const yMap = (p) => h - padB - ((p - lo) / range) * (h - padT - padB);

    // Grid lines
    this.ctx.setLineDash([2, 3]);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    this.ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = padT + (i / 5) * (h - padT - padB);
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]);

    const cw = (w / this.n) * 0.65;
    const gap = (w / this.n) * 0.35;

    // EMA line
    const k = 2 / 11;
    let ema = this.candles[0].close;
    const emaPoints = [ema];
    for (let i = 1; i < this.candles.length; i++) {
      ema = this.candles[i].close * k + ema * (1 - k);
      emaPoints.push(ema);
    }
    this.ctx.beginPath();
    for (let i = 0; i < this.candles.length; i++) {
      const x = i * (cw + gap) + cw / 2;
      i === 0 ? this.ctx.moveTo(x, yMap(emaPoints[i])) : this.ctx.lineTo(x, yMap(emaPoints[i]));
    }
    this.ctx.strokeStyle = 'rgba(0,212,255,0.55)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Candles
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const x = i * (cw + gap);
      const bull = c.close >= c.open;
      const color = bull ? '#00FF88' : '#FF3366';

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x + cw / 2, yMap(c.high));
      this.ctx.lineTo(x + cw / 2, yMap(c.low));
      this.ctx.stroke();

      this.ctx.fillStyle = bull ? 'rgba(0,255,136,0.85)' : 'rgba(255,51,102,0.85)';
      const bh = Math.max(1, Math.abs(yMap(c.open) - yMap(c.close)));
      this.ctx.fillRect(x, Math.min(yMap(c.open), yMap(c.close)), cw, bh);
    }

    // Price track
    const py = yMap(this.currentPrice);
    this.ctx.setLineDash([2, 2]);
    this.ctx.strokeStyle = 'rgba(247,147,26,0.25)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, py); this.ctx.lineTo(w, py);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Glowing dot
    this.ctx.fillStyle = '#F7931A';
    this.ctx.shadowColor = '#F7931A';
    this.ctx.shadowBlur = 12;
    this.ctx.beginPath();
    this.ctx.arc(w - 5, py, 4, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    requestAnimationFrame(() => this.animate());
  }
}

// ══════════════════════════════════════════════════════
// 5. HERO BACKGROUND CHART — transparent 3D candlestick backdrop
// ══════════════════════════════════════════════════════
class HeroBgChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.candles = [];
    this.n = 50;
    this.t = 0;
    this.initData();
    this.resize();
    this.animate();
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  initData() {
    let p = 67000;
    for (let i = 0; i < this.n; i++) {
      const o = p + (Math.random() - 0.5) * 300;
      const c = o  + (Math.random() - 0.5) * 500;
      const h = Math.max(o, c) + Math.random() * 150;
      const l = Math.min(o, c) - Math.random() * 150;
      this.candles.push({ o, c, h, l });
      p = c;
    }
  }

  resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = this.canvas.parentNode ? this.canvas.parentNode.getBoundingClientRect()
                                        : { width: this.canvas.offsetWidth || 560, height: this.canvas.offsetHeight || 320 };
    this.canvas.width  = (rect.width  || 560) * dpr;
    this.canvas.height = (rect.height || 320) * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  animate() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    if (!w || !h) { requestAnimationFrame(() => this.animate()); return; }
    this.ctx.clearRect(0, 0, w, h);

    this.t += 0.003;
    const shift = Math.sin(this.t) * 20;

    let lo = Math.min(...this.candles.map(c => c.l));
    let hi = Math.max(...this.candles.map(c => c.h));
    const range = hi - lo || 1;
    const yMap = (p) => h * 0.85 - ((p - lo) / range) * (h * 0.7) + shift;

    const cw = (w / this.n) * 0.55;
    const gap = (w / this.n) * 0.45;

    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const x = i * (cw + gap);
      const bull = c.c >= c.o;
      const alpha = 0.12 + (i / this.n) * 0.18;
      const color = bull ? `rgba(0,255,136,${alpha})` : `rgba(255,51,102,${alpha})`;

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x + cw/2, yMap(c.h));
      this.ctx.lineTo(x + cw/2, yMap(c.l));
      this.ctx.stroke();

      this.ctx.fillStyle = color;
      const bh = Math.max(1, Math.abs(yMap(c.o) - yMap(c.c)));
      this.ctx.fillRect(x, Math.min(yMap(c.o), yMap(c.c)), cw, bh);
    }
    requestAnimationFrame(() => this.animate());
  }
}

// ══════════════════════════════════════════════════════
// 6. CTA SECTION PARTICLE BURST
// ══════════════════════════════════════════════════════
class CtaParticles {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.resize();
    this.spawnLoop();
    this.animate();
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  resize() {
    const parent = this.canvas.parentNode;
    const rect   = parent ? parent.getBoundingClientRect() : null;
    this.canvas.width  = rect ? rect.width  : (window.innerWidth);
    this.canvas.height = rect ? rect.height : 500;
  }

  spawnLoop() {
    setInterval(() => {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x:   Math.random() * this.canvas.width,
          y:   this.canvas.height + 10,
          vx:  (Math.random() - 0.5) * 1.2,
          vy:  -(Math.random() * 1.5 + 0.5),
          r:   Math.random() * 2.5 + 0.8,
          life: 1,
          decay: Math.random() * 0.006 + 0.003,
          gold: Math.random() > 0.5
        });
      }
      // Cleanup dead particles
      this.particles = this.particles.filter(p => p.life > 0);
    }, 80);
  }

  animate() {
    const { ctx, canvas, particles } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) continue;

      const color = p.gold
        ? `rgba(247,147,26,${p.life * 0.6})`
        : `rgba(0,212,255,${p.life * 0.5})`;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (p.gold && p.life > 0.5) {
        ctx.shadowColor = '#F7931A';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    requestAnimationFrame(() => this.animate());
  }
}

// ══════════════════════════════════════════════════════
// 7. LIVE TICKER — update from API or keep static
// ══════════════════════════════════════════════════════
async function updateTickerStrip() {
  try {
    const r = await fetch('/api/coins');
    if (!r.ok) return;
    const data = await r.json();
    const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','DOTUSDT'];
    const fmt = (p) => {
      const n = Math.abs(p);
      const d = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
      return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    };
    const track = document.getElementById('tickerTrack');
    if (!track) return;
    const items = data
      .filter(c => symbols.includes(c.symbol))
      .sort((a,b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));

    const html = [...items, ...items].map(c => {
      const chg = parseFloat(c.priceChangePercent);
      const cls = chg >= 0 ? 'up' : 'dn';
      const sign = chg >= 0 ? '+' : '';
      return `<div class="ticker-item">
        <span class="ticker-symbol">${c.symbol.replace('USDT','')}</span>
        <span class="ticker-price">${fmt(parseFloat(c.lastPrice))}</span>
        <span class="ticker-chg ${cls}">${sign}${chg.toFixed(2)}%</span>
      </div>`;
    }).join('');
    track.innerHTML = html;
  } catch (e) { /* keep static fallback */ }
}

// ══════════════════════════════════════════════════════
// 8. MARKETS GRID — sparkline cards
// ══════════════════════════════════════════════════════
const coinMeta = {
  BTCUSDT:  { name: 'Bitcoin',  icon: '₿', label: 'BTC' },
  ETHUSDT:  { name: 'Ethereum', icon: 'Ξ', label: 'ETH' },
  SOLUSDT:  { name: 'Solana',   icon: '◎', label: 'SOL' },
  BNBUSDT:  { name: 'BNB',      icon: '⬡', label: 'BNB' },
  XRPUSDT:  { name: 'XRP',      icon: '✕', label: 'XRP' },
};

const sparklineCache = {};

async function fetchSparklineCandles(symbol) {
  if (sparklineCache[symbol] && Date.now() - sparklineCache[symbol].ts < 60000) {
    return sparklineCache[symbol].data;
  }
  try {
    const r = await fetch(`/api/candles?symbol=${symbol}&interval=1h&limit=24`);
    if (r.ok) {
      const raw = await r.json();
      const closes = raw.map(c => parseFloat(c[4]));
      sparklineCache[symbol] = { data: closes, ts: Date.now() };
      return closes;
    }
  } catch (e) { /* fall through */ }
  return sparklineCache[symbol]?.data || [];
}

async function drawSparkline(canvasId, symbol, changePercent) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentNode.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  if (!w || !h) return;

  let closes = await fetchSparklineCandles(symbol);
  if (!closes.length) {
    closes = Array.from({ length: 24 }, (_, i) => 50 + Math.sin(i / 2.5) * 8 + Math.random() * 4);
  }

  const isUp  = changePercent >= 0;
  const color = isUp ? '#00FF88' : '#FF3366';
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const range = hi - lo || 1;
  const pts = closes.map((p, i) => ({
    x: (i / (closes.length - 1)) * w,
    y: h - 2 - ((p - lo) / range) * (h - 4)
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, isUp ? 'rgba(0,255,136,0.18)' : 'rgba(255,51,102,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, h);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(pts[pts.length-1].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

async function refreshMarkets() {
  const grid = document.getElementById('marketsGrid');
  if (!grid) return;
  const targets = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];

  const fmtUSD = (p) => {
    const n = Math.abs(p);
    const d = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
    return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const fmtVol = (v) => {
    if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
    return Number(v).toFixed(2);
  };

  try {
    const r = await fetch('/api/coins');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const filtered = data.filter(c => targets.includes(c.symbol));
    filtered.sort((a,b) => targets.indexOf(a.symbol) - targets.indexOf(b.symbol));

    grid.innerHTML = filtered.map(c => {
      const meta = coinMeta[c.symbol] || { icon: '◉', label: c.symbol.replace('USDT',''), name: c.symbol };
      const price = parseFloat(c.lastPrice);
      const chg   = parseFloat(c.priceChangePercent);
      const vol   = parseFloat(c.volume);
      const cls   = chg >= 0 ? 'up' : 'dn';
      const sign  = chg >= 0 ? '+' : '';

      return `
        <div class="market-card reveal-on-scroll" onclick="location.href='/charts?symbol=${c.symbol}'" style="cursor:pointer">
          <div class="market-head">
            <div class="market-coin">
              <div class="market-coin-icon">${meta.icon}</div>
              <div>
                <h4>${meta.label}/USDT</h4>
                <span>${meta.name}</span>
              </div>
            </div>
            <span class="market-chg ${cls}">${sign}${chg.toFixed(2)}%</span>
          </div>
          <div class="market-price">${fmtUSD(price)}</div>
          <div class="market-vol">Vol: $${fmtVol(vol * price)}</div>
          <div class="market-sparkline">
            <canvas class="sparkline-canvas" id="spark_${c.symbol}"></canvas>
          </div>
        </div>`;
    }).join('');

    filtered.forEach(c => {
      const chg = parseFloat(c.priceChangePercent);
      drawSparkline(`spark_${c.symbol}`, c.symbol, chg);
    });

    // Re-observe new cards
    document.querySelectorAll('#marketsGrid .reveal-on-scroll').forEach(el => {
      if (revealObserver && !el.classList.contains('active')) revealObserver.observe(el);
    });
    if (typeof initCardTiltEffect === 'function') initCardTiltEffect();

  } catch (e) {
    if (grid.querySelector('.loading-card')) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;font-size:13px;color:var(--text-2);background:rgba(8,13,22,0.8);border:var(--glass-border);border-radius:var(--radius)">
        Live feeds temporarily unavailable. <a href="/charts" style="color:var(--gold)">Open the platform</a> for live data.
      </div>`;
    }
  }
}

// ══════════════════════════════════════════════════════
// 9. COUNTER ANIMATION — performance metrics
// ══════════════════════════════════════════════════════
function animateCounters() {
  document.querySelectorAll('.metric-num').forEach(el => {
    const target   = parseFloat(el.getAttribute('data-target'));
    const suffix   = el.getAttribute('data-suffix') || '';
    const prefix   = el.getAttribute('data-prefix') || '';
    const duration = 2200;
    const start    = performance.now();

    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      const val  = ease * target;
      const formatted = target % 1 === 0
        ? Math.floor(val).toLocaleString()
        : val.toFixed(2);
      el.textContent = prefix + formatted + suffix;
      if (progress < 1) requestAnimationFrame(update);
      else el.textContent = prefix + (target % 1 === 0 ? target.toLocaleString() : target.toFixed(2)) + suffix;
    }
    requestAnimationFrame(update);
  });
}

// ══════════════════════════════════════════════════════
// 10. PRICING TOGGLE
// ══════════════════════════════════════════════════════
function initPricingToggle() {
  const btnMonthly  = document.getElementById('btnMonthly');
  const btnYearly   = document.getElementById('btnYearly');
  const slider      = document.getElementById('billingSlider');
  if (!btnMonthly || !slider) return;

  function setBilling(mode) {
    const isYearly = mode === 'yearly';
    btnMonthly.classList.toggle('active', !isYearly);
    btnYearly.classList.toggle('active',   isYearly);
    slider.classList.toggle('yearly', isYearly);

    document.querySelectorAll('.price-amount').forEach(el => {
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = el.getAttribute(isYearly ? 'data-yearly' : 'data-monthly');
        el.style.opacity = '1';
      }, 140);
    });
    document.querySelectorAll('.price-period').forEach(el => {
      el.textContent = isYearly ? '/mo, billed annually' : '/month';
    });
  }

  btnMonthly.addEventListener('click', () => setBilling('monthly'));
  btnYearly.addEventListener('click',  () => setBilling('yearly'));
  slider.addEventListener('click',     () => setBilling(slider.classList.contains('yearly') ? 'monthly' : 'yearly'));
}

// ══════════════════════════════════════════════════════
// 11. INTERSECTION OBSERVERS — scroll reveal & counters
// ══════════════════════════════════════════════════════
let revealObserver;

function initScrollObservers() {
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('active');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  document.querySelectorAll('.reveal-on-scroll').forEach(el => revealObserver.observe(el));

  // Counter observer on metrics section
  const metricsSection = document.querySelector('.metrics');
  if (metricsSection) {
    const counterObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) { animateCounters(); obs.unobserve(e.target); }
      });
    }, { threshold: 0.2 });
    counterObserver.observe(metricsSection);
  }
}

// ══════════════════════════════════════════════════════
// 12. FEATURE CARD RADIAL GLOW — mouse tracking
// ══════════════════════════════════════════════════════
function initFeatureCardGlow() {
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - rect.top)  / rect.height * 100) + '%');
    });
  });
}

// ══════════════════════════════════════════════════════
// 13. NAV ACTIVE LINK HIGHLIGHT — scroll spy
// ══════════════════════════════════════════════════════
function initScrollSpy() {
  const sections = document.querySelectorAll('section[id], header[id]');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(a => a.classList.remove('active'));
        const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s));
}

// ══════════════════════════════════════════════════════
// 14. MOBILE MENU — close on nav link click
// ══════════════════════════════════════════════════════
function initMobileNavClose() {
  const menu = document.getElementById('mobileMenu');
  const toggle = document.getElementById('menuToggle');
  if (!menu) return;
  menu.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      if (toggle) toggle.textContent = '☰';
    });
  });
}

// ══════════════════════════════════════════════════════
// 15. LIVE PRICE SYNC — update heroChange + dashChg from tick
// ══════════════════════════════════════════════════════
function startLivePriceSync() {
  // Pull once from /api/ticker for real initial values
  fetch('/api/ticker?symbol=BTCUSDT')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      const price  = parseFloat(data.lastPrice  || data.price || 0);
      const chgPct = parseFloat(data.priceChangePercent || data.changePercent || 0);
      if (price) {
        const fmt = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const hp = document.getElementById('heroPrice');
        const dp = document.getElementById('dashPrice');
        const hc = document.getElementById('heroChange');
        const dc = document.getElementById('dashChg');
        if (hp) hp.textContent = fmt(price);
        if (dp) dp.textContent = fmt(Math.round(price));
        const chgStr = (chgPct >= 0 ? '+' : '') + chgPct.toFixed(2) + '%';
        if (hc) {
          hc.textContent = chgStr;
          hc.className = 'pill-value ' + (chgPct >= 0 ? 'pill-up' : 'pill-dn');
        }
        if (dc) {
          dc.textContent = chgStr;
          dc.className = 'dash-stat-v ' + (chgPct >= 0 ? 'v-green' : 'v-red');
        }
      }
    })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════
// 16. ENTERPRISE CTA — open auth modal or mailto
// ══════════════════════════════════════════════════════
function initEnterpriseCta() {
  const btn = document.getElementById('enterpriseCta');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // Redirect directly to the guest terminal
    window.location.href = '/charts';
  });
}

// ══════════════════════════════════════════════════════
// 17. SMOOTH ANCHOR SCROLL — account for fixed navbar height
// ══════════════════════════════════════════════════════
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const offset = 80; // navbar height
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

// ══════════════════════════════════════════════════════
// 18. BOOT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Canvas animations
  const bgCanvas = document.getElementById('bgParticles');
  if (bgCanvas) new ParticleGrid(bgCanvas);

  const heroCanvas = document.getElementById('heroLiveChart');
  if (heroCanvas) new HeroLiveChart(heroCanvas);

  const bgChartCanvas = document.getElementById('heroBgChart');
  if (bgChartCanvas) new HeroBgChart(bgChartCanvas);

  const ctaCanvas = document.getElementById('ctaParticles');
  if (ctaCanvas) new CtaParticles(ctaCanvas);

  // UI
  initScrollObservers();
  initPricingToggle();
  initFeatureCardGlow();
  initScrollSpy();
  initMobileNavClose();
  initEnterpriseCta();
  initSmoothScroll();
  startLivePriceSync();

  // Data feeds
  refreshMarkets();
  updateTickerStrip();
  setInterval(refreshMarkets,    9000);
  setInterval(updateTickerStrip, 15000);
  setInterval(startLivePriceSync, 30000);
});
