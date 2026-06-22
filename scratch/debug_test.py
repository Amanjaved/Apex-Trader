import json
import time
from backend.ai.copilot import AICopilot
import backend.services as services

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
    
    # swing high at index 30:
    if i == 29:
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
        o_val, h_val, l_val, c_val = 55000.0, 55000.0, 48500.0, 53000.0
        
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

copilot = AICopilot()

# Print the scored zones internally
def analyze_override(self, symbol, interval):
    # Just to inspect the logic locally
    pass

res = copilot.analyze_market_structure("BTCUSDT", "1h", calculate_matrix=False)

import pprint
pprint.pprint(res["levels"])
