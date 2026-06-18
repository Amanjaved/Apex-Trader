from __future__ import annotations

import http.server
import os
import threading
import time
import webbrowser
from backend.api.routes import Handler, FRONTEND_DIR, BASE_DIR

PORT = 3000
HTML_FILE = os.path.join(FRONTEND_DIR, "index.html")

def _open_browser() -> None:
    time.sleep(1.0)
    webbrowser.open(f"http://localhost:{PORT}")

def _banner() -> None:
    BOLD = "\033[1m"; DIM = "\033[2m"; RESET = "\033[0m"
    CYAN = "\033[96m"; GREEN = "\033[92m"; YELLOW = "\033[93m"
    MAGENTA = "\033[95m"; WHITE = "\033[97m"
    base = f"http://localhost:{PORT}"
    print()
    print(f"  {YELLOW}{'=' * 56}{RESET}")
    print(f"  {BOLD}{WHITE} ApexTrader Pro  {DIM}v4.0{RESET}  {DIM}- Institutional Trading Terminal{RESET}")
    print(f"  {YELLOW}{'=' * 56}{RESET}")
    print()
    print(f"  {GREEN}>  Server   {CYAN}{base}{RESET}")
    print(f"  {GREEN}>  Health   {CYAN}{base}/api/health{RESET}")
    print()
    print(f"  {BOLD}{MAGENTA}API Endpoints:{RESET}")
    eps = [
        ("/api/candles",   "OHLCV candlestick data  (symbol, interval, limit)"),
        ("/api/ticker",    "24h price ticker         (symbol)"),
        ("/api/orderbook", "Order-book depth          (symbol, limit)"),
        ("/api/coins",     "All supported coins       (prices, % change)"),
        ("/api/feargreed", "Crypto Fear & Greed index"),
        ("/api/news",      "Latest crypto news feed"),
        ("/api/health",    "Server health check"),
    ]
    for ep, desc in eps:
        print(f"  {DIM}|{RESET}  {WHITE}GET{RESET}  {CYAN}{ep:<18}{RESET}  {DIM}{desc}{RESET}")
    print()
    print(f"  {BOLD}{MAGENTA}Supported pairs:{RESET}")
    print(f"  {DIM}  BTCUSDT ETHUSDT SOLUSDT BNBUSDT XRPUSDT{RESET}")
    print(f"  {DIM}  ADAUSDT DOGEUSDT AVAXUSDT DOTUSDT MATICUSDT{RESET}")
    print()
    print(f"  {DIM}Press Ctrl+C to stop.{RESET}")
    print()

def start_server() -> None:
    # Pre-flight check
    if not os.path.isfile(HTML_FILE):
        print(f"\n  ERROR: index.html not found at {HTML_FILE}\n")
        raise SystemExit(1)

    _banner()

    server = http.server.ThreadingHTTPServer(("", PORT), Handler)
    threading.Thread(target=_open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down… Goodbye!\n")
        server.shutdown()

if __name__ == "__main__":
    start_server()
