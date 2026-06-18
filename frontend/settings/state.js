import { D } from './dom.js';

// ─────────────────────────────────────────────
//  COIN REGISTRY
// ─────────────────────────────────────────────
export const COINS = {
  BTCUSDT:  { name:'Bitcoin',     sym:'BTC',  icon:'₿',  dec:2 },
  ETHUSDT:  { name:'Ethereum',    sym:'ETH',  icon:'Ξ',  dec:2 },
  SOLUSDT:  { name:'Solana',      sym:'SOL',  icon:'◎',  dec:3 },
  BNBUSDT:  { name:'Binance Coin',sym:'BNB',  icon:'🔶', dec:2 },
  XRPUSDT:  { name:'Ripple',      sym:'XRP',  icon:'✕',  dec:4 },
  ADAUSDT:  { name:'Cardano',     sym:'ADA',  icon:'₳',  dec:4 },
  DOGEUSDT: { name:'Dogecoin',    sym:'DOGE', icon:'Ð',  dec:5 },
  AVAXUSDT: { name:'Avalanche',   sym:'AVAX', icon:'🔺', dec:3 },
  DOTUSDT:  { name:'Polkadot',    sym:'DOT',  icon:'●',  dec:3 },
  MATICUSDT:{ name:'Polygon',     sym:'MATIC',icon:'⬡',  dec:4 },
};

export const TF_MAP = {
  1:'1m', 3:'3m', 5:'5m', 15:'15m', 30:'30m',
  60:'1h', 120:'2h', 240:'4h', 1440:'1d', 10080:'1w'
};

// ─────────────────────────────────────────────
//  GLOBAL STATE — Single Source of Truth
// ─────────────────────────────────────────────
export const S = {
  // Chart data
  candles:     [],          // [{t,o,h,l,c,v}, …]
  srCandles:   [],
  tickerData:  {},

  // View state
  coin:        'BTCUSDT',
  tf:          '60',        // minutes
  mode:        'candle',    // candle|heikin|line|area|bar
  theme:       'dark',

  // Viewport (index-based)
  viewStart:   0,
  viewEnd:     0,

  // Feature flags
  overlays:    { ema:true, sma:false, bb:true, vwap:false, ichimoku:false,
                 smartSR:false, orderBlocks:false, fvg:false, marketStructure:false },
  subs:        { vol:true, rsi:true, macd:false, stoch:false, obv:false },
  msFlags:     { bos:true, choch:true, hh:false, ll:false, eqhl:false, sweeps:false },
  showDepth:   false,
  sidebarOpen: true,
  srTf:        '1440',

  // UI
  drawTool:       'none',
  currentDrawing: null,
  drawings:       [],
  alerts:         [],
  events:         [],
  hoverIdx:       -1,
  isPanning:      false,
  panStartX:      0,
  panStartView:   0,

  // S/R
  srLevels: { support:[], resistance:[], demand:[], supply:[] },

  // Live data
  orderBook: { bids:[], asks:[] },
  fng:       { value:50, label:'Neutral' },
  newsArticles: [],

  // Candle colors (user-configurable)
  bullColor: '#26a69a',
  bearColor: '#ef5350',

  // Layout cache (set by drawMainChart each frame)
  layout: null,
};

// ─────────────────────────────────────────────
//  DYNAMIC CSS COLOR RETRIEVERS
// ─────────────────────────────────────────────
export function var_cyan()   { return S.theme === 'dark' ? '#00d4ff' : '#2563eb'; }
export function var_green()  { return S.theme === 'dark' ? '#00ff88' : '#059669'; }
export function var_red()    { return S.theme === 'dark' ? '#ff3366' : '#dc2626'; }
export function var_amber()  { return S.theme === 'dark' ? '#ffaa00' : '#d97706'; }
export function var_purple() { return '#8b5cf6'; }
export function var_text()   { return S.theme === 'dark' ? '#e6edf3' : '#111827'; }
export function var_text3()  { return S.theme === 'dark' ? '#6e7681' : '#9ca3af'; }
export function var_grid()   { return S.theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'; }
export function var_bg()     { return S.theme === 'dark' ? '#0d1117' : '#ffffff'; }
export function var_blue_hex() { return '#3b82f6'; }

// ─────────────────────────────────────────────
//  STATE PERSISTENCE — localStorage
// ─────────────────────────────────────────────
export function saveState() {
  try {
    localStorage.setItem('apex_pro_state', JSON.stringify({
      coin: S.coin, tf: S.tf, mode: S.mode, theme: S.theme,
      overlays: S.overlays, subs: S.subs, srTf: S.srTf,
      showDepth: S.showDepth, sidebarOpen: S.sidebarOpen,
      alerts: S.alerts, drawings: S.drawings,
      bullColor: S.bullColor, bearColor: S.bearColor,
      settings: {
        emaFast: D.inpEmaFast.value, emaSlow: D.inpEmaSlow.value,
        sma: D.inpSmaPeriod.value, bbP: D.inpBbPeriod.value,
        bbS: D.inpBbStd.value, rsi: D.inpRsiPeriod.value,
        macdF: D.inpMacdFast.value, macdS: D.inpMacdSlow.value,
        macdSig: D.inpMacdSig.value
      }
    }));
  } catch(e) {
    console.error('[saveState]', e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem('apex_pro_state');
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.coin && p.coin in COINS) S.coin = p.coin;
    if (p.tf)  S.tf   = p.tf;
    if (p.mode) S.mode = p.mode;
    if (p.theme) S.theme = p.theme;
    if (p.overlays) Object.assign(S.overlays, p.overlays);
    if (p.subs)     Object.assign(S.subs,     p.subs);
    if (p.srTf)     S.srTf = p.srTf;
    if (p.showDepth !== undefined) S.showDepth    = p.showDepth;
    if (p.sidebarOpen !== undefined) S.sidebarOpen = p.sidebarOpen;
    if (p.alerts)   S.alerts   = p.alerts;
    if (p.drawings) S.drawings = p.drawings;
    if (p.bullColor) S.bullColor = p.bullColor;
    if (p.bearColor) S.bearColor = p.bearColor;
    if (p.settings) {
      const s = p.settings;
      if (s.emaFast) D.inpEmaFast.value  = s.emaFast;
      if (s.emaSlow) D.inpEmaSlow.value  = s.emaSlow;
      if (s.sma)     D.inpSmaPeriod.value = s.sma;
      if (s.bbP)     D.inpBbPeriod.value  = s.bbP;
      if (s.bbS)     D.inpBbStd.value     = s.bbS;
      if (s.rsi)     D.inpRsiPeriod.value  = s.rsi;
      if (s.macdF)   D.inpMacdFast.value  = s.macdF;
      if (s.macdS)   D.inpMacdSlow.value  = s.macdS;
      if (s.macdSig) D.inpMacdSig.value   = s.macdSig;
    }
  } catch(e) {
    console.warn('[loadState]', e);
  }
}
