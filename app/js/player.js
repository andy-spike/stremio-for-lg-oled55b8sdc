// The player screen. See engine.js for how "direct" and "convert" playback
// are chosen. Progress is written to the library the same way stremio-core
// does (Account.progress/finish), so it syncs with the official apps.

var Player = (function () {
  var el = U.el;
  var SIZES = [0.8, 1, 1.3, 1.6], SIZE_NAMES = ["Small", "Normal", "Large", "Huge"];
  // Subtitle legibility. The "luna" values are what LG's media service takes
  // for subtitles the TV draws itself (embedded tracks in direct play).
  var SUB_BGS = [{ id: "none", name: "None", luna: 0 }, { id: "translucent", name: "Translucent", luna: 160 }, { id: "solid", name: "Solid", luna: 255 }];
  var SUB_COLORS = [{ id: "white", name: "White" }, { id: "yellow", name: "Yellow" }];
  function indexOfId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return 0; }
  var HLS_CONFIG = { enableWorker: false, backBufferLength: 30, maxBufferLength: 50, maxMaxBufferLength: 80,
    maxFragLookUpTolerance: 0, maxBufferHole: 0, appendErrorMaxRetry: 20, nudgeMaxRetry: 20,
    manifestLoadingTimeOut: 30000, manifestLoadingMaxRetry: 10, renderTextTracksNatively: true };

  function open(opts) { App.push(create(opts)); }

  function nextVideoOf(meta, video) {
    var eps = (meta.videos || []).filter(function (v) { return isFinite(v.season) && isFinite(v.episode); })
      .sort(function (a, b) { return a.season - b.season || a.episode - b.episode; });
    var i = -1;
    eps.forEach(function (v, k) { if (v.id === video.id) i = k; });
    if (i < 0) return null;
    var n = eps[i + 1];
    if (!n || (n.season === 0 && video.season !== 0)) return null;
    if (n.released && new Date(n.released) > new Date()) return null;
    return n;
  }

  function resolution(v) {
    if (!v || !v.width) return "";
    if (v.width >= 3200) return "4K";
    if (v.width >= 1800) return "1080p";
    if (v.width >= 1200) return "720p";
    return v.height + "p";
  }

  function channels(n) { return n > 2 ? (n - 1) + ".1" : n === 1 ? "mono" : "stereo"; }
  function hhmm(d) { return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); }

  function create(opts) {
    var meta = opts.meta, video = opts.video, stream = opts.stream;
    var nextVideo = nextVideoOf(meta, video);
    var isEpisode = video.season !== undefined && video.episode !== undefined;
    var subtitle = isEpisode ? "Season " + video.season + "  ·  Episode " + video.episode + ((video.title || video.name) ? "  —  " + (video.title || video.name) : "") : "";
    var title = meta.name + (isEpisode ? " S" + video.season + " E" + video.episode : "");

    // ---- DOM ----
    var media = el("video.media");
    var subLayer = el("div.sublayer");
    var subs = Subtitles.createRenderer(subLayer);

    var art = meta.logo ? el("img.plogo", { src: meta.logo, alt: meta.name }) : el("div.ptitle", { text: meta.name });
    if (meta.logo) art.onerror = function () { art.parentNode.replaceChild(el("div.ptitle", { text: meta.name }), art); };
    var statusText = el("span"), statsLine = el("div.pstats");
    var loading = el("div.ploading", {}, [el("div.pcenter", {}, [art,
      subtitle ? el("div.psub", { text: subtitle }) : null,
      el("div.pstatus", {}, [el("div.spinner"), statusText]), statsLine])]);
    if (meta.background || meta.poster) loading.style.backgroundImage = "url(\"" + (meta.background || meta.poster) + "\")";
    var buffering = el("div.buffering.hidden", {}, el("div.spinner"));

    var chips = el("div.chips");
    var clockEl = el("div.oclock"), endsEl = el("div.oends");
    var timeNow = el("span.tnow"), timeLeft = el("span.tleft");
    var barBuf = el("div.buf"), barPlay = el("div.played"), knob = el("div.knob");
    var bubble = el("div.bubble.hidden");
    var seekbar = el("div.seekbar.focusable", {}, [el("div.track", {}, [barBuf, barPlay, knob]), bubble]);
    // Controls row: track menus left; back 10 s, play, forward 10 s in the
    // center; other streams and next episode right. Icon-only buttons.
    var btnBack = ctl("back10", "Back 10 s", function () { seekBy(-10, true); });
    var btnFwd = ctl("forward10", "Forward 10 s", function () { seekBy(10, true); });
    var btnPlay = ctl("pause", "Pause", togglePause, "primary");
    var btnNext = nextVideo ? ctl("next", "Next episode", playNext) : null;
    var btnAudio = ctl("audio", "Audio", function () { openMenu("audio"); });
    var btnSubs = ctl("subtitles", "Subtitles", function () { openMenu("subs"); });
    var btnStreams = ctl("sources", "Other streams", otherStreams);
    var overlay = el("div.overlay.hidden", {}, [
      el("div.otop", {}, [chips, el("div.otime", {}, [clockEl, endsEl])]),
      el("div.obottom", {}, [
        el("div.oheading", {}, [el("div.otitle", { text: meta.name }), subtitle ? el("div.osub", { text: subtitle }) : null]),
        el("div.scrub", {}, [timeNow, seekbar, timeLeft]),
        el("div.controls", {}, [
          el("div.cgroup.cleft", {}, [btnAudio, btnSubs]),
          el("div.cgroup.ccenter", {}, [btnBack, btnPlay, btnFwd]),
          el("div.cgroup.cright", {}, [btnStreams, btnNext])])
      ])
    ]);
    var menu = el("div.menu.hidden");
    var nextCard = el("div.nextcard.hidden");
    var errorView = el("div.perror.hidden");
    var root = el("section.screen.player", {}, [media, subLayer, buffering, overlay, menu, nextCard, loading, errorView]);
    var s = { el: root };

    // Icon-only round control. Focus only changes colours, never size, so
    // nothing in the row moves. The label is for screen readers.
    function ctl(icon, label, fn, cls) {
      var b = el("div.ctl.focusable" + (cls ? "." + cls : ""), { "aria-label": label }, [Icons.svg(icon), el("span.clabel", { text: label })]);
      b.onactivate = fn;
      return b;
    }
    function setCtl(b, icon, label) {
      b.replaceChild(Icons.svg(icon), b.firstChild);
      b.lastChild.textContent = label;
      b.setAttribute("aria-label", label);
    }
    // Text button with a leading icon, for the error view and next-episode card.
    function btn(label, fn, icon, cls) {
      var b = el("div.btn.focusable" + (cls ? "." + cls : ""), {}, [icon ? Icons.svg(icon) : null, el("span", { text: label })]);
      b.onactivate = fn;
      return b;
    }

    // ---- state ----
    var info = null, plan = null, mode = null;
    var hls = null, hlsId = null;
    var item = Account.itemFor(meta);
    var audioIdx = 0;
    var subSel = { kind: "off" };      // off | embedded {index} | addon {url}
    var addonSubs = [], addonSubsLoaded = false;
    var subDelay = 0, subSize = Math.max(0, SIZES.indexOf(U.load("subSize", 1)));
    var hlsTrackCount = -1;
    var mediaId = null, mediaIdTimer = null;
    var timers = [], statsTimer = null, hideTimer = null, seekTimer = null;
    var pendingSeek = null, seekSteps = 0, lastSeekKey = 0, seekLandedAt = 0;
    var menuOpener = null, subsShowAll = false, focusToggle = false;
    var lastPush = 0, closed = false, nextDismissed = false, nextCountdown = null, triedConvert = false;
    var restartUntil = 0, resumeNotice = 0;
    var subBg = indexOfId(SUB_BGS, U.load("subBg", "none")), subColor = indexOfId(SUB_COLORS, U.load("subColor", "white"));
    subs.setSize(SIZES[subSize]);
    subs.setStyle(SUB_BGS[subBg].id, SUB_COLORS[subColor].id);

    // ---- startup ----
    function status(text) { statusText.textContent = text; }

    // again: { mode, audio } to retry the same way (keeps audio conversion).
    function start(startAt, again) {
      Nav.focus(null);
      errorView.classList.add("hidden");
      loading.classList.remove("hidden");
      status("Starting the streaming server…");
      if (stream.infoHash) watchStats(stream.infoHash.toLowerCase());
      Engine.ensure().then(function () {
        status(stream.infoHash || /^magnet:/.test(stream.url || "") ? "Connecting to peers…" : "Connecting…");
        return Engine.resolve(stream, { season: video.season, episode: video.episode });
      }).then(function (r) {
        if (closed) return null;
        info = r;
        if (info.infoHash) watchStats(info.infoHash, info.fileIdx);
        status("Reading the file…");
        // One retry (a slow torrent may have more of the file by then); then
        // guess from the names, and read it again once it's playing.
        return Engine.probe(info.url).then(null, function () {
          if (closed) return null;
          status("Still reading the file…");
          return Engine.probe(info.url, 30000);
        }).then(null, function () { return null; });
      }).then(function (probe) {
        if (closed || !info) return;
        if (!probe) {
          var hints = stream.behaviorHints || {};
          probe = Engine.guessProbe([info.filename, hints.filename, stream.name, stream.title, stream.description].join(" "));
        }
        plan = Engine.plan({ probe: probe }, U.load("prefAudioLang", ""));
        audioIdx = again && plan.audio[again.audio] ? again.audio : plan.audioIdx;
        var startMode = again && again.mode === "convert" && plan.canConvert ? "convert" : plan.mode;
        status("Starting playback…");
        var resumeAt = startAt;
        if (resumeAt === undefined) {
          var st = item.state;
          if (st.video_id === video.id && st.timeOffset > 5000 && (!st.duration || st.timeOffset < st.duration * 0.9)) {
            resumeAt = st.timeOffset / 1000;
            resumeNotice = resumeAt;   // shown once playback actually starts
          }
        }
        load(startMode, resumeAt || 0, audioIdx);
        loadAddonSubs();
        if (plan.guessed) reprobe();
      }).catch(function (e) {
        if (closed) return;
        var torrent = stream.infoHash || /^magnet:/.test(stream.url || "");
        fail(torrent && !info && /Timed out/.test(e.message || "")
          ? "Nobody is sharing this torrent right now (no peers found in 60 seconds). Try another stream — ones with more seeders start faster."
          : e.message || "Couldn't start this stream.");
      });
    }

    // The codecs were guessed from the names: read the file again once it
    // plays (the start of it is downloaded by then, so this is quick). If
    // the audio turns out to need conversion, switch to it where we are.
    function reprobe() {
      var forInfo = info, tries = 0;
      function stale() { return closed || info !== forInfo || !plan || !plan.guessed; }
      (function attempt() {
        if (stale()) return;
        if (!playingSeen) { setTimeout(attempt, 2000); return; }
        Engine.probe(info.url, 30000).then(function (p) {
          if (stale()) return;
          var real = Engine.plan({ probe: p }, U.load("prefAudioLang", ""));
          plan = real;
          var failed = !errorView.classList.contains("hidden");
          if (mode === "direct" && real.mode === "convert" && !failed) {
            var a = real.audio[real.audioIdx];
            load("convert", pos(), real.audioIdx);
            App.toast("This file has " + a.codec.toUpperCase() + " audio — converting it for this TV…", 5000);
            return;
          }
          if (!real.audio[audioIdx]) audioIdx = 0;
          if (mode === "direct") {
            audioIdx = real.audioIdx;
            if (mediaId && real.audio.length > 1) Luna.media("selectTrack", { type: "audio", mediaId: mediaId, index: audioIdx });
          }
          showInfo();
          if (subSel.kind === "off") { autoDone = false; autoSubs(); }
        }, function () { if (++tries < 3) setTimeout(attempt, 10000); });
      })();
    }

    function watchStats(infoHash, fileIdx) {
      clearInterval(statsTimer);
      statsTimer = setInterval(function () {
        Engine.stats(infoHash, fileIdx).then(function (st) {
          if (!st) return;
          U.clear(statsLine);
          [["peers", st.peers + (st.peers === 1 ? " peer" : " peers")], ["download", U.bytes(st.downloadSpeed || 0) + "/s"]].forEach(function (x) {
            statsLine.appendChild(el("span.stat", {}, [Icons.svg(x[0]), el("span", { text: x[1] })]));
          });
        });
      }, 2000);
    }

    // ---- media loading ----
    function teardown() {
      clearInterval(mediaIdTimer);
      clearTimeout(seekTimer);
      pendingSeek = null;
      bubble.classList.add("hidden");
      seekbar.classList.remove("seeking");
      if (seekOnce) { media.removeEventListener("loadedmetadata", seekOnce); seekOnce = null; }
      mediaId = null;
      if (hls) { hls.destroy(); hls = null; }
      if (hlsId) { Engine.hlsDestroy(hlsId); hlsId = null; }
      hlsTrackCount = -1;
      media.removeAttribute("src");
      try { media.load(); } catch (e) { /* ignore */ }
    }

    // Current position; before the resume seek lands, where we're starting.
    var startPos = 0, seekOnce = null;
    function pos() { return media.currentTime || startPos || 0; }

    function load(newMode, startAt, wantAudio) {
      teardown();
      mode = newMode;
      tvSubsSettled = mode !== "direct";
      playingSeen = false;
      audioIdx = wantAudio;
      var resumeAt = startAt || 0;
      startPos = resumeAt;
      if (mode === "direct") {
        media.src = info.url;
        seekOnce = function () {
          media.removeEventListener("loadedmetadata", seekOnce);
          seekOnce = null;
          if (resumeAt > 0) media.currentTime = resumeAt;
        };
        media.addEventListener("loadedmetadata", seekOnce);
        media.play();
        waitForMediaId();
      } else {
        var h = Engine.hlsUrl(info.url);
        hlsId = h.id;
        var cfg = {};
        Object.keys(HLS_CONFIG).forEach(function (k) { cfg[k] = HLS_CONFIG[k]; });
        cfg.startPosition = resumeAt > 0 ? resumeAt : -1;
        hls = new Hls(cfg);
        var recovered = false;
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (hls.audioTracks.length > audioIdx) hls.audioTrack = audioIdx;
          hls.subtitleDisplay = false;
          applySubs();
          media.play();
        });
        hls.on(Hls.Events.ERROR, function (e, d) {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; hls.recoverMediaError(); return; }
          fail("Playback failed (" + d.details + ").");
        });
        hls.loadSource(h.url);
        hls.attachMedia(media);
      }
      showInfo();
    }

    // The TV assigns the hardware pipeline an id once the source opens;
    // LG's media service needs it for track selection. Poll often: until we
    // have it, the TV may be drawing the file's default subtitle track.
    function waitForMediaId() {
      var tries = 0;
      clearInterval(mediaIdTimer);
      mediaIdTimer = setInterval(function () {
        var id = String(media.mediaId || "").trim();
        if (id && id !== "<invalid mediaId>") {
          clearInterval(mediaIdTimer);
          mediaId = id;
          // Switch the TV's own subtitles off first (unless an embedded
          // track was chosen); the loading screen stays up until it's done.
          var off = subSel.kind === "embedded" ? Promise.resolve()
            : Luna.media("setSubtitleEnable", { mediaId: mediaId, enable: false });
          off.then(settleTvSubs, settleTvSubs);
          if (plan.audio.length > 1) Luna.media("selectTrack", { type: "audio", mediaId: mediaId, index: audioIdx });
          applySubs();
        } else if (++tries === 150) settleTvSubs();   // keep polling: slow torrents start late
      }, 60);
    }

    // The loading screen hides once the video plays AND (in direct play) the
    // TV's subtitles are switched off, so its default track never flashes
    // on screen. Never waits more than 2 s after playback starts.
    var tvSubsSettled = true, playingSeen = false;
    function settleTvSubs() { tvSubsSettled = true; reveal(); }
    function reveal() {
      if (!playingSeen || !tvSubsSettled) return;
      loading.classList.add("hidden");
      clearInterval(statsTimer);
    }

    function fail(message) {
      if (closed) return;
      loading.classList.add("hidden");
      overlay.classList.add("hidden");
      menu.classList.add("hidden");
      media.pause();
      U.clear(errorView);
      var actions = el("div.actions");
      if (mode === "direct" && plan && plan.canConvert && !triedConvert) {
        actions.appendChild(btn("Try with audio conversion", function () {
          triedConvert = true; errorView.classList.add("hidden"); load("convert", pos(), audioIdx); App.refocus(btnPlay);
        }, "convert", "primary"));
      }
      actions.appendChild(btn("Other streams", otherStreams, "back", actions.firstChild ? "" : "primary"));
      actions.appendChild(btn("Retry", function () { start(pos() || undefined, { mode: mode, audio: audioIdx }); }, "retry"));
      errorView.appendChild(el("div.ecard", {}, [Icons.svg("alert", "ealert"),
        el("h1", { text: "This stream can’t play" }), el("p", { text: message }), actions]));
      errorView.classList.remove("hidden");
      App.refocus(actions.firstChild);
    }

    media.addEventListener("error", function () {
      if (!media.getAttribute("src") || mode !== "direct") return;
      var code = media.error && media.error.code;
      var v = plan && plan.video;
      if (code === 3 || code === 4) {
        fail(v && plan.videoUnsupported
          ? "This TV can't decode " + v.codec.toUpperCase() + " video. Pick another stream (H.264 or HEVC/x265 versions work)."
          : "The TV couldn't decode this file. Another stream of the same title will usually work.");
      } else fail("The stream stopped responding (network error " + code + ").");
    });
    media.addEventListener("playing", function () {
      if (!playingSeen) {
        playingSeen = true;
        setTimeout(settleTvSubs, 2000);
      }
      if (resumeNotice) {
        restartUntil = Date.now() + 10000;
        App.toast("Resuming at " + U.clock(resumeNotice) + " — press rewind to start over", 6000);
        resumeNotice = 0;
      }
      reveal();
      buffering.classList.add("hidden");
      setCtl(btnPlay, "pause", "Pause");
    });
    media.addEventListener("waiting", function () { if (loading.classList.contains("hidden")) buffering.classList.remove("hidden"); });
    media.addEventListener("pause", function () { setCtl(btnPlay, "play", "Play"); showOverlay(); saveProgress(true); });
    media.addEventListener("play", function () { setCtl(btnPlay, "pause", "Pause"); bumpHide(); });
    media.addEventListener("ended", function () {
      saveProgress(true);
      if (nextVideo) playNext(); else App.pop();
    });

    // ---- overlay ----
    function showInfo() {
      if (!plan) return;
      var a = plan.audio[audioIdx];
      var parts = [resolution(plan.video), plan.video ? plan.video.codec.toUpperCase() : "",
        a ? (U.langName(a.lang) || "Audio") + " " + a.codec.toUpperCase() + (a.channels ? " " + channels(a.channels) : "") : ""];
      U.clear(chips);
      if (mode === "convert") chips.appendChild(el("span.pchip.accent", {}, [Icons.svg("convert"), el("span", { text: "Audio converted" })]));
      parts.filter(Boolean).forEach(function (t) { chips.appendChild(el("span.pchip", { text: t })); });
    }

    function overlayOpen() { return !overlay.classList.contains("hidden"); }
    function setPos(f) {
      var pct = Math.max(0, Math.min(1, f)) * 100 + "%";
      barPlay.style.width = pct;
      knob.style.left = pct;
    }
    function menuOpen() { return !menu.classList.contains("hidden"); }

    function showOverlay(focusEl) {
      if (menuOpen()) return;   // the side menu owns focus; the overlay is already up
      var wasOpen = overlayOpen();
      overlay.classList.remove("hidden");
      subs.raise(true);
      if (!wasOpen || focusEl) App.refocus(focusEl || btnPlay);
      bumpHide();
    }
    function hideOverlay() {
      if (media.paused || menuOpen()) return;
      overlay.classList.add("hidden");
      subs.raise(false);
    }
    function bumpHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideOverlay, 4000); }

    function togglePause() {
      if (media.paused) media.play(); else media.pause();
    }

    function tick() {
      var t = media.currentTime || 0, d = media.duration;
      if (pendingSeek === null) {
        timeNow.textContent = U.clock(t);
        setPos(isFinite(d) && d ? t / d : 0);
      }
      if (overlayOpen()) {
        var now = new Date();
        clockEl.textContent = hhmm(now);
        if (isFinite(d) && d) {
          timeLeft.textContent = "−" + U.clock(d - (pendingSeek === null ? t : pendingSeek));
          endsEl.textContent = "Ends at " + hhmm(new Date(now.getTime() + (d - t) * 1000 / (media.playbackRate || 1)));
        }
      }
      var b = media.buffered, end = 0;
      for (var i = 0; i < b.length; i++) if (b.start(i) <= t + 1 && b.end(i) > end) end = b.end(i);
      barBuf.style.width = (isFinite(d) && d ? end / d * 100 : 0) + "%";
      if (mode === "convert") syncHlsCues();
      subs.update(t);
      var nearEnd = nextVideo && !nextDismissed && isFinite(d) && d > 300 && d - t < 30;
      if (nearEnd && !media.paused && !menuOpen()) showNextCard();
      else if (nextCountdown !== null && !goingNext && (!nearEnd || media.paused)) hideNextCard();
    }

    // ---- seeking ----
    // keepFocus: called from a skip button, which keeps focus (otherwise focus
    // moves to the timeline so more arrows keep seeking).
    function seekBy(delta, keepFocus) {
      var d = media.duration;
      if (!isFinite(d)) return;
      var base = pendingSeek === null ? media.currentTime : pendingSeek;
      pendingSeek = Math.max(0, Math.min(d - 2, base + delta));
      timeNow.textContent = U.clock(pendingSeek);
      setPos(pendingSeek / d);
      bubble.textContent = (delta > 0 ? "+" : "−") + Math.abs(Math.round(pendingSeek - media.currentTime)) + " s";
      bubble.style.left = (pendingSeek / d * 100) + "%";
      bubble.classList.remove("hidden");
      seekbar.classList.add("seeking");
      showOverlay(keepFocus ? null : seekbar);
      clearTimeout(seekTimer);
      seekTimer = setTimeout(commitSeek, 700);
    }
    function commitSeek() {
      if (pendingSeek === null) return;
      media.currentTime = pendingSeek;
      pendingSeek = null;
      bubble.classList.add("hidden");
      seekbar.classList.remove("seeking");
      seekSteps = 0;
      seekLandedAt = Date.now();
    }
    // OK right after seeking means "play from here": jump now if the seek is
    // still pending, and play (never pause). Returns false if there was no
    // recent seek, so OK falls back to play/pause.
    function confirmSeek() {
      if (pendingSeek === null && Date.now() - seekLandedAt > 2000) return false;
      clearTimeout(seekTimer);
      commitSeek();
      seekLandedAt = 0;
      if (media.paused) media.play();
      return true;
    }
    function arrowSeek(dir) {
      var now = Date.now();
      seekSteps = now - lastSeekKey < 1500 ? seekSteps + 1 : 0;
      lastSeekKey = now;
      var step = [10, 10, 30, 60][Math.min(seekSteps, 3)];
      seekBy(dir * step);
    }

    // ---- audio and subtitles ----
    function selectAudio(i) {
      var a = plan.audio[i];
      if (!a) return;
      if (mode === "convert") { audioIdx = i; if (hls) hls.audioTrack = i; }
      else if (a.native) { audioIdx = i; if (mediaId) Luna.media("selectTrack", { type: "audio", mediaId: mediaId, index: i }); }
      else if (plan.canConvert) { load("convert", pos(), i); App.toast("Converting " + a.codec.toUpperCase() + " audio for this TV…"); }
      else { App.toast("This TV can't play " + a.codec.toUpperCase() + " audio for this video."); return; }
      showInfo();
    }

    // Text subtitle tracks inside the file. In direct play LG's media service
    // counts only text tracks, the same indexing Stremio's webOS player uses.
    function embeddedSubs() {
      if (!plan) return [];
      if (mode === "convert") {
        return (hls ? hls.subtitleTracks : []).map(function (t, i) { return { index: i, lang: t.lang, title: t.name }; });
      }
      return plan.subs.filter(function (t) { return t.text; }).map(function (t, i) { return { index: i, lang: t.lang, title: t.title }; });
    }

    function applySubs() {
      subs.clear();
      hlsTrackCount = -1;
      if (mode === "convert" && hls) hls.subtitleTrack = subSel.kind === "embedded" ? subSel.index : -1;
      if (mode === "direct" && mediaId) {
        if (subSel.kind === "embedded") {
          var want = subSel, forId = mediaId;
          Luna.media("setSubtitleEnable", { mediaId: mediaId, enable: true }).then(function () {
            setTimeout(function () {
              if (subSel !== want || mediaId !== forId) return;   // changed meanwhile
              Luna.media("selectTrack", { type: "text", mediaId: mediaId, index: subSel.index });
              Luna.media("setSubtitleFontSize", { mediaId: mediaId, fontSize: Math.min(3, subSize) });
              tvSubStyle();
              tvSubSync();
            }, 500);
          });
        } else Luna.media("setSubtitleEnable", { mediaId: mediaId, enable: false });
      }
      if (subSel.kind === "addon") {
        var url = subSel.url;
        Engine.subtitleVtt(url).then(function (vtt) {
          if (subSel.kind === "addon" && subSel.url === url) subs.setCues(Subtitles.parse(vtt));
        }, function () { if (subSel.url === url) App.toast("Couldn't load those subtitles."); });
      }
    }

    // hls.js puts converted embedded subtitles into a hidden text track; copy
    // its cues into our renderer as they arrive.
    function syncHlsCues() {
      if (subSel.kind !== "embedded" || !hls) return;
      var track = null;
      for (var i = 0; i < media.textTracks.length; i++) {
        var t = media.textTracks[i];
        if (t.mode !== "disabled") { if (t.mode === "showing") t.mode = "hidden"; track = t; }
      }
      if (!track || !track.cues || track.cues.length === hlsTrackCount) return;
      hlsTrackCount = track.cues.length;
      var list = [];
      for (var k = 0; k < track.cues.length; k++) {
        var c = track.cues[k];
        var text = Subtitles.clean(c.text);
        if (text) list.push({ start: c.startTime, end: c.endTime, text: text });
      }
      list.sort(function (a, b) { return a.start - b.start; });
      subs.setCues(list);
    }

    function loadAddonSubs() {
      Engine.opensubHash(info.url).then(function (h) {
        return Addons.subtitles(meta.type, video.id, { videoHash: h && h.hash, videoSize: (h && h.size) || info.size, filename: info.filename });
      }).then(function (list) {
        addonSubs = list;
        addonSubsLoaded = true;
        autoSubs();
        if (menuOpen() && menuOpener === btnSubs) openMenu("subs");   // replace "Looking for subtitles…"
      }, function () { addonSubsLoaded = true; autoSubs(); });
    }

    var autoDone = false;
    function autoSubs() {
      var want = U.load("prefSubLang", "");
      if (autoDone || !want) return;
      autoDone = true;
      var emb = embeddedSubs().filter(function (t) { return U.sameLang(t.lang, want); })[0];
      if (emb) subSel = { kind: "embedded", index: emb.index };
      else {
        var ext = addonSubs.filter(function (t) { return U.sameLang(t.lang, want); })[0];
        if (ext) subSel = { kind: "addon", url: ext.url, id: ext.id };
      }
      if (subSel.kind !== "off") applySubs();
    }

    // ---- menus ----
    function openMenu(kind) {
      var toggleRow = null;
      menuOpener = kind === "audio" ? btnAudio : btnSubs;
      U.clear(menu);
      menu.appendChild(el("div.mhead", {}, [Icons.svg(kind === "audio" ? "audio" : "subtitles"), el("h2", { text: kind === "audio" ? "Audio" : "Subtitles" })]));
      var list = el("div.mlist.vscroll");
      menu.appendChild(list);
      var focusRow = null;
      function item(label, sub, selected, fn) {
        var r = el("div.mrow.focusable" + (selected ? ".selected" : ""), {}, [
          el("div.mtext", {}, [el("div.mlabel", { text: label }), sub ? el("div.msub", { text: sub }) : null]),
          selected ? Icons.svg("check", "mcheck") : null]);
        r.onactivate = fn;
        list.appendChild(r);
        if (selected || !focusRow) focusRow = selected ? r : focusRow || r;
        return r;
      }
      if (kind === "audio") {
        if (!plan || !plan.audio.length) list.appendChild(el("div.msub", { text: "No audio information for this file." }));
        (plan ? plan.audio : []).forEach(function (a, i) {
          var ch = a.channels ? channels(a.channels) : "";
          var name = U.langName(a.lang) || "Track " + (i + 1);
          item(name, [a.title && a.title.toLowerCase() !== name.toLowerCase() ? a.title : "", a.codec.toUpperCase() + " " + ch,
            a.native ? "" : plan.canConvert ? "converted" : "not supported", a.guessed ? "from the file name" : ""].filter(Boolean).join(" · "),
            i === audioIdx, function () { selectAudio(i); closeMenu(); });
        });
      } else {
        // Only the languages picked in Settings > Subtitle languages; the
        // rest sit behind "Other languages" and, once opened, are listed
        // after them. Untagged tracks and the track in use always show.
        var entries = [];
        var add = function (label, desc, lang, selected, fn) {
          var other = !!lang && lang !== "und" && !U.wantSubLang(lang) && !selected;
          entries.push({ label: label, desc: desc, selected: selected, fn: fn, other: other });
        };
        item("Off", "", subSel.kind === "off", function () { subSel = { kind: "off" }; applySubs(); closeMenu(); });
        embeddedSubs().forEach(function (t) {
          add(U.langName(t.lang) || "Track " + (t.index + 1), "In the file" + (t.title ? " · " + t.title : ""), t.lang,
            subSel.kind === "embedded" && subSel.index === t.index,
            function () { subSel = { kind: "embedded", index: t.index }; applySubs(); closeMenu(); });
        });
        var byLang = {};
        addonSubs.forEach(function (t) { var k = U.langName(t.lang) || "Other"; (byLang[k] = byLang[k] || []).push(t); });
        Object.keys(byLang).sort().forEach(function (lang) {
          byLang[lang].slice(0, 6).forEach(function (t, n) {
            add(lang + (n ? " " + (n + 1) : ""), t.addon, t.lang, subSel.kind === "addon" && subSel.url === t.url,
              function () { subSel = { kind: "addon", url: t.url, id: t.id }; applySubs(); closeMenu(); });
          });
        });
        var mine = entries.filter(function (e) { return !e.other; });
        var others = entries.filter(function (e) { return e.other; });
        mine.forEach(function (e) { item(e.label, e.desc, e.selected, e.fn); });
        if (!addonSubsLoaded) list.appendChild(el("div.mnote", {}, [el("div.spinner"), el("span", { text: "Looking for subtitles…" })]));
        else if (!entries.length) list.appendChild(el("div.mnote", { text: "No subtitles found for this video." }));
        else if (!mine.length) list.appendChild(el("div.mnote", { text: "No " + U.subLangs().map(U.langName).join(" or ") + " subtitles for this video." }));
        // Show/hide the other languages in place; focus stays on this row.
        if (others.length) {
          toggleRow = el("div.mrow.mtoggle.focusable", {}, [
            el("div.mtext", {}, [el("div.mlabel", { text: (subsShowAll ? "Hide" : "Show") + " other languages" }),
              el("div.msub", { text: others.length + (others.length === 1 ? " track" : " tracks") })]),
            Icons.svg(subsShowAll ? "chevronUp" : "chevronDown", "mchev")]);
          toggleRow.onactivate = function () { subsShowAll = !subsShowAll; focusToggle = true; openMenu("subs"); };
          list.appendChild(toggleRow);
          if (subsShowAll) others.forEach(function (e) { item(e.label, e.desc, e.selected, e.fn); });
        }
        var size = stepper("Size", SIZE_NAMES[subSize], function (d) {
          subSize = (subSize + d + SIZES.length) % SIZES.length;
          U.save("subSize", SIZES[subSize]);
          subs.setSize(SIZES[subSize]);
          if (mode === "direct" && mediaId) Luna.media("setSubtitleFontSize", { mediaId: mediaId, fontSize: Math.min(3, subSize) });
          return SIZE_NAMES[subSize];
        });
        var delay = stepper("Delay", delayText(), function (d) {
          subDelay = Math.round((subDelay + d * 0.25) * 100) / 100;
          subs.setDelay(subDelay);
          tvSubSync();
          if (subDelay < -2 && mode === "direct" && subSel.kind === "embedded" && d < 0) {
            App.toast("The TV can show subtitles from the file at most about 2 s early.");
          }
          return delayText();
        });
        var bgRow = stepper("Background", SUB_BGS[subBg].name, function (d) {
          subBg = (subBg + d + SUB_BGS.length) % SUB_BGS.length;
          U.save("subBg", SUB_BGS[subBg].id);
          applySubStyle();
          return SUB_BGS[subBg].name;
        });
        var colorRow = stepper("Color", SUB_COLORS[subColor].name, function (d) {
          subColor = (subColor + d + SUB_COLORS.length) % SUB_COLORS.length;
          U.save("subColor", SUB_COLORS[subColor].id);
          applySubStyle();
          return SUB_COLORS[subColor].name;
        });
        list.appendChild(el("div.mdivider"));
        list.appendChild(size);
        list.appendChild(bgRow);
        list.appendChild(colorRow);
        list.appendChild(delay);
      }
      menu.classList.remove("hidden");
      clearTimeout(hideTimer);
      App.refocus(focusToggle && toggleRow || focusRow);
      focusToggle = false;
    }

    // Apply the background and colour to both renderers: ours (addon and
    // converted subtitles) and the TV's (embedded tracks in direct play).
    function applySubStyle() {
      subs.setStyle(SUB_BGS[subBg].id, SUB_COLORS[subColor].id);
      tvSubStyle();
    }
    // Delay for subtitles the TV draws itself (embedded tracks in direct
    // play). setSubtitleSync takes milliseconds; positive shows them earlier,
    // ours is the opposite. Measured on this TV: later works for any amount,
    // earlier only up to ~2 s (the TV reads subtitles just ahead of the video).
    function tvSubSync() {
      if (mode !== "direct" || !mediaId || subSel.kind !== "embedded") return;
      Luna.media("setSubtitleSync", { mediaId: mediaId, sync: -Math.round(subDelay * 1000) });
    }
    function tvSubStyle() {
      if (mode !== "direct" || !mediaId) return;
      Luna.media("setSubtitleCharacterColor", { mediaId: mediaId, charColor: SUB_COLORS[subColor].id });
      Luna.media("setSubtitleBackgroundColor", { mediaId: mediaId, bgColor: "black" });
      Luna.media("setSubtitleBackgroundOpacity", { mediaId: mediaId, bgOpacity: SUB_BGS[subBg].luna });
    }

    // A row whose value changes with left/right (OK steps forward).
    function stepper(label, value, change) {
      var val = el("span.svalue", { text: value });
      var r = el("div.mrow.stepper.focusable", {}, [el("div.mlabel", { text: label }),
        el("div.sctl", {}, [Icons.svg("chevronLeft"), val, Icons.svg("chevronRight")])]);
      r.step = function (d) { val.textContent = change(d); };
      r.onactivate = function () { r.step(1); };
      return r;
    }
    function delayText() { return (subDelay > 0 ? "+" : subDelay < 0 ? "−" : "") + Math.abs(subDelay).toFixed(2) + " s"; }

    // Focus goes back to the button that opened the menu.
    function closeMenu() {
      if (!menuOpen()) return;
      menu.classList.add("hidden");
      showOverlay(menuOpener || btnPlay);
    }

    // ---- next episode ----
    function showNextCard() {
      if (nextCountdown !== null) return;
      var n = 10;
      U.clear(nextCard);
      var label = el("div.ncount");
      var bar = el("div.nbar", {}, el("div"));
      var go = btn("Play now", playNext, "play", "primary");
      var thumb = el("div.nthumb", { style: nextVideo.thumbnail ? { backgroundImage: "url(\"" + nextVideo.thumbnail + "\")" } : {} });
      nextCard.appendChild(thumb);
      nextCard.appendChild(el("div.nbody", {}, [
        el("div.nlabel", { text: "E" + nextVideo.episode + (nextVideo.title ? "  ·  " + nextVideo.title : "") }),
        label, bar, el("div.actions", {}, [go, btn("Dismiss", dismissNext)])]));
      nextCard.classList.remove("hidden");
      App.refocus(go);
      label.textContent = "Next episode in " + n + " s";
      // Drain the bar over the countdown (transform only, no layout work).
      setTimeout(function () { bar.firstChild.style.transform = "scaleX(0)"; }, 50);
      nextCountdown = setInterval(function () {
        n--;
        label.textContent = "Next episode in " + n + " s";
        if (n <= 0) { clearInterval(nextCountdown); playNext(); }
      }, 1000);
    }
    function dismissNext() {
      nextDismissed = true;
      hideNextCard();
    }
    // Hide the card and cancel the countdown or a next episode being loaded.
    // Without dismissing, it can show again (e.g. after pausing).
    function hideNextCard() {
      clearInterval(nextCountdown);
      nextCountdown = null;
      if (goingNext) { goingNext = false; nextToken++; }
      nextCard.classList.add("hidden");
      App.refocus(btnPlay);
    }

    // Binge watching: reuse a stream from the same release group if the
    // addon marks one (behaviorHints.bingeGroup), like the official apps.
    var goingNext = false, nextToken = 0;
    function playNext() {
      if (goingNext || !nextVideo) return;
      goingNext = true;
      var token = ++nextToken;
      clearInterval(nextCountdown);
      saveProgress(true);
      media.pause();
      var group = stream.behaviorHints && stream.behaviorHints.bingeGroup;
      var found = null;
      var wait = group ? Addons.streams(meta.type, nextVideo.id, function (addon, list) {
        if (!found) found = list.filter(function (x) { return x.behaviorHints && x.behaviorHints.bingeGroup === group; })[0] || null;
      }) : Promise.resolve();
      App.toast("Loading the next episode…");
      wait.then(function () {
        // Cancelled (Dismiss/Back) or the player was closed meanwhile.
        if (closed || token !== nextToken || App.top() !== s) return;
        var next = nextVideo;
        App.pop();
        // Drop the previous episode's stream list so the stack doesn't grow
        // and "Other streams" belongs to the episode being watched.
        var under = App.top();
        if (under && under.streamsFor && under.streamsFor !== next.id) App.pop();
        App.push(Screens.streams(meta, next));
        if (found) { U.setLastStream(next.id, found); open({ meta: meta, video: next, stream: found }); }
        else App.toast("Pick a stream for the next episode");
      }, function () {
        if (token === nextToken) { goingNext = false; App.toast("Couldn't load the next episode."); }
      });
    }

    // Back to this video's stream list: the screen underneath when we came
    // from it, otherwise (Resume, next episode) a fresh one.
    function otherStreams() {
      App.pop();
      var t = App.top();
      if (!(t && t.streamsFor === video.id)) App.push(Screens.streams(meta, video));
    }

    // ---- progress ----
    function saveProgress(push) {
      var d = media.duration, t = media.currentTime;
      if (!isFinite(d) || d < 60 || !t) return;
      Account.progress(item, video.id, t * 1000, d * 1000);
      var now = Date.now();
      if (push || now - lastPush > 60000) { lastPush = now; Account.put(item, true); }
      else Account.put(item, false);
    }

    // ---- keys ----
    s.key = function (code) {
      if (code !== KEY.BACK) bumpHide();
      if (!errorView.classList.contains("hidden")) return false;   // Nav handles its buttons; Back closes the player
      // Loading: nothing to press (focus may sit on a hidden button). Back closes.
      if (!loading.classList.contains("hidden")) return code !== KEY.BACK;
      if (code === KEY.PLAY) { media.play(); return true; }
      if (code === KEY.PAUSE) { media.pause(); return true; }
      if (code === KEY.PLAYPAUSE) { togglePause(); return true; }
      if (code === KEY.STOP) { App.pop(); return true; }
      if (code === KEY.FF) { seekBy(30); return true; }
      if (code === KEY.RW) {
        if (Date.now() < restartUntil) { restartUntil = 0; media.currentTime = 0; App.toast("Starting from the beginning"); return true; }
        seekBy(-30); return true;
      }
      if (!nextCard.classList.contains("hidden")) {
        if (code === KEY.BACK) { dismissNext(); return true; }
        return false;
      }
      if (menuOpen()) {
        var c = Nav.current();
        if (code === KEY.BACK) { closeMenu(); return true; }
        if (c && c.step && (code === KEY.LEFT || code === KEY.RIGHT)) { c.step(code === KEY.LEFT ? -1 : 1); return true; }
        // The menu sits on the right edge: Left leaves it, Right has nowhere to go.
        if (code === KEY.LEFT) { closeMenu(); return true; }
        if (code === KEY.RIGHT) return true;
        return false;
      }
      if (!overlayOpen()) {
        if (code === KEY.OK) { togglePause(); showOverlay(); return true; }
        if (code === KEY.LEFT || code === KEY.RIGHT) { arrowSeek(code === KEY.LEFT ? -1 : 1); return true; }
        if (code === KEY.UP || code === KEY.DOWN) { showOverlay(); return true; }
        return false;   // Back: leave the player
      }
      if (code === KEY.BACK) { if (media.paused) return false; overlay.classList.add("hidden"); subs.raise(false); return true; }
      if (Nav.current() === seekbar && (code === KEY.LEFT || code === KEY.RIGHT)) { arrowSeek(code === KEY.LEFT ? -1 : 1); return true; }
      if (Nav.current() === seekbar && code === KEY.OK) { if (!confirmSeek()) togglePause(); return true; }
      // Nothing sits above the timeline, so Up there hides the controls.
      if (Nav.current() === seekbar && code === KEY.UP) { clearTimeout(hideTimer); overlay.classList.add("hidden"); subs.raise(false); return true; }
      return false;
    };

    root.addEventListener("mousemove", function () {
      if (!loading.classList.contains("hidden") || !errorView.classList.contains("hidden")) return;
      if (menuOpen() || !nextCard.classList.contains("hidden")) return;
      if (overlayOpen()) bumpHide(); else showOverlay();
    });

    s.initialFocus = function () { return null; };
    // Which part of the player owns focus: an open card or menu keeps arrows,
    // hover and clicks to itself until it closes (see Nav).
    s.focusScope = function () {
      if (!errorView.classList.contains("hidden")) return errorView;
      if (menuOpen()) return menu;
      if (!nextCard.classList.contains("hidden")) return nextCard;
      return null;
    };
    // Pointer click outside the open menu or next-episode card closes it.
    s.dismissScope = function () {
      if (menuOpen()) closeMenu();
      else if (!nextCard.classList.contains("hidden")) dismissNext();
    };
    s.visibility = function (visible) { if (!visible) { media.pause(); saveProgress(true); } };
    s.destroy = function () {
      closed = true;
      saveProgress(true);
      if (isFinite(media.duration) && media.duration >= 60 && item.state.video_id === video.id) {
        Account.finish(item, nextVideo ? nextVideo.id : null);
        Account.put(item, true);
      }
      clearInterval(statsTimer); clearInterval(nextCountdown); clearTimeout(hideTimer); clearTimeout(seekTimer);
      timers.forEach(clearInterval);
      media.pause();
      teardown();
      subs.clear();
    };

    timers.push(setInterval(tick, 250));
    // Subtitles get their own faster clock so lines appear and clear on time
    // (the 250 ms tick could leave them up to a quarter second late).
    timers.push(setInterval(function () { if (subs.hasCues()) subs.update(media.currentTime || 0); }, 80));
    timers.push(setInterval(function () { if (!media.paused) saveProgress(false); }, 5000));
    start();
    return s;
  }

  return { open: open };
})();
