// Updates. The streaming server updates itself: once a day the app asks the
// TV's updater to install a newer Stremio server if there is one, then
// restarts the server when nothing is playing. App updates come from this
// project's GitHub releases; the app says when one is available and installs
// it only when asked (from Settings), since installing closes the app.
// The work on the TV is done by /media/developer/stremio/bin/stremio-update.

var Updates = (function () {
  var CMD = "/media/developer/stremio/bin/stremio-update";
  var SERVICE = "/media/developer/stremio/bin/stremio-service";
  var RELEASES = "https://api.github.com/repos/andy-spike/stremio-for-lg-oled55b8sdc/releases?per_page=30";
  var APP_ID = "com.local.stremio";
  var DAY = 24 * 3600 * 1000;
  var VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
  var RUNNING = ["checking", "downloading", "verifying", "installing"];

  function cmp(a, b) {
    var x = a.split("."), y = b.split(".");
    for (var i = 0; i < 3; i++) if (+x[i] !== +y[i]) return +x[i] - +y[i];
    return 0;
  }

  // Runs one of the updater's fixed commands as root. Only versions that
  // passed the VERSION check are ever added to the command.
  function exec(args) {
    return Luna.rootExec(CMD + " " + args).then(function (r) {
      if (!r || !r.returnValue) throw new Error("update service unavailable");
      var lines = String(r.stdoutString || "").replace(/\s+$/, "").split("\n");
      return lines[lines.length - 1];
    });
  }

  function status() { return exec("status").then(function (out) { return JSON.parse(out); }); }

  var appVersion = null;
  function current() {
    if (appVersion) return Promise.resolve(appVersion);
    // fetch() can't read file:// (where webOS apps live); XHR can.
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      x.onload = function () { try { appVersion = JSON.parse(x.responseText).version; } catch (e) { /* unknown */ } resolve(appVersion); };
      x.onerror = function () { resolve(null); };
      x.open("GET", "appinfo.json");
      x.send();
    });
  }

  // Published app versions with a package for this app, newest first.
  function releases() {
    return U.request(RELEASES, { timeout: 15000 }).then(function (list) {
      var out = [];
      (list || []).forEach(function (r) {
        var v = String(r.tag_name || "").replace(/^v/, "");
        if (r.draft || r.prerelease || !VERSION.test(v)) return;
        var file = APP_ID + "_" + v + "_all.ipk";
        if ((r.assets || []).some(function (a) { return a.name === file; })) out.push(v);
      });
      return out.sort(function (a, b) { return cmp(b, a); });
    });
  }

  // { current, latest (newer than current, or null), previous (the newest
  // older release, or null) }
  function appState() {
    return Promise.all([current(), releases()]).then(function (r) {
      var cur = r[0], list = r[1];
      var newer = cur ? list.filter(function (v) { return cmp(v, cur) > 0; }) : [];
      var older = cur ? list.filter(function (v) { return cmp(v, cur) < 0; }) : [];
      return { current: cur, latest: newer[0] || null, previous: older[0] || null };
    });
  }

  function playing() { return !!document.querySelector(".screen.player"); }

  // Loads the new server.js by restarting the server, unless something is
  // playing (then it loads the next time the server starts).
  function restartServer() {
    if (playing()) return Promise.resolve(false);
    return Luna.rootExec(SERVICE + " stop").then(function () { return Engine.ensure(); }).then(function () { return true; });
  }

  // Polls a background server or app task until it finishes.
  function wait(onStep) {
    var started = Date.now();
    return new Promise(function (resolve) {
      (function poll() {
        status().then(function (s) {
          var p = s.progress || {};
          if (onStep) onStep(s);
          if ((s.busy || RUNNING.indexOf(p.state) >= 0) && Date.now() - started < 5 * 60 * 1000) setTimeout(poll, 3000);
          else resolve(s);
        }, function () { resolve(null); });
      })();
    });
  }

  // Server update. force: also install a version that was skipped (after
  // going back to the previous one, or a failed start).
  function updateServer(force, onStep) {
    return exec(force ? "server force" : "server").then(function () {
      // Give the background task a moment to write its first progress.
      return new Promise(function (resolve) { setTimeout(resolve, 1500); });
    }).then(function () { return wait(onStep); }).then(function (s) {
      var p = (s && s.progress) || {};
      if (p.task === "server" && p.state === "installed") return restartServer().then(function () { return s; });
      return s;
    });
  }

  function switchServer() {
    return exec("switch-server").then(function (out) {
      var r = JSON.parse(out);
      if (!r.ok) throw new Error(r.error || "switch failed");
      return restartServer().then(function () { return r.version; });
    });
  }

  // Installs an app release. The app closes while it installs and opens again.
  function installApp(version, onStep) {
    if (!VERSION.test(version)) return Promise.reject(new Error("bad version"));
    return exec("app " + version).then(function () {
      return new Promise(function (resolve) { setTimeout(resolve, 1500); });
    }).then(function () { return wait(onStep); });
  }

  // Once a day, shortly after the app opens.
  function auto() {
    if (Date.now() - U.load("updateCheckAt", 0) < DAY) return;
    U.save("updateCheckAt", Date.now());
    updateServer(false).catch(function () { /* tried again tomorrow */ });
    appState().then(function (a) {
      if (a.latest && a.latest !== U.load("appSkip", "")) {
        App.toast(tr("App update {version} is available. Install it in Settings.", { version: a.latest }), 8000);
      }
    }, function () {});
  }

  // Checked hourly too, so an app left open for days still updates.
  function start() { setTimeout(auto, 30000); setInterval(auto, 3600 * 1000); }

  return { start: start, status: status, appState: appState, updateServer: updateServer,
    switchServer: switchServer, installApp: installApp, current: current, cmp: cmp };
})();
