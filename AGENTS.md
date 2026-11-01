# Stremio for LG OLED55B8SDC

A custom Stremio client for Andy's LG OLED55B8SDC (webOS 4, Chromium 53,
rooted via Homebrew Channel). README.md explains how it works; read it first.

## Every change goes to the TV right away

Andy wants to see every change on the TV as soon as it's made. After each
change to `app/`, bump the patch `version` in `app/appinfo.json` and run:

```sh
tools/deploy.sh       # build, install on the TV, open the app
```

Installing closes the app if it's open; that's expected, don't ask first.
If the TV is off or unreachable, say so; don't loop. Changes to `runtime/`
go out with `tools/install-runtime.sh` instead.

## Commit as you go

Commit each finished feature or fix as its own commit (with the version
bump that shipped it) and push, without waiting to be asked.

## Code

- `app/` is plain ES5-era JS and CSS for Chromium 53: no build step, no
  modules. The existing code uses `var` and `function` only (no `let`,
  `const`, arrow functions or template strings); keep it that way.
  It is driven by the remote's arrow keys and the Magic Pointer.
- `app/lib/` is vendored hls.js. Don't edit it.
- `runtime/` mirrors `/media/developer/stremio` on the TV. Only
  `runtime/bin/stremio-service` is ours and tracked; the rest is gitignored.
- Bump `version` in `app/appinfo.json` when shipping a change.
- Tests: `node tests/subtitles.test.js` and `node tests/account.test.js`. Mock pages for screen work:
  `preview/screens.html`, `preview/player.html`.

## Accessing the TV

```sh
bin/tv --check        # verify connection
bin/tv 'uptime'       # run a command as root
bin/tv --find         # print current IP
```

Plain `ssh lg-tv` also works (defined in `~/.ssh/config`).

- Usual IP `192.168.0.9`, MAC `20:3d:bd:f8:eb:7a`. `bin/tv` finds the TV by
  MAC if the IP changed. Key `~/.ssh/lg-tv_ed25519`; dropbear server.
- Host key pinned in `~/.ssh/known_hosts_lgtv` under the alias `lg-tv`. If the
  host key check fails, stop and tell Andy. Don't disable checking.
- SSH refused: the TV is probably off or booting (SSH starts ~30–40 s after
  boot). Ask Andy to turn it on. Don't loop.
- BusyBox shell: no bash, limited `ps`/`grep` flags.

## Rules for the TV

- You are root on a device with no easy recovery. Back up a file before
  changing it, and keep a rollback path.
- "Reset"/"restart" means `reboot`. Never factory reset: it wipes root and
  every modification.
- Don't touch Homebrew Channel's own files or its failsafe flag.
- Say so before rebooting; Andy may be watching the screen.
- The TV also runs a custom launcher, Magic Pointer toggle and startup
  service from earlier work (not in this repo). Leave them alone. Their
  sources are in `~/backups/lg-tv-legacy-2026-10-31.tar.gz`.
