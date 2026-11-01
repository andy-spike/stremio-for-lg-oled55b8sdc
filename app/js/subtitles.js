// WebVTT parsing and an on-screen subtitle renderer. Used for addon
// subtitles (converted to VTT by the streaming server) and for embedded
// subtitles when the audio is being converted (hls.js delivers them as cues).
// Embedded subtitles in direct play are drawn by the TV itself instead.

var Subtitles = (function () {
  function time(t) {
    var p = t.trim().replace(",", ".").split(":");
    var s = 0;
    for (var i = 0; i < p.length; i++) s = s * 60 + parseFloat(p[i]);
    return s;
  }

  function clean(text) {
    return text.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  }

  // VTT text -> [{ start, end, text }] sorted by start (seconds).
  function parse(vtt) {
    var cues = [];
    String(vtt || "").replace(/\r/g, "").split(/\n{2,}/).forEach(function (block) {
      var lines = block.split("\n");
      var i = 0;
      while (i < lines.length && lines[i].indexOf("-->") < 0) i++;
      if (i >= lines.length) return;   // header, NOTE, STYLE or junk
      var m = /([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[i]);
      if (!m) return;
      var text = clean(lines.slice(i + 1).join("\n")).trim();
      if (text) cues.push({ start: time(m[1]), end: time(m[2]), text: text });
    });
    cues.sort(function (a, b) { return a.start - b.start; });
    return cues;
  }

  function createRenderer(container) {
    var box = document.createElement("div");
    box.className = "subs";
    container.appendChild(box);
    var cues = [], delay = 0, shown = "", maxLen = 10;

    function setCues(list) {
      cues = list || [];
      maxLen = cues.reduce(function (m, c) { return Math.max(m, c.end - c.start); }, 10);
      render("");
    }

    function render(text) {
      if (text === shown) return;
      shown = text;
      box.textContent = "";
      text.split("\n").forEach(function (line, i) {
        if (i) box.appendChild(document.createElement("br"));
        var span = document.createElement("span");
        span.textContent = line;
        box.appendChild(span);
      });
    }

    // Binary search for the last cue starting before t, then look back far
    // enough to catch long overlapping cues.
    function update(now) {
      var t = now - delay;
      var lo = 0, hi = cues.length - 1, idx = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      var out = [];
      for (var i = idx; i >= 0 && cues[i].start >= t - maxLen; i--) {
        if (cues[i].end > t) out.unshift(cues[i].text);
      }
      render(out.join("\n"));
    }

    return {
      setCues: setCues,
      clear: function () { setCues([]); },
      setDelay: function (s) { delay = s; },
      setSize: function (scale) { box.style.fontSize = (3.2 * scale) + "vw"; },
      // bg: "none" (outlined text) | "translucent" | "solid"; color: "white" | "yellow"
      setStyle: function (bg, color) {
        ["bg-none", "bg-translucent", "bg-solid", "color-white", "color-yellow"].forEach(function (c) { box.classList.remove(c); });
        box.classList.add("bg-" + bg);
        box.classList.add("color-" + color);
      },
      update: update,
      raise: function (on) { box.classList.toggle("raised", !!on); }
    };
  }

  return { parse: parse, createRenderer: createRenderer };
})();

if (typeof module !== "undefined") module.exports = Subtitles;
