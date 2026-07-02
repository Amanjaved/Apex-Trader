# Coding & Design Conventions

## Backend (Python)
- **Type Annotations**: Always enforce strict Python typing annotations. Use `from __future__ import annotations` at the top of files.
- **Routing & Handler Structure**: API routes are hosted under the `Handler` class in `backend/api/routes.py`. Do not spin up external routing engines unless requested.
- **Gzip Compression**: Custom payloads larger than 512 bytes are compressed in transit if `gzip` is accepted by the client. Ensure this behavior is preserved in responses.
- **Cache Policy**: Binance ticker updates and candle details are stored in an in-memory cache (`_cache` in `market_data.py`) with strict TTL limits to prevent upstream rate-limiting issues.
- **Diagnostics**: Health check statistics are tracked by telemetry counters inside `backend/monitoring/telemetry.py` and outputted at `/api/health`.

## Frontend (JavaScript / HTML / CSS)
- **High-DPI Canvas Rendering**: All dynamic drawing contexts (like sparkline overlays and mockup grids) must read `window.devicePixelRatio`, scale the canvas buffer size accordingly, and use standard CSS rules for display dimensions to avoid blurry rendering on retina screens.
- **Theme Variables**: Use CSS custom variables (e.g. `--bg`, `--text-muted`, `--primary`) on the `html[data-theme]` selectors to support seamless Dark/Light styling changes.
- **Modular JavaScript**: Use standard ES6 import/export syntax for files under `frontend/` (e.g., `app.js`, `charts.js`, and modules).
