import json
import time
import sys
sys.path.append('d:/Delta Api/BTC/Chart')
import backend.services as services
from backend.ai.copilot import AICopilot

# Set up mock candles exactly like the test
now_ms = int(time.time() * 1000)
closes = [55000.0] * 200
closes[30] = 60000.0
closes[60] = 48000.0
for idx in range(70, 200): closes[idx] = 65000.0
closes[110] = 49000.0
closes[120] = 64500.0
closes[139] = 70000.0
for idx in range(141, 180): closes[idx] = 63000.0
for idx in range(180, 200): closes[idx] = 66000.0

candles = []
for i in range(200):
    c_val = closes[i]
    o_val, h_val, l_val, v_val = c_val, c_val + 50.0, c_val - 50.0, 1000.0
    if i == 29: o_val, h_val, l_val, c_val = 58000.0, 60000.0, 58000.0, 59500.0
    elif i == 30: o_val, h_val, l_val, c_val, v_val = 59500.0, 61000.0, 59000.0, 59000.0, 5000.0
    elif i == 31: o_val, h_val, l_val, c_val = 59000.0, 59100.0, 57000.0, 57000.0
    elif i == 58: o_val, h_val, l_val, c_val, v_val = 51000.0, 51500.0, 48000.0, 49000.0, 5000.0
    elif i == 59: o_val, h_val, l_val, c_val = 49000.0, 52000.0, 48500.0, 52000.0
    elif i == 60: o_val, h_val, l_val, c_val = 52000.0, 54000.0, 51900.0, 54000.0
    elif i == 110: o_val, h_val, l_val, c_val = 55000.0, 55000.0, 48000.0, 53000.0
    elif i == 119: o_val, h_val, l_val, c_val = 65000.0, 65200.0, 64600.0, 64600.0
    elif i == 120: o_val, h_val, l_val, c_val, v_val = 64600.0, 65000.0, 64400.0, 64800.0, 5000.0
    elif i == 121: o_val, h_val, l_val, c_val = 64800.0, 65500.0, 64700.0, 65200.0
    elif i == 136: o_val, h_val, l_val, c_val, v_val = 65000.0, 70000.0, 65000.0, 69500.0, 5000.0
    elif i == 137: o_val, h_val, l_val, c_val, v_val = 69500.0, 69600.0, 68000.0, 68000.0, 5000.0
    elif i == 138: o_val, h_val, l_val, c_val, v_val = 68000.0, 68100.0, 64000.0, 64000.0, 5000.0
    elif i == 139: o_val, h_val, l_val, c_val, v_val = 64000.0, 70000.0, 64000.0, 69000.0, 5000.0
    elif i == 140: o_val, h_val, l_val, c_val, v_val = 69000.0, 69100.0, 63000.0, 63000.0, 5000.0
    candles.append([now_ms - (200 - i) * 60000, str(o_val), str(h_val), str(l_val), str(c_val), str(v_val)])

orig_fetch_candles = services.fetch_candles
services.fetch_candles = lambda sym, iv, lim: json.dumps(candles)

copilot = AICopilot()

res = copilot.analyze_market_structure('BTCUSDT', '1h', False)
print('Support:', res['levels']['support'])
