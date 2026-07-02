# Frontend Architecture

The frontend consists of two main entry points (Landing Page and Trading Dashboard) styled using dark premium fintech themes.

## Entry Point Pages
- **Landing Page**: `index.html` (styled by `index.css`, driven by `app.js`). Serves as the marketing gateway. Features:
  - Floating Live Chart Canvas
  - Particle Background Canvas
  - Concurrently fetched glowing ticker sparklines
  - Billing Toggle Switches
- **Trading Dashboard**: `charts.html` (styled by `charts.css`, driven by `charts.js`). Provides TradingView-style charting, indicators, drawing toolbars, order book depth drawers, and AI assistant tabs.

## Modular Scripts & Modules
- **State Management**: `frontend/settings/state.js` houses system settings (`S`) and coin list details (`COINS`).
- **DOM Selector registry**: `frontend/settings/dom.js` (registers UI identifiers `D`).
- **Indicators calculations (Client-side)**: `frontend/indicators/indicators.js`.
- **Chart Draw Engines**:
  - `frontend/chart/chart_engine.js`: Handles main candlesticks, volume bars, RSI/MACD oscillator bars, minimap overlay, and cursor interactions.
  - `frontend/orderflow/orderflow.js`: Renders bid/ask cumulative depth graph.
  - `frontend/watchlist/watchlist.js`: Runs watchlist symbols updates.
  - `frontend/alerts/alerts.js`: Coordinates price triggers.
  - `frontend/ai/ai.js`: Populates AI tab confluences, matrix states, and long/short probabilities.
