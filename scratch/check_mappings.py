with open('backend/services/market_score.py', encoding='utf-8') as f:
    content = f.read()

# Let's search for the initialization of self.factor_calculators
import re
matches = re.findall(r'\(.*?\)\s*:\s*self\._calc_.*?,', content)
for m in matches:
    print(m)
