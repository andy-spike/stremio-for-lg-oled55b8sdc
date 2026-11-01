#!/bin/sh
set -eu
R=/media/developer/stremio
B=$R/updates/network-dhcp-backup
service=$(cat "$R/updates/dns-backup/service")
S=/var/lib/connman/$service/settings
[ "$(sed -n 's/^IPv4.method=//p' "$S")" = manual ]
umask 077
mkdir -p "$B"
cp -p "$S" "$B/settings"
ip=$(sed -n 's/^IPv4.local_address=//p' "$S")
gateway=$(sed -n 's/^IPv4.gateway=//p' "$S")
[ "$(sed -n 's/^IPv4.netmask_prefixlen=//p' "$S")" = 24 ]
rm -f "$B/confirmed"
cat > "$B/rollback.sh" <<EOF
#!/bin/sh
connmanctl config '$service' --ipv4 manual '$ip' 255.255.255.0 '$gateway'
EOF
chmod 700 "$B/rollback.sh"
(
  sleep 120
  if [ ! -f "$B/confirmed" ]; then
    echo 'No confirmation; restoring original manual address' >> /tmp/stremio-network-repair.log
    sh "$B/rollback.sh" >> /tmp/stremio-network-repair.log 2>&1
  fi
) </dev/null >/dev/null 2>&1 &
sleep 2
connmanctl config "$service" --ipv4 dhcp >> /tmp/stremio-network-repair.log 2>&1
