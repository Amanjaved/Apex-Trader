import os
import sys

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ai.copilot import fetch_realtime_news_impact
print("Testing fetch_realtime_news_impact...")
res = fetch_realtime_news_impact("BTCUSDT")
print("Result:", res)
