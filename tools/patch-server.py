"""Patches the official Stremio server.js for the TV.

1. Listen only on 127.0.0.1, so other devices on the network can't use it.
2. Send CORS headers to installed TV apps (file:// pages report their origin
   as "file://" or "null"), so the app can load HLS playlists with XHR.
   Websites opened in the TV's browser stay blocked, unlike NO_CORS=1.

Usage: python3 -I tools/patch-server.py <in server.js> <out server.js>
Each replacement must match exactly once, so a new server version that
changed this code fails loudly instead of silently staying exposed.
"""
import sys

PATCHES = [
    ('server.listen(port), server.on("error",',
     'server.listen(port, "127.0.0.1"), server.on("error",'),
    ('(console.warn(err), server.listen(port))',
     '(console.warn(err), server.listen(port, "127.0.0.1"))'),
    ('process.env.NO_CORS || !req.headers.origin ||',
     'process.env.NO_CORS || !req.headers.origin || "file://" === req.headers.origin || "null" === req.headers.origin ||'),
]

src = open(sys.argv[1], encoding="utf-8").read()
for old, new in PATCHES:
    n = src.count(old)
    if n != 1:
        sys.exit(f"expected 1 match, found {n}: {old}")
    src = src.replace(old, new)
open(sys.argv[2], "w", encoding="utf-8").write(src)
print("patched", sys.argv[2])
