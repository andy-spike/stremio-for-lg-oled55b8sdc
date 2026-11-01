// Stremio addons: the user's collection from their account (or Stremio's
// official defaults when signed out), and requests to them following the
// addon protocol: GET {base}/{resource}/{type}/{id}[/{extra}].json

var Addons = (function () {
  // Official defaults (Stremio/stremio-official-addons), minus ones that need
  // a desktop (local files) or are retired.
  var DEFAULTS = [
    "https://v3-cinemeta.strem.io/manifest.json",
    "https://opensubtitles-v3.strem.io/manifest.json",
    "https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json"
  ];

  var list = U.load("addons", null);   // [{ transportUrl, manifest }]

  function base(transportUrl) { return transportUrl.replace(/\/manifest\.json$/, ""); }

  function load() {
    var fromAccount = Account.signedIn()
      ? Account.addonCollection().catch(function () { return null; })
      : Promise.resolve(null);
    return fromAccount.then(function (addons) {
      if (addons && addons.length) {
        return addons.filter(function (a) { return a.manifest && /^https?:/.test(a.transportUrl) && !/127\.0\.0\.1/.test(a.transportUrl); })
          .map(function (a) { return { transportUrl: a.transportUrl, manifest: a.manifest }; });
      }
      if (list && list.length && Account.signedIn()) return list;   // offline: keep the last known set
      return U.settle(DEFAULTS.map(function (url) {
        return U.request(url).then(function (m) { return { transportUrl: url, manifest: m }; });
      })).then(function (r) { return r.filter(Boolean); });
    }).then(function (addons) {
      list = addons;
      U.save("addons", list);
      return list;
    });
  }

  function all() { return list || []; }

  // Does this addon serve `resource` for this type and id? Resources can be
  // plain names or objects with their own types/idPrefixes.
  function supports(addon, resource, type, id) {
    var m = addon.manifest, types = m.types || [], prefixes = m.idPrefixes;
    var found = (m.resources || []).some(function (r) {
      if (typeof r === "string") return r === resource;
      if (r && r.name === resource) {
        if (r.types) types = r.types;
        if (r.idPrefixes) prefixes = r.idPrefixes;
        return true;
      }
      return false;
    });
    if (!found || types.indexOf(type) < 0) return false;
    if (id && prefixes && prefixes.length) return prefixes.some(function (p) { return id.indexOf(p) === 0; });
    return true;
  }

  function url(addon, resource, type, id, extra) {
    var extraStr = Object.keys(extra || {}).filter(function (k) { return extra[k] !== undefined && extra[k] !== null && extra[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(extra[k]); }).join("&");
    return base(addon.transportUrl) + "/" + resource + "/" + encodeURIComponent(type) + "/" + encodeURIComponent(id) +
      (extraStr ? "/" + extraStr : "") + ".json";
  }

  // Catalogs shown on the board: those that need no required extra.
  function boardCatalogs() {
    var out = [];
    all().forEach(function (addon) {
      (addon.manifest.catalogs || []).forEach(function (c) {
        var required = (c.extra || []).some(function (e) { return e.isRequired; }) || (c.extraRequired || []).length > 0;
        if (!required) out.push({ addon: addon, catalog: c });
      });
    });
    return out;
  }

  function searchCatalogs() {
    var out = [];
    all().forEach(function (addon) {
      (addon.manifest.catalogs || []).forEach(function (c) {
        var extras = (c.extra || []).map(function (e) { return e.name; }).concat(c.extraSupported || []);
        var others = (c.extra || []).some(function (e) { return e.isRequired && e.name !== "search"; });
        if (extras.indexOf("search") >= 0 && !others) out.push({ addon: addon, catalog: c });
      });
    });
    return out;
  }

  function catalog(entry, extra) {
    return U.request(url(entry.addon, "catalog", entry.catalog.type, entry.catalog.id, extra), { timeout: 20000 })
      .then(function (r) { return (r && r.metas) || []; });
  }

  // First addon (in collection order) that returns a meta wins, like Stremio.
  function meta(type, id) {
    var candidates = all().filter(function (a) { return supports(a, "meta", type, id); });
    return candidates.reduce(function (p, addon) {
      return p.then(function (found) {
        if (found) return found;
        return U.request(url(addon, "meta", type, id), { timeout: 20000 })
          .then(function (r) { return r && r.meta ? r.meta : null; }, function () { return null; });
      });
    }, Promise.resolve(null));
  }

  // Streams from every addon in parallel. onGroup(addon, streams) is called
  // as each addon answers; resolves when all are done.
  function streams(type, id, onGroup) {
    var candidates = all().filter(function (a) { return supports(a, "stream", type, id); });
    return U.settle(candidates.map(function (addon) {
      return U.request(url(addon, "stream", type, id), { timeout: 30000 }).then(function (r) {
        var list = (r && r.streams) || [];
        onGroup(addon, list);
        return list;
      });
    }));
  }

  function subtitles(type, id, extra) {
    var candidates = all().filter(function (a) { return supports(a, "subtitles", type, id); });
    return U.settle(candidates.map(function (addon) {
      return U.request(url(addon, "subtitles", type, id, extra), { timeout: 20000 }).then(function (r) {
        return ((r && r.subtitles) || []).map(function (s) { return { id: s.id, url: s.url, lang: s.lang, addon: addon.manifest.name }; });
      });
    })).then(function (groups) { return [].concat.apply([], groups.filter(Boolean)); });
  }

  return { load: load, all: all, supports: supports, boardCatalogs: boardCatalogs, searchCatalogs: searchCatalogs,
    catalog: catalog, meta: meta, streams: streams, subtitles: subtitles };
})();
