"""Tiny health endpoint so Docker can tell whether the analytics loop is working."""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


class HealthState:
    """Tracks the last successful analytics cycle. Thread-safe enough for one writer, one reader."""

    def __init__(self, interval_seconds: float, startup_grace_seconds: float = 120.0):
        self.started_at = time.monotonic()
        self.last_success = None  # monotonic time of last good cycle
        self.last_error = None
        self.interval = interval_seconds
        self.grace = startup_grace_seconds

    def record_success(self) -> None:
        self.last_success = time.monotonic()
        self.last_error = None

    def record_failure(self, message: str) -> None:
        self.last_error = message

    def is_healthy(self, now: float = None) -> bool:
        now = time.monotonic() if now is None else now
        if self.last_success is None:
            # Not yet succeeded: healthy only during the startup grace period.
            return (now - self.started_at) <= self.grace
        allowed = max(3 * self.interval, 90.0)
        return (now - self.last_success) <= allowed


def start_health_server(state: HealthState, port: int = 8000) -> HTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 (http.server naming)
            if self.path != "/health":
                self.send_response(404)
                self.end_headers()
                return
            healthy = state.is_healthy()
            body = json.dumps({"status": "ok" if healthy else "unavailable"}).encode()
            self.send_response(200 if healthy else 503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):  # keep health probes out of the logs
            return

    server = HTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
