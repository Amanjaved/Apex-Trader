import sys
import unittest
from unittest.mock import patch, MagicMock

# Set path and system encoding
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('.')

class TestAICopilotBackend(unittest.TestCase):
    @patch('backend.services.market_score.MarketScoreEngine.compute_score')
    @patch('openai.resources.chat.completions.Completions.create')
    def test_copilot_response(self, mock_chat_create, mock_compute):
        # Setup mock market score data
        mock_compute.return_value = {
            "final_score": 72.5,
            "categories": [
                {
                    "name": "Supply & Demand",
                    "score": 80.0,
                    "sub_factors": [
                        {"name": "Whale Accumulation", "raw_value": "Bullish", "normalized_score": 80.0, "status": "Live", "tier": "Proxy"}
                    ]
                }
            ]
        }
        
        # Setup mock OpenAI chat completion
        mock_completion = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        mock_message.content = (
            "<header_summary>BTC remains bullish at 72% conviction; prepare for triggers.</header_summary>\n"
            "### **Executive Summary & Bias**\n"
            "Bullish.\n"
            "### **Trading Plan Guidance**\n"
            "Entry range near 64000."
        )
        mock_choice.message = mock_message
        mock_completion.choices = [mock_choice]
        mock_chat_create.return_value = mock_completion
        
        from backend.ai.copilot import AICopilot
        copilot = AICopilot()
        
        res = copilot.analyze_market_structure("BTCUSDT", "1h", calculate_matrix=False)
        
        print("Confidence Score:", res.get("score"))
        print("Consensus Bias:", res.get("bias"))
        print("Win Probability by Strategy (EMA):", res.get("winProbs", {}).get("ema"))
        print("Invalidation Levels:", res.get("invalidationLevels"))
        print("Explanation Grouping (Primary):", [x["name"] for x in res.get("explanationGrouping", {}).get("primary", [])])
        print("Explanation Grouping (Secondary):", [x["name"] for x in res.get("explanationGrouping", {}).get("secondary", [])])
        print("Monte Carlo Probabilities:", res.get("monteCarlo"))
        print("Hidden Divergence:", res.get("hiddenDivergence"))
        print("Conflict Detector:", res.get("conflictDetector"))
        print("Liquidity Trap Detector:", res.get("liquidityTrap"))
        print("Market Score:", res.get("marketScore"))
        
        self.assertTrue(10 <= res.get("score") <= 100)
        self.assertIn("bias", res)
        self.assertIn("invalidationLevels", res)
        self.assertIn("bull_invalidation", res.get("invalidationLevels"))
        self.assertIn("bear_invalidation", res.get("invalidationLevels"))
        self.assertIn("monteCarlo", res)
        self.assertIn("hiddenDivergence", res)
        self.assertIn("conflictDetector", res)
        self.assertIn("liquidityTrap", res)
        self.assertIn("marketScore", res)
            
if __name__ == '__main__':
    unittest.main()
