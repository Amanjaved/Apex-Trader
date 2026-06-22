import unittest
import threading
import http.server
import urllib.request
import json
import os
import sys

# Ensure backend package context can be resolved
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.api.routes import Handler

class TestRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Start server on ephemeral port
        cls.server = http.server.ThreadingHTTPServer(("localhost", 0), Handler)
        cls.port = cls.server.server_address[1]
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_health(self):
        url = f"http://localhost:{self.port}/api/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("status"), "ok")

    def test_session(self):
        url = f"http://localhost:{self.port}/api/auth/session"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("status"), "success")
            self.assertEqual(data.get("user").get("email"), "guest@apextrader.pro")

if __name__ == "__main__":
    unittest.main()
