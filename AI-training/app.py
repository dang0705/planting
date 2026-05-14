import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from inference import build_health_payload, dumps_json, predict_image

SERVICE_API_KEY = str(os.getenv("HF_SERVICE_API_KEY", "") or "").strip()


class Handler(BaseHTTPRequestHandler):
    server_version = "PlantingHFInference/1.0"

    def _send_json(self, status_code: int, payload):
        body = dumps_json(payload)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _is_authorized(self) -> bool:
        if not SERVICE_API_KEY:
            return True

        header = str(self.headers.get("Authorization", "") or "").strip()
        if not header:
            return False

        if header == SERVICE_API_KEY:
            return True

        return header == f"Bearer {SERVICE_API_KEY}"

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        if self.path in ("/health", "/"):
            self._send_json(200, build_health_payload())
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/predict":
            self._send_json(404, {"error": "not_found"})
            return

        if not self._is_authorized():
            self._send_json(401, {"error": "unauthorized"})
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid_json"})
            return

        try:
            result = predict_image(
                image_url=payload.get("image_url"),
                image_base64=payload.get("image_base64"),
                top_k=payload.get("top_k"),
                input_organ_hint=str(payload.get("input_organ_hint", "") or ""),
            )
        except Exception as exc:  # pragma: no cover - runtime guard
            self._send_json(
                400,
                {
                    "error": str(exc) or "prediction_failed",
                },
            )
            return

        self._send_json(200, result)


def main():
    port = int(os.getenv("PORT", "3000") or "3000")
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"HF inference service listening on http://0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
