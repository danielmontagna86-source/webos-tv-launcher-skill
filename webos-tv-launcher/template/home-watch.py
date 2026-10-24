#!/usr/bin/env python3
"""Open the launcher when LG's home appears, and host the optional tv_services.

Replaces home-watch.py from webos-vibehack (OmkarK97, MIT). Runs on an always-on device on the
same network (Windows PC, Mac, Raspberry Pi). It watches the TV's foreground app over the
remote-control service (port 3000/3001) and launches the launcher when LG's home shows up.

IMPORTANT, webOS 5 (2020 TVs): pressing Home *from inside an app* (Netflix...) opens LG's home as an
overlay and the foreground app does NOT change, so nothing reaches this script. It only works
when the TV powers on to LG's home, or when leaving an app makes the foreground app empty.
On webOS 5 use the number-key shortcut (hold 1 with the launcher open) as your "Home" button.
On webOS 22+ (home is a real app) the Home button redirect works fully.

Press Home twice within ESCAPE_SECONDS to stay on LG's home.

    python home-watch.py 192.168.1.50
    HOMEWATCH_DEBUG=1 python home-watch.py 192.168.1.50   # log every foreground change

Needs: pip install websockets. Pair once first (sync-apps.py does it).
"""
import asyncio
import json
import os
import sys
import time

import lgtv

try:
    import tv_services
except ImportError:          # the service is optional
    tv_services = None

LAUNCHER = os.environ.get("LAUNCHER_ID", "com.gathin.tvhome")
LG_HOME = "com.webos.app.home"
# webOS 5 shows LG's home as an overlay and reports an empty foreground appId while it is open.
HOME_IDS = (LG_HOME, "")
ESCAPE_SECONDS = 3.0


def log(*args):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *args, flush=True)


async def watch(host):
    ws = await lgtv.session(host, ping_interval=10, ping_timeout=10)
    log("connected to", host)
    last_redirect = 0.0
    try:
        await ws.send(json.dumps({"type": "subscribe", "id": "fg",
                                  "uri": "ssap://com.webos.applicationManager/getForegroundAppInfo",
                                  "payload": {}}))
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("id") != "fg":
                continue
            app = msg.get("payload", {}).get("appId")
            if os.environ.get("HOMEWATCH_DEBUG"):
                log("foreground:", json.dumps(msg.get("payload", {}))[:300])
            if app not in HOME_IDS:
                continue
            now = time.monotonic()
            if now - last_redirect < ESCAPE_SECONDS:
                log("Home pressed twice: staying on LG home")
                last_redirect = 0.0
                continue
            last_redirect = now
            await ws.send(json.dumps({"type": "request", "id": "launch", "uri": "ssap://system.launcher/launch",
                                      "payload": {"id": LAUNCHER}}))
            log("LG home -> launcher")
    finally:
        await ws.close()


async def main(host):
    delay = 5
    while True:
        try:
            await watch(host)
            delay = 5
        except (OSError, asyncio.TimeoutError, lgtv.websockets.WebSocketException) as e:
            log("not connected:", type(e).__name__, e)   # TV off or in standby: keep trying
            delay = min(delay * 2, 20)
        await asyncio.sleep(delay)


if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TV_HOST")
    if not host:
        sys.exit("usage: home-watch.py <TV IP>")
    if tv_services and os.environ.get("TV_SERVICES", "1") != "0":
        try:
            tv_services.start()   # status + photo of the day for the TV, on port 8765
        except OSError as e:
            log("tv_services not started:", e)
    try:
        asyncio.run(main(host))
    except KeyboardInterrupt:
        pass
