import urllib.request
import json
import ssl

context = ssl._create_unverified_context()
urls = [
    "https://api.db.nomics.world/v22/series/FRED/CPIAUCSL?observations=1",
    "https://api.db.nomics.world/v22/series/FRED/UNRATE?observations=1",
    "https://api.db.nomics.world/v22/series/FRED/GDPC1?observations=1"
]

for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=context, timeout=5) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            series = res.get("series", {})
            docs = series.get("docs", [])
            print(f"URL: {url} -> SUCCESS, got {len(docs)} series docs")
            if docs:
                values = docs[0].get("value", [])
                dates = docs[0].get("period", [])
                print(f"  Latest date: {dates[-1] if dates else 'N/A'}, latest value: {values[-1] if values else 'N/A'}")
    except Exception as e:
        print(f"URL: {url} -> FAILED: {e}")
