from __future__ import annotations

import email.utils
import json
import urllib.request
import xml.etree.ElementTree as ET
import time
import re
from typing import Dict, List, Set, Tuple
from backend.services.market_data import cache_get, cache_set, UPSTREAM_HEADERS

FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1"
FEEDS = {
    "CoinDesk": "http://feeds.feedburner.com/Coindesk",
    "CoinTelegraph": "https://cointelegraph.com/rss",
    "Decrypt": "https://decrypt.co/feed",
}

TTL_FEAR_GREED = 300
TTL_NEWS = 60

def fetch_url(url: str, ttl: int) -> bytes:
    """Generic cached HTTP GET."""
    entry = cache_get(url)
    if entry:
        ts, data = entry
        if time.time() - ts < ttl:
            return data

    req = urllib.request.Request(url, headers=UPSTREAM_HEADERS)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
    cache_set(url, data)
    return data

def fetch_feargreed() -> bytes:
    return fetch_url(FEAR_GREED_URL, TTL_FEAR_GREED)

def clean_tokens(title: str) -> Set[str]:
    """Extract alpha-numeric tokens from a title, excluding common stop words."""
    stop_words = {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "with", "by", "of", "is", "are", "was", "were", "to", "from", "on", "in",
        "that", "it", "as", "at", "this", "by", "an", "be", "has", "have"
    }
    cleaned = "".join(c if c.isalnum() or c.isspace() else " " for c in title.lower())
    words = cleaned.split()
    return {w for w in words if w not in stop_words and len(w) > 2}

def jaccard_similarity(s1: Set[str], s2: Set[str]) -> float:
    """Compute Jaccard similarity coefficient between two sets of tokens."""
    if not s1 or not s2:
        return 0.0
    return len(s1.intersection(s2)) / len(s1.union(s2))

def analyze_sentiment(title: str, body: str) -> str:
    """Analyze cryptocurrency sentiment using a weighted lexicon and negation handling."""
    text = (title + " " + body).lower()
    
    bullish_weights = {
        "surge": 2.0, "breakout": 3.0, "rally": 2.5, "bullish": 2.5, "ath": 3.0,
        "greenlight": 2.0, "adoption": 2.0, "partnership": 2.0, "upgrade": 1.5,
        "approved": 3.0, "approval": 3.0, "inflow": 2.0, "gain": 1.5, "rise": 1.5,
        "soar": 2.0, "jump": 1.5, "buy": 1.5, "buying": 1.5, "growth": 1.5,
        "positive": 1.5, "support": 1.0, "skyrocket": 2.5, "halving": 2.0
    }
    
    bearish_weights = {
        "crash": 3.0, "dump": 3.0, "bearish": 2.5, "hack": 3.5, "lawsuit": 3.0,
        "crackdown": 3.0, "fears": 2.0, "fud": 2.0, "plunge": 2.5, "liquidated": 2.5,
        "drop": 1.5, "theft": 3.0, "probe": 2.5, "scam": 3.0, "bankrupt": 3.5,
        "regulatory": 1.5, "ban": 3.0, "fine": 2.0, "fined": 2.0, "outflow": 2.0,
        "sell": 1.5, "selloff": 2.5, "dip": 1.5, "risk": 1.5, "negative": 1.5,
        "investigation": 2.0, "subpoena": 2.5, "seized": 2.5
    }
    
    negations = ["not", "no", "never", "won't", "don't", "isn't", "aren't", "without"]
    
    words = text.split()
    bull_score = 0.0
    bear_score = 0.0
    
    for i, w in enumerate(words):
        cw = "".join(c for c in w if c.isalnum())
        if not cw:
            continue
            
        is_negated = False
        for offset in [1, 2]:
            if i - offset >= 0:
                prev_word = "".join(c for c in words[i - offset] if c.isalnum())
                if prev_word in negations:
                    is_negated = True
                    break
        
        if cw in bullish_weights:
            weight = bullish_weights[cw]
            if is_negated:
                bear_score += weight
            else:
                bull_score += weight
        elif cw in bearish_weights:
            weight = bearish_weights[cw]
            if is_negated:
                bull_score += weight
            else:
                bear_score += weight
                
    phrases = {
        "all-time high": (3.5, "bull"),
        "bull run": (3.0, "bull"),
        "rate cut": (2.0, "bull"),
        "rate hike": (2.0, "bear"),
        "sec approval": (3.5, "bull"),
        "sec lawsuit": (3.5, "bear"),
        "regulatory crackdown": (3.0, "bear"),
    }
    for phrase, (weight, direction) in phrases.items():
        if phrase in text:
            negated = any(neg + " " + phrase in text or neg + " a " + phrase in text for neg in negations)
            if direction == "bull":
                if negated:
                    bear_score += weight
                else:
                    bull_score += weight
            else:
                if negated:
                    bull_score += weight
                else:
                    bear_score += weight
                    
    if bull_score > bear_score + 0.5:
        return "bullish"
    elif bear_score > bull_score + 0.5:
        return "bearish"
    else:
        return "neutral"

def fetch_news() -> bytes:
    all_articles = []
    
    for name, url in FEEDS.items():
        try:
            raw_xml = fetch_url(url, TTL_NEWS)
            root = ET.fromstring(raw_xml)
            channel = root.find("channel")
            if channel is not None:
                for item in channel.findall("item")[:15]:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    pubdate = (item.findtext("pubDate") or "").strip()
                    desc = (item.findtext("description") or "").strip()
                    
                    if "<" in desc:
                        desc_clean = re.sub(r'<[^>]+>', '', desc).strip()
                    else:
                        desc_clean = desc.strip()
                    
                    ts = 0
                    if pubdate:
                        try:
                            ts = int(email.utils.parsedate_to_datetime(pubdate).timestamp())
                        except Exception:
                            pass
                    
                    sentiment = analyze_sentiment(title, desc_clean)
                    all_articles.append({
                        "title": title,
                        "url": link,
                        "published_on": ts,
                        "source": name,
                        "body": desc_clean,
                        "sentiment": sentiment,
                        "source_info": {"name": name},
                    })
        except Exception as e:
            print(f"  [news] Failed to fetch or parse {name}: {e}")
            
    # Sort by published time descending
    all_articles.sort(key=lambda x: x["published_on"], reverse=True)
    
    # De-duplicate articles using title Jaccard similarity
    unique_articles = []
    seen_token_sets = []
    
    for a in all_articles:
        tokens = clean_tokens(a["title"])
        is_duplicate = False
        for prev_tokens in seen_token_sets:
            if jaccard_similarity(tokens, prev_tokens) > 0.5:  # 50% token similarity is duplicate
                is_duplicate = True
                break
        if not is_duplicate:
            unique_articles.append(a)
            seen_token_sets.append(tokens)
            
    return json.dumps({"Data": unique_articles[:25]}).encode()
