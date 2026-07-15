import urllib.request, json

resp = urllib.request.urlopen('http://localhost:3000/api/market-score?symbol=BTCUSDT&interval=4h', timeout=60)
data = json.loads(resp.read())

target_factors = [
    "Bullish vs Bearish Ratio",
    "Long/Short Ratio",
    "Liquidation Clusters",
    "Exchange Deposits",
    "Exchange Withdrawals",
    "Exchange Reserves",
    "Active Addresses"
]

print("Checking targets:")
for cat in data.get('categories', []):
    for sf in cat.get('sub_factors', []):
        name = sf.get('name')
        if name in target_factors:
            raw = sf.get('raw_value')
            norm = sf.get('normalized_score')
            status = sf.get('status')
            source = sf.get('source')
            print(f"  {name}: status={status}, source={source}, raw={raw}, normalized={norm}")
