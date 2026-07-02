import { S, COINS, TF_MAP, saveState } from './state.js';
import { D } from './dom.js';
import { calculateSmartSR, IC } from '../indicators/indicators.js';
import { renderCoinList } from '../watchlist/watchlist.js';
import { renderNews, drawFngGauge, toast } from './settings.js';
import { checkAlerts } from '../alerts/alerts.js';
import { updateAI } from '../ai/ai.js';

let ws = null;
let wsKlineStream = null;
let wsDepthStream = null;
let wsReconnectTimer = null;
let wsReconnectDelay = 1000;
let backendWs = null;

const TICKER_STREAMS = Object.keys(COINS).map(s => `${s.toLowerCase()}@ticker`);

let queueRenderCallback = null;

export function registerApiRenderQueuer(qr) {
  queueRenderCallback = qr;
}

export function setStatus(txt, cls) {
  D.statusTxt.textContent = txt;
  D.statusDot.className = 'dot ' + cls;
}

function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export async function fetchCandles() {
  setStatus('Loading…', 'idle');
  S.candles = [];
  IC.clear();
  if (queueRenderCallback) queueRenderCallback();

  const sym = S.coin, tf = TF_MAP[S.tf];
  try {
    const r = await fetch(`/api/candles?symbol=${sym}&interval=${tf}&limit=500`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();
    if (raw.status === 'offline') { setStatus('Market data offline', 'err'); return; }
    if (S.coin !== sym || TF_MAP[S.tf] !== tf) return;
    S.candles = raw.map(k => ({ t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5] }));
    IC.clear();
    S.viewStart = Math.max(0, S.candles.length - 160);
    S.viewEnd   = S.candles.length;
    setStatus('Live — Binance', 'live');
    try { updateAI(); } catch(e) { console.error(e); }
    if (queueRenderCallback) queueRenderCallback();
  } catch(e) {
    setStatus('Error: ' + e.message, 'err');
    console.error('[fetchCandles]', e);
  }
}

export async function fetchOrderBook() {
  if (!S.showDepth) return;
  const sym = S.coin;
  try {
    const r = await fetch(`/api/orderbook?symbol=${sym}&limit=30`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (S.coin !== sym) return;
    S.orderBook = {
      bids: d.bids.map(b => [+b[0],+b[1]]),
      asks: d.asks.map(a => [+a[0],+a[1]])
    };
    if (queueRenderCallback) queueRenderCallback();
  } catch(e) { console.error('[fetchOrderBook]', e); }
}

let lastFetchTime = {};

export async function fetchSrCandles() {
  if (!S.overlays.smartSR) return;
  const sym = S.coin;
  const tfs = ["1m", "5m", "15m", "1h", "4h"];
  const now = Date.now();

  const promises = tfs.map(async tf => {
    const cacheKey = `${sym}_${tf}`;
    const tfMs = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000 }[tf];

    // Only refetch if cache is empty, or stale (time elapsed > tf time)
    if (!S.srCandlesMTF || !S.srCandlesMTF[tf] || !lastFetchTime[cacheKey] || (now - lastFetchTime[cacheKey] >= tfMs)) {
      try {
        const r = await fetch(`/api/candles?symbol=${sym}&interval=${tf}&limit=300`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        if (Array.isArray(raw)) {
          lastFetchTime[cacheKey] = now;
          return { tf, data: raw.map(k => ({ t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5] })) };
        }
      } catch (e) {
        console.error(`[fetchSrCandles] Error fetching ${tf}:`, e);
      }
    }
    return { tf, data: S.srCandlesMTF ? S.srCandlesMTF[tf] : [] };
  });

  try {
    const results = await Promise.all(promises);
    if (S.coin !== sym) return;

    if (!S.srCandlesMTF) S.srCandlesMTF = {};
    results.forEach(res => {
      if (res.data && res.data.length > 0) {
        S.srCandlesMTF[res.tf] = res.data;
      }
    });

    calculateSmartSR();
    if (queueRenderCallback) queueRenderCallback();
  } catch (e) {
    console.error('[fetchSrCandles] error:', e);
  }
}


export async function fetchCoinsList() {
  try {
    const r = await fetch('/api/coins');
    if (!r.ok) return;
    const data = await r.json();
    data.forEach(t => {
      if (t.symbol in COINS) S.tickerData[t.symbol] = t;
    });
    renderCoinList();
  } catch(e) { console.error('[fetchCoinsList]', e); }
}

