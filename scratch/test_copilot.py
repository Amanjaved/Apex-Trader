import sys
import json
from backend.ai.copilot import AICopilot

# Set mock or load environment if needed
sys.stdout.reconfigure(encoding='utf-8')

copilot = AICopilot()
res = copilot.analyze_market_structure("BTCUSDT", "1h", calculate_matrix=False)

print("Confidence Breakdown:")
print(json.dumps(res.get("confidenceBreakdown"), indent=2))

print("\nExplanation Grouping:")
print(json.dumps(res.get("explanationGrouping"), indent=2))
