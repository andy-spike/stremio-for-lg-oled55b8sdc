// node tools/test-subtitles.js — checks the VTT parser and cue lookup.
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
console.log("subtitles ok", JSON.stringify(cues));
