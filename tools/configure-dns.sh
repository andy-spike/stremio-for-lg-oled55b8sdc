#!/bin/sh
# Enable the TV's HTTPS DNS forwarder, or restore its original DNS configuration.
set -eu
case "${1:-}" in enable|disable) action=$1 ;; *) echo "usage: $0 enable|disable" >&2; exit 2 ;; esac
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tv_ip=$("$here/bin/tv" --find)
# Ship the standalone verification command and our own startup hook to staging.
if [ "$action" = enable ]; then
  scp -q -o HostName="$tv_ip" "$here/tools/tv/test-dns.js" lg-tv:/tmp/stremio-test-dns.js
  scp -q -o HostName="$tv_ip" "$here/tools/tv/stremio-dns-startup" lg-tv:/tmp/stremio-dns-startup
fi
ssh -o HostName="$tv_ip" lg-tv /bin/sh -s -- "$action" <<'REMOTE'
set -eu
R=/media/developer/stremio
B=$R/updates/dns-backup
HOOK=/var/lib/webosbrew/init.d/92-stremio-dns
node() { "$R/lib/ld-linux-armhf.so.3" --library-path "$R/lib" "$R/bin/node" "$@"; }
if [ "$1" = disable ]; then
  [ -f "$B/service" ] && [ -f "$B/settings" ] || { echo "No DNS backup" >&2; exit 1; }
  "$R/bin/stremio-dns" deactivate
  rm -f "$HOOK"
  echo "Original DNS restored; custom startup hook removed; forwarder stopped"
  exit 0
fi
iface=$(ip route | awk '/^default/ {print $5; exit}')
mac=$(tr -d ':' < "/sys/class/net/$iface/address")
case "$iface" in wlan*) prefix=wifi ;; eth*) prefix=ethernet ;; *) echo "Unsupported network interface: $iface" >&2; exit 1 ;; esac
set -- /var/lib/connman/${prefix}_${mac}_*/settings
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo "Cannot identify one connection profile" >&2; exit 1; }
settings=$1
service=$(basename "$(dirname "$settings")")
umask 077
mkdir -p "$B"
chmod 700 "$B"
if [ -f "$B/service" ]; then
  [ "$(cat "$B/service")" = "$service" ] || { echo "Backup belongs to a different connection" >&2; exit 1; }
else
  [ -f "$B/settings" ] || cp -p "$settings" "$B/settings"
  printf '%s\n' "$service" > "$B/service"
fi
[ -f "$B/resolv.conf" ] || cp -p /etc/resolv.conf "$B/resolv.conf"
if [ -e "$HOOK" ]; then
  cmp -s /tmp/stremio-dns-startup "$HOOK" || { echo "Startup hook path already occupied" >&2; exit 1; }
fi
# Any activation failure restores the saved configuration and removes our hook.
trap '"$R/bin/stremio-dns" deactivate; rm -f "$HOOK"' EXIT
"$R/bin/stremio-dns" activate
node /tmp/stremio-test-dns.js 127.0.0.2
curl -fsS --max-time 15 https://v3-cinemeta.strem.io/meta/series/tt2560140.json -o /tmp/stremio-dns-verified.json
node -e 'const m=JSON.parse(require("fs").readFileSync("/tmp/stremio-dns-verified.json")); if (!m.meta || m.meta.id !== "tt2560140" || !m.meta.videos.length) process.exit(1); console.log("Attack on Titan metadata verified: " + m.meta.videos.length + " episodes");'
cp /tmp/stremio-dns-startup "$HOOK"
chmod 755 "$HOOK"
trap - EXIT
echo "HTTPS DNS enabled; original configuration saved in $B"
REMOTE
