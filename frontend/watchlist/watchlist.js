import { S, COINS, saveState } from '../settings/state.js';
import { D } from '../settings/dom.js';

function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Global hook to invoke initData when coin changes
let initDataCallback = null;
export function registerWatchlistInitDataCallback(cb) {
  initDataCallback = cb;
}

export function renderCoinList(filter = '') {
  D.coinList.innerHTML = '';
  Object.entries(COINS).forEach(([sym, info]) => {
    if (filter && !info.name.toLowerCase().includes(filter.toLowerCase()) &&
                  !info.sym.toLowerCase().includes(filter.toLowerCase())) return;
    const t = S.tickerData[sym] || {};
    const rawPrice = t.lastPrice ?? t.c;
    const rawPct   = t.priceChangePercent ?? t.P;
    const hasPrice = rawPrice !== undefined && rawPrice !== null && rawPrice !== '' && Number.isFinite(+rawPrice);
    const hasPct   = rawPct !== undefined && rawPct !== null && rawPct !== '' && Number.isFinite(+rawPct);
    const price = hasPrice ? fmtUSD(+rawPrice) : '—';
    const pct   = hasPct ? (+rawPct).toFixed(2) : null;
    const up    = pct !== null && +pct >= 0;
    const div = document.createElement('div');
    div.className = 'coin-item' + (sym === S.coin ? ' active' : '');
    div.innerHTML = `
      <span class="ci-icon">${info.icon}</span>
      <span class="ci-name">${info.sym}/USDT</span>
      <span class="ci-price">${price}</span>
      <span class="ci-chg ${up?'up':'dn'}">${pct !== null ? (up?'+':'')+pct+'%' : '—'}</span>`;
    div.addEventListener('click', () => {
      S.coin = sym;
      D.symIcon.textContent = info.icon;
      D.symName.textContent = `${info.sym}/USDT`;
      D.coinDropdown.classList.remove('open');
      D.symBtn.classList.remove('open');
      D.symChev.textContent = '▼';
      saveState();
      if (initDataCallback) initDataCallback();
      renderCoinList();
    });
    D.coinList.appendChild(div);
  });
}

export function initWatchlist() {
  D.symBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = D.coinDropdown.classList.toggle('open');
    D.symBtn.classList.toggle('open', open);
    D.symChev.textContent = open ? '▲' : '▼';
    // Close other dropdowns
    document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.dd-trigger.open').forEach(t => t.classList.remove('open'));
    if (open) { D.coinSearch.focus(); renderCoinList(); }
  });
  D.coinSearch.addEventListener('input', () => renderCoinList(D.coinSearch.value));
}
