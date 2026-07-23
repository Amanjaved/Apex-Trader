import unittest
import math
from typing import List, Dict, Any
from backend.indicators.calculator import (
    calculate_sma, calculate_ema, calculate_bb, calculate_rsi,
    calculate_macd, calculate_atr, detect_swings, detect_fvg, detect_order_blocks
)
from backend.ai.copilot import AICopilot

class TestIndicators(unittest.TestCase):
    def setUp(self):
        # 30 standard test closes
        self.closes = [
            10.0, 11.0, 12.0, 11.0, 10.0, 9.0, 8.0, 9.0, 10.0, 11.0,
            12.0, 13.0, 14.0, 15.0, 14.0, 13.0, 12.0, 11.0, 12.0, 13.0,
            14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 19.0, 18.0, 17.0
        ]
        # 30 standard test candles
        self.candles = [
            {"t": i * 60000, "o": c - 0.5, "h": c + 1.0, "l": c - 1.0, "c": c, "v": 100.0}
            for i, c in enumerate(self.closes)
        ]

    def test_sma(self):
        # Normal SMA
        sma5 = calculate_sma(self.closes, 5)
        self.assertEqual(len(sma5), len(self.closes))
        # Initial values should fall back to closes
        self.assertEqual(sma5[0], 10.0)
        self.assertEqual(sma5[3], 11.0)
        # Check calculation for index >= period - 1
        expected_sma5_at_4 = (10.0 + 11.0 + 12.0 + 11.0 + 10.0) / 5
        self.assertAlmostEqual(sma5[4], expected_sma5_at_4)

        # Empty sma
        self.assertEqual(calculate_sma([], 5), [])

    def test_ema(self):
        ema5 = calculate_ema(self.closes, 5)
        self.assertEqual(len(ema5), len(self.closes))
        self.assertEqual(ema5[0], 10.0)
        
        # Check smoothing formula: out[i] = closes[i] * k + out[i-1] * (1-k)
        k = 2 / (5 + 1)
        expected_ema5_at_1 = self.closes[1] * k + self.closes[0] * (1 - k)
        self.assertAlmostEqual(ema5[1], expected_ema5_at_1)

        # Empty ema
        self.assertEqual(calculate_ema([], 5), [])

    def test_bb(self):
        bb = calculate_bb(self.closes, 5, 2.0)
        self.assertEqual(len(bb["upper"]), len(self.closes))
        self.assertEqual(len(bb["mid"]), len(self.closes))
        self.assertEqual(len(bb["lower"]), len(self.closes))
        
        # Initial values fallback to closes
        self.assertEqual(bb["mid"][0], 10.0)
        self.assertEqual(bb["upper"][0], 10.0)
        self.assertEqual(bb["lower"][0], 10.0)
        
        # Check standard calculation after period
        mid_val = sum(self.closes[:5]) / 5
        variance = sum((c - mid_val) ** 2 for c in self.closes[:5]) / 5
        sd = math.sqrt(variance)
        self.assertAlmostEqual(bb["mid"][4], mid_val)
        self.assertAlmostEqual(bb["upper"][4], mid_val + 2.0 * sd)
        self.assertAlmostEqual(bb["lower"][4], mid_val - 2.0 * sd)

    def test_rsi(self):
        rsi14 = calculate_rsi(self.closes, 14)
        self.assertEqual(len(rsi14), len(self.closes))
        # Initial values should be zero
        self.assertEqual(rsi14[0], 0.0)
        self.assertEqual(rsi14[13], 0.0)
        # 14th index is the first calculated
        self.assertNotEqual(rsi14[14], 0.0)
        
        # Empty/short closes
        self.assertEqual(calculate_rsi([], 14), [])
        self.assertEqual(calculate_rsi([10.0, 11.0], 14), [0.0, 0.0])

    def test_macd(self):
        macd = calculate_macd(self.closes, 12, 26, 9)
        self.assertEqual(len(macd["macd_line"]), len(self.closes))
        self.assertEqual(len(macd["sig_line"]), len(self.closes))
        self.assertEqual(len(macd["hist"]), len(self.closes))

    def test_atr(self):
        atr5 = calculate_atr(self.candles, 5)
        self.assertEqual(len(atr5), len(self.closes))
        self.assertEqual(atr5[0], 0.0)
        
        # Empty/short candles
        self.assertEqual(calculate_atr([], 5), [])
        self.assertEqual(calculate_atr(self.candles[:2], 5), [0.0, 0.0])

    def test_detect_swings(self):
        swings = detect_swings(self.candles, 3)
        self.assertIn("highs", swings)
        self.assertIn("lows", swings)
        
        # Verify pivot properties (local max/min)
        for h in swings["highs"]:
            idx = h["i"]
            self.assertTrue(all(self.candles[idx - j]["h"] <= h["price"] for j in range(1, 4)))
            self.assertTrue(all(self.candles[idx + j]["h"] <= h["price"] for j in range(1, 4)))

        for l in swings["lows"]:
            idx = l["i"]
            self.assertTrue(all(self.candles[idx - j]["l"] >= l["price"] for j in range(1, 4)))
            self.assertTrue(all(self.candles[idx + j]["l"] >= l["price"] for j in range(1, 4)))

    def test_detect_fvg(self):
        # Create a FVG in candles (next_l > prev_h)
        temp_candles = self.candles.copy()
        temp_candles[10] = {"t": 10000, "o": 10, "h": 12, "l": 9, "c": 11, "v": 10}
        temp_candles[11] = {"t": 11000, "o": 12, "h": 20, "l": 12, "c": 19, "v": 10}
        temp_candles[12] = {"t": 12000, "o": 19, "h": 21, "l": 15, "c": 18, "v": 10}
        # candle 11 is big impulse. next_c['l'] = 15 > prev_c['h'] = 12. FVG exists!
        fvg = detect_fvg(temp_candles)
        self.assertTrue(len(fvg["bullFVG"]) > 0)

    def test_detect_order_blocks(self):
        # Create order blocks patterns
        temp_candles = self.candles.copy()
        temp_candles[10] = {"t": 10000, "o": 12, "h": 13, "l": 9, "c": 10, "v": 10} # Bearish candle
        temp_candles[11] = {"t": 11000, "o": 10, "h": 15, "l": 10, "c": 14, "v": 10} # Bullish candle
        temp_candles[12] = {"t": 12000, "o": 14, "h": 18, "l": 13, "c": 17, "v": 10} # Bullish candle engulfing high of candle 10
        obs = detect_order_blocks(temp_candles)
        self.assertTrue(len(obs["bullOBs"]) > 0)

