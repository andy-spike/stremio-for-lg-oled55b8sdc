// The local Stremio streaming server (http://127.0.0.1:11470): starting it,
// turning addon streams into playable URLs, and deciding how a file plays.
//
// How a file plays on this TV:
//   direct   - the TV's hardware player gets the file as-is. Used when the
//              video codec and the chosen audio track are supported.
//   convert  - the server re-encodes only the audio (to AAC) and serves HLS;
//              video is copied untouched. Used for DTS and other audio this
//              TV can't decode. Played through hls.js (Media Source
//              Extensions), because the TV's own HLS player can't read the
//              fragmented-MP4 HLS the server produces.
// Video is never converted: this CPU is far too slow for that.

var Engine = (function () {
  var SERVER = "http://127.0.0.1:11470";
  var SERVICE = "/media/developer/stremio/bin/stremio-service";

  // What this TV decodes. DTS is added at startup only if the TV reports it
  // (tv.model.edidType), the same check Stremio's webOS player makes.
  var caps = {
    video: ["h264", "hevc", "vp9", "mpeg2video", "mpeg4", "vc1"],
    audio: ["aac", "ac3", "eac3", "mp3", "mp2", "flac", "pcm_s16le", "pcm_s24le"],
    hlsAudio: ["aac", "ac3", "eac3"],   // what the converted HLS may carry
    mseVideo: ["h264", "hevc"]          // what hls.js can feed to the TV
  };

  function detectCaps() {
    return Luna.config(["tv.model.edidType"]).then(function (c) {
      var edid = String(c["tv.model.edidType"] || "").toLowerCase();
      if (edid.indexOf("truehd") >= 0) caps.audio.push("truehd");
      if (edid.indexOf("dts") >= 0) caps.audio.push("dts");
    });
  }

  function alive() {
    return U.request(SERVER + "/settings", { timeout: 2500 }).then(function () { return true; }, function () { return false; });
  }

  // Make sure the server runs; start it through Homebrew Channel if not.
  var starting = null;
  function ensure() {
    if (starting) return starting;
    starting = alive().then(function (ok) {
      if (ok) return true;
      return Luna.rootExec(SERVICE + " start").then(function () {
        var tries = 0;
        return new Promise(function (resolve, reject) {
          (function wait() {
            alive().then(function (up) {
              if (up) resolve(true);
              else if (++tries > 40) reject(new Error(tr("The streaming server did not start")));
              else setTimeout(wait, 500);
            });
          })();
        });
      });
    });
    starting.then(function () { starting = null; }, function () { starting = null; });
    return starting;
  }

  function trackerSources(stream) {
    return (stream.sources || []).filter(function (s) { return /^(tracker|dht):/.test(s); });
  }

  // Addon stream -> { url, infoHash?, fileIdx?, filename? }
  function resolve(stream, seriesInfo) {
    if (stream.infoHash) return createTorrent(stream.infoHash.toLowerCase(), stream.fileIdx, trackerSources(stream), seriesInfo);
    if (stream.url && stream.url.indexOf("magnet:") === 0) {
      var m = /xt=urn:btih:([a-zA-Z0-9]+)/.exec(stream.url);
      if (!m) return Promise.reject(new Error(tr("Unreadable magnet link")));
      var trackers = (stream.url.match(/tr=([^&]+)/g) || []).map(function (t) { return "tracker:" + decodeURIComponent(t.slice(3)); });
      return createTorrent(m[1].toLowerCase(), null, trackers, seriesInfo);
    }
    if (stream.url) {
      var hints = stream.behaviorHints || {};
      var url = hints.proxyHeaders ? proxyUrl(stream.url, hints.proxyHeaders.request || {}, hints.proxyHeaders.response || {}) : stream.url;
      return Promise.resolve({ url: url, filename: hints.filename || null });
    }
    return Promise.reject(new Error(tr("This stream type isn't supported on the TV")));
  }

  // Same request Stremio's own players send (stremio-video createTorrent.js).
  // Without a peerSearch the server uses its built-in public tracker list
  // plus DHT; a peerSearch replaces that list, so only send one when the
  // stream brings its own trackers.
  function createTorrent(infoHash, fileIdx, sources, seriesInfo) {
    var hasIdx = fileIdx !== null && fileIdx !== undefined && isFinite(fileIdx);
    var body = { torrent: { infoHash: infoHash } };
    var all = ["dht:" + infoHash].concat(sources.map(function (s) { return /^(tracker|dht):/.test(s) ? s : "tracker:" + s; }));
    if (sources.some(function (s) { return s.indexOf("dht:") !== 0; })) {
      body.peerSearch = { sources: all.filter(function (s, i) { return all.indexOf(s) === i; }), min: 40, max: 200 };
    }
    if (hasIdx) body.guessFileIdx = false;
    else {
      body.guessFileIdx = {};
      if (seriesInfo && isFinite(seriesInfo.season)) body.guessFileIdx.season = seriesInfo.season;
      if (seriesInfo && isFinite(seriesInfo.episode)) body.guessFileIdx.episode = seriesInfo.episode;
    }
    return U.request(SERVER + "/" + infoHash + "/create", { body: body, timeout: 60000 }).then(function (r) {
      var idx = hasIdx ? fileIdx : r.guessedFileIdx;
      if (idx === undefined || idx === null || idx < 0) {
        // Fall back to the largest file.
        var best = -1, size = -1;
        (r.files || []).forEach(function (f, i) { if (f.length > size) { size = f.length; best = i; } });
        idx = best;
      }
      var file = (r.files || [])[idx];
      return { url: SERVER + "/" + infoHash + "/" + idx, infoHash: infoHash, fileIdx: idx,
        filename: file ? file.name : null, size: file ? file.length : null };
    });
  }

  function proxyUrl(streamUrl, requestHeaders, responseHeaders) {
    var a = document.createElement("a");
    a.href = streamUrl;
    var q = [["d", a.protocol + "//" + a.host]];
    Object.keys(requestHeaders).forEach(function (k) { q.push(["h", k + ":" + requestHeaders[k]]); });
    Object.keys(responseHeaders).forEach(function (k) { q.push(["r", k + ":" + responseHeaders[k]]); });
    var qs = q.map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&");
    return SERVER + "/proxy/" + qs + a.pathname + a.search;
  }

  // ffprobe through the server: container, codecs and tracks.
  function probe(mediaUrl, timeout) {
    return U.request(SERVER + "/hlsv2/probe?mediaURL=" + encodeURIComponent(mediaUrl), { timeout: timeout || 45000 });
  }

  // When the file can't be read in time (a slow torrent), guess its codecs
  // from the file name and stream title ("x265", "DTS-HD MA" ...), so DTS
  // still gets converted. The player reads the file again once it plays.
  function guessProbe(text) {
    var t = String(text || "").toLowerCase();
    function has(re) { return new RegExp("(^|[^a-z0-9])(" + re + ")").test(t); }
    var video = has("av1") ? "av1" : has("vp9") ? "vp9" : has("x265|h\\.?265|hevc") ? "hevc" : "h264";
    var streams = [{ track: "video", codec: video }];
    if (has("dts")) streams.push({ track: "audio", codec: "dts" });
    return { streams: streams, guessed: true };
  }

  // Decide how to play. audioIndex is the wanted audio track (position among
  // audio streams) or -1 for "pick by preference".
  function plan(info, audioLang) {
    var streams = info.probe ? info.probe.streams : [];
    var guessed = !!(info.probe && info.probe.guessed);
    var video = streams.filter(function (s) { return s.track === "video"; })[0];
    var audio = streams.filter(function (s) { return s.track === "audio"; });
    var subs = streams.filter(function (s) { return s.track === "subtitle"; });
    var audioIdx = 0;
    if (audioLang) {
      var byLang = -1;
      audio.forEach(function (a, i) { if (byLang < 0 && U.sameLang(a.language, audioLang)) byLang = i; });
      if (byLang >= 0) audioIdx = byLang;
    }
    var chosen = audio[audioIdx];
    var audioOk = !chosen || caps.audio.indexOf(chosen.codec) >= 0;
    var canConvert = !!video && caps.mseVideo.indexOf(video.codec) >= 0;
    return {
      mode: !audioOk && canConvert ? "convert" : "direct",
      video: video || null,
      audio: audio.map(function (a, i) {
        return { index: i, codec: a.codec, lang: a.language, title: a.title, channels: a.channels,
          native: caps.audio.indexOf(a.codec) >= 0, guessed: guessed };
      }),
      audioIdx: audioIdx,
      subs: subs.map(function (s, i) { return { index: i, codec: s.codec, lang: s.language, title: s.title,
        text: ["subrip", "ass", "ssa", "webvtt", "mov_text", "text"].indexOf(s.codec) >= 0 }; }),
      canConvert: canConvert,
      guessed: guessed,
      videoUnsupported: !!video && caps.video.indexOf(video.codec) < 0
    };
  }

  var hlsCounter = 0;
  function hlsUrl(mediaUrl) {
    var id = "tv" + Date.now().toString(36) + (hlsCounter++);
    var q = "mediaURL=" + encodeURIComponent(mediaUrl) +
      caps.mseVideo.map(function (c) { return "&videoCodecs=" + c; }).join("") +
      caps.hlsAudio.map(function (c) { return "&audioCodecs=" + c; }).join("") + "&maxAudioChannels=6";
    return { id: id, url: SERVER + "/hlsv2/" + id + "/master.m3u8?" + q };
  }

  // Stops the server's ffmpeg work for a converted stream.
  function hlsDestroy(id) {
    if (id) U.request(SERVER + "/hlsv2/" + id + "/destroy", { timeout: 5000, text: true }).catch(function () {});
  }

  // OpenSubtitles needs the file's hash and size to find matching subtitles.
  function opensubHash(mediaUrl) {
    return U.request(SERVER + "/opensubHash?videoUrl=" + encodeURIComponent(mediaUrl), { timeout: 30000 })
      .then(function (r) { return r && r.result ? r.result : null; }, function () { return null; });
  }

  // Any subtitle file (SRT, VTT; any text encoding) -> WebVTT text.
  function subtitleVtt(url) {
    return U.request(SERVER + "/subtitles.vtt?from=" + encodeURIComponent(url), { timeout: 30000, text: true });
  }

  function stats(infoHash, fileIdx) {
    var path = "/" + infoHash + (fileIdx === undefined || fileIdx === null ? "" : "/" + fileIdx);
    return U.request(SERVER + path + "/stats.json", { timeout: 4000 }).catch(function () { return null; });
  }

  return { caps: caps, detectCaps: detectCaps, ensure: ensure, alive: alive, resolve: resolve, probe: probe, guessProbe: guessProbe,
    plan: plan, hlsUrl: hlsUrl, hlsDestroy: hlsDestroy, opensubHash: opensubHash, subtitleVtt: subtitleVtt, stats: stats };
})();
