// node tests/subtitles.test.js — checks the VTT parser and cue lookup.
const S = require("../app/js/subtitles.js");
const vtt = `WEBVTT

NOTE this is a comment
with two lines

STYLE
::cue { color: red }

1
00:00:01.000 --> 00:00:04.000
<i>Hello</i> there

00:00:03.500 --> 00:00:06.000 line:90%
Line one
Line two

01:02:03.250 --> 01:02:05.000
Late &amp; long`;
const cues = S.parse(vtt);
const assert = require("assert");
assert.strictEqual(cues.length, 3);
assert.deepStrictEqual(cues[0], { start: 1, end: 4, text: "Hello there" });
assert.strictEqual(cues[1].text, "Line one\nLine two");
assert.strictEqual(cues[2].start, 3723.25);
assert.strictEqual(cues[2].text, "Late & long");

// Text cleanup: tags, ASS overrides and line breaks, entities, blank lines.
assert.strictEqual(S.clean("{\\an8}<b>Hi</b>\\Nthere"), "Hi\nthere");
assert.strictEqual(S.clean("  \n<i> </i>\nTom &quot;Jr&quot; &#39;s  \n\n"), "Tom \"Jr\" 's");
assert.strictEqual(S.clean("<i></i>"), "");
const blank = S.parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<i> </i>\n\n00:00:03.000 --> 00:00:04.000\nReal");
assert.deepStrictEqual(blank.map(c => c.text), ["Real"]);

// Renderer, on a minimal fake DOM: between cues nothing is drawn (no empty
// span that would show as a background box); repeated lines show once.
function fakeEl(tag) {
  const classes = new Set();
  return { tag, children: [], style: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    set className(v) { classes.clear(); v.split(" ").forEach(c => classes.add(c)); },
    set textContent(v) { this.children = []; this.text = v; },
    get textContent() { return this.text || this.children.map(c => c.textContent || "").join(""); },
    appendChild(c) { this.children.push(c); return c; } };
}
global.document = { createElement: fakeEl };
const layer = fakeEl("div");
const r = S.createRenderer(layer);
const box = layer.children[0];
r.setCues([{ start: 1, end: 2, text: "One" }, { start: 1.5, end: 2, text: "One" }, { start: 5, end: 6, text: "Two\nlines" }]);
r.update(0.5);
assert.ok(box.classList.contains("empty") && box.children.length === 0, "nothing drawn before the first cue");
r.update(1.7);
assert.strictEqual(box.children.filter(c => c.tag === "span").length, 1, "duplicate line shown once");
assert.ok(!box.classList.contains("empty"));
r.update(3);
assert.ok(box.classList.contains("empty") && box.children.length === 0, "nothing drawn in a gap");
r.update(5.5);
assert.strictEqual(box.children.filter(c => c.tag === "span").length, 2);

console.log("subtitles ok");
