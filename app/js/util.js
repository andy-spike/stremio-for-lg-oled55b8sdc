// Small helpers shared by every module. The TV runs Chromium 53: ES2015 is
// fine (arrow functions, let/const, Promise, fetch), but there is no
// async/await, no object spread and no optional chaining.

var U = (function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // el("div.card.focusable", {onclick: fn, "data-x": 1}, [children or text])
  function el(spec, attrs, children) {
    var parts = spec.split(".");
    var node = document.createElement(parts[0] || "div");
    if (parts.length > 1) node.className = parts.slice(1).join(" ");
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.indexOf("on") === 0 && typeof v === "function") node[k] = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.keys(v).forEach(function (s) { node.style[s] = v[s]; });
      else node.setAttribute(k, v === true ? "" : v);
    });
    (Array.isArray(children) ? children : children === undefined ? [] : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { if (window.console) console.warn("save failed", key, e); return false; }   // quota: keep running
  }

  // The stream last played per video, for Resume. One capped map (most
  // recent 60) instead of a key per video, so storage can't fill up.
  var STREAMS_KEY = "lastStreams", STREAMS_MAX = 60;
  function lastStream(videoId) {
    var m = load(STREAMS_KEY, {});
    return (m[videoId] && m[videoId].stream) || load("lastStream:" + videoId, null);
  }
  function setLastStream(videoId, stream) {
    var m = load(STREAMS_KEY, {});
    m[videoId] = { at: Date.now(), stream: stream };
    var ids = Object.keys(m).sort(function (a, b) { return m[b].at - m[a].at; });
    ids.slice(STREAMS_MAX).forEach(function (id) { delete m[id]; });
    save(STREAMS_KEY, m);
    forget("lastStream:" + videoId);
  }
  // Move the old per-video keys ("lastStream:<id>") into the capped map.
  function migrateLastStreams() {
    try {
      var m = load(STREAMS_KEY, {}), old = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("lastStream:") === 0) old.push(k);
      }
      if (!old.length) return;
      old.forEach(function (k) {
        var id = k.slice("lastStream:".length);
        if (!m[id]) m[id] = { at: 0, stream: load(k, null) };
        localStorage.removeItem(k);
      });
      var ids = Object.keys(m).sort(function (a, b) { return m[b].at - m[a].at; });
      ids.slice(STREAMS_MAX).forEach(function (id) { delete m[id]; });
      save(STREAMS_KEY, m);
    } catch (e) { /* ignore */ }
  }
  function forget(key) { localStorage.removeItem(key); }

  // Time of day in the format picked in Settings: "9:41 PM" (default) or "21:41".
  function timeOfDay(d) {
    var h = d.getHours(), m = ("0" + d.getMinutes()).slice(-2);
    if (load("clockFormat", "12h") === "24h") return ("0" + h).slice(-2) + ":" + m;
    return ((h + 11) % 12 + 1) + ":" + m + (h < 12 ? " AM" : " PM");
  }

  // fetch with a timeout. Resolves to parsed JSON; rejects on HTTP errors.
  function request(url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { done = true; reject(new Error("Timed out: " + url)); }, opts.timeout || 15000);
      fetch(url, {
        method: opts.body === undefined ? "GET" : "POST",
        headers: opts.body === undefined ? {} : { "content-type": "application/json" },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      }).then(function (res) {
        if (!res.ok) throw new Error(res.status + " " + res.statusText + ": " + url);
        return opts.text ? res.text() : res.json();
      }).then(function (v) {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }, function (e) {
        if (!done) { done = true; clearTimeout(timer); reject(e); }
      });
    });
  }

  // Like Promise.all, but never rejects: failed entries become null.
  function settle(promises) {
    return Promise.all(promises.map(function (p) { return p.then(function (v) { return v; }, function () { return null; }); }));
  }

  function nowIso() { return new Date().toISOString(); }

  function clock(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    seconds = Math.floor(seconds);
    var h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function bytes(n) {
    if (!n) return "";
    var units = ["B", "KB", "MB", "GB", "TB"], i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i >= 3 ? n.toFixed(1) : Math.round(n)) + " " + units[i];
  }

  // ISO 639-2 (what files and addons use) to a readable name. Covers the
  // languages that show up in practice; unknown codes are shown as-is.
  var LANGS = {
    eng: "English", en: "English", spa: "Spanish", es: "Spanish", spl: "Spanish (Latin America)",
    por: "Portuguese", pt: "Portuguese", pob: "Portuguese (Brazil)", fre: "French", fra: "French", fr: "French",
    ger: "German", deu: "German", de: "German", ita: "Italian", it: "Italian", dut: "Dutch", nld: "Dutch", nl: "Dutch",
    rus: "Russian", ru: "Russian", ukr: "Ukrainian", pol: "Polish", pl: "Polish", cze: "Czech", ces: "Czech",
    swe: "Swedish", nor: "Norwegian", nob: "Norwegian", dan: "Danish", fin: "Finnish", gre: "Greek", ell: "Greek",
    tur: "Turkish", tr: "Turkish", ara: "Arabic", ar: "Arabic", heb: "Hebrew", hin: "Hindi", jpn: "Japanese", ja: "Japanese",
    kor: "Korean", ko: "Korean", chi: "Chinese", zho: "Chinese", zh: "Chinese", tha: "Thai", vie: "Vietnamese",
    ind: "Indonesian", may: "Malay", msa: "Malay", rum: "Romanian", ron: "Romanian", hun: "Hungarian", bul: "Bulgarian",
    hrv: "Croatian", scc: "Serbian", srp: "Serbian", slv: "Slovenian", slo: "Slovak", slk: "Slovak", cat: "Catalan",
    est: "Estonian", lav: "Latvian", lit: "Lithuanian", per: "Persian", fas: "Persian", und: "Unknown"
  };
  function englishName(code) {
    if (!code) return "";
    return LANGS[String(code).toLowerCase()] || code;
  }
  // The name to show, in the interface language.
  function langName(code) { var n = englishName(code); return n && window.tr ? tr(n) : n; }
  // Same language under different codes ("eng" / "en" / "English")?
  function sameLang(a, b) {
    if (!a || !b) return false;
    return englishName(a).toLowerCase() === englishName(b).toLowerCase();
  }

  // "Spanish (Latin America)" -> "spanish": regional variants count as the language.
  function langBase(code) { return englishName(code).replace(/ \(.*\)$/, "").toLowerCase(); }

  // Languages offered in settings, one entry per language: the common ones
  // first, then the rest alphabetically.
  var COMMON = ["eng", "spa", "fre", "ger", "ita", "por"];
  function langOptions() {
    var seen = {}, rest = [];
    COMMON.forEach(function (c) { seen[LANGS[c]] = true; });
    Object.keys(LANGS).forEach(function (c) {
      var n = LANGS[c];
      if (c === "und" || / \(/.test(n) || seen[n]) return;
      seen[n] = true;
      rest.push([c, n]);
    });
    rest = rest.map(function (r) { return [r[0], langName(r[0])]; });
    rest.sort(function (a, b) { return a[1].localeCompare(b[1]); });
    return COMMON.map(function (c) { return [c, langName(c)]; }).concat(rest);
  }

  // Subtitle languages the player lists (Settings > Subtitle languages).
  // [] means every language.
  function subLangs() { return load("subLangs", ["eng", "spa"]); }
  function wantSubLang(code) {
    var want = subLangs();
    if (!want.length) return true;
    var b = langBase(code);
    return want.some(function (w) { return langBase(w) === b; });
  }

  return { $: $, $all: $all, el: el, clear: clear, load: load, save: save, forget: forget, timeOfDay: timeOfDay,
    request: request, settle: settle, nowIso: nowIso, clock: clock, bytes: bytes,
    lastStream: lastStream, setLastStream: setLastStream, migrateLastStreams: migrateLastStreams,
    langName: langName, sameLang: sameLang, langOptions: langOptions, subLangs: subLangs, wantSubLang: wantSubLang };
})();
