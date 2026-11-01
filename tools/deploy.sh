#!/bin/sh
# Builds the app, installs it on the TV and opens it, so a change shows up
# on screen right away. Installing closes the app if it is open.
#
# Usage: tools/deploy.sh        (from anywhere)
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tv="$here/bin/tv"

ipk=$(python3 -I "$here/tools/build-ipk.py" | cut -d' ' -f1)
echo "built $ipk"

"$tv" 'cat > /tmp/stremio.ipk' < "$ipk"

# Install, waiting until the installer reports the final state.
"$tv" 'luna-send -i luna://com.webos.appInstallService/dev/install \
  "{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/stremio.ipk\",\"subscribe\":true}" < /dev/null > /tmp/stremio-install.log 2>&1 &
  pid=$!
  i=0
  while [ $i -lt 60 ]; do
    if grep -q "\"state\":\"installed\"" /tmp/stremio-install.log; then kill $pid; echo installed; break; fi
    if grep -qE "\"state\":\"(failed|install failed)\"|\"returnValue\":false" /tmp/stremio-install.log; then kill $pid; cat /tmp/stremio-install.log; exit 1; fi
    sleep 1; i=$((i+1))
  done
  [ $i -lt 60 ] || { kill $pid; echo "install timed out"; cat /tmp/stremio-install.log; exit 1; }
  rm -f /tmp/stremio.ipk /tmp/stremio-install.log'

"$tv" 'luna-send -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"com.local.stremio\"}" < /dev/null'
version=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$here/app/appinfo.json")
echo "on the TV: com.local.stremio $version"
