# Suggested Commands

## Running the Platform
- **Start Dev Server**: Runs the threading HTTP server locally on port 3000 and automatically attempts to launch the browser.
  ```powershell
  python server.py
  ```

## Running Tests
- **Run Backend Tests**: Runs Python unit tests inside the `backend/tests/` directory using Python's standard `unittest` framework.
  ```powershell
  python -m unittest discover -s backend/tests
  ```

## Diagnostic & API Checks (Windows PowerShell)
- **Check Server Health Endpoint**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/health"
  ```
- **Check Coins Endpoint**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/coins"
  ```
- **Check AI Analysis Endpoint**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/ai/analysis?symbol=BTCUSDT&interval=1h"
  ```
