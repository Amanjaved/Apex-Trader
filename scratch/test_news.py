import urllib.request, json

resp = urllib.request.urlopen('http://localhost:3000/api/market-score?symbol=BTCUSDT&interval=4h', timeout=60)
data = json.loads(resp.read())

for cat in data.get('categories', []):
    if cat.get('id') == 'news_regulations':
        print(f"Category: {cat['name']} (Score: {cat.get('score')})")
        for sf in cat.get('sub_factors', []):
            name = sf.get('name', '?')
            raw = sf.get('raw_value', '?')
            norm = sf.get('normalized_score', '?')
            status = sf.get('status', '?')
            source = sf.get('source', '?')
            print(f"  {name}: raw={raw}, normalized={norm}, status={status}, source={source}")