export async function fetchFearGreed() {
  try {
    const r = await fetch('/api/feargreed');
    const d = await r.json();
    if (d.data && d.data[0]) {
      S.fng = { value: +d.data[0].value, label: d.data[0].value_classification };
      D.fngValue.textContent = S.fng.value;
      D.fngLabel.textContent = S.fng.label;
      drawFngGauge();
    }
  } catch(e) { /* fail silently */ }
}

export async function fetchNews() {
  try {
    const r = await fetch('/api/news');
    const d = await r.json();
    if (d.Data) { S.newsArticles = d.Data; renderNews(); }
  } catch(e) {
    D.newsList.innerHTML = '<div style="font-size:11px;color:var(--red)">News unavailable.</div>';
  }
}

export async function initData() {
  const overlay = D.chartLoadingOverlay;
  const loaderText = D.loaderText;

  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
  }

  if (loaderText) {
    loaderText.textContent = `Connecting to ${S.coin} Live Feed...`;
  }

  // 1. Connect to live WebSocket concurrently with HTTP data fetches
  connectWS();

  if (loaderText) {
    loaderText.textContent = `Fetching ${S.coin} market history...`;
  }

  // 2. Fetch critical and auxiliary data. We ONLY block the initial rendering on the primary
  // candles fetch (which is required to draw the chart). The auxiliary datasets (orderbook,
  // multi-timeframe S/R levels, news) are fetched in parallel and load progressively in the background.
  const candlesPromise = fetchCandles();
  const orderBookPromise = fetchOrderBook();
  const srCandlesPromise = fetchSrCandles();
  const newsPromise = fetchNews();

  await candlesPromise;

  if (loaderText) {
    loaderText.textContent = 'Synchronizing terminal...';
  }

  // 3. Block overlay fade-out until WebSocket connection is open and candles are populated
  let retries = 0;
  const maxRetries = 25; // 2.5 seconds max wait before fallback
  while (retries < maxRetries) {
    const wsConnected = ws && ws.readyState === WebSocket.OPEN;
    if (wsConnected && S.candles && S.candles.length > 0) {
      break;
    }
    await new Promise(r => setTimeout(r, 100));
    retries++;
  }

  // 4. Smoothly fade out the loading overlay
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 400); // matches the CSS transition time
  }
}

function wsSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

export function updateWSSubscriptions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const tgtKline = `${S.coin.toLowerCase()}@kline_${TF_MAP[S.tf]}`;
  const tgtDepth = S.showDepth ? `${S.coin.toLowerCase()}@depth20@100ms` : null;
  const unsub = [], sub = [];

  if (wsKlineStream !== tgtKline) {
    if (wsKlineStream) unsub.push(wsKlineStream);
    sub.push(tgtKline);
    wsKlineStream = tgtKline;
  }
  if (wsDepthStream !== tgtDepth) {
    if (wsDepthStream) unsub.push(wsDepthStream);
    if (tgtDepth)      sub.push(tgtDepth);
    wsDepthStream = tgtDepth;
  }
  if (unsub.length) wsSend({ method:'UNSUBSCRIBE', params:unsub, id:2 });
  if (sub.length)   wsSend({ method:'SUBSCRIBE',   params:sub,   id:3 });
}

export function connectBackendWS() {
  if (backendWs && (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING)) return;
  if (backendWs) { try { backendWs.close(); } catch(e) {} backendWs = null; }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Use host of frontend connection (e.g. localhost:8000)
  const host = window.location.host || 'localhost:8000';
  const url = `${protocol}//${host}/api/ws/ticks`;

  backendWs = new WebSocket(url);

  backendWs.onopen = () => {
    console.log('[Backend WS] Connected to paper trading tick sync');
  };

  backendWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "trade_closed") {
        toast(`Position closed: ${msg.side} ${msg.symbol} at $${msg.exit_price}. PnL: $${msg.pnl.toFixed(2)}`, 'info');
        window.dispatchEvent(new CustomEvent('demo-trade-update'));
      } else if (msg.type === "trade_opened") {
        toast(`Position opened: ${msg.side} ${msg.symbol} at $${msg.entry_price}`, 'info');
        window.dispatchEvent(new CustomEvent('demo-trade-update'));
      }
    } catch (ex) { /* ignore */ }
  };

  backendWs.onclose = () => {
    backendWs = null;
    setTimeout(connectBackendWS, 3000);
  };
}

