# runtime/

Mirror of `/media/developer/stremio` on the TV. `tools/install-runtime.sh`
copies it there. Only our scripts in `bin/` are in git; the rest is
third-party and gitignored (~140 MB).

| Path | Source |
|---|---|
| `bin/stremio-service` | Ours. Starts/stops the server; the app calls it through Homebrew Channel's root exec. |
| `bin/stremio-update`, `bin/update.js` | Ours. Server and app updates (see [the technical guide](../docs/technical.md)). |
| `bin/patch-server.js` | Ours. The TV patches for Stremio's `server.js`. |
| `bin/dns-forwarder.js`, `bin/stremio-dns` | Loopback HTTPS DNS forwarder and supervisor; see [DNS setup and rollback](../docs/dns.md). |
| `bin/node` | Official Node 16 `linux-armv7l` build (hard-float) |
| `bin/ffmpeg`, `bin/ffprobe` | Static armhf ffmpeg 7.0.2 |
| `lib/*` | Debian 10 (buster) `armhf` glibc, libstdc++, libgcc, libatomic |
| `server.js` | Stremio's official `server.js` 4.20.19 after `bin/patch-server.js`. The TV replaces it with newer versions by itself. |

Other copies: the TV itself, and
`~/backups/lg-tv-legacy-2026-10-31.tar.gz` (`lg-tv/history/2026-10-26-initial-mods/stremio-tv/runtime/`).
