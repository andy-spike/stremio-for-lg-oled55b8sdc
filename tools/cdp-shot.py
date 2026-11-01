import asyncio, json, base64, sys, urllib.request, websockets, subprocess
from pathlib import Path
TV_IP = subprocess.check_output([str(Path(__file__).resolve().parents[1] / "bin/tv"), "--find"], text=True).strip()

async def main(out):
    pages = json.load(urllib.request.urlopen("http://" + TV_IP + ":9998/json"))
    url = [p for p in pages if (sys.argv[2] if len(sys.argv) > 2 else "com.local.stremio") in p["url"]][0]["webSocketDebuggerUrl"]
    async with websockets.connect(url, max_size=None, ping_interval=None, open_timeout=30) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Page.captureScreenshot", "params": {"format": "jpeg", "quality": 70}}))
        while True:
            m = json.loads(await ws.recv())
            if m.get("id") == 1:
                open(out, "wb").write(base64.b64decode(m["result"]["data"])); print("saved", out); return
asyncio.run(main(sys.argv[1]))
