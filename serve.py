from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import base64
import binascii
import hashlib
import json
import re
import sys


ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
IMAGE_DIR = DATA_DIR / "images"
DB_FILE = DATA_DIR / "mytravelblog_db.json"
DEFAULT_STATE = {
    "mytravelblog_places": [],
    "mytravelblog_tag_index": [],
}
DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", re.DOTALL)
IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def ensure_db_file():
    DATA_DIR.mkdir(exist_ok=True)
    IMAGE_DIR.mkdir(exist_ok=True)
    if not DB_FILE.exists():
        DB_FILE.write_text(json.dumps(DEFAULT_STATE, indent=2), encoding="utf-8")


def save_image_data_url(data_url):
    match = DATA_URL_RE.match(data_url or "")
    if not match:
        raise ValueError("Expected a base64 image data URL")

    mime_type, encoded = match.groups()
    if mime_type not in IMAGE_EXTENSIONS:
        raise ValueError("Unsupported image type")

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ValueError("Invalid base64 image data") from exc

    if not image_bytes:
        raise ValueError("Image is empty")

    digest = hashlib.sha256(image_bytes).hexdigest()
    filename = f"{digest}{IMAGE_EXTENSIONS[mime_type]}"
    path = IMAGE_DIR / filename
    if not path.exists():
        path.write_bytes(image_bytes)
    return f"/data/images/{filename}"


def migrate_inline_images(state):
    places = state.get("mytravelblog_places")
    if not isinstance(places, list):
        return False

    changed = False
    for place in places:
        if not isinstance(place, dict) or not isinstance(place.get("photos"), list):
            continue

        migrated = []
        for photo in place["photos"]:
            if isinstance(photo, str) and photo.startswith("data:image/"):
                try:
                    migrated.append(save_image_data_url(photo))
                    changed = True
                except ValueError:
                    migrated.append(photo)
            else:
                migrated.append(photo)
        place["photos"] = migrated

    return changed


def load_state():
    ensure_db_file()
    try:
        state = json.loads(DB_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return DEFAULT_STATE.copy()
    if migrate_inline_images(state):
        save_state(state)
    return state


def save_state(state):
    ensure_db_file()
    DB_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


class NoCacheHandler(SimpleHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self._send_json(200, load_state())
            return

        self.path = "/index.html" if parsed.path in ("", "/", "/index.html") else (parsed.path or "/")
        super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/state":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            payload = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        if not isinstance(payload, dict):
            self._send_json(400, {"error": "State payload must be an object"})
            return

        next_state = DEFAULT_STATE.copy()
        next_state.update(payload)
        migrate_inline_images(next_state)
        save_state(next_state)
        self._send_json(200, {"ok": True, "path": str(DB_FILE)})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/images":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            payload = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        data_url = payload.get("dataUrl") if isinstance(payload, dict) else None
        try:
            url = save_image_data_url(data_url)
        except ValueError as exc:
            self._send_json(400, {"error": str(exc)})
            return

        self._send_json(201, {"ok": True, "url": url})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def translate_path(self, path):
        translated = super().translate_path(path)
        return str(ROOT_DIR / Path(translated).name) if path in ("/", "/index.html") else translated


def main():
    ensure_db_file()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    server = ThreadingHTTPServer(("localhost", port), NoCacheHandler)
    print(f"Serving on http://localhost:{port} with cache disabled")
    print(f"Database file: {DB_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
