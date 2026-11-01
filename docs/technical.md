# Technical guide

A Stremio client for this TV: your account, addons, library and Continue
Watching, torrent and HTTP streams, audio-track and subtitle selection, and
DTS audio conversion (this TV can't decode DTS).

## Layout

| Path | What |
|---|---|
| `app/` | The TV app `com.local.stremio`. Plain JS for Chromium 53, no build step. `app/lib/` is vendored hls.js. |
| `runtime/` | Mirror of `/media/developer/stremio` on the TV: Node 16 (hard-float), a private hard-float glibc (Debian 10), static ffmpeg 7.0.2, Stremio's patched `server.js` 4.20.19, and our `bin/stremio-service`, which starts/stops the server (the app runs it through Homebrew Channel's root exec). Only `stremio-service` is in git; [`../runtime/README.md`](../runtime/README.md) lists where the rest comes from. |
| `tools/` | Build, install and debug scripts. |
| `tests/` | `node tests/subtitles.test.js` checks the VTT parser. |
| `preview/` | Desktop mock pages of the app screens and player, with sample art. `clip.webm` (sample video) is gitignored; drop in any short `.webm`. |
| `bin/tv` | SSH helper for the TV (`bin/tv --check`, `bin/tv 'cmd'`). |
| `dist/` | Built `.ipk` files (gitignored). |

Why the private runtime: the TV's system is soft-float (`/lib/ld-linux.so.3`)
and official Node builds are hard-float, so Node runs through its own loader
(`lib/ld-linux-armhf.so.3 --library-path lib bin/node`). The TV's own
libraries are never touched.

## How the server runs

- As user `nobody`, listening on `127.0.0.1:11470` only (patched in
  `runtime/bin/patch-server.js`; the patch also lets `file://` app pages use CORS).
- `DISABLE_CACHING=1`: torrent data stays in a ~45 MB RAM buffer, never on the
  TV's flash storage. Stremio's own TV build does the same. A disk cache would
  not help here: the server never trims the torrent being watched, so one large
  movie would fill the 1.9 GB of free space.
- Node memory is capped low (`--max-old-space-size=160 --max-semi-space-size=2
  --optimize-for-size`): the TV has little free RAM, and with a 256 MB cap the
  server grew to ~200 MB while streaming. Measured at ~135 MB streaming 1080p.
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

Before playing, the server reads the file (ffprobe) to learn its codecs. If a
slow torrent doesn't deliver enough of it in time, the app guesses from the file
name and stream title ("DTS", "x265" ...) and reads the file again once playback
has started, switching to audio conversion then if it's needed.

Addon subtitles (OpenSubtitles) are converted to WebVTT by the server and drawn by the app.

## Updates

**Server: automatic.** Once a day (and from Settings > Updates > Check for
updates) the app runs `bin/stremio-update server` on the TV, in the background:

1. Find the newest server. Stremio publishes each version at
   `dl.strem.io/server/v<version>/desktop/server.js` with no "latest"
   pointer, so the updater tries the next version numbers.
2. Require an explicitly verified version in `update.js`, download it, apply
   `patch-server.js`, verify the exact patched SHA-256, and syntax-check it.
   Unknown versions or changed bundles leave the current server installed, even
   for a forced update. Approvals require tests on this TV before editing the list.
3. Archive the installed and previous servers under `updates/archive/`, then
   put it in place, keeping the old one as `updates/server.prev.js`, and mark
   it `updates/pending`. The app restarts the server unless something is playing.
4. On its next start, `stremio-service` waits for the new server to answer
   on 127.0.0.1 only. If it doesn't, or if it listens on the network, the
   previous server comes back and that version is skipped from then on.

Settings > Updates > "Switch to server X" swaps the current and the previous
server (going back skips the newer one until an explicit forced update).
A pending update blocks further installations so its recovery copy is retained.
Runtime deployments also retain `updates/` and a dated full runtime backup.
Use `tools/install-runtime.sh --scripts` for changes to our four runtime scripts;
it backs those up without replacing the installed server or its binaries.

The startup check is a startup/network-binding check, not proof that every
addon or media format works. Before approving a bundle, test torrent discovery,
metadata, file selection, byte delivery and ffprobe using a controlled seeded
video on the TV. Also test addon metadata independently: browsing details uses
HTTPS addon requests and does not go through the streaming server.

On 2026-11-01, 4.22.5 passed controlled tracker/peer discovery, metadata, file
selection, exact-byte H.264/AAC delivery, ffprobe and HLS master-playlist
generation on the B8. Attack on Titan
(`tt2560140`) metadata timed out with normal DNS, but returned 85,818 bytes
when the hostname was resolved explicitly. DNS requests timed out independently
of the streaming server; this was not evidence of a server API regression.
Full playback on the TV screen and public torrent availability remain separate
checks; a controlled transfer cannot guarantee those.

**App: when asked.** The app reads this repo's GitHub releases. When one is
newer, it says so; "Install app X" downloads its `.ipk` on the TV and installs
it (the app closes and opens again). "Go back to app X" installs the previous
release. `tools/release.sh` publishes a release.

Progress: `/tmp/stremio-update.json`; log: `/tmp/stremio-update.log`.

## Privacy

The app talks to `api.strem.io` only for sign-in, addons and library sync,
and to GitHub and `dl.strem.io` only for updates. It
sends none of the analytics the official apps send (`Events`, `SeekLog`,
`SkipGaps`).

## Build and install

```sh
node runtime/bin/patch-server.js <official server.js> runtime/server.js
tools/install-runtime.sh                 # runtime -> /media/developer/stremio
tools/deploy.sh                          # build -> dist/, install on the TV, open the app
```

Bump `version` in `app/appinfo.json` for each release.

Debugging: `tools/cdp.py -e 'expr'` evaluates JS in the app through the TV's
inspector (:9998); `tools/cdp-shot.py out.jpg` takes a screenshot (pages with a
full-screen backdrop can't be captured). Both need `pip install websockets`.

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

## Optional HTTPS DNS

The B8 has a reversible local DNS-over-HTTPS forwarder to avoid external UDP
DNS timeouts. See [DNS setup, verification and rollback](dns.md).
