# HTTPS DNS on the LG B8

The initial symptom looked like UDP DNS failure. Further tests found an IP
address conflict: the TV was manually assigned **192.168.0.9**, and another
MAC (**8E:D4:73:B3:37:6E**) answered an ARP duplicate-address probe for that IP.
This also interrupted direct TCP/HTTPS connections, independently of DNS.

The TV now uses DHCP and received **192.168.0.10** (later 192.168.0.5; see the end of this file). A duplicate-address probe
for the new IP received no replies. The change was protected by a two-minute
automatic rollback, cancelled after reconnecting with the pinned SSH key and
successfully fetching metadata. The original manual configuration and a
rollback script are in `updates/network-dhcp-backup` on the TV. Returning to
192.168.0.9 can reintroduce the conflict; prefer DHCP. The SSH alias now points
to the new address, with its previous config backed up alongside `~/.ssh/config`.
`bin/tv`, deployment and inspector tools handle address discovery.

The HTTPS forwarder is enabled as approved, with its own tested rollback.
It avoids external UDP DNS transport but cannot overcome a lost Internet
connection or another address conflict. Both the network correction and DNS
forwarder were validated after the conflict was resolved.

## Design

`runtime/bin/dns-forwarder.js` listens on **127.0.0.2:53 only**, over UDP and
TCP. It races authenticated DNS-over-HTTPS requests to Cloudflare's 1.0.0.1
and 1.1.1.1 addresses, using `cloudflare-dns.com` for TLS verification and the
HTTP Host header. No bootstrap DNS, npm packages or disabled certificate checks
are needed. Both addresses are the same provider, not independent providers.

Requests have an absolute eight-second deadline. At most 32 queries (64 upstream
requests) are outstanding. Malformed queries are dropped, overload/upstream
failure returns SERVFAIL, and oversized UDP answers are marked truncated so
clients can retry with TCP. The process drops to nobody after binding. No
hostnames or DNS payloads are logged. SIGUSR1 logs aggregate counters and RSS.
On this TV it used approximately 24 MB RSS during verification.

`stremio-dns` supervises the worker with a five-second restart delay, a 24 MB
V8 heap limit, and bounded RAM-backed logs at `/tmp/stremio-dns.log`.

ConnMan cannot reliably relay DNS to the loopback upstream on this firmware.
Its Nameservers setting therefore remains at its original value. Instead,
`activate` bind-mounts a private resolver file read-only over the target of
`/etc/resolv.conf` (`/var/lib/misc/resolv.conf` on this TV). The original file
is hidden, not replaced. Only that mount is read-only; the data partition
remains writable. ConnMan cannot overwrite the active resolver file. Network
reconnection behavior has not been tested; failures writing resolver settings
may appear in ConnMan logs while the mount is active.

Our custom user hook `/var/lib/webosbrew/init.d/92-stremio-dns` activates the
service at boot. Existing hooks, Homebrew binaries, failsafe, launcher and
startup service are untouched. The hook was initially verified manually; a
subsequent authorized reboot confirmed automatic DNS activation (see below).

## Enable and undo

From this checkout:

```sh
tools/install-runtime.sh --scripts
tools/configure-dns.sh enable
# Restore the underlying resolver configuration and remove our startup hook:
tools/configure-dns.sh disable
```

`enable` verifies DNS and Attack on Titan metadata before installing the boot
hook. Activation failure unmounts the resolver override, stops the service,
and removes our hook. Backups of the original connection settings and resolver
file are retained under `/media/developer/stremio/updates/dns-backup` (private:
connection settings can contain credentials). Never publish these backups.

For immediate recovery directly on the TV:

```sh
/media/developer/stremio/bin/stremio-dns deactivate
rm -f /var/lib/webosbrew/init.d/92-stremio-dns
```

Full runtime installation deactivates DNS before replacing the runtime and
reactivates it afterward if the custom hook is enabled. Script-only deployment
keeps the running worker until its next restart; restart the DNS service after
changing its implementation.

## Verification on 2026-11-01

Early results below were intermittent before the address conflict was corrected.

- Original DNS after power cycle: Attack on Titan metadata HTTP 200, 0.184 s.
- Direct HTTPS forwarder: Cinemeta, OpenSubtitles, dl.strem.io and api.github.com
  resolved successfully; final activation batch 0.528–0.548 s per lookup.
- Active system resolver: Attack on Titan metadata HTTP 200 with 131 episodes;
  one timed request completed in 0.268 s. This is a different request from the
  direct DNS timing batch, not a controlled performance comparison.
