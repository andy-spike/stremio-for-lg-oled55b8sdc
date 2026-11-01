// Updates the streaming server and the app. Run by bin/stremio-update (as
// root, with the Node in this folder); see that script for the commands.
//
// Server: Stremio publishes each server version at
//   https://dl.strem.io/server/v<version>/desktop/server.js
// with no "latest" pointer, so newer versions are found by trying the next
// version numbers. A new server.js is downloaded, patched (patch-server.js),
// syntax-checked and put in place; the old one is kept as
// updates/server.prev.js. The running server keeps the old code until it
// restarts. "updates/pending" marks the new one as unproven: bin/stremio-service
// checks that it answers after starting, and switches back if it doesn't.
//
// App: installs com.local.stremio_<version>_all.ipk from this repo's GitHub
// release v<version>, then opens the app again.

"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn, spawnSync } = require("child_process");
const { patch } = require("./patch-server.js");

const ROOT = "/media/developer/stremio";
const UPD = ROOT + "/updates";
const SERVER = ROOT + "/server.js";
const PREV = UPD + "/server.prev.js";
const PENDING = UPD + "/pending";
const SKIP = UPD + "/skip";
const PROGRESS = "/tmp/stremio-update.json";
const SERVER_URL = (v) => "https://dl.strem.io/server/v" + v + "/desktop/server.js";
const APP_ID = "com.local.stremio";
const APP_URL = (v) => "https://github.com/andy-spike/stremio-for-lg-oled55b8sdc/releases/download/v" + v + "/" + APP_ID + "_" + v + "_all.ipk";
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function log(msg) { console.error(new Date().toISOString() + " " + msg); }
function read(file) { try { return fs.readFileSync(file, "utf8").trim(); } catch (e) { return ""; } }
function progress(p) {
  p.at = Date.now();
  fs.writeFileSync(PROGRESS + ".tmp", JSON.stringify(p));
  fs.renameSync(PROGRESS + ".tmp", PROGRESS);
  log(JSON.stringify(p));
}

function parse(v) { return v.split(".").map(Number); }
function cmp(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// The version in the server's bundled package.json.
function versionOf(src) {
  const m = /name: "stremio-server",\s*version: "(\d+\.\d+\.\d+)"/.exec(src);
  return m ? m[1] : null;
}
function serverVersion(file) {
  try { return versionOf(fs.readFileSync(file, "utf8")); } catch (e) { return null; }
}

function skipped() { return read(SKIP).split("\n").filter((v) => VERSION.test(v)); }
function setSkipped(list) {
  fs.mkdirSync(UPD, { recursive: true });
  fs.writeFileSync(SKIP, list.filter((v, i) => list.indexOf(v) === i).join("\n") + "\n");
}

// HTTPS GET (following redirects). head=true resolves with the status code only.
function get(url, head, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: head ? "HEAD" : "GET", timeout: 30000,
      headers: { "User-Agent": "stremio-lg-tv-updater" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), head, redirects + 1));
        return;
      }
      if (head) { res.resume(); resolve(res.statusCode); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error("HTTP " + res.statusCode + " for " + url)); return; }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timed out: " + url)));
    req.on("error", reject);
    req.end();
  });
}

async function exists(v) { return (await get(SERVER_URL(v), true)) === 200; }

// Walks forward from the current version: the next few patch numbers, then
// the next minor, then the next major, until nothing newer is published.
async function latestServer(current) {
  let best = current;
  for (let guard = 0; guard < 50; guard++) {
    const [a, b, c] = parse(best);
    const next = [[a, b, c + 1], [a, b, c + 2], [a, b, c + 3], [a, b + 1, 0], [a, b + 2, 0], [a + 1, 0, 0]].map((x) => x.join("."));
    let found = null;
    for (const v of next) if (await exists(v)) { found = v; break; }
    if (!found) return best;
    best = found;
  }
  return best;
}

