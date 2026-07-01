# ApexTrader Pro — Product Specifications, Information & Features

ApexTrader Pro is an institutional-grade, high-performance cryptocurrency trading terminal designed to combine TradingView-style charts, Bookmap-style order flows, CoinGlass-style sentiment analysis, automated Smart Money Concepts (SMC), and AI-powered quant intelligence.

This document serves as the complete user manual and feature specification manual for the ApexTrader Pro platform.

---

## 1. High-Performance HTML5 Charting Engine
* **60 FPS Rendering Pipeline**: Powered by a custom HTML5 `<canvas>` rendering engine optimized to display 10,000+ historical candles, indicators, and drawings smoothly without lagging.
* **TradingView-Style Scaling & Panning**:
  * **Auto-Scale Mode**: Automatically fits the chart's vertical height to show all candles visible within the active horizontal view.
  * **Manual Y-Axis Scaling**: Hovering over the right-side price axis changes the cursor to `ns-resize`. Clicking and dragging compresses or expands the vertical scale exponentially.
  * **Manual Body Panning**: Clicking and dragging up or down on the main chart area pans the price window vertically, allowing custom price alignment.
  * **Reset Trigger**: Double-clicking anywhere on the main canvas instantly snaps the chart back to auto-scale mode.
* **Premium Loading Lifecycle**: Synchronizes network requests. The chart canvas remains obscured behind a sleek, glass-blurred loading overlay with a gold glowing loader spinner and animated status alerts until WebSocket streams are connected and candles are populated, preventing visual pops.

---

## 2. Advanced Support & Resistance (S/R) Zone Clustering
* **Parallel Web Worker Processing**: Calculations run on a separate browser thread (`sr_worker.js`) to guarantee that heavy computations never stutter the main UI rendering thread.
* **Trailing-Proximity Clustering**: Clusters swing pivots using a strict proximity check against the *last* pivot added to a cluster rather than the first. This prevents distant S/R levels from chain-merging into giant zones.
* **Confluence Scoring (Out of 100)**: Support/resistance zones are scored dynamically based on touch counts, volume spikes, recency, and role-reversal historical confluences. 
* **Dynamic Canvas Overlays**:
  * **Confluence Glows**: High-scoring zones are drawn with wider bounds and a 6px blur glow to highlight major price walls.
  * **Pulsing Indicator**: High-confluence zones pulse dynamically at a 1Hz frequency whenever the live price resides within their boundaries.
  * **HTML Hover Tooltips**: Moving the cursor over any zone displays a floating HTML tooltip revealing the zone score, type, confluences, and origin time.

---

## 3. Smart Money Concepts (SMC) & Institutional Structures
* **Fair Value Gaps (FVG)**: Automatically scans historical candles to detect and highlight unmitigated bullish and bearish fair value gaps (liquidity imbalances).
* **Order Blocks (OB)**: Tracks major buying/selling walls by identifying extreme high-volume candles preceding structural swings, marking them as key institutional supply/demand zones.
* **SMC Summary Cards**: Shows active order blocks and fair value gap boundaries directly within the analysis panel.

---

## 4. Dedicated AI Market Analysis Dashboard
Accessible via the `/analysis` clean URL path, this dashboard acts as a central hub for deep quant analytics.
* **Glassmorphic Slate-Dark UI**: Designed with a cinematic space-slate backdrop, neon border highlights, backdrop filters, and GSAP entrance animations.
* **Neural Market Bias Dial**: Renders a glowing SVG circular gauge and badge showing the aggregated market bias (Strong Bullish, Bullish, Neutral, Bearish, Strong Bearish) normalized to a score out of 100.
* **Directional Probability Slider**: Displays Long vs. Short probability bars derived from live order book imbalances, technical indicators, and news sentiment feeds.
* **Multi-Timeframe Matrix**: High-impact grid summarizing bias states across five distinct timeframes (`5m`, `15m`, `1h`, `4h`, `1d`).
* **Technical Breakdown Cards**: Modular columns summarizing trend stack EMAs, momentum oscillators (RSI, MACD), volatility channels, and order book dominance.

