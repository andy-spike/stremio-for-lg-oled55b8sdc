#!/bin/sh
# Copies runtime/ (Node, hard-float libraries, ffmpeg, server.js and the
# stremio-service control script) to /media/developer/stremio on the TV,
# owned by root. runtime/ mirrors that folder.
#
# Usage: tools/install-runtime.sh        (from the repo root)
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ssh_tv() { ssh lg-tv "$@"; }   # alias from ~/.ssh/config

tar -C "$here/runtime" -cf - bin lib server.js \
  | ssh_tv 'set -e
      R=/media/developer/stremio
      [ -x $R/bin/stremio-service ] && $R/bin/stremio-service stop >/dev/null || true
      mkdir -p $R.new && tar -C $R.new -xf -
      if [ -d $R/data ]; then mv $R/data $R.new/data; fi
      rm -rf $R && mv $R.new $R'
ssh_tv 'R=/media/developer/stremio
  chown -R root:root $R && chmod -R go-w $R && chmod 755 $R/bin/* $R/lib/ld-linux-armhf.so.3
  mkdir -p $R/data && chown nobody $R/data
  du -sh $R'