async function updateServer(force) {
  const task = "server";
  try {
    const current = serverVersion(SERVER);
    if (!current) throw new Error("can't read the installed server's version");
    progress({ task, state: "checking", current });
    const latest = await latestServer(current);
    fs.mkdirSync(UPD, { recursive: true });
    fs.writeFileSync(UPD + "/last-check", String(Date.now()));
    if (cmp(latest, current) <= 0) { progress({ task, state: "uptodate", current, latest }); return; }
    if (!force && skipped().indexOf(latest) >= 0) { progress({ task, state: "skipped", current, latest }); return; }

    progress({ task, state: "downloading", current, version: latest });
    const src = (await get(SERVER_URL(latest))).toString("utf8");
    if (versionOf(src) !== latest) throw new Error("downloaded server.js isn't version " + latest);
    const tmp = UPD + "/server.new.js";
    fs.writeFileSync(tmp, patch(src));   // throws if Stremio changed the patched code

    progress({ task, state: "verifying", current, version: latest });
    // Node runs through its own loader here (see bin/stremio-service).
    const check = spawnSync(ROOT + "/lib/ld-linux-armhf.so.3", ["--library-path", ROOT + "/lib", ROOT + "/bin/node", "--check", tmp], { encoding: "utf8" });
    if (check.status !== 0) { fs.unlinkSync(tmp); throw new Error("server.js " + latest + " fails to parse: " + (check.stderr || "").slice(0, 300)); }

    fs.copyFileSync(SERVER, PREV);
    fs.chmodSync(tmp, 0o644);
    fs.renameSync(tmp, SERVER);
    fs.writeFileSync(PENDING, latest + "\n");
    if (force) setSkipped(skipped().filter((v) => v !== latest));
    progress({ task, state: "installed", previous: current, version: latest });
  } catch (e) {
    progress({ task, state: "failed", error: String(e.message || e) });
    process.exitCode = 1;
  }
}

// Swaps server.js and server.prev.js. Going back skips the newer version so
// the automatic check doesn't reinstall it; going forward un-skips it.
function switchServer() {
  const cur = serverVersion(SERVER), prev = serverVersion(PREV);
  if (!cur || !prev) { console.log(JSON.stringify({ ok: false, error: "no previous server" })); process.exitCode = 1; return; }
  const tmp = UPD + "/server.swap.js";
  fs.renameSync(SERVER, tmp);
  fs.renameSync(PREV, SERVER);
  fs.renameSync(tmp, PREV);
  const skip = skipped().filter((v) => v !== prev);
  if (cmp(prev, cur) < 0) skip.push(cur);
  setSkipped(skip);
  fs.writeFileSync(PENDING, prev + "\n");
  progress({ task: "server", state: "switched", previous: cur, version: prev });
  console.log(JSON.stringify({ ok: true, version: prev }));
}

function luna(args, until) {
  return new Promise((resolve, reject) => {
    const p = spawn("luna-send", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error("installer timed out")); }, 180000);
    p.stdout.on("data", (d) => {
      out += d;
      const r = until ? until(out) : null;
      if (r) { clearTimeout(timer); p.kill(); r === "ok" ? resolve(out) : reject(new Error(out.slice(-400))); }
    });
    p.on("exit", () => { clearTimeout(timer); if (!until) resolve(out); else reject(new Error("installer stopped: " + out.slice(-400))); });
  });
}

async function updateApp(version) {
  const task = "app";
  const file = "/tmp/stremio-update.ipk";
  try {
    if (!VERSION.test(version || "")) throw new Error("bad version");
    progress({ task, state: "downloading", version });
    const ipk = await get(APP_URL(version));
    if (ipk.slice(0, 8).toString("latin1") !== "!<arch>\n") throw new Error("the download isn't an app package");
    fs.writeFileSync(file, ipk);
    progress({ task, state: "installing", version });
    // Same call as tools/deploy.sh. This closes the app.
    await luna(["-i", "luna://com.webos.appInstallService/dev/install",
      JSON.stringify({ id: "com.ares.defaultName", ipkUrl: file, subscribe: true })], (out) => {
      if (/"state":"installed"/.test(out)) return "ok";
      if (/"state":"(failed|install failed)"|"returnValue":false/.test(out)) return "fail";
      return null;
    });
    progress({ task, state: "installed", version });
    await luna(["-n", "1", "luna://com.webos.applicationManager/launch", JSON.stringify({ id: APP_ID })]);
  } catch (e) {
    progress({ task, state: "failed", version, error: String(e.message || e) });
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(file); } catch (e) { /* not downloaded */ }
  }
}

function status() {
  let p = null;
  try { p = JSON.parse(fs.readFileSync(PROGRESS, "utf8")); } catch (e) { /* nothing run since boot */ }
  console.log(JSON.stringify({
    server: serverVersion(SERVER),
    previous: fs.existsSync(PREV) ? serverVersion(PREV) : null,
    pending: read(PENDING) || null,
    skipped: skipped(),
    lastCheck: Number(read(UPD + "/last-check")) || null,
    progress: p
  }));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "status") status();
else if (cmd === "server") updateServer(arg === "force");
else if (cmd === "switch-server") switchServer();
else if (cmd === "app") updateApp(arg);
else { console.error("usage: update.js status|server [force]|switch-server|app <version>"); process.exitCode = 2; }
