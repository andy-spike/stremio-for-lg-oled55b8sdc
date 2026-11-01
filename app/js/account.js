// The Stremio account: sign-in, the user's addon collection, and the library
// (which holds Continue Watching and watch progress).
//
// Library rules mirror stremio-core (src/models/player.rs and
// src/types/library/library_item.rs) so progress made here shows up correctly
// in the official apps and vice versa. The only calls made to api.strem.io
// are for sign-in, addons and the library; no analytics events are sent.

var Account = (function () {
  var API = "https://api.strem.io/api/";
  var LINK = "https://link.stremio.com/api/";
  var WATCHED_COEF = 0.7;   // watched once 70% of the duration was played
  var CREDITS_COEF = 0.9;   // past 90%, playback counts as finished

  var auth = U.load("auth", null);        // { key, user: { _id, email } }
  var library = U.load("library", {});    // _id -> LibraryItem
  var dirty = U.load("libraryDirty", {}); // _id -> _mtime when changed, not yet pushed

  function api(method, body, timeout) {
    return U.request(API + method, { body: body, timeout: timeout || 20000 }).then(function (r) {
      if (r && r.error) throw new Error(r.error.message || "Stremio API error");
      return r ? r.result : null;
    });
  }

  // ---- sign-in ----

  function signedIn() { return !!(auth && auth.key); }
  function user() { return auth && auth.user; }

  function setAuth(key) {
    return api("getUser", { type: "GetUser", authKey: key }).then(function (u) {
      auth = { key: key, user: { _id: u._id, email: u.email } };
      U.save("auth", auth);
      return auth.user;
    });
  }

  function login(email, password) {
    return api("login", { type: "Login", email: email, password: password, facebook: false })
      .then(function (r) { return setAuth(r.authKey); });
  }

  // Phone sign-in: show the code/QR, then poll until it is approved.
  // Returns { code, link, qrcode, wait: Promise<user>, cancel() }.
  function linkLogin() {
    var cancelled = false, timer = null;
    return U.request(LINK + "create?type=Create", { timeout: 15000 }).then(function (r) {
      var c = r.result || r;
      if (!c || !c.code) throw new Error("Could not get a sign-in code");
      var wait = new Promise(function (resolve, reject) {
        var started = Date.now();
        function poll() {
          if (cancelled) return;
          if (Date.now() - started > 10 * 60 * 1000) { reject(new Error("The sign-in code expired")); return; }
          U.request(LINK + "read?type=Read&code=" + encodeURIComponent(c.code), { timeout: 10000 }).then(function (r2) {
            var key = r2 && r2.result && (r2.result.authKey || r2.result.auth_key);
            if (key && !cancelled) setAuth(key).then(resolve, reject);
            else timer = setTimeout(poll, 3000);
          }, function () { timer = setTimeout(poll, 3000); });
        }
        poll();
      });
      return { code: c.code, link: c.link, qrcode: c.qrcode, wait: wait,
        cancel: function () { cancelled = true; clearTimeout(timer); } };
    });
  }

  function logout() {
    var key = auth && auth.key;
    generation++;   // results of a sync still running belong to the old account
    auth = null; library = {}; dirty = {};
    ["auth", "library", "libraryDirty", "addons"].forEach(U.forget);
    if (key) api("logout", { type: "Logout", authKey: key }).catch(function () {});
  }

  // ---- addons ----

  function addonCollection() {
    if (!signedIn()) return Promise.resolve(null);
    return api("addonCollectionGet", { type: "AddonCollectionGet", authKey: auth.key, update: true })
      .then(function (r) { return (r && r.addons) || null; });
  }

  // ---- library ----

  function saveLibrary() { U.save("library", library); U.save("libraryDirty", dirty); }

  // Pull changes from the account and push local ones. Newest _mtime wins,
  // the same rule the official apps use.
  //
  // dirty[id] holds the item's _mtime when it changed. After an upload a
  // flag is cleared only if the item hasn't changed again since it was sent,
  // and a sync requested while one runs starts another when it finishes.
  var syncing = null, again = false, generation = 0;
  function sync() {
    if (!signedIn()) return Promise.resolve(false);
    if (syncing) { again = true; return syncing; }
    var gen = generation, key = auth.key;
    function current() { if (gen !== generation) throw new Error("signed out during sync"); }
    syncing = api("datastoreMeta", { authKey: key, collection: "libraryItem" }).then(function (rows) {
      current();
      var want = [];
      (rows || []).forEach(function (row) {
        var local = library[row[0]];
        if (!local || mtime(local) < mtime({ _mtime: row[1] })) want.push(row[0]);
      });
      var chunks = [];
      for (var i = 0; i < want.length; i += 100) chunks.push(want.slice(i, i + 100));
      return chunks.reduce(function (p, ids) {
        return p.then(function () {
          return api("datastoreGet", { authKey: key, collection: "libraryItem", ids: ids, all: false })
            .then(function (items) { current(); (items || []).forEach(function (it) { if (it && it._id && !dirty[it._id]) library[it._id] = it; }); });
        });
      }, Promise.resolve()).then(function () {
        // Snapshot what is sent, at the moment it is sent.
        var sent = Object.keys(dirty).filter(function (id) { return library[id]; })
          .map(function (id) { return { id: id, mtime: dirty[id] }; });
        if (!sent.length) return null;
        var changes = sent.map(function (x) { return JSON.parse(JSON.stringify(library[x.id])); });
        return api("datastorePut", { authKey: key, collection: "libraryItem", changes: changes }).then(function () {
          current();
          sent.forEach(function (x) { if (dirty[x.id] === x.mtime) delete dirty[x.id]; });
        });
      }).then(function () { current(); saveLibrary(); return want.length > 0; });
    }).then(function (changed) {
      syncing = null;
      if (again) { again = false; return sync().then(function (more) { return changed || more; }, function () { return changed; }); }
      return changed;
    }, function (e) { syncing = null; again = false; throw e; });
    return syncing;
  }

  function mtime(it) {
    var t = it && it._mtime;
    if (typeof t === "number") return t;
    t = Date.parse(t);
    return isNaN(t) ? 0 : t;
  }

  function get(id) { return library[id] || null; }

  function put(item, pushNow) {
    item._mtime = U.nowIso();
    library[item._id] = item;
    dirty[item._id] = item._mtime;
    saveLibrary();
    if (pushNow) push();
  }

  var pushTimer = null;
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { if (signedIn()) sync().catch(function () {}); }, 500);
  }

  // A library item for a meta, creating a temporary one when it isn't in the
  // library yet (temp items appear in Continue Watching but not the Library).
  function itemFor(meta) {
    var it = library[meta.id];
    if (it) return JSON.parse(JSON.stringify(it));
    var now = U.nowIso();
    return {
      _id: meta.id, name: meta.name || "", type: meta.type, poster: meta.poster || null,
      posterShape: meta.posterShape || "poster", removed: true, temp: true, _ctime: now, _mtime: now,
      state: { lastWatched: now, timeWatched: 0, timeOffset: 0, overallTimeWatched: 0, timesWatched: 0,
        flaggedWatched: 0, duration: 0, video_id: null, watched: null, noNotif: false },
      behaviorHints: {
        defaultVideoId: (meta.behaviorHints && meta.behaviorHints.defaultVideoId) || null,
        featuredVideoId: (meta.behaviorHints && meta.behaviorHints.featuredVideoId) || null,
        hasScheduledVideos: !!(meta.behaviorHints && meta.behaviorHints.hasScheduledVideos)
      }
    };
  }

  function inLibrary(id) { var it = library[id]; return !!(it && !it.removed); }

  function setInLibrary(meta, on) {
    var it = itemFor(meta);
    it.removed = !on;
    it.temp = false;
    put(it, true);
  }

  // Playback progress (port of the TimeChanged handler in stremio-core's
  // player model). time and duration are in milliseconds.
  function progress(it, videoId, time, duration) {
    var s = it.state;
    s.lastWatched = U.nowIso();
    if (s.video_id !== videoId) {
      s.video_id = videoId;
      s.overallTimeWatched += s.timeWatched;
      s.timeWatched = 0;
      s.flaggedWatched = 0;
    } else if (time > s.timeOffset) {
      var delta = Math.min(time - s.timeOffset, 30000);   // ignore jumps from seeking forward
      s.timeWatched += delta;
      s.overallTimeWatched += delta;
    }
    if (time > s.timeOffset || Math.abs(time - s.timeOffset) > 5000) {
      s.timeOffset = Math.floor(time);
      s.duration = Math.floor(duration);
    }
    if (s.flaggedWatched === 0 && s.duration > 0 && s.timeWatched > s.duration * WATCHED_COEF) {
      s.flaggedWatched = 1;
      s.timesWatched += 1;
    }
    if (it.temp && s.timesWatched === 0) it.removed = true;
    if (it.removed) it.temp = true;
  }

  // Playback ended or was closed. Past the credits mark the item leaves
  // Continue Watching, or moves on to the next episode.
  function finish(it, nextVideoId) {
    var s = it.state;
    if (s.duration > 0 && s.timeOffset > s.duration * CREDITS_COEF) {
      s.timeOffset = 0;
      if (nextVideoId) {
        s.video_id = nextVideoId;
        s.overallTimeWatched += s.timeWatched;
        s.timeWatched = 0;
        s.flaggedWatched = 0;
        s.timeOffset = 1;
      }
    }
  }

  function continueWatching() {
    return Object.keys(library).map(function (id) { return library[id]; }).filter(function (it) {
      return it.type !== "other" && (!it.removed || it.temp) && it.state && it.state.timeOffset > 0;
    }).sort(function (a, b) { return Date.parse(b.state.lastWatched || 0) - Date.parse(a.state.lastWatched || 0); });
  }

  function libraryItems() {
    return Object.keys(library).map(function (id) { return library[id]; })
      .filter(function (it) { return !it.removed && it.type !== "other"; })
      .sort(function (a, b) { return mtime(b) - mtime(a); });
  }

  return { signedIn: signedIn, user: user, login: login, linkLogin: linkLogin, logout: logout,
    addonCollection: addonCollection, sync: sync, get: get, put: put, itemFor: itemFor,
    inLibrary: inLibrary, setInLibrary: setInLibrary, progress: progress, finish: finish,
    continueWatching: continueWatching, libraryItems: libraryItems };
})();