export function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) { updateWSSubscriptions(); return; }
  if (ws) { ws.close(); ws = null; }

  setStatus('Connecting…', 'idle');
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

  ws = new WebSocket('wss://stream.binance.com:9443/stream');
  connectBackendWS();

  ws.onopen = () => {
    setStatus('Live — WebSocket', 'live');
    wsReconnectDelay = 1000;

    const params = [...TICKER_STREAMS];
    wsKlineStream = `${S.coin.toLowerCase()}@kline_${TF_MAP[S.tf]}`;
    params.push(wsKlineStream);

    if (S.showDepth) {
      wsDepthStream = `${S.coin.toLowerCase()}@depth20@100ms`;
      params.push(wsDepthStream);
    } else {
      wsDepthStream = null;
    }
    wsSend({ method:'SUBSCRIBE', params, id:1 });
  };

  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.result !== undefined) return;
      const { stream, data } = msg;
      if (!stream || !data) return;
      if (stream.endsWith('@ticker'))    onTickerMsg(data);
      else if (stream.includes('@kline_')) onKlineMsg(data);
      else if (stream.includes('@depth')) onDepthMsg(stream, data);
    } catch(ex) { /* discard malformed */ }
  };

  ws.onerror = () => {};
  ws.onclose = () => {
    ws = null; wsKlineStream = null; wsDepthStream = null;
    setStatus('Reconnecting…', 'err');
    wsReconnectTimer = setTimeout(() => {
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
      connectWS();
    }, wsReconnectDelay);
  };
}

function onTickerMsg(data) {
  const sym = data.s;
  S.tickerData[sym] = {
    ...(S.tickerData[sym] || {}),
    ...data,
    lastPrice: data.c ?? S.tickerData[sym]?.lastPrice,
    priceChange: data.p ?? S.tickerData[sym]?.priceChange,
    priceChangePercent: data.P ?? S.tickerData[sym]?.priceChangePercent,
    openPrice: data.o ?? S.tickerData[sym]?.openPrice,
  };
  if (D.coinDropdown.classList.contains('open')) {
    renderCoinList(D.coinSearch.value);
  }

  if (backendWs && backendWs.readyState === WebSocket.OPEN) {
    backendWs.send(JSON.stringify({
      type: 'ticker',
      symbol: sym,
      price: parseFloat(data.c)
    }));
  }

  if (sym === S.coin) {
    const price = parseFloat(data.c);
    const pct   = parseFloat(data.P);
    const chgV  = price - parseFloat(data.o);
    const prev  = parseFloat(D.priceVal.dataset.last || price);
    D.priceVal.dataset.last = price;
    D.priceVal.textContent  = fmtUSD(price);
    D.priceChg.textContent  = `${chgV>=0?'+':''}${fmtUSD(chgV)} (${pct>=0?'+':''}${pct.toFixed(2)}%)`;
    D.priceChg.className    = 'price-chg ' + (chgV>=0?'up':'dn');

    if (price > prev) {
      D.priceVal.className = 'price-val flash-up';
    } else if (price < prev) {
      D.priceVal.className = 'price-val flash-dn';
    }
    if (D.priceVal._ft) clearTimeout(D.priceVal._ft);
    D.priceVal._ft = setTimeout(()=>{ D.priceVal.className='price-val'; }, 350);

    document.title = `${fmtUSD(price)} | ${COINS[sym].sym}/USDT | ApexTrader Pro`;
    checkAlerts(price);
  }
}

function onKlineMsg(data) {
  const k = data.k;
  if (k.s !== S.coin) return;
  const c = { t:k.t, o:+k.o, h:+k.h, l:+k.l, c:+k.c, v:+k.v };
  if (!S.candles.length) return;

  const last = S.candles[S.candles.length - 1];
  if (last.t === c.t) {
    S.candles[S.candles.length - 1] = c;
  } else {
    S.candles.push(c);
    if (S.candles.length > 1000) {
      S.candles.shift();
      S.viewStart = Math.max(0, S.viewStart - 1);
      S.viewEnd   = Math.max(0, S.viewEnd   - 1);
    }
    const atEnd = S.viewEnd >= S.candles.length - 1;
    S.viewEnd = S.candles.length;
    if (atEnd) S.viewStart = Math.max(0, S.viewStart + 1);
  }
  IC.clear();
  try { updateAI(); } catch(e) { console.error(e); }
  if (k.x) {
    fetchSrCandles();
  }
  if (queueRenderCallback) queueRenderCallback();
}

function onDepthMsg(stream, data) {
  if (!S.showDepth) return;
  const expected = `${S.coin.toLowerCase()}@depth20@100ms`;
  if (stream !== expected) return;
  S.orderBook = {
    bids: data.bids.map(b=>[+b[0],+b[1]]),
    asks: data.asks.map(a=>[+a[0],+a[1]])
  };
  if (queueRenderCallback) queueRenderCallback();
}
