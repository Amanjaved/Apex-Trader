// frontend/modules/api.js
/**
 * APEXTRADER API & DATA STREAM MODULE
 * Handles REST endpoints, WebSockets, and data freshness metadata.
 */

export async function fetchCoinsAPI() {
  try {
    const res = await fetch('/api/coins');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[API] Failed to fetch coins:', err);
    return [];
  }
}

export async function fetchAnalysisAPI(symbol = 'BTCUSDT', interval = '60') {
  try {
    const res = await fetch(`/api/ai/analysis?symbol=${symbol}&interval=${interval}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[API] Analysis fetch fallback:', err);
    return null;
  }
}

export async function fetchHealthAPI() {
  try {
    const res = await fetch('/api/health');
    return await res.json();
  } catch (err) {
    return { status: 'DEGRADED', latency_ms: 999 };
  }
}
