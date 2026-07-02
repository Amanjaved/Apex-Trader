# Backend Architecture

The backend is built in standard Python without heavy framework dependencies, using a simple multi-threaded HTTP server.

## Main Entry Point & Router
- **Root Startup**: `server.py` in the workspace root runs the HTTP server.
- **Router**: `backend/api/routes.py` registers the GET routing endpoints (e.g. `/api/candles`, `/api/ticker`, `/api/orderbook`, `/api/coins`, `/api/feargreed`, `/api/news`, `/api/health`, `/api/ai/analysis`).

## Data Services (`backend/services/`)
- **Market Data**: `market_data.py` pulls ticker details and candle histories from Binance, caching updates locally using lock threads to prevent upstream rate limits.
- **Sentiment Feeds**: `sentiment.py` fetches Fear & Greed indices and aggregates crypto news articles.

## Quant Indicators Engine (`backend/indicators/`)
- **Calculator**: `calculator.py` contains mathematical indicators calculations including:
  - Exponential and Simple Moving Averages (`calculate_ema`, `calculate_sma`)
  - RSI and MACD (`calculate_rsi`, `calculate_macd`)
  - Bollinger Bands and ATR (`calculate_bb`, `calculate_atr`)
  - Smart Money Concepts: swing high/low points, Fair Value Gaps, and Order Blocks (`detect_swings`, `detect_fvg`, `detect_order_blocks`).

## AI Copilot (`backend/ai/`)
- **Copilot**: `copilot.py` merges technical indicators, market structure, order book imbalance, news sentiment, and Fear & Greed index to generate a consolidated trend bias (Strong Bullish, Bullish, Neutral, Bearish, Strong Bearish) and long/short probabilities. It also computes a multi-timeframe confluence matrix.
