# Legacy launcher — the app now runs under supervisor:
#   backend : uvicorn server:app --port 8001  (cwd /app/backend)
#   frontend: node server.js --port 3000      (cwd /app/frontend)
import subprocess
import sys

if __name__ == "__main__":
    print("ApexTrader Pro now runs as two services (FastAPI :8001 + static :3000).")
    print("Use: sudo supervisorctl restart backend frontend")
    sys.exit(0)
