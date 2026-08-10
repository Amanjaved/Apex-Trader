# backend/services/feature_lineage.py
"""
APEXTRADER FEATURE LINEAGE GRAPH (DAG) ENGINE
Traces feature origins, mathematical derivation trees, and feature dependencies across strategies.
"""

from __future__ import annotations
import time
from typing import Dict, List, Any


def get_feature_lineage_dag(target_feature_id: str = "FEAT-1047") -> Dict[str, Any]:
    """
    Returns the Directed Acyclic Graph (DAG) lineage for engineered features and strategies.
    """
    nodes = [
        {"id": "RAW-FUNDING", "label": "Perpetual Funding Rate", "type": "RAW_MARKET_DATA"},
        {"id": "RAW-OI", "label": "Open Interest USD", "type": "RAW_MARKET_DATA"},
        {"id": "RAW-LIQUIDITY", "label": "Liquidity Pool Gap %", "type": "RAW_MARKET_DATA"},
        {"id": "FEAT-101", "label": "Funding Rate Velocity (1h)", "type": "DERIVED_1ST_ORDER"},
        {"id": "FEAT-304", "label": "Funding Rate x Open Interest", "type": "DERIVED_2ND_ORDER"},
        {"id": "FEAT-1047", "label": "Funding x OI / Liquidity Gap", "type": "COMPOSITE_SYNTHETIC"},
        {"id": "STRAT-812", "label": "CVD_Volume_Profile_Breakout", "type": "PRODUCTION_STRATEGY"}
    ]

    edges = [
        {"from": "RAW-FUNDING", "to": "FEAT-101", "operator": "d/dt(Funding)"},
        {"from": "RAW-FUNDING", "to": "FEAT-304", "operator": "Multiply"},
        {"from": "RAW-OI", "to": "FEAT-304", "operator": "Multiply"},
        {"from": "FEAT-304", "to": "FEAT-1047", "operator": "Divide by Liquidity Gap"},
        {"from": "RAW-LIQUIDITY", "to": "FEAT-1047", "operator": "Divide"},
        {"from": "FEAT-1047", "to": "STRAT-812", "operator": "Primary Indicator Weight (32%)"}
    ]

    return {
        "target_feature_id": target_feature_id,
        "lineage_dag": {
            "nodes": nodes,
            "edges": edges
        },
        "lineage_path_string": "Funding Rate -> Funding Velocity -> (Funding x OI) -> (Funding x OI / Liquidity Gap) -> Strategy 812"
    }
