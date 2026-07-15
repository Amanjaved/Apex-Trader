import urllib.request
import json
import ssl

context = ssl._create_unverified_context()
url = "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=365d&interval=1d"
try:
    req = urllib.request.Request(
        url, 
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, context=context, timeout=5) as resp:
        data = resp.read()
        print(f"SUCCESS: {len(data)} bytes")
        res = json.loads(data.decode("utf-8"))
        result = res.get("chart", {}).get("result", [])
        if result:
            indicators = result[0].get("indicators", {}).get("quote", [{}])[0]
            close = indicators.get("close", [])
            volume = indicators.get("volume", [])
            # filter out None values
            valid_closes = [c for c in close if c is not None]
            valid_volumes = [v for v in volume if v is not None]
            print(f"Valid close prices: {len(valid_closes)}")
            if len(valid_closes) >= 200:
                mayer_multiple = valid_closes[-1] / (sum(valid_closes[-200:]) / 200.0)
                print(f"Latest Price: {valid_closes[-1]}")
                print(f"200-DMA: {sum(valid_closes[-200:]) / 200.0}")
                print(f"Mayer Multiple: {mayer_multiple}")
except Exception as e:
    print(f"FAILED: {e}")
