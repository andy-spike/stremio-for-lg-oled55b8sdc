// Patches the official Stremio server.js for the TV.
//
// 1. Listen only on 127.0.0.1, so other devices on the network can't use it.
//    A guard put in front of the bundle makes every listen() on the server's
//    ports (11470-11474) bind to 127.0.0.1, whichever code path calls it
//    (startup, the port-retry loop, "restartServer"). Torrent peer ports are
//    left alone. bin/stremio-service also checks the open sockets after an
//    update and refuses a server that listens on all interfaces.
// 2. Send CORS headers to installed TV apps (file:// pages report their origin
//    as "file://" or "null"), so the app can load HLS playlists with XHR.
//    Websites opened in the TV's browser stay blocked, unlike NO_CORS=1.
//    This must match exactly once, so a server version that changed this code
//    fails loudly instead of silently changing behaviour.
//
// Used by update.js on the TV, and by hand:
//   node runtime/bin/patch-server.js <in server.js> <out server.js>

"use strict";
var GUARD = "/* stremio-lg-tv: server ports listen on 127.0.0.1 only */ (function () {\n" +
  "  var net = require(\"net\"), listen = net.Server.prototype.listen;\n" +
  "  function ours(p) { p = Number(p); return p >= 11470 && p <= 11474; }\n" +
  "  net.Server.prototype.listen = function () {\n" +
  "    var a = Array.prototype.slice.call(arguments);\n" +
  "    if (a[0] && typeof a[0] === \"object\") { if (ours(a[0].port)) a[0] = Object.assign({}, a[0], { host: \"127.0.0.1\" }); }\n" +
  "    else if (ours(a[0])) { if (typeof a[1] === \"string\") a[1] = \"127.0.0.1\"; else a.splice(1, 0, \"127.0.0.1\"); }\n" +
  "    return listen.apply(this, a);\n" +
  "  };\n" +
  "})();\n";

var PATCHES = [
  ["process.env.NO_CORS || !req.headers.origin ||",
   'process.env.NO_CORS || !req.headers.origin || "file://" === req.headers.origin || "null" === req.headers.origin ||']
];

function patch(src) {
  if (src.indexOf("stremio-lg-tv:") >= 0) throw new Error("already patched");
  PATCHES.forEach(function (p) {
    var n = src.split(p[0]).length - 1;
    if (n !== 1) throw new Error("expected 1 match, found " + n + ": " + p[0]);
    src = src.split(p[0]).join(p[1]);
  });
  return GUARD + src;
}

module.exports = { patch: patch };

if (require.main === module) {
  var fs = require("fs");
  if (process.argv.length !== 4) { console.error("usage: node patch-server.js <in> <out>"); process.exit(2); }
  fs.writeFileSync(process.argv[3], patch(fs.readFileSync(process.argv[2], "utf8")));
  console.log("patched " + process.argv[3]);
}
