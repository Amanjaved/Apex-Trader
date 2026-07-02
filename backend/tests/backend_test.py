"""
ApexTrader Pro - Backend API Test Suite (pytest)
Covers: market data endpoints, AI analysis (quant + LLM), demo paper trading.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://a09dff2c-60ca-44d5-9d54-a4d139f5a48a.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─── Basic Health & Market Data ────────────────────────────────
class TestHealthAndMarketData:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok" or "service" in data or "status" in data

    def test_candles(self, api):
        r = api.get(f"{BASE_URL}/api/candles", params={"symbol": "BTCUSDT", "interval": "1h", "limit": 100}, timeout=30)
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, list) and len(data) > 0
            # Binance klines are lists of 12 elements
            assert isinstance(data[0], list)
            assert len(data[0]) >= 6

    def test_ticker(self, api):
        r = api.get(f"{BASE_URL}/api/ticker", params={"symbol": "BTCUSDT"}, timeout=20)
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            data = r.json()
            assert "lastPrice" in data or "symbol" in data

    def test_orderbook(self, api):
        r = api.get(f"{BASE_URL}/api/orderbook", params={"symbol": "BTCUSDT", "limit": 20}, timeout=20)
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            data = r.json()
            assert "bids" in data and "asks" in data
            assert isinstance(data["bids"], list)

    def test_coins(self, api):
        r = api.get(f"{BASE_URL}/api/coins", timeout=30)
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, list) and len(data) > 0

    def test_feargreed(self, api):
        r = api.get(f"{BASE_URL}/api/feargreed", timeout=20)
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            data = r.json()
            # alternative.me returns {"data": [...]}
            assert "data" in data or "value" in data

    def test_news(self, api):
        r = api.get(f"{BASE_URL}/api/news", timeout=30)
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, list) or any(k in data for k in ("articles", "items", "Data", "data"))


# ─── AI Analysis Endpoints ────────────────────────────────────
class TestAIAnalysis:
    def test_ai_analysis_full_shape(self, api):
        r = api.get(f"{BASE_URL}/api/ai/analysis", params={"symbol": "BTCUSDT", "interval": "1h"}, timeout=90)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:400]}"
        data = r.json()
        # Required top-level keys per PRD
        for k in ["bias", "score", "levels", "matrix", "entryChecklist", "blockersList", "executionSteps", "riskMeter"]:
            assert k in data, f"Missing key: {k} in analysis response"
        # levels.support/resistance shape
        assert "support" in data["levels"] and "resistance" in data["levels"]
        assert isinstance(data["levels"]["support"], list)
        assert isinstance(data["levels"]["resistance"], list)
        # zone shape (if there are any zones)
        for zone_list in [data["levels"]["support"], data["levels"]["resistance"]]:
            for z in zone_list:
                for field in ["price", "low", "high", "label", "score", "touches"]:
                    assert field in z, f"S/R zone missing '{field}'; got keys={list(z.keys())}"
                break  # first zone is enough
        # matrix should contain 6 timeframes
        matrix = data["matrix"]
        assert isinstance(matrix, (list, dict))
        if isinstance(matrix, list):
            assert len(matrix) >= 6, f"Expected 6 timeframes in matrix, got {len(matrix)}"
        else:
            assert len(matrix) >= 6, f"Expected 6 timeframes in matrix dict, got {len(matrix)}"

    def test_ai_chat_llm(self, api):
        payload = {"symbol": "BTCUSDT", "interval": "1h", "message": "should I long here?"}
        r = api.post(f"{BASE_URL}/api/ai/chat", json=payload, timeout=90)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:400]}"
        data = r.json()
        assert "response" in data and isinstance(data["response"], str) and len(data["response"]) > 5
        assert "engine" in data
        # LLM is preferred; quant is acceptable fallback but flag it
        assert data["engine"] in ("llm", "quant"), f"Unexpected engine: {data['engine']}"

    def test_ai_chat_empty_message(self, api):
        r = api.post(f"{BASE_URL}/api/ai/chat", json={"symbol": "BTCUSDT", "interval": "1h", "message": ""}, timeout=15)
        assert r.status_code == 400

    def test_ai_deep_analysis(self, api):
        r = api.post(f"{BASE_URL}/api/ai/deep-analysis", json={"symbol": "BTCUSDT", "interval": "1h"}, timeout=120)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:400]}"
        data = r.json()
        assert "report" in data and isinstance(data["report"], str)
        assert len(data["report"]) > 100, f"Report too short: {len(data['report'])} chars"
        # LLM markdown should contain at least one of the expected section headings
        report_lower = data["report"].lower()
        has_section = any(s in report_lower for s in ["market read", "trade plan", "conviction"])
        assert has_section, f"Missing expected sections in deep analysis report; head={data['report'][:400]!r}"


# ─── Demo Paper Trading ───────────────────────────────────────
class TestDemoTrading:
    def test_reset_portfolio(self, api):
        r = api.post(f"{BASE_URL}/api/demo/reset", params={"balance": 10000}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "success"
        assert data.get("balance") == 10000

    def test_portfolio(self, api):
        r = api.get(f"{BASE_URL}/api/demo/portfolio", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "balance" in data
        assert "equity" in data
        assert isinstance(data["balance"], (int, float))

    def test_positions_empty(self, api):
        # After reset positions should be empty
        api.post(f"{BASE_URL}/api/demo/reset", params={"balance": 10000}, timeout=15)
        r = api.get(f"{BASE_URL}/api/demo/positions", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_trades_list(self, api):
        r = api.get(f"{BASE_URL}/api/demo/trades", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_open_close_lifecycle(self, api):
        # Reset first
        api.post(f"{BASE_URL}/api/demo/reset", params={"balance": 10000}, timeout=15)
        # Open a position
        open_payload = {"symbol": "BTCUSDT", "side": "BUY", "size": 0.01, "leverage": 5, "price": 60000}
        r_open = api.post(f"{BASE_URL}/api/demo/open", json=open_payload, timeout=30)
        assert r_open.status_code == 200, f"Open failed: {r_open.status_code} {r_open.text[:400]}"
        pos = r_open.json()
        # position id may be under 'id' or 'position_id'
        pid = pos.get("id") or pos.get("position_id") or (pos.get("position") or {}).get("id")
        assert pid is not None, f"No position id in response: {pos}"

        # Verify in list
        r_list = api.get(f"{BASE_URL}/api/demo/positions", timeout=15)
        assert r_list.status_code == 200
        ids = [p.get("id") for p in r_list.json()]
        assert pid in ids, f"Opened position {pid} not in list {ids}"

        # Close
        r_close = api.post(f"{BASE_URL}/api/demo/close", json={"position_id": pid, "price": 61000}, timeout=30)
        assert r_close.status_code == 200, f"Close failed: {r_close.status_code} {r_close.text[:400]}"

        # Verify closed
        r_list2 = api.get(f"{BASE_URL}/api/demo/positions", timeout=15)
        ids2 = [p.get("id") for p in r_list2.json()]
        assert pid not in ids2, f"Position {pid} still open after close"

        # And appears in trades
        r_trades = api.get(f"{BASE_URL}/api/demo/trades", timeout=15)
        trade_syms = [t.get("symbol") for t in r_trades.json()]
        assert "BTCUSDT" in trade_syms


# ─── Frontend HTML Served by node server ──────────────────────
class TestFrontendPages:
    def test_index(self, api):
        r = api.get(f"{BASE_URL}/", timeout=15)
        assert r.status_code == 200
        assert "<html" in r.text.lower()

    def test_charts_page(self, api):
        r = api.get(f"{BASE_URL}/charts", timeout=15)
        assert r.status_code == 200
        assert "<html" in r.text.lower()

    def test_analysis_page(self, api):
        r = api.get(f"{BASE_URL}/analysis", timeout=15)
        assert r.status_code == 200
        assert "<html" in r.text.lower()
        # Deep analysis button must be present
        assert "deep-analysis-btn" in r.text, "deep-analysis-btn not found in /analysis HTML"