- Disable restored ConnMan's original resolver and stopped the forwarder;
  metadata still returned HTTP 200, 0.163 s. Re-enable passed all four DNS tests.
- Worker terminated deliberately: supervisor restarted it; four DNS lookups
  passed after restart, 0.444–0.544 s, 4 successes and 0 upstream failures.
- Supported boot hook manually invoked twice without replacing settings.
- Local tests cover fallback, unavailable upstreams, overload, malformed input,
  TLS options and invalid responses; account, subtitle and updater tests pass.
- TV browser automation is limited by Chromium 53's unsupported CDP Target API.
  Actual title-screen rendering, addon stream availability and on-screen
  playback have not been verified in this change. The browser's own DNS cache
  may require closing and reopening the app before it uses the new resolver.

### Final checks after changing to DHCP

- Activation: UDP DNS checks passed in 268–529 ms; TCP DNS passed in 676 ms.
- Attack on Titan metadata: HTTP 200, correct ID and 131 episodes.
- DNS rollback: original resolver restored, daemon stopped, metadata HTTP 200
  in 0.183 s. DNS subsequently re-enabled successfully.
- Deliberately stopped worker: supervisor restarted it; UDP DNS passed in
  628–645 ms and TCP DNS in 756 ms. Counters: 5 queries, 5 successes, no
  upstream errors. RSS 25,419,776 bytes (about 24.2 MiB).
- Current state: DHCP address 192.168.0.10, HTTPS DNS enabled, custom boot hook
  installed, Stremio server 4.22.5 with 4.20.19 available for rollback.

## Post-reboot verification (2026-11-01)

The TV was rebooted at about 15:31 local time. SSH reconnected after startup,
and uptime confirmed a fresh boot. No manual DNS activation was needed:

- DHCP persisted and the TV retained 192.168.0.10.
- The DNS supervisor and worker started automatically, listening on loopback;
  `/etc/resolv.conf` again pointed to 127.0.0.2 through the read-only bind mount.
- Four UDP DNS checks passed in 213–458 ms; TCP DNS passed in 561 ms.
- Attack on Titan metadata returned the expected title, ID and 131 episodes.
- Stremio 1.3.7 was launched through applicationManager. Its running-app list
  and foreground-app API both confirmed `com.local.stremio`.
- The streaming server was started and answered as 4.22.5. Previous version
  4.20.19 and both DNS/network recovery backups remained available.
- Controlled torrent discovery, metadata and file selection passed. The served
  H.264/AAC MP4 matched its original checksum. The probe endpoint identified
  both codecs, and HLS master and video media playlists were generated.
- SHA-256 checks of the installed server, DNS worker, DNS supervisor, updater,
  streaming service and patcher all matched the local runtime files.
- DNS, server-update, account and subtitle test suites passed.

The foreground-app check confirms that Stremio is open on the TV. Actual
rendered title details and on-screen playback still require a screen check:
both available capture API probes were rejected by this firmware. Network
reconnection without reboot remains a separate, untested scenario.

## Slow Wi-Fi after power-on (2026-11-01, fixed on the router)

Symptom: right after turning the TV on, opening a title showed "No addon has
details for this title." Cause: no network yet, not DNS or the server.

The kernel log (`dmesg`) showed Wi-Fi joining at ~24 s, then the router
de-authenticating the TV 3 s later with reason 15 ("4-way handshake
timeout"). ConnMan rescanned with growing gaps (30, 38, 54, 86 s) and only
reconnected at 87 s. DHCP itself was fast: the router answered a test
request in 0.4 s.

The router (ZTE F680, Claro/ETB firmware) used the mixed **WPA/WPA2-PSK
TKIP/AES** mode, giving the TV a TKIP group key. Setting the network's
**Encryption Type** to **WPA2-PSK-AES** (one field on this firmware) fixed
it: after two reboots the TV joined on the first try at ~23 s and was online
25–29 s after boot, with CCMP for both pairwise and group ciphers. WPS is
still advertised; turning it off is optional.

The app now also retries details and streams while the network is down
(1.3.8), so the remaining ~25 s window after power-on only shows "Can't
reach the internet yet. Trying again…".

The router then gave the TV a new DHCP address, **192.168.0.5**. `bin/tv`
finds the TV by MAC; the `lg-tv` SSH alias was updated (backup next to
`~/.ssh/config`). A boot-time Wi-Fi watchdog was tried and dropped: the
router fix made it unnecessary. When testing Wi-Fi on the TV, don't run
`connmanctl disconnect` from a script: it ended the test script before its
own recovery step ran, and the TV stayed offline until reconnected from the
TV's Settings.