class TestAICopilot(unittest.TestCase):
    def test_empty_or_short_candles(self):
        # Ensure AICopilot doesn't crash on short or empty candle input
        copilot = AICopilot()
        # Mock services fetch calls to return empty array or short array
        import backend.services as services
        
        orig_fetch_candles = services.fetch_candles
        services.fetch_candles = lambda sym, iv, lim: "[]"
        
        try:
            res = copilot.analyze_market_structure("BTCUSDT", "1h")
            self.assertEqual(res["bias"], "NEUTRAL")
            self.assertEqual(res["score"], 0.0)
            self.assertEqual(res["levels"]["support"], [])
            self.assertEqual(res["levels"]["resistance"], [])
        finally:
            services.fetch_candles = orig_fetch_candles

    def test_smart_sr_returns(self):
        # Ensure AICopilot successfully returns support and resistance levels with scores, ranges, and correct labels.
        copilot = AICopilot()
        import backend.services as services
        import json
        import time
        
        now_ms = int(time.time() * 1000)
        closes = [55000.0] * 200
        
        # swing high at index 30
        closes[30] = 60000.0
        
        # swing low at index 60
        closes[60] = 48000.0
        
        # breakout to 65000
        for idx in range(70, 200):
            closes[idx] = 65000.0
            
        # retest of support at index 110
        closes[110] = 49000.0
        
        # swing low at index 120
        closes[120] = 64500.0
        
        # high/bearish block at 139 (price 70000)
        closes[139] = 70000.0
        
        for idx in range(141, 180):
            closes[idx] = 63000.0
            
        for idx in range(180, 200):
            closes[idx] = 66000.0
            
        candles = []
        for i in range(200):
            c_val = closes[i]
            o_val = c_val
            h_val = c_val + 50.0
            l_val = c_val - 50.0
            v_val = 1000.0
            
            # Prior sweepable low
            if i == 18:
                o_val, h_val, l_val, c_val = 55000.0, 55000.0, 50000.0, 51000.0
            elif i == 19:
                o_val, h_val, l_val, c_val = 51000.0, 52000.0, 48600.0, 49000.0
            elif i == 20:
                o_val, h_val, l_val, c_val = 49000.0, 54000.0, 48500.0, 54000.0
                
            # swing high at index 30:
            elif i == 29:
                o_val, h_val, l_val, c_val = 58000.0, 60000.0, 58000.0, 59500.0
            elif i == 30:
                o_val, h_val, l_val, c_val = 59500.0, 61000.0, 59000.0, 59000.0
                v_val = 5000.0
            elif i == 31:
                o_val, h_val, l_val, c_val = 59000.0, 59100.0, 57000.0, 57000.0
                
            # swing low at index 60:
            elif i == 58:
                o_val, h_val, l_val, c_val = 51000.0, 51500.0, 48000.0, 49000.0
                v_val = 5000.0
            elif i == 59:
                o_val, h_val, l_val, c_val = 49000.0, 52000.0, 48500.0, 52000.0
            elif i == 60:
                o_val, h_val, l_val, c_val = 52000.0, 54000.0, 51900.0, 54000.0
                
            # retest candle at index 110:
            elif i == 110:
                o_val, h_val, l_val, c_val = 55000.0, 55000.0, 48000.0, 53000.0
                
            # swing low at index 120:
            elif i == 119:
                o_val, h_val, l_val, c_val = 65000.0, 65200.0, 64600.0, 64600.0
            elif i == 120:
                o_val, h_val, l_val, c_val = 64600.0, 65000.0, 64400.0, 64800.0
                v_val = 5000.0
            elif i == 121:
                o_val, h_val, l_val, c_val = 64800.0, 65500.0, 64700.0, 65200.0
                
            # swing high at index 139 (70000):
            elif i == 136:
                o_val, h_val, l_val, c_val = 65000.0, 70000.0, 65000.0, 69500.0
                v_val = 5000.0
            elif i == 137:
                o_val, h_val, l_val, c_val = 69500.0, 69600.0, 68000.0, 68000.0
                v_val = 5000.0
            elif i == 138:
                o_val, h_val, l_val, c_val = 68000.0, 68100.0, 64000.0, 64000.0
                v_val = 5000.0
            elif i == 139:
                o_val, h_val, l_val, c_val = 64000.0, 70000.0, 64000.0, 69000.0
                v_val = 5000.0
            elif i == 140:
                o_val, h_val, l_val, c_val = 69000.0, 69100.0, 63000.0, 63000.0
                v_val = 5000.0
                
            candles.append([
                now_ms - (200 - i) * 60000,
                str(o_val), str(h_val), str(l_val), str(c_val), str(v_val)
            ])
        
        orig_fetch_candles = services.fetch_candles
        services.fetch_candles = lambda sym, iv, lim: json.dumps(candles)
        
        try:
            res = copilot.analyze_market_structure("BTCUSDT", "1d", min_score=4.0)
            self.assertIn("levels", res)
            self.assertIn("support", res["levels"])
            self.assertIn("resistance", res["levels"])
            
            # Verify we returned populated lists of support and resistance zones
            self.assertTrue(len(res["levels"]["support"]) > 0)
            self.assertTrue(len(res["levels"]["resistance"]) > 0)
            
            # Verify the levels format matches the upgrade specifications
            for s in res["levels"]["support"]:
                self.assertIn("price", s)
                self.assertIn("high", s)
                self.assertIn("low", s)
                self.assertIn("label", s)
                self.assertIn("score", s)
                self.assertTrue(0.0 <= s["score"] <= 100.0)
                
            for r in res["levels"]["resistance"]:
                self.assertIn("price", r)
                self.assertIn("high", r)
                self.assertIn("low", r)
                self.assertIn("label", r)
                self.assertIn("score", r)
                self.assertTrue(0.0 <= r["score"] <= 100.0)
        finally:
            services.fetch_candles = orig_fetch_candles

    def test_monte_carlo_normalization(self):
        copilot = AICopilot()
        import backend.services as services
        import json
        import time
        
        now_ms = int(time.time() * 1000)
        # Mock candles to create standard conditions
        closes = [60000.0] * 200
        candles = []
        for i, c_val in enumerate(closes):
            candles.append([
                now_ms - (200 - i) * 60000,
                str(c_val - 100), str(c_val + 100), str(c_val - 100), str(c_val), "1000.0"
            ])
            
        orig_fetch_candles = services.fetch_candles
        services.fetch_candles = lambda sym, iv, lim: json.dumps(candles)
        try:
            res = copilot.analyze_market_structure("BTCUSDT", "1h")
            mc = res.get("monteCarlo", {})
            self.assertIn("bull_breakout", mc)
            self.assertIn("ranging", mc)
            self.assertIn("bear_breakdown", mc)
            
            p_sum = int(mc["bull_breakout"]) + int(mc["ranging"]) + int(mc["bear_breakdown"])
            self.assertEqual(p_sum, 100)
        finally:
            services.fetch_candles = orig_fetch_candles

if __name__ == "__main__":
    unittest.main()
