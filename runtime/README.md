# runtime/

Mirror of `/media/developer/stremio` on the TV. `tools/install-runtime.sh`
copies it there. Only `bin/stremio-service` (ours) is in git; the rest is
third-party and gitignored (~140 MB).

| Path | Source |
|---|---|
| `bin/stremio-service` | Ours. Starts/stops the server; the app calls it through Homebrew Channel's root exec. |
| `bin/node` | Official Node 16 `linux-armv7l` build (hard-float) |
| `bin/ffmpeg`, `bin/ffprobe` | Static armhf ffmpeg 7.0.2 |
| `lib/*` | Debian 10 (buster) `armhf` glibc, libstdc++, libgcc, libatomic |
| `server.js` | Stremio's official `server.js` 4.20.19 after `tools/patch-server.py` |

Other copies: the TV itself, and
`~/backups/lg-tv-legacy-2026-10-31.tar.gz` (`lg-tv/history/2026-10-26-initial-mods/stremio-tv/runtime/`).
