from __future__ import annotations

import email.utils
import json
import urllib.request
import xml.etree.ElementTree as ET
import time
from backend.services.market_data import cache_get, cache_set, UPSTREAM_HEADERS

FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1"
NEWS_URL       = "http://feeds.feedburner.com/Coindesk"

TTL_FEAR_GREED   = 300
TTL_NEWS         = 60

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

def fetch_news() -> bytes:
    raw_xml = fetch_url(NEWS_URL, TTL_NEWS)
    articles = []
    root = ET.fromstring(raw_xml)
    channel = root.find("channel")
    if channel is not None:
        for item in channel.findall("item")[:20]:
            title   = (item.findtext("title")   or "").strip()
            link    = (item.findtext("link")    or "").strip()
            pubdate = (item.findtext("pubDate") or "").strip()
            desc    = (item.findtext("description") or "").strip()
            ts = 0
            if pubdate:
                try:
                    ts = int(email.utils.parsedate_to_datetime(pubdate).timestamp())
                except Exception:
                    pass
            articles.append({
                "title": title, "url": link,
                "published_on": ts, "source": "CoinDesk",
                "body": desc, "source_info": {"name": "CoinDesk"},
            })
    return json.dumps({"Data": articles}).encode()
