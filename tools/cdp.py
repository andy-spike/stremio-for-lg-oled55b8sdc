"""Evaluates JavaScript in a page on the TV through its web inspector (:9998).

Usage:
  cdp.py [--page SUBSTR] -e 'expression'
  cdp.py [--page SUBSTR] -f script.js [-f more.js ...]   (files run in order)
  cdp.py --list

--page picks the first inspectable page whose URL contains SUBSTR
(default: com.local.stremio). Promises are awaited. Prints the value
(strings raw, everything else as JSON) or the exception text.
"""
import argparse, asyncio, json, sys, urllib.request, subprocess
from pathlib import Path
import websockets

TV_IP = subprocess.check_output([str(Path(__file__).resolve().parents[1] / "bin/tv"), "--find"], text=True).strip()
INSPECTOR = "http://" + TV_IP + ":9998/json"


async def evaluate(ws_url, sources):
    async with websockets.connect(ws_url, max_size=None, ping_interval=None, open_timeout=30) as ws:
        result = None
        for i, expr in enumerate(sources, 1):
            await ws.send(json.dumps({"id": i, "method": "Runtime.evaluate", "params": {
                "expression": expr, "returnByValue": True, "awaitPromise": True}}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == i:
                    result = m.get("result", {})
                    break
            if result.get("exceptionDetails") or result.get("wasThrown"):
                break
        return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default="com.local.stremio")
    ap.add_argument("-e", action="append", default=[])
    ap.add_argument("-f", action="append", default=[])
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    pages = json.load(urllib.request.urlopen(INSPECTOR, timeout=10))
    if a.list:
        for p in pages:
            print(p.get("title"), p.get("url"))
        return
    matches = [p for p in pages if a.page in p.get("url", "") and "webSocketDebuggerUrl" in p]
    if not matches:
        sys.exit(f"no inspectable page matching {a.page!r}")
    sources = [open(f, encoding="utf-8").read() for f in a.f] + a.e
    r = asyncio.run(evaluate(matches[0]["webSocketDebuggerUrl"], sources))
    obj = r.get("result", {})
    if r.get("exceptionDetails") or r.get("wasThrown"):
        sys.exit("exception: " + json.dumps(obj.get("description") or r.get("exceptionDetails"))[:2000])
    v = obj.get("value")
    print(v if isinstance(v, str) else json.dumps(v))


main()
