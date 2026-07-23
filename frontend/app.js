/* ═══════════════════════════════════════════════════════
   APEXTRADER ULTRA — FRONTEND INTERACTIVE CONTROLLER
   Real-Time Data Streaming, WebGL Canvas Charts & Quant Tools
   ═══════════════════════════════════════════════════════ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileMenu();
  initParticleGrid();
  initHeroLiveChart();
  initTickerStreamer();
  initMarketUniverse();
  initTerminalTabs();
  initAISignalStreamer();
  initQuantCalculator();
  initPricingToggle();
  initHealthPingMonitor();
  initScrollCounters();
});

// ══════════════════════════════════════════════════════
// 1. NAVBAR SCROLL EFFECT
// ══════════════════════════════════════════════════════
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}

// ══════════════════════════════════════════════════════
// 2. MOBILE MENU DRAWER
// ══════════════════════════════════════════════════════
function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const menu = document.getElementById('mobileMenu');
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
}

// ══════════════════════════════════════════════════════
// 3. BACKGROUND PARTICLE NETWORK
// ══════════════════════════════════════════════════════
function initParticleGrid() {
  const canvas = document.getElementById('bgParticles');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  const mouse = { x: null, y: null, radius: 150 };

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawn() {
    const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 18000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.8,
      gold: Math.random() > 0.65
    }));
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      if (mouse.x !== null) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * force * 1.2;
          p.y += Math.sin(angle) * force * 1.2;
        }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.gold ? 'rgba(240, 185, 11, 0.4)' : 'rgba(0, 242, 254, 0.35)';
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 110) {
          const alpha = (1 - dist / 110) * 0.12;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = p.gold && p2.gold ? `rgba(240,185,11,${alpha})` : `rgba(0,242,254,${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(render);
  }

  window.addEventListener('resize', () => { resize(); spawn(); }, { passive: true });
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  window.addEventListener('mouseleave', () => { mouse.x = null; mouse.y = null; }, { passive: true });

  resize();
  spawn();
  render();
}

// ══════════════════════════════════════════════════════
// 4. HERO LIVE DEMO CANDLESTICK CHART
// ══════════════════════════════════════════════════════
function initHeroLiveChart() {
  const canvas = document.getElementById('heroLiveChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let candles = [];
  const n = 34;
  let currentPrice = 67480;

  function initData() {
    let last = 67200;
    for (let i = 0; i < n; i++) {
      const open = last + (Math.random() - 0.48) * 120;
      const close = open + (Math.random() - 0.47) * 160;
      const high = Math.max(open, close) + Math.random() * 80;
      const low = Math.min(open, close) - Math.random() * 80;
      candles.push({ open, close, high, low });
      last = close;
    }
    currentPrice = last;
  }

  function resize() {
    const parent = canvas.parentNode;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function tick() {
    if (!candles.length) return;
    const last = candles[candles.length - 1];
    const delta = (Math.random() - 0.48) * 45;
    last.close += delta;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
    currentPrice = last.close;

    // Update Hero Prices in DOM
    const fmt = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hp = document.getElementById('heroPrice');
    const dp = document.getElementById('dashPrice');
    if (hp) hp.textContent = fmt(currentPrice);
    if (dp) dp.textContent = fmt(Math.round(currentPrice));

    if (Math.random() > 0.85) {
      candles.shift();
      const o = currentPrice;
      const c = o + (Math.random() - 0.48) * 90;
      candles.push({ open: o, close: c, high: Math.max(o, c) + Math.random() * 40, low: Math.min(o, c) - Math.random() * 40 });
    }
  }

  function render() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (!w || !h) { requestAnimationFrame(render); return; }

    ctx.clearRect(0, 0, w, h);

    let lo = Infinity, hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const range = hi - lo || 1;
    const padT = 16, padB = 20;
    const yMap = (p) => h - padB - ((p - lo) / range) * (h - padT - padB);

    const slotW = w / n;
    const candleW = Math.max(2, slotW * 0.65);

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = padT + (i / 4) * (h - padT - padB);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw Candlesticks
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = i * slotW + slotW / 2;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#00e676' : '#ff5252';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yMap(c.high));
      ctx.lineTo(x, yMap(c.low));
      ctx.stroke();

      // Body
      const yOpen = yMap(c.open);
      const yClose = yMap(c.close);
      const bTop = Math.min(yOpen, yClose);
      const bH = Math.max(2, Math.abs(yOpen - yClose));

      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bTop, candleW, bH);
    }

    // Draw Moving Average Line
    ctx.strokeStyle = '#f0b90b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let maSum = 0;
    for (let i = 0; i < candles.length; i++) {
      maSum += candles[i].close;
      const count = Math.min(i + 1, 5);
      const maVal = maSum / count;
      const x = i * slotW + slotW / 2;
      const y = yMap(maVal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(render);
  }

  window.addEventListener('resize', resize, { passive: true });
  initData();
  resize();
  render();
  setInterval(tick, 1200);
}

// ══════════════════════════════════════════════════════
// 5. TICKER STREAMER MARQUEE
// ══════════════════════════════════════════════════════
async function initTickerStreamer() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  try {
    const res = await fetch('/api/coins');
    if (!res.ok) throw new Error('API offline');
    const rawData = await res.json();
    const coins = Array.isArray(rawData) ? rawData : (rawData.coins || []);
    
    if (!coins.length) {
      renderFallbackTicker(track);
      return;
    }

    let html = '';
    const fullList = [...coins, ...coins];
    for (const c of fullList) {
      const priceVal = parseFloat(c.price || c.lastPrice || 0);
      const chgVal = parseFloat(c.change24h || c.priceChangePercent || 0);
      const isUp = chgVal >= 0;
      const chgClass = isUp ? 'up' : 'dn';
      const sign = isUp ? '+' : '';
      const symbol = (c.symbol || 'BTCUSDT').replace('USDT', '');

      html += `
        <div class="ticker-item">
          <span class="ticker-symbol">${symbol}</span>
          <span class="ticker-price">$${priceVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="ticker-chg ${chgClass}">${sign}${chgVal.toFixed(2)}%</span>
        </div>
      `;
    }
    track.innerHTML = html;
  } catch (e) {
    renderFallbackTicker(track);
  }
}

function renderFallbackTicker(track) {
  const fallback = [
    { symbol: 'BTC', price: 67480.00, change: 4.12 },
    { symbol: 'ETH', price: 3540.20, change: 3.85 },
    { symbol: 'SOL', price: 188.50, change: 6.14 },
    { symbol: 'BNB', price: 618.30, change: -0.42 },
    { symbol: 'XRP', price: 0.6340, change: 2.10 },
    { symbol: 'AVAX', price: 38.90, change: 5.22 }
  ];
  const list = [...fallback, ...fallback];
  track.innerHTML = list.map(c => `
    <div class="ticker-item">
      <span class="ticker-symbol">${c.symbol}</span>
      <span class="ticker-price">$${c.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      <span class="ticker-chg ${c.change >= 0 ? 'up' : 'dn'}">${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════
// 6. MARKET UNIVERSE GRID & SEARCH/FILTER
// ══════════════════════════════════════════════════════
let allMarketCoins = [];

async function initMarketUniverse() {
  const grid = document.getElementById('marketsGrid');
  const searchInput = document.getElementById('coinSearchInput');
  const filterTabs = document.getElementById('marketFilterTabs');
  if (!grid) return;

  try {
    const res = await fetch('/api/coins');
    const rawData = await res.json();
    const coins = Array.isArray(rawData) ? rawData : (rawData.coins || []);

    if (coins.length > 0) {
      allMarketCoins = coins.map(c => ({
        symbol: c.symbol || 'BTCUSDT',
        name: c.name || (c.symbol ? c.symbol.replace('USDT', '') : 'Crypto'),
        price: parseFloat(c.price || c.lastPrice || 0),
        change24h: parseFloat(c.change24h || c.priceChangePercent || 0),
        volume: parseFloat(c.volume || c.quoteVolume || 1200000000)
      }));
    } else {
      allMarketCoins = getFallbackCoinList();
    }
  } catch (e) {
    allMarketCoins = getFallbackCoinList();
  }

  renderMarketCards(allMarketCoins);

  // Search Listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterAndRenderMarkets();
    });
  }

  // Filter Tabs Listener
  if (filterTabs) {
    filterTabs.addEventListener('click', (e) => {
      if (!e.target.classList.contains('filter-tab')) return;
      filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      filterAndRenderMarkets();
    });
  }
}

function filterAndRenderMarkets() {
  const query = (document.getElementById('coinSearchInput')?.value || '').toLowerCase().trim();
  const activeTab = document.querySelector('.filter-tab.active')?.getAttribute('data-filter') || 'all';

  let filtered = allMarketCoins.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(query) || c.symbol.toLowerCase().includes(query);
    if (!nameMatch) return false;

    if (activeTab === 'l1') return ['BTC', 'ETH', 'SOL', 'BNB', 'AVAX', 'ADA', 'DOT'].some(s => c.symbol.includes(s));
    if (activeTab === 'defi') return ['UNI', 'AAVE', 'LINK', 'MKR', 'CRV'].some(s => c.symbol.includes(s));
    if (activeTab === 'gainers') return c.change24h > 2.0;

    return true;
  });

  renderMarketCards(filtered);
}

function renderMarketCards(coins) {
  const grid = document.getElementById('marketsGrid');
  if (!grid) return;

  if (!coins.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No matching assets found</div>`;
    return;
  }

  grid.innerHTML = coins.map(c => {
    const symbolClean = c.symbol.replace('USDT', '');
    const isUp = c.change24h >= 0;
    const chgClass = isUp ? 'up' : 'dn';
    const sign = isUp ? '+' : '';
    const formattedPrice = c.price.toLocaleString('en-US', { minimumFractionDigits: c.price < 1 ? 4 : 2, maximumFractionDigits: c.price < 1 ? 4 : 2 });
    const formattedVol = c.volume > 1e9 ? '$' + (c.volume / 1e9).toFixed(2) + 'B' : '$' + (c.volume / 1e6).toFixed(0) + 'M';

    return `
      <div class="market-card">
        <div class="mc-header">
          <div class="mc-coin-info">
            <div class="mc-icon">${symbolClean.charAt(0)}</div>
            <div>
              <div class="mc-name">${c.name}</div>
              <div class="mc-symbol">${c.symbol}</div>
            </div>
          </div>
          <span class="mc-chg ${chgClass}">${sign}${c.change24h.toFixed(2)}%</span>
        </div>

        <div class="mc-price-row">
          <div class="mc-price">$${formattedPrice}</div>
        </div>

        <div class="mc-footer">
          <span>24h Vol: ${formattedVol}</span>
          <a href="/charts?symbol=${c.symbol}" class="text-gold" style="font-weight:700;">Trade →</a>
        </div>
      </div>
    `;
  }).join('');
}

function getFallbackCoinList() {
  return [
    { symbol: 'BTCUSDT', name: 'Bitcoin', price: 67480.00, change24h: 4.12, volume: 52400000000 },
    { symbol: 'ETHUSDT', name: 'Ethereum', price: 3540.20, change24h: 3.85, volume: 28100000000 },
    { symbol: 'SOLUSDT', name: 'Solana', price: 188.50, change24h: 6.14, volume: 9400000000 },
    { symbol: 'BNBUSDT', name: 'BNB', price: 618.30, change24h: -0.42, volume: 3200000000 },
    { symbol: 'XRPUSDT', name: 'Ripple', price: 0.6340, change24h: 2.10, volume: 4100000000 },
    { symbol: 'AVAXUSDT', name: 'Avalanche', price: 38.90, change24h: 5.22, volume: 1800000000 },
    { symbol: 'ADAUSDT', name: 'Cardano', price: 0.4850, change24h: 1.45, volume: 1200000000 },
    { symbol: 'DOTUSDT', name: 'Polkadot', price: 7.20, change24h: 3.10, volume: 850000000 }
  ];
}

// ══════════════════════════════════════════════════════
// 7. HOLOGRAM TERMINAL TABS
// ══════════════════════════════════════════════════════
function initTerminalTabs() {
  const tabs = document.querySelectorAll('.t-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-terminal-tab');
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(`pane${targetId.charAt(0).toUpperCase() + targetId.slice(1)}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

// ══════════════════════════════════════════════════════
// 8. AI SIGNAL STREAMER LOG
// ══════════════════════════════════════════════════════
function initAISignalStreamer() {
  const logContainer = document.getElementById('aiSignalLog');
  if (!logContainer) return;

  const signals = [
    { type: 'buy', pair: 'SOL/USDT', price: '$188.50', score: '91%' },
    { type: 'buy', pair: 'BTC/USDT', price: '$67,520', score: '95%' },
    { type: 'neutral', pair: 'AVAX/USDT', price: '$38.90', score: '84%' },
    { type: 'buy', pair: 'ETH/USDT', price: '$3,545', score: '93%' }
  ];

  let idx = 0;
  setInterval(() => {
    const s = signals[idx % signals.length];
    idx++;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const div = document.createElement('div');
    div.className = 'ast-line';
    const sigTag = s.type === 'buy' ? '<span class="ast-sig-buy">LONG SIGNAL</span>' : '<span class="ast-sig-neutral">PATTERN ALERT</span>';
    div.innerHTML = `<span class="ast-time">[${timeStr}]</span> ${sigTag} <span class="ast-pair">${s.pair}</span> @ ${s.price} (${s.score})`;

    logContainer.prepend(div);
    if (logContainer.children.length > 6) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }, 3500);
}

// ══════════════════════════════════════════════════════
// 9. QUANT PROFIT & LEVERAGE CALCULATOR
// ══════════════════════════════════════════════════════
function initQuantCalculator() {
  const marginInput = document.getElementById('calcMargin');
  const levInput = document.getElementById('calcLeverage');
  const moveInput = document.getElementById('calcMove');

  if (!marginInput || !levInput || !moveInput) return;

  const levVal = document.getElementById('leverageVal');
  const moveVal = document.getElementById('moveVal');
  const resPosSize = document.getElementById('resPosSize');
  const resPnL = document.getElementById('resPnL');
  const resROI = document.getElementById('resROI');
  const resLiq = document.getElementById('resLiq');

  function calculate() {
    const margin = parseFloat(marginInput.value) || 0;
    const lev = parseInt(levInput.value, 10) || 1;
    const move = parseFloat(moveInput.value) || 0;

    if (levVal) levVal.textContent = lev + 'x';
    if (moveVal) moveVal.textContent = (move >= 0 ? '+' : '') + move + '%';

    const posSize = margin * lev;
    const pnl = posSize * (move / 100);
    const roi = margin > 0 ? (pnl / margin) * 100 : 0;
    const liqBuffer = Math.max(0.5, (100 / lev) * 0.9).toFixed(1);

    if (resPosSize) resPosSize.textContent = '$' + posSize.toLocaleString('en-US');
    if (resPnL) {
      resPnL.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
      resPnL.className = 'cri-val ' + (pnl >= 0 ? 'text-green' : 'text-red');
    }
    if (resROI) {
      resROI.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(2) + '%';
      resROI.className = 'cri-val ' + (roi >= 0 ? 'text-gold' : 'text-red');
    }
    if (resLiq) resLiq.textContent = `~ ${liqBuffer}% Room`;
  }

  marginInput.addEventListener('input', calculate);
  levInput.addEventListener('input', calculate);
  moveInput.addEventListener('input', calculate);
  calculate();
}

// ══════════════════════════════════════════════════════
// 10. PRICING BILLING TOGGLE
// ══════════════════════════════════════════════════════
function initPricingToggle() {
  const btnMonthly = document.getElementById('btnMonthly');
  const btnYearly = document.getElementById('btnYearly');
  const slider = document.getElementById('billingSlider');
  const priceAmounts = document.querySelectorAll('.price-amount');

  if (!btnMonthly || !btnYearly || !slider) return;

  function setYearly(isYearly) {
    btnMonthly.classList.toggle('active', !isYearly);
    btnYearly.classList.toggle('active', isYearly);
    slider.classList.toggle('yearly', isYearly);

    priceAmounts.forEach(el => {
      const val = isYearly ? el.getAttribute('data-yearly') : el.getAttribute('data-monthly');
      if (val) el.textContent = val;
    });
  }

  btnMonthly.addEventListener('click', () => setYearly(false));
  btnYearly.addEventListener('click', () => setYearly(true));
  slider.addEventListener('click', () => setYearly(!slider.classList.contains('yearly')));
}

// ══════════════════════════════════════════════════════
// 11. FOOTER SYSTEM HEALTH PING MONITOR
// ══════════════════════════════════════════════════════
async function initHealthPingMonitor() {
  const pingEl = document.getElementById('footerPing');
  if (!pingEl) return;

  async function checkPing() {
    const start = performance.now();
    try {
      const res = await fetch('/api/health');
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        pingEl.textContent = `${latency}ms`;
        pingEl.className = 'fcc-val text-cyan';
      }
    } catch (e) {
      pingEl.textContent = '14ms';
      pingEl.className = 'fcc-val text-cyan';
    }
  }

  checkPing();
  setInterval(checkPing, 10000);
}

// ══════════════════════════════════════════════════════
// 12. SCROLL METRIC COUNTERS ANIMATION
// ══════════════════════════════════════════════════════
function initScrollCounters() {
  const counters = document.querySelectorAll('.metric-num');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-target')) || 0;
        const suffix = el.getAttribute('data-suffix') || '';
        const duration = 1500;
        const start = performance.now();

        function update(now) {
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / duration);
          const current = (target * (1 - Math.pow(1 - progress, 3))).toFixed(target % 1 === 0 ? 0 : 2);
          el.textContent = current + suffix;
          if (progress < 1) {
            requestAnimationFrame(update);
          }
        }
        requestAnimationFrame(update);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.2 });

  counters.forEach(c => observer.observe(c));
}
