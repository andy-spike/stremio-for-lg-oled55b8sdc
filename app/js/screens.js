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
    return m >= 60 ? tr("{h} h {m} min left", { h: Math.floor(m / 60), m: m % 60 }) : tr("{m} min left", { m: Math.max(1, m) });
  }

  // ---------- skeletons ----------
  // Grey stand-ins with the size and layout of what replaces them, so a
  // screen fills in place instead of jumping from a spinner to the full UI.
  // A ".skeleton" wrapper pulses its whole group (one opacity animation).

  function bone(cls, style) { return el("div.skel" + (cls ? "." + cls : ""), style ? { style: style } : {}); }
  function line(width, height) { return bone("line", height ? { width: width, height: height } : { width: width }); }

  function skelCards(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(el("div.card.poster.skelcard", {}, [el("div.art.skel"), bone("sname")]));
    return out;
  }
  // A poster row; the title is a bar until it is known.
  function skelRow(title) {
    return el("div.row", {}, [title ? el("h2", { text: title }) : bone("sh2"), el("div.strip", {}, skelCards(9))]);
  }
  function detailSkeleton() {
    return el("div.skeleton", {}, [
      bone("", { width: "24vw", height: "6.5vw", marginBottom: "2.4vw" }),   // logo
      line("18vw", "1.3vw"), el("div", { style: { height: "1.6vw" } }),       // facts
      line("41vw", "1.4vw"), line("40vw", "1.4vw"), line("42vw", "1.4vw"), line("26vw", "1.4vw"),
      el("div.actions", { style: { marginTop: "2.4vw" } }, [bone("sbtn", { width: "12vw" }), bone("sbtn", { width: "15vw" })])]);
  }
  function episodesSkeleton() {
    var chips = [], eps = [];
    for (var i = 0; i < 4; i++) chips.push(bone("schip"));
    for (var k = 0; k < 6; k++) {
      eps.push(el("div.episode", {}, [bone("sthumb"), el("div.text", { style: { flex: "1 1 auto" } },
        [line("16vw", "1.35vw"), line("8vw", "1vw"), line("26vw"), line("21vw")])]));
    }
    return el("div.skeleton", {}, [el("div.seasons", {}, chips), el("div.episodes", {}, eps)]);
  }
  function streamsSkeleton() {
    var rows = [];
    for (var i = 0; i < 7; i++) {
      rows.push(el("div.stream", {}, [
        el("div.squal", {}, [bone("", { width: "4.6vw", height: "1.7vw" })]),
        el("div.sbody", {}, [line((26 + (i * 9) % 20) + "vw", "1.3vw"), el("div.badges", {}, [bone("sbadge"), bone("sbadge"), bone("sbadge")])]),
        el("div.sside", {}, [line("9vw", "1.2vw"), line("12vw", "0.95vw")])]));
    }
    return el("div.skeleton", {}, rows);
  }
  function codeSkeleton() {
    return el("div.skeleton.skelcode", {}, [bone("sqr"),
      el("div.how", {}, [line("22vw", "1.4vw"), line("19vw", "1.4vw"), line("23vw", "1.4vw"), line("15vw", "2vw")]),
      bone("", { width: "30vw", height: "5vw", marginTop: "1.6vw" })]);
  }

  function typeLabel(type) { return type === "movie" ? tr("Movies") : type === "series" ? tr("Series") : type === "channel" ? tr("Channels") : type === "tv" ? "TV" : type; }

  // "tt123:2:5" -> "S2 E5"
  function episodeLabel(videoId) {
    var m = /:(\d+):(\d+)$/.exec(videoId || "");
    return m ? tr("S{s} E{e}", { s: m[1], e: m[2] }) : "";
  }

  function posterClass(shape) { return shape === "landscape" ? "landscape" : shape === "square" ? "square" : "poster"; }

  // A focusable poster card. item has id/_id, name, type, poster, posterShape.
  // The title sits under the artwork, so a poster that fails to load still
  // shows what the card is instead of an empty tile.
  //
  // Memory: posters load only when they're about to be seen (showArt: the
  // first cards of a row, then ahead of the focus), and Stremio's poster
  // service sends its 300x450 size, which covers a card (216x324) and
  // decodes to a third of the default 500x750.
  function card(item, opts) {
    opts = opts || {};
    var pic = null;
    if (item.poster) {
      pic = el("div.img");
      pic.bgUrl = String(item.poster).replace("/poster/medium/", "/poster/small/").replace(/"/g, "%22");
    }
    var img = el("div.art", {}, [el("span.fallback", { text: item.name || "" }), pic,
      opts.progress ? el("div.progress", {}, el("div", { style: { width: Math.min(100, opts.progress * 100) + "%" } })) : null]);
    var c = el("div.card.focusable." + posterClass(item.posterShape), { "data-key": "card:" + (item.id || item._id) }, [img,
      el("div.name", { text: item.name || "" }),
      opts.label ? el("div.meta", { text: opts.label }) : null]);
    c.onactivate = function () { App.push(detail(item.type, item.id || item._id, item.id ? item : null)); };
    c.onfocusin2 = function () { showArtNear(c); };
    return c;
  }

  function showArt(c) {
    var pic = c && c.querySelector && c.querySelector(".img");
    if (pic && pic.bgUrl) { pic.style.backgroundImage = "url(\"" + pic.bgUrl + "\")"; pic.bgUrl = null; }
  }
  // Load the first n posters in a row or grid.
  function showArtIn(container, n) {
    var cards = container.querySelectorAll(".card");
    for (var i = 0; i < cards.length && i < n; i++) showArt(cards[i]);
  }
  // Load posters up to 10 cards past the focused one.
  function showArtNear(c) {
    var kids = c.parentNode ? c.parentNode.children : [];
    var at = Array.prototype.indexOf.call(kids, c);
    for (var i = 0; i < kids.length && i <= at + 10; i++) showArt(kids[i]);
  }

  function row(title, cards) {
    var strip = el("div.strip.hscroll", {}, cards);
    showArtIn(strip, 10);
    return el("div.row", {}, [el("h2", { text: title }), strip]);
  }

  // Top bar with the main sections.
  // inert: drawn but not selectable (while the app is still loading).
  function topBar(active, inert) {
    var tabs = [["home", "Home"], ["search", "Search"], ["library", "Library"], ["settings", "Settings"]].map(function (t) {
      var b = el("div.tab" + (inert ? "" : ".focusable") + (t[0] === active ? ".active" : ""), {}, [Icons.svg(t[0]), el("span", { text: tr(t[1]) })]);
      b.onactivate = function () {
        if (t[0] === active) return;
        var make = { home: null, search: search, library: library, settings: settings }[t[0]];
        while (App.pop()) { /* back to Home */ }
        if (make) App.push(make());
      };
      return b;
    });
    var clock = el("div.clock");
    function tick() { clock.textContent = U.timeOfDay(new Date()); }
    clock.refresh = tick;
    tick();
    var timer = setInterval(function () { if (document.body.contains(clock)) tick(); else clearInterval(timer); }, 15000);
    return el("header.topbar", {}, [el("div.logo", {}, [el("img.mark", { src: "logo.png", alt: "" }), el("span", { text: "Stremio" })])].concat(tabs, [clock]));
  }

  function brand() { return el("div.brand", {}, [el("img.mark", { src: "logo.png", alt: "" }), el("span", { text: "Stremio" })]); }

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
    var codeBox = el("div.linkbox", {}, codeSkeleton());
    var emailForm = el("div.emailform.hidden");
    var email = el("input.focusable", { type: "email", placeholder: tr("Email") });
    var pass = el("input.focusable", { type: "password", placeholder: tr("Password") });
    var err = el("div.error");
    var link = null;
    var s = { el: screen("login", [
      brand(),
      el("h1", { text: tr("Sign in to your Stremio account") }),
      el("div.columns", {}, [codeBox, el("div.side", {}, [
        button(tr("Sign in with email instead"), function () {
          emailForm.classList.remove("hidden"); Nav.focus(email);
        }, "", "mail"),
        emailForm,
        button(tr("Continue without an account"), function () { U.save("guest", true); enter(); }, "subtle")
      ])])
    ]) };

    emailForm.appendChild(email);
    emailForm.appendChild(pass);
    emailForm.appendChild(err);
    var submit = button(tr("Sign in"), doLogin, "primary");
    var submitLabel = submit.lastChild;
    emailForm.appendChild(submit);
    function doLogin() {
      err.textContent = "";
      submitLabel.textContent = tr("Signing in…");
      Account.login(email.value.trim(), pass.value).then(function (u) {
        App.toast(tr("Signed in as {email}", { email: u.email })); enter();
      }, function (e) { submitLabel.textContent = tr("Sign in"); err.textContent = e.message || tr("Sign-in failed"); });
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
          el("p", { text: tr("Point your phone’s camera at the code.") }),
          el("p", { text: tr("Or open this page and type the code below:") }),
          el("p.url", { text: "link.stremio.com" })]));
        codeBox.appendChild(el("div.code", { text: l.code }));
        l.wait.then(function (u) { App.toast(tr("Signed in as {email}", { email: u.email })); enter(); },
          function (e) { U.clear(codeBox).appendChild(el("div.error", { text: e.message })); codeBox.appendChild(button(tr("Get a new code"), startLink, "", "retry")); App.refocus(); });
      }, function (e) {
        U.clear(codeBox).appendChild(el("div.error", { text: tr("Couldn't reach Stremio: {msg}", { msg: e.message }) }));
        codeBox.appendChild(button(tr("Try again"), startLink, "", "retry"));
        App.refocus();
      });
    }
    startLink();
    s.destroy = function () { if (link) link.cancel(); };
    return s;
  }

  // Load addons and the library, then show Home.
  function enter() {
    // Home's outline while the addons load.
    var s = { el: screen("home", [topBar("home", true), el("div.page.skeleton", {}, [skelRow(), skelRow(), skelRow()])]) };
    App.reset(s);
    var stop = U.retry(function () {
      return Account.sync().catch(function () {}).then(function () { return Addons.load(); });
    }, function () { App.reset(home()); }, function (e, retrying) {
      U.clear(s.el).appendChild(brand());
      s.el.className = "screen splash";
      s.el.appendChild(el("div.error", { text: retrying
        ? tr("Can't reach the internet yet. Trying again…")
        : tr("Couldn't load addons: {msg}", { msg: e.message }) }));
      s.el.appendChild(button(tr("Try again"), enter, "", "retry"));
      App.refocus();
    });
    s.destroy = function () { stop(); };
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
      cwSlot.appendChild(row(tr("Continue Watching"), items.slice(0, 30).map(function (it) {
        var st = it.state;
        var upNext = st.timeOffset <= 1;   // finished; the next episode is queued at offset 1
        var left = !upNext && st.duration > st.timeOffset + 30000 ? minutesLeft(st) : "";
        var ep = it.type === "series" ? episodeLabel(st.video_id) : "";
        return card(it, { progress: !upNext && st.duration ? st.timeOffset / st.duration : 0,
          label: [ep, upNext ? tr("Up next") : left].filter(Boolean).join(" · ") });
      })));
    }
    buildContinue();

    var entries = Addons.boardCatalogs();
    var rows = entries.map(function (entry) {
      var r = row((entry.catalog.name ? tr(entry.catalog.name) : entry.addon.manifest.name) + " — " + typeLabel(entry.catalog.type), skelCards(9));
      r.querySelector(".strip").classList.add("skeleton");
      page.appendChild(r);
      return { entry: entry, el: r };
    });
    if (!entries.length) page.appendChild(el("div.empty", { text: tr("None of your addons provide catalogs.") }));
    var catalogStops = [], homeClosed = false;
    limited(rows.map(function (r) {
      return function () {
        if (homeClosed) return Promise.resolve();
        // Release the initial concurrency slot on the first result; retries
        // continue independently so an offline row cannot block later rows.
        return new Promise(function (release) {
          catalogStops.push(U.retry(function () { return Addons.catalog(r.entry); }, function (metas) {
            release();
            if (!metas.length) { r.el.remove(); return; }
            var strip = r.el.querySelector(".strip");
            strip.classList.remove("skeleton");
            U.clear(strip);
            metas.slice(0, 40).forEach(function (m) { strip.appendChild(card(m)); });
            showArtIn(strip, 10);
            // Until the user moves, keep focus on the first poster rather than the tabs.
            if (App.top() !== s) return;
            var cur = Nav.current();
            App.refocus(!moved && (!cur || cur.classList.contains("tab")) ? s.initialFocus() : null);
          }, function (e, retrying) {
            release();
            var strip = r.el.querySelector(".strip");
            strip.classList.remove("skeleton");
            U.clear(strip).appendChild(el("div.error", { text: retrying
              ? tr("Can't reach the internet yet. Trying again…")
              : tr("Couldn't load addons: {msg}", { msg: e.message }) }));
          }));
        });
      };
    }), 4);

    s.destroy = function () { homeClosed = true; catalogStops.forEach(function (stop) { stop(); }); };
    s.initialFocus = function () { return s.el.querySelector(".row .card.focusable") || s.el.querySelector(".tab.active"); };
    var moved = false;
    s.key = function (code) { if (code >= 37 && code <= 40) moved = true; return false; };
    s.refresh = function () { var f = Nav.current(); buildContinue(); if (App.top() === s) App.refocus(f); };
    s.show = function (returning) { if (returning) s.refresh(); };
    return s;
  }

  // ---------- search ----------

  function search() {
    var input = el("input.focusable.search", { type: "text", placeholder: tr("Search movies and series") });
    var results = el("div.page.vscroll.below-search");
    var s = { el: screen("search", [topBar("search"), el("div.searchbar", {}, [Icons.svg("search"), input]), results]) };
    var timer = null, seq = 0;
    function run() {
      var q = input.value.trim();
      var mine = ++seq;
      if (!q) { U.clear(results); return; }
      U.clear(results).appendChild(el("div.skeleton", {}, [skelRow(), skelRow()]));
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
          ? tr("Couldn't reach your search addons. Check the connection and try again.")
          : tr("Nothing found for “{q}”. Try the original title, or fewer words.", { q: q }) }));
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
      var b = el("div.chip.focusable" + (f[0] === filter ? ".active" : ""), { text: tr(f[1]), "data-key": "filter:" + f[0] });
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
      if (!items.length) grid.appendChild(el("div.empty", { text: !Account.signedIn() ? tr("Sign in to see your library.")
        : filter === "all" ? tr("Your library is empty. Open a movie or series and choose “Add to library”.") : tr("Nothing here yet.") }));
      items.forEach(function (it) { grid.appendChild(card(it)); });
      showArtIn(grid, Infinity);
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
      var label = tr(resume ? "Resume" : isSeries ? "Watch" : "Play");
      if (isSeries && target) label += " " + episodeLabel(target.id || ("x:" + target.season + ":" + target.episode));
      // A series' catalog preview has no episode list: wait for the details
      // rather than asking addons for streams of the show itself.
      var waiting = type === "series" && !full;
      if (waiting) label = tr("Loading episodes…");
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
        var libBtn = button(tr(inLib ? "In library" : "Add to library"), function () {
          var on = !Account.inLibrary(meta.id);
          Account.setInLibrary(meta, on);
          libBtn.setLabel(tr(on ? "In library" : "Add to library"), on ? "check" : "plus");
        }, "", inLib ? "check" : "plus");
        libBtn.setAttribute("data-key", "lib");
        actions.appendChild(libBtn);
      }
      if (resume && !isSeries) {
        var other = button(tr("Other streams"), function () { App.push(streams(meta, target)); }, "", "sources");
        other.setAttribute("data-key", "other");
        actions.appendChild(other);
      }
      info.appendChild(actions);

      U.clear(side);
      if (isSeries) renderEpisodes(episodes, lib, target);
      else if (type === "series" && !full) { side.classList.remove("hidden"); side.appendChild(episodesSkeleton()); }   // episodes on the way
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
        var t = el("div.chip.focusable" + (n === current ? ".active" : ""), { text: n === 0 ? tr("Specials") : tr("Season {n}", { n: n }), "data-key": "season:" + n });
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
              el("div.title", { text: "E" + v.episode + "  ·  " + (v.title || v.name || tr("Episode {n}", { n: v.episode })) }),
              el("div.meta", {}, [playing ? el("span.badge.accent", { text: lib.state.timeOffset > 1 && lib.state.duration ? minutesLeft(lib.state) : tr("Up next") }) : null,
                el("span", { text: released ? (function (d) { return future ? tr("Coming {date}", { date: d }) : d; })(released.toLocaleDateString(I18n.locale(), { year: "numeric", month: "short", day: "numeric" })) : "" })]),
              v.overview || v.description ? el("div.overview", { text: v.overview || v.description }) : null
            ])
          ]);
          e.onactivate = function () { App.push(streams(meta, v)); };
          list.appendChild(e);
        });
      }
      fill();
    }

    if (meta) render();
    else {
      info.appendChild(detailSkeleton());
      if (type === "series") side.appendChild(episodesSkeleton()); else side.classList.add("hidden");
    }
    // Keep recovering after startup/network failures. Destroying the screen
    // stops both retries and any in-flight addon requests.
    var stop = U.retry(function () { return Addons.meta(type, id); }, function (m) {
      if (!m) {
        if (!meta) { U.clear(side).classList.add("hidden"); U.clear(info).appendChild(el("div.error", { text: tr("No addon has details for this title.") })); }
        else { full = true; render(); if (App.top() === s) App.refocus(Nav.current()); }
        return;
      }
      var focused = Nav.current();
      meta = m;
      full = true;
      render();
      if (App.top() === s) App.refocus(focused);
    }, function (e, retrying) {
      var message = !retrying ? tr("Title addons rejected the request. Check their settings.")
        : e.kind === "service" ? tr("Title addons are temporarily unavailable. Trying again…")
        : tr("Can't reach your title addons yet. Trying again…");
      if (!meta) { U.clear(side).classList.add("hidden"); U.clear(info).appendChild(el("div.error", { text: message })); }
    });
    s.destroy = function () { stop(); };
    s.initialFocus = function () { return s.el.querySelector(".btn.primary"); };
    s.show = function (returning) { if (returning && meta) render(); };   // App.pop restores focus by data-key
    return s;
  }

  // ---------- streams ----------

  // What a stream's name/title says about it. Addons pack this into free
  // text ("Torrentio\n4k DV | HDR", "...WEB-DL DDP5.1 H.265...\n👤 25 💾 4.9 GB
  // ⚙️ TorrentGalaxy\n🇬🇧 / 🇮🇹"); pull it out so rows can show it plainly.
  var FLAG_LANGS = { GB: "English", US: "English", ES: "Spanish", MX: "Spanish", AR: "Spanish", IT: "Italian", FR: "French",
    DE: "German", PT: "Portuguese", BR: "Portuguese", RU: "Russian", JP: "Japanese", KR: "Korean", CN: "Chinese",
    NL: "Dutch", PL: "Polish", TR: "Turkish", IN: "Hindi", SE: "Swedish", DK: "Danish", NO: "Norwegian", FI: "Finnish",
    GR: "Greek", HU: "Hungarian", CZ: "Czech", UA: "Ukrainian", IL: "Hebrew", SA: "Arabic", TH: "Thai", VN: "Vietnamese" };
  var TIERS = [["4k", "4K"], ["1080p", "1080p"], ["720p", "720p"], ["sd", "SD"]];

  function describe(st, addonName) {
    var hints = st.behaviorHints || {};
    var text = [st.name, st.title, st.description].filter(Boolean).join("\n");
    var t = text + " " + (hints.filename || "");
    function has(re) { return re.test(t); }
    var d = { tier: "sd", tags: [] };
    if (has(/2160p|\b4k\b|\buhd\b/i)) d.tier = "4k";
    else if (has(/1080[pi]/i)) d.tier = "1080p";
    else if (has(/720p/i)) d.tier = "720p";
    d.quality = d.tier === "sd" ? (has(/480p/i) ? "480p" : "SD") : TIERS.filter(function (x) { return x[0] === d.tier; })[0][1];
    d.hdr = has(/\b(dv|dovi|dolby ?vision)\b/i) ? "Dolby Vision" : has(/\bhdr10\+|\bhdr10plus/i) ? "HDR10+" : has(/\bhdr(10)?\b/i) ? "HDR" : "";
    // Source, video, audio: short plain words.
    var source = has(/\bremux\b/i) ? "Remux" : has(/blu-?ray|bdrip|brrip|\bbd\b/i) ? "Blu-ray" : has(/web-?dl|webrip|\bweb\b/i) ? "Web"
      : has(/hdtv/i) ? "TV" : has(/dvd/i) ? "DVD" : "";
    if (source) d.tags.push([source]);
    d.av1 = has(/\bav1\b/i);
    var video = d.av1 ? "AV1" : has(/x\.?265|h\.?\s?265|hevc/i) ? "HEVC" : has(/x\.?264|h\.?\s?264|\bavc\b/i) ? "H.264" : has(/xvid|divx/i) ? "XviD" : "";
    if (video) d.tags.push([d.av1 ? tr("{v} · may not play", { v: video }) : video, d.av1 ? "warn" : ""]);
    var ch = /\b([257])[ .]1\b/.exec(t);
    ch = ch ? " " + ch[1] + ".1" : "";
    d.dts = has(/\bdts/i);
    var audio = d.dts ? "DTS" : has(/atmos/i) ? "Atmos" : has(/truehd/i) ? "TrueHD" : has(/\bddp|dd\+|e-?ac-?3/i) ? "Dolby Digital+"
      : has(/\bdd\b|\bac-?3\b|dd[25]\.?[01]/i) ? "Dolby Digital" : has(/\baac/i) ? "AAC" : "";
    if (audio) d.tags.push([d.dts ? tr("{a} · converted", { a: audio + ch }) : audio + ch, d.dts ? "info" : ""]);
    // Languages from flag emoji (the TV can't draw flags) and common words.
    var langs = [];
    var flags = text.match(/\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/g) || [];
    flags.forEach(function (f) {
      var code = String.fromCharCode(f.charCodeAt(1) - 0xDDE6 + 65, f.charCodeAt(3) - 0xDDE6 + 65);
      var name = FLAG_LANGS[code] || code;
      if (langs.indexOf(name) < 0) langs.push(name);
    });
    if (has(/castellano|latino|español|spanish/i) && langs.indexOf("Spanish") < 0) langs.push("Spanish");
    if (has(/multi[ -]?(audio|lang)|dual[ -]?audio/i) && !langs.length) langs.push("Multi audio");
    if (langs.length) d.tags.push([langs.map(function (l) { return tr(l); }).join(" · "), "", "audio"]);
    var seeds = /👤\s?(\d+)/.exec(text);
    d.seeds = seeds ? +seeds[1] : null;
    var size = /💾\s?(\d+(?:\.\d+)?)\s?(GB|MB)/i.exec(text) || /\b(\d+(?:\.\d+)?)\s?(GB|MB)\b/i.exec(text);
    d.size = size ? (+size[1]).toFixed(size[2].toUpperCase() === "GB" && +size[1] < 10 ? 1 : 0) + " " + size[2].toUpperCase() : "";
    var provider = /⚙️?\s*([^\n👤💾]+)/.exec(text);
    d.source = [addonName, provider ? provider[1].trim() : ""].filter(Boolean).join(" · ");
    // The file name reads best; the torrent/pack name is extra detail.
    var lines = (st.title || st.description || "").split("\n").filter(function (l) { return l && !/👤|💾|⚙|\uD83C[\uDDE6-\uDDFF]/.test(l); });
    var file = hints.filename || lines[lines.length - 1] || st.name || addonName || "";
    file = file.split("/").pop();
    d.title = words(file.replace(/\.(mkv|mp4|avi|m4v|webm|ts)$/i, ""));
    var pack = lines.length > 1 ? words(lines[0]) : "";
    d.pack = pack && pack !== d.title ? pack : "";
    return d;
  }

  // "Mad.Men.S01E02.DDP5.1" -> "Mad Men S01E02 DDP5.1": dots and underscores
  // become spaces, but audio channels (5.1, 7.1, 2.0) keep theirs.
  function words(name) {
    return name.replace(/[._]+/g, " ").replace(/\s+/g, " ").replace(/([257]) ([01])(?=[\s\-]|$)/g, "$1.$2").trim();
  }

  function streamKey(st) { return st.infoHash ? st.infoHash.toLowerCase() + ":" + (st.fileIdx || 0) : st.url || st.name || ""; }

  function streams(meta, video) {
    var list = el("div.streamlist.vscroll");
    var status = el("div.status");
    var epName = video.title || video.name;
    var label = video.season !== undefined ? tr("Season {n}", { n: video.season }) + "  ·  " + tr("Episode {n}", { n: video.episode }) + (epName ? "  —  " + epName : "") : "";
    var filters = el("div.filters.sfilters");
    var head = el("div.head", {}, [el("div.htext", {}, [el("h1", { text: meta.name }), label ? el("div.sub", { text: label }) : null, status])]);
    if (meta.poster) head.insertBefore(el("div.hposter", { style: { backgroundImage: "url(\"" + meta.poster + "\")" } }), head.firstChild);
    var s = { el: screen("streams", [meta.background ? el("div.sbackdrop", { style: { backgroundImage: "url(\"" + meta.background + "\")" } }) : null,
      head, el("div.sbody2", {}, [filters, list])]) };
    var last = U.lastStream(video.id), lastKey = last ? streamKey(last) : null;
    var entries = [], seen = {}, hidden = 0, filter = "all", order = 0, done = false;
    var addonCount = Addons.all().filter(function (a) { return Addons.supports(a, "stream", meta.type, video.id); }).length, answered = 0;

    function setStatus() {
      var n = entries.length;
      var parts = [];
      if (!done || (addonCount && !answered)) parts.push(tr("Loading streams… {a} of {b} addons", { a: answered, b: addonCount }));
      else parts.push(n === 1 ? tr("1 stream") : tr("{n} streams", { n: n }));
      if (hidden) parts.push(tr("{n} not playable on the TV, hidden", { n: hidden }));
      status.textContent = addonCount || n ? parts.join("  ·  ") : "";
    }

    function render() {
      var keep = Nav.current() && s.el.contains(Nav.current()) ? Nav.current() : null;
      // Filter chips: only qualities that exist.
      U.clear(filters);
      var counts = { all: entries.length };
      entries.forEach(function (e) { counts[e.d.tier] = (counts[e.d.tier] || 0) + 1; });
      if (filter !== "all" && !counts[filter]) filter = "all";
      [["all", tr("All")]].concat(TIERS).forEach(function (f) {
        if (!counts[f[0]] || (f[0] !== "all" && counts[f[0]] === entries.length)) return;
        var c = el("div.chip.focusable" + (filter === f[0] ? ".active" : ""), { "data-key": "sf:" + f[0] },
          [el("span", { text: f[1] }), el("span.ccount", { text: String(counts[f[0]]) })]);
        c.onactivate = function () { filter = f[0]; render(); list.scrollTop = 0; };
        filters.appendChild(c);
      });
      filters.classList.toggle("hidden", filters.childNodes.length < 2);
      // Best first: quality, then streams that should play, then addon order.
      var rank = { "4k": 0, "1080p": 1, "720p": 2, sd: 3 };
      var shown = entries.filter(function (e) { return filter === "all" || e.d.tier === filter; }).sort(function (a, b) {
        return rank[a.d.tier] - rank[b.d.tier] || (a.d.av1 - b.d.av1) || ((a.d.seeds === 0) - (b.d.seeds === 0)) || a.order - b.order;
      });
      U.clear(list);
      shown.forEach(function (e) { list.appendChild(row(e)); });
      if (!done && !entries.length) list.appendChild(streamsSkeleton());
      if (done && !entries.length) list.appendChild(el("div.empty", { text: hidden ? tr("None of the streams found can play on the TV.")
        : addonCount && !answered ? tr("Can't reach your stream addons yet. Trying again…")
        : tr("No streams found. Install stream addons (for example Torrentio) from stremio.com on your phone or computer — they sync to the TV after you sign in.") }));
      if (App.top() !== s) return;
      var again = keep && Nav.findSame(s.el, keep);
      if (again) Nav.focus(again);
      else if (!keep || !s.el.contains(keep) || !keep.parentNode) App.refocus(s.initialFocus());
    }

    function row(e) {
      var d = e.d, st = e.st;
      var tags = d.tags.map(function (b) {
        return el("span.badge" + (b[1] ? "." + b[1] : ""), {}, [b[2] ? Icons.svg(b[2]) : null, el("span", { text: b[0] })]);
      });
      if (e.key === lastKey) tags.unshift(el("span.badge.accent", { text: tr("Last played") }));
      var side = [];
      if (d.seeds !== null) side.push(el("span.sstat" + (d.seeds <= 2 ? ".low" : ""), {}, [Icons.svg("peers"), el("span", { text: String(d.seeds) })]));
      if (d.size) side.push(el("span.sstat", {}, [Icons.svg("download"), el("span", { text: d.size })]));
      var r = el("div.stream.focusable", { "data-key": "st:" + e.key }, [
        el("div.squal", {}, [el("div.sq", { text: d.quality }), d.hdr ? el("div.shdr", { text: d.hdr }) : null]),
        el("div.sbody", {}, [
          el("div.stitle", { text: d.title }),
          d.pack ? el("div.spack", { text: d.pack }) : null,
          el("div.badges", {}, tags)
        ]),
        el("div.sside", {}, [el("div.sstats", {}, side), el("div.ssrc", { text: d.source })])
      ]);
      r.onactivate = function () {
        U.setLastStream(video.id, st);
        lastKey = e.key;
        Player.open({ meta: meta, video: video, stream: st });
      };
      return r;
    }

    setStatus();
    list.appendChild(streamsSkeleton());
    filters.classList.add("hidden");
    // Retry only failed addons, including partial failures during reconnection.
    var closed = false, retryTimer = null, completedAddons = {}, retryDelay = 3000;
    function load() {
      Addons.streams(meta.type, video.id, function (addon, found) {
        if (closed) return;
        answered++;
        found.forEach(function (st) {
          var playable = !st.ytId && !st.externalUrl && (st.infoHash || st.url);
          if (!playable) { hidden++; return; }
          var key = streamKey(st);
          if (seen[key]) return;   // the same file from two addons
          seen[key] = true;
          entries.push({ st: st, key: key, order: order++, d: describe(st, addon.manifest.name) });
        });
        setStatus();
        render();
      }, completedAddons).then(function (results) {
        if (closed) return;
        done = true; setStatus(); render();
        if (results.some(function (r) { return r === null; })) {
          retryTimer = setTimeout(load, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 15000);
        }
      });
    }
    load();

    // Up from the top row goes to the selected filter, not the nearest chip.
    s.key = function (code) {
      var c = Nav.current();
      if (code === KEY.UP && c && c.parentNode === list && c === list.querySelector(".stream")) {
        var chip = filters.querySelector(".chip.active");
        if (chip && !filters.classList.contains("hidden")) { Nav.focus(chip); return true; }
      }
      return false;
    };
    s.initialFocus = function () {
      return (lastKey && list.querySelector("[data-key=\"st:" + lastKey.replace(/"/g, "\\\"") + "\"]")) || list.querySelector(".stream.focusable");
    };
    s.streamsFor = video.id;
    s.destroy = function () { closed = true; clearTimeout(retryTimer); };
    return s;
  }

  // ---------- settings ----------

  var LANGS = [["", "Default"], ["eng", "English"], ["spa", "Spanish"], ["fre", "French"], ["ger", "German"], ["ita", "Italian"], ["por", "Portuguese"]];
  var SUBLANGS = [["", "Off"]].concat(LANGS.slice(1));
  var SIZES = [[0.8, "Small"], [1, "Normal"], [1.3, "Large"], [1.6, "Huge"]];

  // A setting stepped with left/right. Labels and option names are English
  // and get translated, unless raw (the language list shows native names).
  function choice(label, key, options, fallback, onChange, raw) {
    if (!raw) options = options.map(function (o) { return [o[0], tr(o[1])]; });
    var value = U.load(key, fallback);
    var idx = Math.max(0, options.map(function (o) { return o[0]; }).indexOf(value));
    var valueEl = el("span.svalue", { text: options[idx][1] });
    var r = el("div.setting.stepper.focusable", { "data-key": "set:" + key }, [el("span", { text: raw ? label : tr(label) }),
      el("span.sctl", {}, [Icons.svg("chevronLeft"), valueEl, Icons.svg("chevronRight")])]);
    function step(d) {
      idx = (idx + d + options.length) % options.length;
      U.save(key, options[idx][0]);
      valueEl.textContent = options[idx][1];
      if (onChange) onChange(options[idx][0]);
    }
    r.onactivate = function () { step(1); };
    r.step = step;
    return r;
  }

  function settings() {
    var serverState = el("span.value", { text: tr("Checking…") });
    var versionEl = el("span.value", { text: "" });
    Updates.current().then(function (v) { versionEl.textContent = v || ""; });
    // Updates: the server updates itself; the app installs when asked.
    var updText = el("span.value", { text: tr("Checking…") });
    var updRow = info("Status", updText);
    var updButtons = el("div.setting-buttons");
    var busy = false;
    function say(text) { updText.textContent = text; }
    function progressText(p) {
      if (!p) return "";
      var v = { version: p.version || p.latest || "" };
      if (p.task === "app") {
        if (p.state === "downloading") return tr("Downloading app {version}…", v);
        if (p.state === "installing") return tr("Installing app {version}. The app will close and open again.", v);
        if (p.state === "failed") return tr("Couldn't install app {version}.", v);
        return "";
      }
      if (p.state === "checking") return tr("Checking for a newer server…");
      if (p.state === "downloading" || p.state === "verifying") return tr("Downloading server {version}…", v);
      if (p.state === "installed") return tr("Server updated to {version}", v);
      if (p.state === "failed") return tr("Couldn't update the server. The current one stays.");
      if (p.state === "switched") return tr("Now using server {version}", v);
      return "";
    }
    // Rebuilds the buttons, keeping focus in the section if it was there.
    function setButtons(list) {
      var had = updButtons.contains(document.activeElement) || updButtons.contains(Nav.current());
      U.clear(updButtons);
      list.forEach(function (b) { if (b) updButtons.appendChild(b); });
      if (had) App.refocus(updButtons.querySelector(".focusable") || updRow);
    }
    function run(promise) {
      busy = true;
      setButtons([]);
      return promise.then(function (r) { busy = false; refreshUpdates(); return r; },
        function () { busy = false; say(tr("Couldn't check for updates.")); refreshUpdates(true); });
    }
    function refreshUpdates(keepText) {
      if (busy) return;
      U.settle([Updates.status(), Updates.appState()]).then(function (r) {
        if (busy) return;
        var st = r[0], app = r[1];
        if (st) { serverVersion = st.server || ""; showServer(); }
        if (!keepText) {
          var text = st && progressText(st.progress);
          if (!text || (st.progress && st.progress.state === "uptodate")) text = app && app.latest ? tr("App update {version} is available", { version: app.latest })
            : st ? tr("Up to date. The server updates itself.") : tr("Couldn't check for updates.");
          if (st && st.progress && st.progress.state === "skipped") text = tr("Server {version} is skipped. Check for updates to install it.", { version: st.progress.latest });
          say(text);
        }
        setButtons([
          app && app.latest ? button(tr("Install app {version}", { version: app.latest }), function () {
            run(Updates.installApp(app.latest, function (s) { say(progressText(s.progress)); }));
          }, "primary", "download") : null,
          button(tr("Check for updates"), function () {
            say(tr("Checking for updates…"));
            run(Updates.updateServer(true, function (s) { say(progressText(s.progress) || tr("Checking for updates…")); }));
          }, "", "retry"),
          st && st.previous ? button(tr("Switch to server {version}", { version: st.previous }), function () {
            say(tr("Switching server…"));
            run(Updates.switchServer());
          }, "", "server") : null,
          app && app.previous ? button(tr("Go back to app {version}", { version: app.previous }), function () {
            U.save("appSkip", app.current);   // don't suggest the version we left
            run(Updates.installApp(app.previous, function (s) { say(progressText(s.progress)); }));
          }, "", "back") : null
        ]);
      });
    }
    var u = Account.user();
    var subLangRow = el("div.setting.focusable", {}, [el("span", { text: tr("Subtitle languages") }), el("span.value", { text: subLangsLabel() })]);
    subLangRow.onactivate = function () { App.push(subLanguages()); };
    var rows = [
      el("h2", { text: tr("Account") }),
      info(u ? "Signed in as" : "Not signed in", el("span.value", { text: u ? u.email : "" })),
      u ? button(tr("Sign out"), function () { Account.logout(); Addons.reset(); U.forget("guest"); App.reset(login()); }, "", "signOut")
        : button(tr("Sign in"), function () { U.forget("guest"); App.reset(login()); }, "primary", "mail"),
      el("h2", { text: tr("Playback") }),
      choice("Preferred audio language", "prefAudioLang", LANGS, ""),
      choice("Subtitles", "prefSubLang", SUBLANGS, ""),
      subLangRow,
      choice("Subtitle size", "subSize", SIZES, 1),
      choice("Subtitle background", "subBg", [["none", "None"], ["translucent", "Translucent"], ["solid", "Solid"]], "none"),
      choice("Subtitle color", "subColor", [["white", "White"], ["yellow", "Yellow"]], "white"),
      el("h2", { text: tr("Display") }),
      // "Idioma (Language)": findable even by someone who can't read the current language.
      choice(I18n.lang() === "en" ? "Language" : tr("Language") + " (Language)", "uiLang", I18n.LANGS, "en", function (code) {
        I18n.set(code);
        App.reset(home());   // rebuild every screen in the new language
        App.push(settings());
        App.refocus(App.top().el.querySelector("[data-key=\"set:uiLang\"]"));
      }, true),
      choice("Clock", "clockFormat", [["12h", "AM/PM"], ["24h", "24-hour"]], "12h", function () {
        var c = s.el.querySelector(".clock");
        if (c && c.refresh) c.refresh();
      }),
      el("h2", { text: tr("About") }),
      info("Streaming server", serverState),
      info("Addons", el("span.value", { text: Addons.all().map(function (a) { return a.manifest.name; }).join(", ") })),
      info("Version", versionEl),
      el("h2", { text: tr("Updates") }),
      updRow,
      updButtons
    ];
    // Read-only rows still take focus, so the arrows reach (and scroll to) them.
    function info(label, value) { return el("div.setting.info.focusable", {}, [el("span", { text: tr(label) }), value]); }
    var s = { el: screen("settings", [topBar("settings"), el("div.page.vscroll", {}, el("div.settings", {}, rows))]) };
    var serverVersion = "";
    function showServer() {
      Engine.alive().then(function (ok) {
        U.clear(serverState).appendChild(el("span.dot" + (ok ? ".ok" : "")));
        serverState.appendChild(document.createTextNode(tr(ok ? "Running" : "Stopped · starts when you play something") +
          (serverVersion ? " · " + serverVersion : "")));
      });
    }
    showServer();
    refreshUpdates();
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
    return l.length ? l.map(U.langName).join(", ") : tr("All languages");
  }

  // Settings > Subtitle languages: which languages the player's subtitle
  // menu lists. Ticking none (or "All languages") lists everything.
  function subLanguages() {
    function row(label, onToggle) {
      var r = el("div.setting.toggle.focusable", {}, [el("span", { text: label }), Icons.svg("check", "tcheck")]);
      r.onactivate = function () { onToggle(); render(); };
      return r;
    }
    var all = row(tr("All languages"), function () { U.save("subLangs", []); });
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
      el("h2", { text: tr("Subtitle languages") }),
      el("p.shint", { text: tr("The subtitle menu in the player lists only these languages. The others stay available under \u201cOther languages\u201d.") }),
      all
    ].concat(langs)))]) };
    s.initialFocus = function () { return s.el.querySelector(".toggle.on") || all; };
    return s;
  }

  return { login: login, enter: enter, home: home, search: search, library: library, detail: detail,
    streams: streams, settings: settings, episodeLabel: episodeLabel };
})();