---

## 5. Live Quant Sentiment & News Analytics
* **Speedometer Fear & Greed Index**: Visualizes the aggregated crypto sentiment feed from alternative.me using a classic gauge speedometer with a rotating needle pointer, raw score, and classification badges.
* **Order Depth Wall Canvas**: Dynamically polls bid/ask order volume depth and draws cumulative walls (green bids vs. red asks) on a dedicated canvas, showing the exact location of massive order walls.
* **Relevance-Filtered News Feed**: Fetches real-time feeds from CoinDesk, CoinTelegraph, and Decrypt, analyzes headline/body sentiment using a negation-handling lexicon, filters for the active symbol, and renders them with color-coded sentiment labels.

---

## 6. Strategy Backtest Simulator
* **Client-Side Strategy Backtester**: Runs a historical EMA 12/26 cross strategy on 500 candles instantly in the browser.
* **Performance Metrics**: Calculates and renders:
  * **Win Rate %** (colored green/red based on performance)
  * **Profit Factor**
  * **Total Trade Count**
  * **Max Drawdown %**
* **Cumulative Equity Curve Canvas**: Draws a beautiful, glowing aqua-neon line chart plotting the strategy's equity progression over the historical period.

---

## 7. Interactive Position & Leverage Calculator
* **Active State Synchronization**: Pulls recommended entry, take-profit targets, and stop-loss levels directly from the AI analysis.
* **Calculator Parameters**:
  * **Capital ($)**: Account balance input.
  * **Risk %**: Percentage of capital to risk per trade.
  * **Leverage Slider**: Adjustable range slider from 1x to 100x leverage.
* **Real-time Outputs**:
  * **Position Size**: Total position value in USD and units.
  * **Margin Required**: Minimum margin required to open the position.
  * **Est. Liquidation Price**: Calculated liquidation trigger point.
  * **Take Profit Outputs**: Expected payouts and ROE % for Target 1, Target 2, and Target 3.
  * **Stop Loss**: Potential loss amount in USD and target price.
  * **Risk-to-Reward Ratio**: Exact ratio calculation.
* **Safety Alert Banners**: Displays warning alerts if leverage is set too high, and outputs a **Liquidation Hazard** banner if the estimated liquidation price triggers *before* the protective stop-loss level.

---

## 8. Real-Time AI Quant Chatbot Console
* **Interactive Chat Terminal**: Renders a cmd-style message console with scroll locks and typing bubble indicators.
* **Live Quant Querying**: Answers questions about live indicators, S/R zones, and SMC structures without external API rate limits. Users can query:
  * *"What is the RSI?"*
  * *"Where is the next support level?"*
  * *"Show me the trade setup"*
  * *"Show volatility and Bollinger Bands"*

---

## 9. Deep Architectural Details of Platform Pages

### 🛬 Page 1: Cinematic 3D Landing Page (`index.html`)
The entry point of the ApexTrader platform, designed to wow institutional quants and retail traders.
* **WebGL Particle Galaxy Background**: Uses Three.js to render a live, orbiting 3D coordinate particle system that represents floating market liquidity nodes, updating and reacting dynamically to cursor movement.
* **GSAP Holographic Slider**: Orchestrates a series of floating glassmorphic product detail cards in 3D perspective using the GreenSock Animation Platform, rotating elements into view as the user scrolls.
* **Asset Universe Ticker Grid**: Displays real-time prices, 24h delta percentages, and volume indexes across 10+ major trading pairs.
* **Holographic HoloChart Showcase**: Demonstrates interactive, simulated charting widgets that showcase the platform's visual capabilities before launching.

