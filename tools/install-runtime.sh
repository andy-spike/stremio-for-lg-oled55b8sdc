#!/bin/sh
# Copies runtime/ (Node, hard-float libraries, ffmpeg, server.js and the
# stremio-service control script) to /media/developer/stremio on the TV,
# owned by root. runtime/ mirrors that folder.
#
# Usage: tools/install-runtime.sh        (from the repo root)
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ssh_tv() { ssh lg-tv "$@"; }   # alias from ~/.ssh/config

# Updating our scripts should not reinstall binaries or replace server choices.
if [ "${1:-}" = "--scripts" ]; then
  tar -C "$here/runtime" -cf - bin/stremio-service bin/stremio-update bin/update.js bin/patch-server.js | ssh_tv 'set -e
    R=/media/developer/stremio
    backup=$R/updates/scripts-$(date +%Y%m%d-%H%M%S)
    mkdir -p "$backup/bin" "$backup/new"
    for name in stremio-service stremio-update update.js patch-server.js; do
      cp -p "$R/bin/$name" "$backup/bin/$name"
    done
    tar -C "$backup/new" -xf -
    chown -R root:root "$backup/new"
    chmod 755 "$backup/new/bin/"*
    for name in stremio-service stremio-update update.js patch-server.js; do
      mv "$backup/new/bin/$name" "$R/bin/$name"
    done
    echo "Scripts installed; backup: $backup"'
  exit 0
fi
[ "$#" -eq 0 ] || { echo "usage: $0 [--scripts]" >&2; exit 2; }

tar -C "$here/runtime" -cf - bin lib server.js \
  | ssh_tv 'set -e
      R=/media/developer/stremio
      [ -x $R/bin/stremio-service ] && $R/bin/stremio-service stop >/dev/null || true
      mkdir -p $R.new && tar -C $R.new -xf -
      if [ -d $R/data ]; then mv $R/data $R.new/data; fi
      # Retain updater state and recovery servers across script deployments.
      if [ -d $R/updates ]; then cp -a $R/updates $R.new/updates; fi
      backup=$R.backup-$(date +%Y%m%d-%H%M%S)
      [ ! -e "$backup" ] || exit 1
      if [ -d $R ]; then mv $R "$backup"; fi
      mv $R.new $R'
ssh_tv 'R=/media/developer/stremio
  chown -R root:root $R && chmod -R go-w $R && chmod 755 $R/bin/* $R/lib/ld-linux-armhf.so.3
  mkdir -p $R/data && chown nobody $R/data
  du -sh $R'
