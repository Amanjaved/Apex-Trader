from __future__ import annotations

import os
import sys

# Ensure backend package context can be resolved
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.market_score import MarketScoreEngine

def main():
    print("Initializing MarketScoreEngine...")
    engine = MarketScoreEngine()
    
    # Override _gather_market_data with detailed print statements
    original_gather = engine._gather_market_data
    
    def debug_gather(symbol, interval):
        print("Gathering market data...")
        data = {}
        
        print("1. Fetching candles...")
        try:
            import json
            import backend.services as services
            candles_raw = json.loads(services.fetch_candles(symbol, interval, 500))
            data["candles"] = [
                {
                    "t": int(k[0]),
                    "o": float(k[1]),
                    "h": float(k[2]),
                    "l": float(k[3]),
                    "c": float(k[4]),
                    "v": float(k[5]),
                    "taker_buy_base": float(k[9]) if len(k) > 9 else 0.0,
                }
                for k in candles_raw
            ]
            print(f"Candles fetched: {len(data['candles'])}")
        except Exception as e:
            print(f"Error candles: {e}")
            data["candles"] = []

        print("2. Fetching orderbook...")
        try:
            orderbook_raw = json.loads(services.fetch_orderbook(symbol, 100))
            data["orderbook"] = {
                "bids": [[float(b[0]), float(b[1])] for b in orderbook_raw.get("bids", [])],
                "asks": [[float(a[0]), float(a[1])] for a in orderbook_raw.get("asks", [])]
            }
            print(f"Orderbook fetched: bids={len(data['orderbook']['bids'])}, asks={len(data['orderbook']['asks'])}")
        except Exception as e:
            print(f"Error orderbook: {e}")
            data["orderbook"] = {"bids": [], "asks": []}

        print("3. Fetching Fear & Greed...")
        try:
            fg_raw = services.fetch_feargreed()
            fg_json = json.loads(fg_raw)
            if fg_json.get("data") and len(fg_json["data"]) > 0:
                data["fear_greed"] = float(fg_json["data"][0]["value"])
            print(f"Fear & Greed fetched: {data.get('fear_greed')}")
        except Exception as e:
            print(f"Error Fear & Greed: {e}")
            data["fear_greed"] = None

        print("4. Fetching Futures Funding...")
        from backend.services.market_score import fetch_external_url
        funding_raw = fetch_external_url("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT", 15)
        if funding_raw:
            try:
                fund_json = json.loads(funding_raw)
                data["futures_funding"] = float(fund_json.get("lastFundingRate", 0.0))
                print(f"Funding fetched: {data['futures_funding']}")
            except Exception as e:
                print(f"Error parsing funding: {e}")
                data["futures_funding"] = None
        else:
            print("Funding fetch returned None")
            data["futures_funding"] = None

        print("5. Fetching Open Interest...")
        oi_raw = fetch_external_url("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT", 15)
        if oi_raw:
            try:
                oi_json = json.loads(oi_raw)
                data["futures_oi"] = float(oi_json.get("openInterest", 0.0))
                print(f"OI fetched: {data['futures_oi']}")
            except Exception as e:
                print(f"Error parsing OI: {e}")
                data["futures_oi"] = None
        else:
            print("OI fetch returned None")
            data["futures_oi"] = None

        print("6. Fetching Long/Short Ratio...")
        ls_raw = fetch_external_url("https://fapi.binance.com/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1", 15)
        if ls_raw:
            try:
                ls_json = json.loads(ls_raw)
                if len(ls_json) > 0:
                    data["futures_long_short"] = float(ls_json[0].get("longShortRatio", 1.0))
                print(f"L/S Ratio fetched: {data.get('futures_long_short')}")
            except Exception as e:
                print(f"Error parsing L/S: {e}")
                data["futures_long_short"] = None
        else:
            print("L/S fetch returned None")
            data["futures_long_short"] = None

        print("7. Fetching Futures Ticker...")
        f_ticker_raw = fetch_external_url("https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT", 15)
        if f_ticker_raw:
            try:
                ft_json = json.loads(f_ticker_raw)
                data["futures_price"] = float(ft_json.get("price", 0.0))
                print(f"Futures price fetched: {data['futures_price']}")
            except Exception as e:
                print(f"Error parsing Futures price: {e}")
                data["futures_price"] = None
        else:
            print("Futures price fetch returned None")
            data["futures_price"] = None

        print("8. Fetching Liquidations...")
        liq_raw = fetch_external_url("https://fapi.binance.com/fapi/v1/forceOrders?symbol=BTCUSDT&limit=50", 15)
        if liq_raw:
            try:
                data["futures_liquidations"] = json.loads(liq_raw)
                print(f"Liquidations fetched: {len(data['futures_liquidations'])}")
            except Exception as e:
                print(f"Error parsing Liquidations: {e}")
                data["futures_liquidations"] = []
        else:
            print("Liquidations fetch returned None")
            data["futures_liquidations"] = []

        print("9. Fetching CoinGecko global market dominance...")
        cg_raw = fetch_external_url("https://api.coingecko.com/api/v3/global", 300)
        if cg_raw:
            try:
                cg_json = json.loads(cg_raw)
                mcap_pct = cg_json.get("data", {}).get("market_cap_percentage", {})
                data["btc_dominance"] = float(mcap_pct.get("btc", 0.0))
                data["eth_dominance"] = float(mcap_pct.get("eth", 0.0))
                data["stablecoin_dominance"] = float(mcap_pct.get("usdt", 0.0)) + float(mcap_pct.get("usdc", 0.0))
                print(f"CoinGecko fetched: btc_dom={data['btc_dominance']}, eth_dom={data['eth_dominance']}, stable_dom={data['stablecoin_dominance']}")
            except Exception as e:
                print(f"Error parsing CoinGecko: {e}")
                data["btc_dominance"] = None
                data["eth_dominance"] = None
                data["stablecoin_dominance"] = None
        else:
            print("CoinGecko fetch returned None")
            data["btc_dominance"] = None
            data["eth_dominance"] = None
            data["stablecoin_dominance"] = None

        print("10. Fetching DXY price...")
        dxy_raw = fetch_external_url("https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1d&interval=1m", 300)
        if dxy_raw:
            try:
                dxy_json = json.loads(dxy_raw)
                closes = dxy_json["chart"]["result"][0]["indicators"]["quote"][0]["close"]
                data["dxy_price"] = float([c for c in closes if c is not None][-1])
                print(f"DXY fetched: {data['dxy_price']}")
            except Exception as e:
                print(f"Error parsing DXY: {e}")
                data["dxy_price"] = None
        else:
            print("DXY fetch returned None")
            data["dxy_price"] = None

        print("11. Fetching Gold price...")
        gold_raw = fetch_external_url("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=1m", 300)
        if gold_raw:
            try:
                gold_json = json.loads(gold_raw)
                closes = gold_json["chart"]["result"][0]["indicators"]["quote"][0]["close"]
                data["gold_price"] = float([c for c in closes if c is not None][-1])
                print(f"Gold fetched: {data['gold_price']}")
            except Exception as e:
                print(f"Error parsing Gold: {e}")
                data["gold_price"] = None
        else:
            print("Gold fetch returned None")
            data["gold_price"] = None

        print("12. Fetching mempool mining diff...")
        diff_raw = fetch_external_url("https://mempool.space/api/v1/difficulty-adjustment", 600)
        if diff_raw:
            try:
                diff_json = json.loads(diff_raw)
                data["mining_difficulty_change"] = float(diff_json.get("difficultyChange", 0.0))
                print(f"Diff fetched: {data['mining_difficulty_change']}")
            except Exception as e:
                print(f"Error parsing Diff: {e}")
                data["mining_difficulty_change"] = None
        else:
            print("Diff fetch returned None")
            data["mining_difficulty_change"] = None

        print("13. Fetching mempool mining hashrate...")
        hash_raw = fetch_external_url("https://mempool.space/api/v1/mining/hashrate/3m", 600)
        if hash_raw:
            try:
                hash_json = json.loads(hash_raw)
                hashrates = hash_json.get("hashrates", [])
                if len(hashrates) > 30:
                    latest_hr = hashrates[-1].get("hashrate", 1.0)
                    prev_hr = hashrates[-30].get("hashrate", 1.0)
                    data["hashrate_change_pct"] = (latest_hr - prev_hr) / prev_hr * 100.0
                else:
                    data["hashrate_change_pct"] = 0.0
                print(f"Hashrate change fetched: {data['hashrate_change_pct']}")
            except Exception as e:
                print(f"Error parsing Hashrate: {e}")
                data["hashrate_change_pct"] = None
        else:
            print("Hashrate fetch returned None")
            data["hashrate_change_pct"] = None

        print("14. Fetching Farside Spot ETF net flows...")
        etf_raw = fetch_external_url("https://farside.in/btc/", 3600)
        if etf_raw:
            try:
                etf_html = etf_raw.decode("utf-8", errors="ignore")
                import re
                totals = re.findall(r'<td class="[^"]*total[^"]*">([^<]+)</td>', etf_html)
                if totals:
                    latest_total = totals[-1].replace(",", "").strip()
                    data["etf_net_flow"] = float(latest_total)
                else:
                    data["etf_net_flow"] = None
                print(f"ETF flows fetched: {data['etf_net_flow']}")
            except Exception as e:
                print(f"Error parsing ETF: {e}")
                data["etf_net_flow"] = None
        else:
            print("ETF fetch returned None")
            data["etf_net_flow"] = None

        return data
        
    engine._gather_market_data = debug_gather
    
    print("Computing score...")
    res = engine.compute_score("BTCUSDT", "1h")
    print("SCORE COMPUTED:")
    print(f"Score: {res['final_score']}")
    print(f"Signal: {res['signal']}")
    print(f"Coverage: {res['data_coverage_pct']}%")

if __name__ == "__main__":
    main()
