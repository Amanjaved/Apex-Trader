# Tech Stack & Dependencies

## Languages
- **Backend**: Python 3.8+ (using standard typing annotations and `__future__.annotations`).
- **Frontend**: Vanilla HTML5, Vanilla CSS3 (CSS custom variables for themes), and Vanilla JavaScript (ES6 module syntax).

## Frameworks & Servers
- **Backend Server**: Built-in Python `http.server.ThreadingHTTPServer` running on port 3000. It routes API requests and serves static frontend assets.
- **Frontend Engine**: High-DPI HTML5 Canvas rendering for live candlestick charts, indicators, sparklines, and interactive background particle grids. No external charting libraries (like TradingView Lightweight Charts or Chart.js) are used; all elements are drawn from scratch.

## Package Dependencies (Python)
Key dependencies from `requirements.txt`:
- `requests`: Fetching external APIs.
- `websocket-client`: Real-time streaming from upstream exchange feeds.
- `pandas` & `numpy`: Data manipulation and technical analysis calculations.
- `python-dotenv`: Environment variables loading.

## Upstream APIs
- **Binance API**: Candlestick history (`/api/candles`) and coins information (`/api/coins`).
- **Alternative.me**: Fear & Greed index (`/api/feargreed`).
- **CryptoCompare**: News headlines and sentiment feeds (`/api/news`).
