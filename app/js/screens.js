// Every screen except the player: sign-in, Home, Search, Library, details,
// stream list and Settings. Each function returns a screen object for App.

var Screens = (function () {
  var el = U.el;

  // ---------- shared pieces ----------

  function screen(cls, children) {
    return el("section.screen." + cls, {}, children);
  }

  // Text button, optionally with a leading icon. setLabel() swaps both.
  function button(label, fn, cls, icon) {
    var b = el("div.btn.focusable" + (cls ? "." + cls : ""), {}, [icon ? Icons.svg(icon) : null, el("span", { text: label })]);
    b.onactivate = fn;
    b.setLabel = function (text, newIcon) {
      b.lastChild.textContent = text;
      if (newIcon) { if (b.firstChild.className.indexOf("icon") === 0) b.replaceChild(Icons.svg(newIcon), b.firstChild); else b.insertBefore(Icons.svg(newIcon), b.firstChild); }
    };
    return b;
  }

  function minutesLeft(st) {
    var m = Math.round((st.duration - st.timeOffset) / 60000);
    return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min left" : Math.max(1, m) + " min left";
  }

  function spinner(text) { return el("div.loading", {}, [el("div.spinner"), el("span", { text: text || "" })]); }

  function typeLabel(type) { return type === "movie" ? "Movies" : type === "series" ? "Series" : type === "channel" ? "Channels" : type === "tv" ? "TV" : type; }

  // "tt123:2:5" -> "S2 E5"
  function episodeLabel(videoId) {
    var m = /:(\d+):(\d+)$/.exec(videoId || "");
    return m ? "S" + m[1] + " E" + m[2] : "";
  }

  function posterClass(shape) { return shape === "landscape" ? "landscape" : shape === "square" ? "square" : "poster"; }

  // A focusable poster card. item has id/_id, name, type, poster, posterShape.
  // The title sits under the artwork, so a poster that fails to load still
  // shows what the card is instead of an empty tile.
  function card(item, opts) {
    opts = opts || {};
    var img = el("div.art", {}, [el("span.fallback", { text: item.name || "" }),
      item.poster ? el("div.img", { style: { backgroundImage: "url(\"" + String(item.poster).replace(/"/g, "%22") + "\")" } }) : null,
      opts.progress ? el("div.progress", {}, el("div", { style: { width: Math.min(100, opts.progress * 100) + "%" } })) : null]);
    var c = el("div.card.focusable." + posterClass(item.posterShape), { "data-key": "card:" + (item.id || item._id) }, [img,
      el("div.name", { text: item.name || "" }),
      opts.label ? el("div.meta", { text: opts.label }) : null]);
    c.onactivate = function () { App.push(detail(item.type, item.id || item._id, item.id ? item : null)); };
    return c;
  }

  function row(title, cards) {
    var strip = el("div.strip.hscroll", {}, cards);
    return el("div.row", {}, [el("h2", { text: title }), strip]);
  }

  // Top bar with the main sections.
  function topBar(active) {
    var tabs = [["home", "Home"], ["search", "Search"], ["library", "Library"], ["settings", "Settings"]].map(function (t) {
      var b = el("div.tab.focusable" + (t[0] === active ? ".active" : ""), {}, [Icons.svg(t[0]), el("span", { text: t[1] })]);
      b.onactivate = function () {
        if (t[0] === active) return;
        var make = { home: null, search: search, library: library, settings: settings }[t[0]];
        while (App.pop()) { /* back to Home */ }
        if (make) App.push(make());
      };
      return b;
    });
    var clock = el("div.clock");
    function tick() { var d = new Date(); clock.textContent = d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); }
    tick();
    var timer = setInterval(function () { if (document.body.contains(clock)) tick(); else clearInterval(timer); }, 15000);
    return el("header.topbar", {}, [el("div.logo", {}, [el("img.mark", { src: "icon.png", alt: "" }), el("span", { text: "Stremio" })])].concat(tabs, [clock]));
  }

  function brand() { return el("div.brand", {}, [el("img.mark", { src: "icon.png", alt: "" }), el("span", { text: "Stremio" })]); }

  // Runs fns (returning promises) with at most n in flight.
  function limited(fns, n) {
    var i = 0;
    function next() { if (i >= fns.length) return Promise.resolve(); var f = fns[i++]; return f().then(next, next); }
    var workers = [];
    for (var k = 0; k < Math.min(n, fns.length); k++) workers.push(next());
    return Promise.all(workers);
  }

  // ---------- sign-in ----------

  function login() {
    var codeBox = el("div.linkbox", {}, spinner("Getting a sign-in code…"));
    var emailForm = el("div.emailform.hidden");
    var email = el("input.focusable", { type: "email", placeholder: "Email" });
    var pass = el("input.focusable", { type: "password", placeholder: "Password" });
    var err = el("div.error");
    var link = null;
    var s = { el: screen("login", [
      brand(),
      el("h1", { text: "Sign in to your Stremio account" }),
      el("div.columns", {}, [codeBox, el("div.side", {}, [
        button("Sign in with email instead", function () {
          emailForm.classList.remove("hidden"); Nav.focus(email);
        }, "", "mail"),
        emailForm,
        button("Continue without an account", function () { U.save("guest", true); enter(); }, "subtle")
      ])])
    ]) };

    emailForm.appendChild(email);
    emailForm.appendChild(pass);
    emailForm.appendChild(err);
    var submit = button("Sign in", doLogin, "primary");
    var submitLabel = submit.lastChild;
    emailForm.appendChild(submit);
    function doLogin() {
      err.textContent = "";
      submitLabel.textContent = "Signing in…";
      Account.login(email.value.trim(), pass.value).then(function (u) {
        App.toast("Signed in as " + u.email); enter();
      }, function (e) { submitLabel.textContent = "Sign in"; err.textContent = e.message || "Sign-in failed"; });
    }
    [email, pass].forEach(function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.keyCode === KEY.OK) { e.preventDefault(); if (input === email) Nav.focus(pass); else doLogin(); }
      });
    });

    function startLink() {
      Account.linkLogin().then(function (l) {
        link = l;
        U.clear(codeBox);
        codeBox.appendChild(el("img.qr", { src: l.qrcode }));
        codeBox.appendChild(el("div.how", {}, [
          el("p", { text: "Point your phone’s camera at the code." }),
          el("p", { text: "Or open this page and type the code below:" }),
          el("p.url", { text: "link.stremio.com" })]));
        codeBox.appendChild(el("div.code", { text: l.code }));
        l.wait.then(function (u) { App.toast("Signed in as " + u.email); enter(); },
          function (e) { U.clear(codeBox).appendChild(el("div.error", { text: e.message })); codeBox.appendChild(button("Get a new code", startLink, "", "retry")); App.refocus(); });
      }, function (e) {
        U.clear(codeBox).appendChild(el("div.error", { text: "Couldn't reach Stremio: " + e.message }));
        codeBox.appendChild(button("Try again", startLink, "", "retry"));
        App.refocus();
      });
    }
    startLink();
    s.destroy = function () { if (link) link.cancel(); };
    return s;
  }

  // Load addons and the library, then show Home.
  function enter() {
    var s = { el: screen("splash", [brand(), spinner("Loading your addons…")]) };
    App.reset(s);
    Account.sync().catch(function () {}).then(function () { return Addons.load(); }).then(function () {
      App.reset(home());
    }, function (e) {
      U.clear(s.el).appendChild(el("div.error", { text: "Couldn't load addons: " + e.message }));
      s.el.appendChild(button("Try again", enter, "", "retry"));
      App.refocus();
    });
  }

  // ---------- home ----------

  function home() {
    var page = el("div.page.vscroll");
    var cwSlot = el("div");
    page.appendChild(cwSlot);
    var s = { el: screen("home", [topBar("home"), page]) };

    function buildContinue() {
      U.clear(cwSlot);
      var items = Account.continueWatching();
      if (!items.length) return;
      cwSlot.appendChild(row("Continue Watching", items.slice(0, 30).map(function (it) {
        var st = it.state;
        var upNext = st.timeOffset <= 1;   // finished; the next episode is queued at offset 1
        var left = !upNext && st.duration > st.timeOffset + 30000 ? minutesLeft(st) : "";
        var ep = it.type === "series" ? episodeLabel(st.video_id) : "";
        return card(it, { progress: !upNext && st.duration ? st.timeOffset / st.duration : 0,
          label: [ep, upNext ? "Up next" : left].filter(Boolean).join(" · ") });
      })));
    }
    buildContinue();

    var entries = Addons.boardCatalogs();
    var rows = entries.map(function (entry) {
      var r = row((entry.catalog.name || entry.addon.manifest.name) + " — " + typeLabel(entry.catalog.type), [el("div.card.placeholder.poster")]);
      page.appendChild(r);
      return { entry: entry, el: r };
    });
    if (!entries.length) page.appendChild(el("div.empty", { text: "None of your addons provide catalogs." }));
    limited(rows.map(function (r) {
      return function () {
        return Addons.catalog(r.entry).then(function (metas) {
          if (!metas.length) { r.el.remove(); return; }
          var strip = r.el.querySelector(".strip");
          U.clear(strip);
          metas.slice(0, 40).forEach(function (m) { strip.appendChild(card(m)); });
          // Until the user moves, keep focus on the first poster rather than the tabs.
          if (App.top() !== s) return;
          var cur = Nav.current();
          App.refocus(!moved && (!cur || cur.classList.contains("tab")) ? s.initialFocus() : null);
        }, function () { r.el.remove(); if (App.top() === s) App.refocus(); });
      };
    }), 4);

    s.initialFocus = function () { return s.el.querySelector(".row .card.focusable") || s.el.querySelector(".tab.active"); };
    var moved = false;
    s.key = function (code) { if (code >= 37 && code <= 40) moved = true; return false; };
    s.refresh = function () { var f = Nav.current(); buildContinue(); if (App.top() === s) App.refocus(f); };
    s.show = function (returning) { if (returning) s.refresh(); };
    return s;
  }

  // ---------- search ----------

  function search() {
    var input = el("input.focusable.search", { type: "text", placeholder: "Search movies and series" });
    var results = el("div.page.vscroll.below-search");
    var s = { el: screen("search", [topBar("search"), el("div.searchbar", {}, [Icons.svg("search"), input]), results]) };
    var timer = null, seq = 0;
    function run() {
      var q = input.value.trim();
      var mine = ++seq;
      if (!q) { U.clear(results); return; }
      U.clear(results).appendChild(spinner("Searching…"));
      var cats = Addons.searchCatalogs();
      var found = 0, failed = 0;
      U.settle(cats.map(function (entry) {
        return Addons.catalog(entry, { search: q }).then(function (metas) {
          if (mine !== seq || !metas.length) return;
          if (!found++) U.clear(results);
          results.appendChild(row(entry.addon.manifest.name + " — " + typeLabel(entry.catalog.type), metas.slice(0, 40).map(function (m) { return card(m); })));
        }, function (e) { failed++; throw e; });
      })).then(function () {
        if (mine !== seq || found) return;
        U.clear(results).appendChild(el("div.empty", { text: cats.length && failed === cats.length
          ? "Couldn't reach your search addons. Check the connection and try again."
          : "Nothing found for “" + q + "”. Try the original title, or fewer words." }));
      });
    }
    input.addEventListener("keydown", function (e) {
      if (e.keyCode === KEY.OK) { e.preventDefault(); clearTimeout(timer); run(); }
      if (e.keyCode === KEY.DOWN) { var first = results.querySelector(".card"); if (first) { e.preventDefault(); e.stopPropagation(); input.blur(); Nav.focus(first); } }
    });
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 900); });
    s.initialFocus = function () { return input; };
    return s;
  }

  // ---------- library ----------

  function library() {
    var grid = el("div.grid");
    var filter = "all";
    var filters = el("div.filters", {}, [["all", "All"], ["movie", "Movies"], ["series", "Series"]].map(function (f) {
      var b = el("div.chip.focusable" + (f[0] === filter ? ".active" : ""), { text: f[1], "data-key": "filter:" + f[0] });
      b.onactivate = function () {
        filter = f[0];
        U.$all(".chip", filters).forEach(function (c) { c.classList.toggle("active", c === b); });
        build();
      };
      return b;
    }));
    var s = { el: screen("library", [topBar("library"), el("div.page.vscroll", {}, [filters, grid])]) };
    function build() {
      U.clear(grid);
      var items = Account.libraryItems().filter(function (it) { return filter === "all" || it.type === filter; });
      if (!items.length) grid.appendChild(el("div.empty", { text: !Account.signedIn() ? "Sign in to see your library."
        : filter === "all" ? "Your library is empty. Open a movie or series and choose “Add to library”." : "Nothing here yet." }));
      items.forEach(function (it) { grid.appendChild(card(it)); });
    }
    build();
    s.refresh = build;
    s.show = function (returning) { if (returning) build(); };
    s.initialFocus = function () { return grid.querySelector(".card") || filters.querySelector(".chip"); };
    return s;
  }

  // ---------- details ----------

  function sortedEpisodes(meta) {
    return (meta.videos || []).filter(function (v) { return isFinite(v.season) && isFinite(v.episode); })
      .sort(function (a, b) { return a.season - b.season || a.episode - b.episode; });
  }

  function detail(type, id, preview) {
    var bg = el("div.backdrop");
    var info = el("div.info");
    var side = el("div.side.vscroll");
    var s = { el: screen("detail", [bg, el("div.shade"), info, side]) };
    var meta = preview;
    var full = false;          // the addon's full details (with episodes) have arrived
    var shownSeason = null;    // season the user picked; kept across re-renders

    function videoFor(videoId) {
      var v = (meta.videos || []).filter(function (x) { return x.id === videoId; })[0];
      if (v) return v;
      return { id: videoId || (meta.behaviorHints && meta.behaviorHints.defaultVideoId) || meta.id };
    }

    function render() {
      if (meta.background) bg.style.backgroundImage = "url(\"" + meta.background + "\")";
      U.clear(info);
      info.appendChild(meta.logo ? el("img.logo", { src: meta.logo, onerror: function () { this.parentNode.replaceChild(el("h1", { text: meta.name }), this); } }) : el("h1", { text: meta.name }));
      var facts = [meta.releaseInfo || meta.year, meta.runtime, (meta.genres || meta.genre || []).slice(0, 3).join(", ")].filter(Boolean);
      var factsEl = el("div.facts", {}, facts.map(function (f) { return el("span.fact", { text: f }); }));
      if (meta.imdbRating) factsEl.appendChild(el("span.fact.rating", {}, [Icons.svg("star"), el("span", { text: meta.imdbRating })]));
      info.appendChild(factsEl);
      if (meta.description) info.appendChild(el("p.description", { text: meta.description }));

      var lib = Account.get(meta.id);
      var episodes = sortedEpisodes(meta);
      var isSeries = episodes.length > 0;
      var actions = el("div.actions");
      var resume = lib && lib.state && lib.state.video_id && lib.state.timeOffset > 0;
      var target = resume ? videoFor(lib.state.video_id) : isSeries ? (episodes.filter(function (v) { return v.season > 0; })[0] || episodes[0]) : videoFor(null);
      var label = resume ? "Resume" : isSeries ? "Watch" : "Play";
      if (isSeries && target) label += " " + episodeLabel(target.id || ("x:" + target.season + ":" + target.episode));
      // A series' catalog preview has no episode list: wait for the details
      // rather than asking addons for streams of the show itself.
      var waiting = type === "series" && !full;
      if (waiting) label = "Loading episodes…";
      var play = button(label, function () {
        if (waiting) return;
        var saved = resume ? U.lastStream(target.id) : null;
        // Resume plays the saved stream on top of its stream list, so
        // "Other streams" and Back land on the list.
        if (saved) { App.push(streams(meta, target)); Player.open({ meta: meta, video: target, stream: saved }); }
        else App.push(streams(meta, target));
      }, "primary" + (waiting ? ".waiting" : ""), "play");
      play.setAttribute("data-key", "play");
      actions.appendChild(play);
      if (Account.signedIn()) {
        var inLib = Account.inLibrary(meta.id);
        var libBtn = button(inLib ? "In library" : "Add to library", function () {
          var on = !Account.inLibrary(meta.id);
          Account.setInLibrary(meta, on);
          libBtn.setLabel(on ? "In library" : "Add to library", on ? "check" : "plus");
        }, "", inLib ? "check" : "plus");
        libBtn.setAttribute("data-key", "lib");
        actions.appendChild(libBtn);
      }
      if (resume && !isSeries) {
        var other = button("Other streams", function () { App.push(streams(meta, target)); }, "", "sources");
        other.setAttribute("data-key", "other");
        actions.appendChild(other);
      }
      info.appendChild(actions);

      U.clear(side);
      if (isSeries) renderEpisodes(episodes, lib, target);
      else side.classList.add("hidden");
    }

    function renderEpisodes(episodes, lib, target) {
      side.classList.remove("hidden");
      var seasons = [];
      episodes.forEach(function (v) { if (seasons.indexOf(v.season) < 0) seasons.push(v.season); });
      seasons.sort(function (a, b) { return (a === 0) - (b === 0) || a - b; });   // specials last
      // The season picked earlier, else the target's, else the first one.
      var current = [shownSeason, target && target.season].filter(function (n) { return seasons.indexOf(n) >= 0; })[0];
      if (current === undefined) current = seasons[0];
      var tabs = el("div.seasons.hscroll");
      var list = el("div.episodes");
      side.appendChild(tabs);
      side.appendChild(list);
      seasons.forEach(function (n) {
        var t = el("div.chip.focusable" + (n === current ? ".active" : ""), { text: n === 0 ? "Specials" : "Season " + n, "data-key": "season:" + n });
        t.onactivate = function () { current = shownSeason = n; U.$all(".chip", tabs).forEach(function (c) { c.classList.toggle("active", c === t); }); fill(); };
        tabs.appendChild(t);
      });
      function fill() {
        U.clear(list);
        episodes.filter(function (v) { return v.season === current; }).forEach(function (v) {
          var playing = lib && lib.state.video_id === v.id;
          var released = v.released ? new Date(v.released) : null;
          var future = released && released > new Date();
          var e = el("div.episode.focusable" + (future ? ".future" : ""), { "data-key": "ep:" + v.id }, [
            el("div.thumb", { style: v.thumbnail ? { backgroundImage: "url(\"" + v.thumbnail + "\")" } : {} },
              playing && lib.state.duration ? el("div.progress", {}, el("div", { style: { width: Math.min(100, lib.state.timeOffset / lib.state.duration * 100) + "%" } })) : null),
            el("div.text", {}, [
              el("div.title", { text: "E" + v.episode + "  ·  " + (v.title || v.name || "Episode " + v.episode) }),
              el("div.meta", {}, [playing ? el("span.badge.accent", { text: lib.state.timeOffset > 1 && lib.state.duration ? minutesLeft(lib.state) : "Up next" }) : null,
                el("span", { text: released ? (future ? "Coming " : "") + released.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "" })]),
              v.overview || v.description ? el("div.overview", { text: v.overview || v.description }) : null
            ])
          ]);
          e.onactivate = function () { App.push(streams(meta, v)); };
          list.appendChild(e);
        });
      }
      fill();
    }

    if (meta) render(); else info.appendChild(spinner("Loading…"));
    Addons.meta(type, id).then(function (m) {
      if (!m) {
        if (!meta) U.clear(info).appendChild(el("div.error", { text: "No addon has details for this title." }));
        else { full = true; render(); if (App.top() === s) App.refocus(Nav.current()); }   // play from the preview
        return;
      }
      var focused = Nav.current();
      meta = m;
      full = true;
      render();
      if (App.top() === s) App.refocus(focused);
    });
    s.initialFocus = function () { return s.el.querySelector(".btn.primary"); };
    s.show = function (returning) { if (returning && meta) render(); };   // App.pop restores focus by data-key
    return s;
  }

  // ---------- streams ----------

  function badges(stream) {
    var t = [stream.name, stream.title, stream.description].filter(Boolean).join(" ");
    var out = [];
    if (/2160p|\b4k\b|\buhd\b/i.test(t)) out.push(["4K", ""]);
    else if (/1080p/i.test(t)) out.push(["1080p", ""]);
    else if (/720p/i.test(t)) out.push(["720p", ""]);
    if (/\b(dv|dovi|dolby ?vision)\b/i.test(t)) out.push(["Dolby Vision", ""]);
    else if (/\bhdr(10\+?)?\b/i.test(t)) out.push(["HDR", ""]);
    if (/\bav1\b/i.test(t)) out.push(["AV1 · may not play", "warn"]);
    if (/\bdts\b/i.test(t)) out.push(["DTS · audio converted", "info"]);
    var seeds = /👤\s?(\d+)/.exec(t);
    if (seeds) out.push([seeds[1], "", "peers"]);
    var size = /(\d+(?:\.\d+)?)\s?(GB|MB)\b/i.exec(t);
    if (size) out.push([size[1] + " " + size[2].toUpperCase(), "", "download"]);
    var source = /⚙️?\s*([^\n👤💾]+)/.exec(t);
    if (source) out.push([source[1].trim(), "muted"]);
    return out;
  }

  // Addons append a metadata line of emoji (👤 seeders, 💾 size, ⚙️ source);
  // those become badges, so drop them from the title text.
  function cleanTitle(text) {
    return text.split("\n").filter(function (line) { return !/👤|💾|⚙/.test(line); }).join("\n").trim();
  }

  function streams(meta, video) {
    var list = el("div.streamlist.vscroll");
    var status = el("div.status");
    var epName = video.title || video.name;
    var label = video.season !== undefined ? "Season " + video.season + "  ·  Episode " + video.episode + (epName ? "  —  " + epName : "") : "";
    var head = el("div.head", {}, [el("div.htext", {}, [el("h1", { text: meta.name }), label ? el("div.sub", { text: label }) : null, status])]);
    if (meta.poster) head.insertBefore(el("div.hposter", { style: { backgroundImage: "url(\"" + meta.poster + "\")" } }), head.firstChild);
    var s = { el: screen("streams", [meta.background ? el("div.sbackdrop", { style: { backgroundImage: "url(\"" + meta.background + "\")" } }) : null, head, list]) };
    var all = [];
    var pending = Addons.all().filter(function (a) { return Addons.supports(a, "stream", meta.type, video.id); }).length;
    status.textContent = pending ? "Loading streams from " + pending + " addon" + (pending > 1 ? "s" : "") + "…" : "";

    Addons.streams(meta.type, video.id, function (addon, found) {
      if (!found.length) return;
      list.appendChild(el("h2", { text: addon.manifest.name }));
      found.forEach(function (st) {
        all.push(st);
        var playable = !st.ytId && !st.externalUrl && (st.infoHash || st.url);
        var r = el("div.stream.focusable" + (playable ? "" : ".disabled"), { "data-key": "st:" + (st.infoHash ? st.infoHash + ":" + (st.fileIdx || 0) : st.url || st.name) }, [
          el("div.sname", { text: st.name || addon.manifest.name }),
          el("div.sbody", {}, [
            el("div.stitle", { text: cleanTitle(st.title || st.description || "") }),
            el("div.badges", {}, badges(st).map(function (b) {
              return el("span.badge" + (b[1] ? "." + b[1] : ""), {}, [b[2] ? Icons.svg(b[2]) : null, el("span", { text: b[0] })]);
            }).concat(playable ? [] : [el("span.badge.warn", { text: "Not playable on TV" })]))
          ])
        ]);
        r.onactivate = function () {
          if (!playable) return;
          U.setLastStream(video.id, st);
          Player.open({ meta: meta, video: video, stream: st, streams: all });
        };
        list.appendChild(r);
      });
      if (App.top() === s && (!Nav.current() || !s.el.contains(Nav.current()))) App.refocus();
    }).then(function () {
      status.textContent = all.length ? all.length + (all.length === 1 ? " stream" : " streams") : "";
      if (!all.length) list.appendChild(el("div.empty", { text: "No streams found. Install stream addons (for example Torrentio) " +
        "from stremio.com on your phone or computer — they sync to the TV after you sign in." }));
    });
    s.initialFocus = function () { return list.querySelector(".stream.focusable:not(.disabled)"); };
    s.streamsFor = video.id;
    return s;
  }

  // ---------- settings ----------

  var LANGS = [["", "Default"], ["eng", "English"], ["spa", "Spanish"], ["fre", "French"], ["ger", "German"], ["ita", "Italian"], ["por", "Portuguese"]];
  var SUBLANGS = [["", "Off"]].concat(LANGS.slice(1));
  var SIZES = [[0.8, "Small"], [1, "Normal"], [1.3, "Large"], [1.6, "Huge"]];

  function choice(label, key, options, fallback) {
    var value = U.load(key, fallback);
    var idx = Math.max(0, options.map(function (o) { return o[0]; }).indexOf(value));
    var valueEl = el("span.svalue", { text: options[idx][1] });
    var r = el("div.setting.stepper.focusable", {}, [el("span", { text: label }),
      el("span.sctl", {}, [Icons.svg("chevronLeft"), valueEl, Icons.svg("chevronRight")])]);
    function step(d) {
      idx = (idx + d + options.length) % options.length;
      U.save(key, options[idx][0]);
      valueEl.textContent = options[idx][1];
    }
    r.onactivate = function () { step(1); };
    r.step = step;
    return r;
  }

  function settings() {
    var serverState = el("span.value", { text: "Checking…" });
    var versionEl = el("span.value", { text: "" });
    // fetch() can't read file:// (where webOS apps live); XHR can.
    var x = new XMLHttpRequest();
    x.onload = function () { try { versionEl.textContent = JSON.parse(x.responseText).version; } catch (e) { /* leave blank */ } };
    x.open("GET", "appinfo.json");
    x.send();
    var u = Account.user();
    var subLangRow = el("div.setting.focusable", {}, [el("span", { text: "Subtitle languages" }), el("span.value", { text: subLangsLabel() })]);
    subLangRow.onactivate = function () { App.push(subLanguages()); };
    var rows = [
      el("h2", { text: "Account" }),
      info(u ? "Signed in as" : "Not signed in", el("span.value", { text: u ? u.email : "" })),
      u ? button("Sign out", function () { Account.logout(); Addons.reset(); U.forget("guest"); App.reset(login()); }, "", "signOut")
        : button("Sign in", function () { U.forget("guest"); App.reset(login()); }, "primary", "mail"),
      el("h2", { text: "Playback" }),
      choice("Preferred audio language", "prefAudioLang", LANGS, ""),
      choice("Subtitles", "prefSubLang", SUBLANGS, ""),
      subLangRow,
      choice("Subtitle size", "subSize", SIZES, 1),
      choice("Subtitle background", "subBg", [["none", "None"], ["translucent", "Translucent"], ["solid", "Solid"]], "none"),
      choice("Subtitle color", "subColor", [["white", "White"], ["yellow", "Yellow"]], "white"),
      el("h2", { text: "About" }),
      info("Streaming server", serverState),
      info("Addons", el("span.value", { text: Addons.all().map(function (a) { return a.manifest.name; }).join(", ") })),
      info("Version", versionEl)
    ];
    // Read-only rows still take focus, so the arrows reach (and scroll to) them.
    function info(label, value) { return el("div.setting.info.focusable", {}, [el("span", { text: label }), value]); }
    var s = { el: screen("settings", [topBar("settings"), el("div.page.vscroll", {}, el("div.settings", {}, rows))]) };
    Engine.alive().then(function (ok) {
      U.clear(serverState).appendChild(el("span.dot" + (ok ? ".ok" : "")));
      serverState.appendChild(document.createTextNode(ok ? "Running" : "Stopped · starts when you play something"));
    });
    s.key = function (code) {
      var c = Nav.current();
      if (c && c.step && (code === KEY.LEFT || code === KEY.RIGHT)) { c.step(code === KEY.LEFT ? -1 : 1); return true; }
      return false;
    };
    s.initialFocus = function () { return s.el.querySelector(".page .focusable"); };
    s.show = function (returning) { if (returning) subLangRow.lastChild.textContent = subLangsLabel(); };
    return s;
  }

  function subLangsLabel() {
    var l = U.subLangs();
    return l.length ? l.map(U.langName).join(", ") : "All languages";
  }

  // Settings > Subtitle languages: which languages the player's subtitle
  // menu lists. Ticking none (or "All languages") lists everything.
  function subLanguages() {
    function row(label, onToggle) {
      var r = el("div.setting.toggle.focusable", {}, [el("span", { text: label }), Icons.svg("check", "tcheck")]);
      r.onactivate = function () { onToggle(); render(); };
      return r;
    }
    var all = row("All languages", function () { U.save("subLangs", []); });
    var langs = U.langOptions().map(function (o) {
      var r = row(o[1], function () {
        var cur = U.subLangs().filter(function (c) { return c !== o[0]; });
        if (cur.length === U.subLangs().length) cur.push(o[0]);
        U.save("subLangs", cur);
      });
      r.code = o[0];
      return r;
    });
    function render() {
      var cur = U.subLangs();
      all.classList.toggle("on", !cur.length);
      langs.forEach(function (r) { r.classList.toggle("on", cur.indexOf(r.code) >= 0); });
    }
    render();
    var s = { el: screen("settings", [topBar("settings"), el("div.page.vscroll", {}, el("div.settings", {}, [
      el("h2", { text: "Subtitle languages" }),
      el("p.shint", { text: "The subtitle menu in the player lists only these languages. The others stay available under \u201cOther languages\u201d." }),
      all
    ].concat(langs)))]) };
    s.initialFocus = function () { return s.el.querySelector(".toggle.on") || all; };
    return s;
  }

  return { login: login, enter: enter, home: home, search: search, library: library, detail: detail,
    streams: streams, settings: settings, episodeLabel: episodeLabel };
})();
