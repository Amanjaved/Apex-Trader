import { S, COINS, saveState } from '../settings/state.js';
import { D } from '../settings/dom.js';

// Global toast helper wrapper
function toast(msg, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  D.toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, duration);
}

function fmtUSD(p) {
  const n = Math.abs(p);
  const dec = n < 0.01 ? 6 : n < 1 ? 4 : n < 10 ? 3 : 2;
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function addAlert(price) {
  if (!price || isNaN(price) || price <= 0) return;
  const cur = S.candles.length ? S.candles[S.candles.length-1].c : 0;
  S.alerts.push({ price, dir: price > cur ? 'above' : 'below', triggered: false });
  saveState(); renderAlertList();
  toast(`Alert set at ${fmtUSD(price)}`, 'success');
}

export function checkAlerts(price) {
  let changed = false;
  S.alerts.forEach(a => {
    if (a.triggered) return;
    if ((a.dir==='above' && price >= a.price) || (a.dir==='below' && price <= a.price)) {
      a.triggered = true; changed = true;
      toast(`🔔 Alert: ${COINS[S.coin].sym} hit ${fmtUSD(a.price)}`, 'warn');
      if (Notification.permission === 'granted')
        new Notification('ApexTrader Pro', { body: `${COINS[S.coin].sym} reached ${fmtUSD(a.price)}` });
    }
  });
  if (changed) { saveState(); renderAlertList(); }
}

export function renderAlertList() {
  D.alertList.innerHTML = '';
  if (!S.alerts.length) {
    D.alertList.innerHTML = '<div style="font-size:11px;color:var(--text-3)">No alerts set.</div>';
    return;
  }
  S.alerts.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'alert-item' + (a.triggered ? ' triggered' : '');
    el.innerHTML = `<div><div style="font-family:var(--mono);font-size:11px;font-weight:600">${fmtUSD(a.price)}</div>
      <div style="font-size:9px;color:var(--text-3)">${a.dir==='above'?'▲ above':'▼ below'}${a.triggered?' · Triggered':''}</div></div>
      <button class="alert-del" data-index="${i}">✕</button>`;
    D.alertList.appendChild(el);
  });
}

// Event delegation for alert deletion
export function initAlerts() {
  D.alertList.addEventListener('click', e => {
    const btn = e.target.closest('.alert-del');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index);
    if (!isNaN(idx)) {
      S.alerts.splice(idx, 1);
      saveState();
      renderAlertList();
    }
  });

  // Attach legacy window method just in case
  window.removeAlert = i => {
    S.alerts.splice(i, 1);
    saveState();
    renderAlertList();
  };

  D.btnAlertAdd.addEventListener('click', () => {
    addAlert(parseFloat(D.alertPrice.value));
    D.alertPrice.value = '';
  });
  D.alertPrice.addEventListener('keydown', e => { if (e.key==='Enter') D.btnAlertAdd.click(); });
}
