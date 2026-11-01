#!/bin/sh
# Publishes the current app version as a GitHub release, so the TV can
# install it (Settings > Updates). Run after the version's commit is pushed.
#
# Usage: tools/release.sh        (from anywhere)
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$here"
version=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' app/appinfo.json)

[ -z "$(git status --porcelain app)" ] || { echo "app/ has uncommitted changes; commit first" >&2; exit 1; }
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ] || { echo "push first: HEAD isn't on the remote" >&2; exit 1; }
if gh release view "v$version" >/dev/null 2>&1; then echo "v$version is already released"; exit 0; fi

ipk=$(python3 -I tools/build-ipk.py | cut -d' ' -f1)
gh release create "v$version" "$ipk" --target "$(git rev-parse HEAD)" --title "$version" \
  --notes "$(git log -1 --format=%s)"
echo "released v$version"
