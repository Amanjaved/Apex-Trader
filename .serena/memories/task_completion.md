# Task Completion & Verification

Before resolving any coding task, follow this quality checklist:

## 1. Run Automated Test Suites
- Ensure all backend unit tests pass.
  ```powershell
  python -m unittest discover -s backend/tests
  ```

## 2. Verify Server Compilation & Route Ingestion
- Start the dev server and verify no compilation, syntax, or import errors are thrown:
  ```powershell
  python server.py
  ```
- Send a request to `/api/health` to confirm the handler returns status code 200:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/health"
  ```

## 3. Manual UI Verification
- Open the landing page (`http://localhost:3000/`) and charts dashboard (`http://localhost:3000/charts`).
- Ensure no JavaScript runtime exceptions are thrown in the browser DevTools Console.
- Verify canvas elements render sharply and scale appropriately on resizing.
