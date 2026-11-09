# HTTPS DNS on the LG B8

> Current configuration (2026-11-08): native ConnMan DNS is restored; the
> custom HTTPS DNS boot hook is disabled. The sections below describe the
> historical setup and optional forwarder. See the latest entry at the end.

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

## Native DNS and startup recovery (2026-11-08)

The TV switched from George Martin to Vince Gilligan (5 GHz, 5200 MHz).
A captured switch took about 29 seconds, including an authentication retry;
DHCP then completed and metadata HTTPS worked with the forwarder still active.
This did not establish DNS as the cause of the wireless delay.

Direct UDP DNS tests against the router (192.168.0.1) and forwarder both
resolved Cinemeta, api.strem.io and OpenSubtitles. The native system resolver
was restored by deactivating stremio-dns and removing only our 92-stremio-dns
hook. ConnMan's underlying resolver uses 127.0.0.1; this is its native local
DNS proxy, distinct from our former 127.0.0.2 worker. Metadata HTTPS passed
using this resolver. DHCP and the saved Wi-Fi profile were left unchanged.

A private backup and rollback script remain on the TV at
`/media/developer/stremio/updates/native-dns-20261108-204312/rollback.sh`.
The script restores the saved boot hook and activates the optional forwarder.
A two-minute automatic rollback was armed before the change and disarmed
only after native DNS/HTTPS verification succeeded. Original network backups
remain private on the TV; they have not been copied into this repository.

App 1.3.9 retries startup addon loading and failed Home catalogs with a delay
that grows from 3 to at most 15 seconds. Failed rows remain visible instead
of disappearing. Closing a screen stops its retry timers. Catalog requests
are cancelled on screen destruction. The shared request helper uses XHR,
which can actually abort on this TV's Chromium 53, including on timeout.
Account writes are not automatically retried. Stream lists retain successful
addon results and retry only failed addons; permanent HTTP errors are not
retried. No script disconnects or resets Wi-Fi.

`node tests/network-recovery.test.js` covers request cancellation/timeouts,
retry delays, cleanup, permanent errors, partial-addon recovery, offline
startup and Home catalog recovery. Existing account, subtitle, DNS-forwarder
and server-update tests also pass. A physical power-off/startup and playback
interruption test remain separate from a software reboot and mocked tests.

### Reboot validation

After a software reboot, the TV automatically rejoined Vince Gilligan with
DHCP address 192.168.0.3. The driver recorded a successful association around
23.37 seconds after boot, with no authentication retry in the filtered log.
At uptime 46.85 seconds, the TV reported internet availability. The native
ConnMan resolver remained active, the custom resolver mount and hook were
absent, and the forwarder remained stopped. Cinemeta metadata returned HTTP
200 in 0.503 seconds. App 1.3.9 launched successfully, was reported as the
foreground app, and its local streaming server answered /settings. Installed
util.js and screens.js SHA-256 hashes matched the tested source. This verifies
service/API behavior, not on-screen rendering or actual playback.

## Title-details recovery (1.3.10, 2026-11-08)

The user's overnight symptom appears after selecting a show; other TV apps
can connect. A full software boot captured on the TV joined Vince Gilligan
around 23.78 seconds. Eighteen metadata HTTPS probes from uptime 37.40 to
225.82 seconds all succeeded, including probes bypassing DNS. Stremio was
launched at uptime 72.44 seconds; the streaming server answered by the next
sample at 81.97 seconds. This did not reproduce an overnight failure or
verify on-screen title rendering. The original capture's bounded Luna status
command used incompatible timeout syntax; it has since been corrected to
BusyBox's `timeout -t 3`. The independent Wi-Fi, IP, DNS and HTTPS probes ran.

Reproduction against the title-loading code did confirm that HTTP 503/429
errors were treated as an answered request, returning no title instead of
retrying. A 404 from one addon also hid a temporary error from another.
Requests ran sequentially with 20-second per-provider timeouts.

1.3.10 queries up to four metadata providers concurrently, with a 15-second
per-request timeout. The first valid matching title wins (rather than waiting
for providers in collection order), and outstanding requests are cancelled.
A 404 or an empty successful response means that provider lacks the title.
Network failures, 408/429/5xx errors and invalid responses remain retryable,
even alongside another provider's 404 or permanent error. Other HTTP errors
are reported as rejected requests and are not retried indefinitely.

The title screen now uses the shared retry controller with a 3-to-15-second
capped delay and cancels requests/timers when closed. It distinguishes
unreachable title addons, temporary addon failures and rejected requests;
it does not infer a TV-wide internet outage from an addon request failure.
All new copy is translated into Spanish, French, German and Portuguese.
No router, clock, Wi-Fi or DNS configuration change was needed for this fix.

Network-recovery tests exercise the actual addon and screen-loader code for
mixed errors, retry classification, invalid responses, concurrent success,
bounded concurrency, cancellation, repeated offline recovery and permanent
errors. All five test suites pass. 1.3.10 was installed and launched on the TV;
installed addon/screen file hashes matched the source, and metadata HTTPS
returned HTTP 200. Overnight power-down behavior remains unverified, with
the one-shot startup capture armed for a subsequent full boot.
