import json

weights = json.load(open('backend/market-score-weights.json', encoding='utf-8'))
for c in weights.get('categories', []):
    print(f"{c['name']} (Weight: {c['overall_weight_pct']}%)")
    for sf in c.get('sub_factors', []):
        print(f"  - {sf['name']} (Weight: {sf['overall_weight_pct']}%, Tier: {sf.get('tier', 'N/A')})")