### 📈 Page 2: Professional Chart Terminal (`charts.html`)
The primary execution console containing direct WebSocket connections and interactive controls.
* **Left-hand Drawing Palette**: Contains drawing tools for manual annotations:
  * *Select/Pan* mode
  * *Crosshairs*: Pixel-snapping vertical and horizontal crosslines with floating coordinate readouts.
  * *Trend Line & Parallel Channels*: Draws angled vector lines and parallel channels on the canvas, computing price deltas.
  * *H-Lines & V-Lines*: Draws static horizontal/vertical anchors.
  * *Rectangles*: Outlines institutional clusters or custom blocks.
  * *Fibonacci Retracement & Extensions*: Plots classic and extended golden ratios (`0.236`, `0.382`, `0.5`, `0.618`, `0.786`, `1.0`, etc.) based on user-anchored swing highs and lows.
* **Canvas Area & Multi-Panes**:
  * *Main Chart Canvas*: Renders candlesticks, EMA lines, Bollinger Band bands, and glows. Includes a floating hover tooltip summarizing the open, high, low, close, and volume coordinates of the active candle.
  * *Order Book Depth Drawer*: An expandable, bottom-docked panel visualizing order density.
  * *Sub-Charts Area*: Houses resizable indicators (Volume, RSI, MACD, OBV, Stochastic) mapped onto independent sub-canvases with manual boundary sliders.
* **Right-hand Workspace Tabs**:
  * *Tools Tab*: Manages price alerts (creating/deleting horizontal alerts) and filters SMC overlays (turning on/off BOS, CHOCH, Equal Highs, or sweeps text overlays).
  * *Settings Tab*: Fine-tunes technical indicator parameters, period lengths, and colors.
  * *Risk Tab*: Computes account drawdown parameters.
  * *Intel Tab*: Inspects real-time buy/sell ratios.
  * *AI Tab*: Renders copilot market summary blocks and hosts the entry shortcut to launch the deep AI page.

### 🧠 Page 3: AI Market Analysis Hub (`analysis.html`)
A dedicated analytical console providing specialized quant assessments and backtesting reports.
* **Grid Layout Details**:
  * *Bias Card*: Houses the overall market bias. Animates an HSL-colored SVG stroke dial to represent technical score weights.
  * *Probability Card*: Displays Long vs Short ratios with dual glowing progress sliders and a center divider glow indicator.
  * *Timeframe Matrix*: Displays five timeframe bias status boxes (`5m`, `15m`, `1h`, `4h`, `1d`) color-coded to immediately identify macro-micro trend confluences.
  * *Confluence Cards*: Highlights Trend (EMA stack checks), Momentum (RSI/MACD status), Volatility (ATR checks), and Order Flow bids/asks confluences.
  * *Levels Stack Card*: Displays support levels (sorted descending, nearest support first) immediately below the active current price line, and resistance levels (sorted ascending) immediately above, mimicking a real chart stack.
  * *Interactive Position Sizing Calculator*: Replaces static parameters with interactive inputs. Real-time updates calculate margin sizes, dollar risks, take-profit targets, liquidation hazard warning banners, and potential yields.
  * *Strategy Backtest Card*: Runs client-side golden/death cross backtests, tracking wins, losses, drawdowns, and plotting a cumulative return equity sparkline.
  * *AI Quant Chat Terminal*: CMD console with scroll locks and typing indicators. Hooks into backend indicator caches to answer questions about indicators, support levels, or tactical trade setups.

---

## 10. System Specifications & Technology Stack

### Frontend Architecture
* **Language & Structure**: Pure HTML5, CSS3, and Modular ES6 Javascript.
* **Styles**: Glassmorphism backdrop-filters, curated HSL color systems, and CSS variables.
* **Worker Layer**: Web Worker-driven indicator calculations (`sr_worker.js`).
* **Real-time Sync**: Direct WebSocket connection to Binance streams (`stream.binance.com`).

### Backend Architecture
* **Language & Core**: Python 3.10+ standard library HTTP/webserver handler (`server.py`, `routes.py`).
* **S/R & Indicator Engine**: Python indicator calculator parity code (`calculator.py`, `copilot.py`).
* **Sentiment Engine**: RSS XML feed parsers, Jaccard title de-duplication, and lexicon sentiment analyzer (`sentiment.py`).
