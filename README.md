# Stremio for the LG OLED55B8 (webOS 4)

A Stremio client for this TV: your account, addons, library and Continue
Watching, torrent and HTTP streams, audio-track and subtitle selection, and
DTS audio conversion (this TV can't decode DTS).

## Pieces

| Where | What |
|---|---|
| `app/` → TV app `com.local.stremio` | The interface. Plain JS for Chromium 53 (no build step). |
| `runtime/` → `/media/developer/stremio` on the TV | Node 16 (hard-float build), a private hard-float glibc runtime (Debian 10), static ffmpeg 7.0.2, Stremio's official `server.js` 4.20.19 (patched, see below), and `bin/stremio-service`. Owned by root. |
| `service/stremio-service` | Starts/stops the server. The app runs it through Homebrew Channel's root exec. |

Why the private runtime: the TV's system is soft-float (`/lib/ld-linux.so.3`)
and official Node builds are hard-float, so Node runs through its own loader
(`lib/ld-linux-armhf.so.3 --library-path lib bin/node`). The TV's own
libraries are never touched.

## How the server runs

- As user `nobody`, listening on `127.0.0.1:11470` only (patched in
  `tools/patch-server.py`; the patch also lets `file://` app pages use CORS).
- `DISABLE_CACHING=1`: torrent data stays in a ~45 MB RAM buffer, never on the
  TV's flash storage. Stremio's own TV build does the same. A disk cache would
  not help here: the server never trims the torrent being watched, so one large
  movie would fill the 1.9 GB of free space.
- `NO_HTTPS_SERVER=1`, `CASTING_DISABLED=1`; HTTPS certificate fetching and
  network discovery are off.
- Started on demand when the app opens; a watchdog stops it (and any ffmpeg)
  5 minutes after the app is closed. Log: `/tmp/stremio-server.log` (RAM, trimmed).

## How a file plays

| File | Path |
|---|---|
| H.264/HEVC/VP9 with AAC, AC-3, E-AC-3, MP3, FLAC or TrueHD | Direct to the TV's hardware player. Audio/embedded-subtitle tracks are switched through `luna://com.webos.media` (as Stremio's official webOS player does). |
| DTS (or other audio the TV lacks) | The server re-encodes only the audio to AAC 5.1; video is copied. Played with hls.js (Stremio's build), because the TV's own HLS player can't read fragmented-MP4 HLS. |
| AV1 and other video the TV can't decode | Not converted (this CPU is too slow); the app says so and suggests another stream. |

Addon subtitles (OpenSubtitles) are converted to WebVTT by the server and drawn by the app.

## Privacy

The app talks to `api.strem.io` only for sign-in, addons and library sync. It
sends none of the analytics the official apps send (`Events`, `SeekLog`,
`SkipGaps`).

## Build and install

```sh
python3 -I tools/patch-server.py <official server.js> runtime/server.js
tools/install-runtime.sh                 # runtime -> /media/developer/stremio
python3 -I tools/build-ipk.py            # -> com.local.stremio_<version>_all.ipk
# copy the .ipk to /tmp on the TV, then:
luna-send -n 1 luna://com.webos.appInstallService/dev/install \
  '{"id":"com.ares.defaultName","ipkUrl":"/tmp/stremio.ipk","subscribe":true}' < /dev/null
```

Debugging: `tools/cdp.py -e 'expr'` evaluates JS in the app through the TV's
inspector (:9998); `tools/cdp-shot.py out.jpg` takes a screenshot (pages with a
full-screen backdrop can't be captured). `node tools/test-subtitles.js` tests
the VTT parser.

Gotchas found on this TV:
- `luna-send` over SSH prints nothing unless stdin is `/dev/null`.
- Homebrew Channel's exec service leaks its sockets into commands; background
  processes must be started with `start-stop-daemon -b`, or the exec call never returns.
- ffmpeg ignores SIGTERM while blocked on I/O; `stop` follows up with SIGKILL.
- A suspended (background) app freezes its timers; test with the app in the foreground.

## Undo

```sh
/media/developer/stremio/bin/stremio-service stop
rm -rf /media/developer/stremio
luna-send -n 1 luna://com.webos.appInstallService/dev/remove '{"id":"com.local.stremio"}' < /dev/null
```

## Runtime binaries (not in git)

`runtime/bin/`, `runtime/lib/` and `runtime/server.js` are gitignored
(~140 MB of third-party files). To rebuild `runtime/`:

| Path | Source |
|---|---|
| `runtime/bin/node` | Official Node 16 `linux-armv7l` build (hard-float) |
| `runtime/lib/*` | Debian 10 (buster) `armhf` glibc, libstdc++, libgcc, libatomic |
| `runtime/bin/ffmpeg`, `ffprobe` | Static armhf ffmpeg 7.0.2 |
| `runtime/server.js` | Stremio's official `server.js` 4.20.19, run through `tools/patch-server.py` |

The installed copy is on the TV at `/media/developer/stremio`. A full local
copy of the earlier project, binaries included, is in
`~/backups/lg-tv-legacy-2026-10-31.tar.gz`.

`preview/clip.webm` (sample video for `preview/player.html`) is also ignored;
drop in any short `.webm`.
