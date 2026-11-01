"""Builds dist/com.local.stremio_<version>_all.ipk from app/ (version from appinfo.json).

Usage: python3 -I tools/build-ipk.py
Install on the TV: copy to /tmp, then
  luna-send -n 1 luna://com.webos.appInstallService/dev/install \
    '{"id":"com.ares.defaultName","ipkUrl":"/tmp/<file>.ipk","subscribe":true}'
"""
import io, json, tarfile, time
from pathlib import Path

here = Path(__file__).resolve().parent.parent
app = here / "app"
info = json.loads((app / "appinfo.json").read_text())
appid, version = info["id"], info["version"]


def tgz(add):
    b = io.BytesIO()
    with tarfile.open(fileobj=b, mode="w:gz", format=tarfile.GNU_FORMAT) as t:
        add(t)
    return b.getvalue()


def root_owned(i):
    i.uid = i.gid = 0
    i.uname = i.gname = "root"
    return i


def data(t):
    base = f"./usr/palm/applications/{appid}"
    for d in ["./usr", "./usr/palm", "./usr/palm/applications", base]:
        i = tarfile.TarInfo(d); i.type = tarfile.DIRTYPE; i.mode = 0o755; i.mtime = time.time(); t.addfile(i)
    for f in sorted(app.iterdir()):
        t.add(f, arcname=f"{base}/{f.name}", recursive=True, filter=root_owned)


def control(t):
    size_kb = sum(p.stat().st_size for p in app.rglob("*") if p.is_file()) // 1024 + 1
    c = (f"Package: {appid}\nVersion: {version}\nSection: misc\nPriority: optional\n"
         f"Architecture: all\nInstalled-Size: {size_kb}\nMaintainer: local\nDescription: Stremio for webOS\n"
         f"webOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n").encode()
    i = tarfile.TarInfo("./control"); i.size = len(c); i.mode = 0o644; i.mtime = time.time()
    t.addfile(i, io.BytesIO(c))


members = [("debian-binary", b"2.0\n"), ("control.tar.gz", tgz(control)), ("data.tar.gz", tgz(data))]
out = io.BytesIO(); out.write(b"!<arch>\n")
for name, body in members:
    out.write(f"{name + '/':<16}{int(time.time()):<12}{0:<6}{0:<6}{'100644':<8}{len(body):<10}`\n".encode())
    out.write(body)
    if len(body) % 2:
        out.write(b"\n")
(here / "dist").mkdir(exist_ok=True)
p = here / "dist" / f"{appid}_{version}_all.ipk"
p.write_bytes(out.getvalue())
print(p, p.stat().st_size)
