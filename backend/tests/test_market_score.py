import unittest
import os
import sys
import json

# Ensure backend package context can be resolved
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.market_score import MarketScoreEngine

class TestMarketScore(unittest.TestCase):
    def setUp(self):
        from backend.services.market_score import _score_cache, _score_cache_lock
        with _score_cache_lock:
            _score_cache.clear()
        # Default mock data to prevent any network calls
        self.mock_data = {
            "candles": [{"t": 1700000000 + i*3600, "o": 60000.0, "h": 61000.0, "l": 59000.0, "c": 60500.0, "v": 100.0, "taker_buy_base": 55.0} for i in range(100)],
            "orderbook": {
                "bids": [[60400.0 - i, 2.0] for i in range(50)],
                "asks": [[60600.0 + i, 2.0] for i in range(50)],
            },
            "fear_greed": 55.0,
            "futures_funding": 0.0001,
            "futures_oi": 100000.0,
            "futures_long_short": 1.2,
            "futures_price": 60550.0,
            "futures_liquidations": [],
            "btc_dominance": 52.0,
            "eth_dominance": 18.0,
            "stablecoin_dominance": 10.0,
            "dxy_price": 101.5,
            "gold_price": 2300.0,
            "mining_difficulty_change": 1.5,
            "hashrate_change_pct": 2.3,
            "etf_net_flow": 150.0,
            "deribit_pcr": 0.8,
            "fed_funds_rate": 5.25,
            "bond_yield_10y": 4.5,
        }
        self.mock_nlp = {
            "government_regulations": 60.0,
            "etf_approval": 75.0,
            "exchange_hacks": 50.0,
            "exchange_listings": 65.0,
            "security_vulnerabilities": 50.0,
            "country_adoption": 55.0,
            "tax_policies": 50.0,
            "major_partnerships": 70.0,
            "reddit_sentiment": 65.0
        }

    def test_baseline_core(self):
        engine = MarketScoreEngine()
        # Mock gatherer to prevent network requests
        engine._gather_market_data = lambda symbol, interval: self.mock_data
        engine._run_news_sentiment_analysis = lambda: self.mock_nlp
        
        # Mock calculations to return Unavailable to test core baseline math
        engine._calculate_sub_factor = lambda cat_id, sf_name, symbol, interval, data: (None, "Unavailable", "Unavailable")
        res = engine.compute_score("BTCUSDT", "1h")
        
        self.assertEqual(res["final_score"], 50.0)
        self.assertEqual(res["signal"], "Neutral")
        self.assertEqual(res["data_coverage_pct"], 0.0)
        
        # Verify schema
        self.assertIn("categories", res)
        self.assertEqual(len(res["categories"]), 12)
        for cat in res["categories"]:
            self.assertIsNone(cat["score"])
            for sf in cat["sub_factors"]:
                self.assertEqual(sf["status"], "Unavailable")
                self.assertIsNone(sf["raw_value"])
                self.assertIsNone(sf["normalized_score"])

    def test_live_tier1_and_tier2(self):
        engine = MarketScoreEngine()
        # Mock gatherer to prevent network requests
        engine._gather_market_data = lambda symbol, interval: self.mock_data
        engine._run_news_sentiment_analysis = lambda: self.mock_nlp
        res = engine.compute_score("BTCUSDT", "1h")
        
        # Confirm that live data coverage is high (exceeds 80% due to cascades)
        self.assertGreaterEqual(res["data_coverage_pct"], 80.0)
        
        # Verify that score calculations produce sane outputs
        self.assertGreaterEqual(res["final_score"], 0.0)
        self.assertLessEqual(res["final_score"], 100.0)
        
        # Check that we have a valid signal
        self.assertIn(res["signal"], ["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"])
        
        # Verify that some sub-factors are now "Live"
        live_factors = []
        for cat in res["categories"]:
            for sf in cat["sub_factors"]:
                if sf["status"] == "Live":
                    live_factors.append(sf)
                    self.assertIsNotNone(sf["raw_value"])
                    self.assertIsNotNone(sf["normalized_score"])
        
        # We should have a significant number of live factors (45+)
        self.assertGreaterEqual(len(live_factors), 45)

if __name__ == "__main__":
    unittest.main()
