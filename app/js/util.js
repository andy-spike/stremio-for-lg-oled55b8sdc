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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota: keep running */ }
  }
  function forget(key) { localStorage.removeItem(key); }

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
  function langName(code) {
    if (!code) return "";
    return LANGS[String(code).toLowerCase()] || code;
  }
  // Same language under different codes ("eng" / "en" / "English")?
  function sameLang(a, b) {
    if (!a || !b) return false;
    return langName(a).toLowerCase() === langName(b).toLowerCase();
  }

  return { $: $, $all: $all, el: el, clear: clear, load: load, save: save, forget: forget,
    request: request, settle: settle, nowIso: nowIso, clock: clock, bytes: bytes,
    langName: langName, sameLang: sameLang };
})();
