"""Optional HTTP service the TV launcher reads from an always-on PC on the same LAN.

GET /status.json  -> health chips: internet + whatever you list in tv_services.json
GET /bg.json      -> photo of the day from Bing, preferring a landscape among the last 8

Started by home-watch.py in a background thread (shares its autostart), or run it alone:
    python tv_services.py

Standard library only. Listens on 0.0.0.0:8765. CORS is open because the TV app runs from file://.
Anyone on your LAN can read these two JSONs: put nothing secret in the check names.

tv_services.json (next to this file) lists the checks. Example:
{
  "checks": [
    {"name": "Docker stack", "type": "docker", "prefix": "myproject"},
    {"name": "Ollama",       "type": "port",   "host": "127.0.0.1", "port": 11434},
    {"name": "Home Assistant","type": "port",  "host": "192.168.1.10", "port": 8123},
    {"name": "Plex",         "type": "process","image": "Plex Media Server.exe"}
  ]
}
"""
import json
import os
import platform
import socket
import subprocess
import threading
import time
import unicodedata
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("TV_SERVICES_PORT", "8765"))
STATUS_EVERY = 60          # seconds
BG_EVERY = 6 * 3600        # seconds
HERE = os.path.dirname(os.path.abspath(__file__))
NO_WINDOW = 0x08000000 if platform.system() == "Windows" else 0   # no console flash under pythonw

_state = {"status": {"updated": 0, "items": []}, "bg": {}}
_lock = threading.Lock()


def _load_checks():
    try:
        with open(os.path.join(HERE, "tv_services.json"), encoding="utf-8") as f:
            return json.load(f).get("checks", [])
    except (OSError, ValueError):
        return []


def _port_open(host, port, timeout=1.5):
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


def _run(args, timeout=10):
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW)
        return out.stdout
    except Exception:
        return ""


def _process_running(image):
    if platform.system() == "Windows":
        return image.lower() in _run(["tasklist", "/FI", "IMAGENAME eq " + image, "/NH"]).lower()
    return bool(_run(["pgrep", "-f", image]).strip())


def _check(c):
    kind = c.get("type")
    if kind == "port":
        return {"ok": _port_open(c.get("host", "127.0.0.1"), c["port"])}
    if kind == "process":
        return {"ok": _process_running(c["image"])}
    if kind == "docker":
        lines = [l for l in _run(["docker", "ps", "--format", "{{.Names}}|{{.Status}}"]).splitlines() if l.strip()]
        mine = [l for l in lines if l.startswith(c.get("prefix", ""))]
        healthy = [l for l in mine if "(healthy)" in l or ("Up" in l and "unhealthy" not in l)]
        return {"ok": bool(mine) and len(healthy) == len(mine), "detail": "%d/%d" % (len(healthy), len(mine))}
    return {"ok": False}


def _check_status():
    items = [{"name": "Internet", "ok": _port_open("1.1.1.1", 53)}]
    for c in _load_checks():
        try:
            r = _check(c)
        except Exception:
            r = {"ok": False}
        r["name"] = c.get("name", "?")
        items.append(r)
    with _lock:
        _state["status"] = {"updated": int(time.time()), "items": items}


# Words that point to a landscape in Bing's title/caption (pt-BR and en, accents removed).
LANDSCAPE_WORDS = (
    "parque nacional", "montanha", "monte ", "lago", "praia", "floresta", "vale ", "cachoeira",
    "catarata", "ilha", "deserto", "serra", "canion", "geleira", "fiorde", "falesia", "dunas",
    "baia", "colina", "cordilheira", "campos", "costa ", "litoral", "lagoa", "vulcao", "aurora",
    "mountain", "lake", "beach", "forest", "valley", "falls", "island", "national park", "glacier",
    "canyon", "desert", "coast", "fjord", "dunes",
)


def _plain(text):
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower()


def _is_landscape(img):
    words = _plain(img.get("title", "") + " " + img.get("copyright", ""))
    return any(w in words for w in LANDSCAPE_WORDS)


def _fetch_bg():
    market = os.environ.get("TV_SERVICES_MARKET", "pt-BR")
    url = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=" + market
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode("utf-8"))
    images = data.get("images") or []
    if not images:
        return
    picks = [i for i in images if _is_landscape(i)]
    img = picks[0] if picks else images[0]
    if img.get("urlbase"):
        full = "https://www.bing.com" + img["urlbase"] + "_1920x1080.jpg"
    else:
        full = "https://www.bing.com" + img["url"]
    with _lock:
        _state["bg"] = {"url": full, "title": img.get("title", ""),
                        "copyright": img.get("copyright", ""), "date": img.get("startdate", "")}


def _loop(fn, every):
    while True:
        try:
            fn()
        except Exception:
            pass
        time.sleep(every)


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        with _lock:
            body = {"/status.json": _state["status"], "/bg.json": _state["bg"]}.get(path)
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):
        pass  # quiet under pythonw


def start():
    """Start the checks and the HTTP server in daemon threads. Call once."""
    threading.Thread(target=_loop, args=(_check_status, STATUS_EVERY), daemon=True).start()
    threading.Thread(target=_loop, args=(_fetch_bg, BG_EVERY), daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


if __name__ == "__main__":
    start()
    print("tv_services on port", PORT, flush=True)
    while True:
        time.sleep(3600)
