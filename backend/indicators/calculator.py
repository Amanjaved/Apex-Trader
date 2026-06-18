# Server-side technical indicator calculations for validation checks
from typing import List

def calculate_sma(closes: List[float], period: int) -> List[float]:
    """Calculate simple moving average."""
    out = []
    for i in range(len(closes)):
        if i < period - 1:
            out.append(closes[i])
        else:
            val = sum(closes[i - period + 1 : i + 1]) / period
            out.append(val)
    return out
