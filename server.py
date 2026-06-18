import sys
import os

# Ensure backend package can be imported from root directory context
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.server import start_server

if __name__ == "__main__":
    start_server()
