// Remote-control focus. Any element with class "focusable" inside the active
// screen can take focus; arrow keys move to the nearest one in that
// direction. Scrolling containers (.hscroll rows, .vscroll pages) follow the
// focused element. Focus is a "focus" class, not DOM focus, except for text
// inputs, which need real focus to open the TV keyboard.
//
// A screen can narrow focus to one part of itself with focusScope() (an open
// side menu, a dialog card): arrows, pointer hover and clicks then stay
// inside that element until it closes.

var Nav = (function () {
  var root = null;      // element whose focusables are reachable
  var scopeFn = null;   // returns the element focus is confined to, or null
  var current = null;

  function setRoot(el, preferred, scope) {
    root = el;
    scopeFn = scope || null;
    var start = preferred && area().contains(preferred) ? preferred : first();
    focus(start);
  }

  // The part of the screen that currently owns focus.
  function area() {
    var s = scopeFn && scopeFn();
    return s && root && root.contains(s) ? s : root;
  }
  function contains(el) { return !!(root && el && area().contains(el)); }

  function candidates() {
    if (!root) return [];
    return U.$all(".focusable", area()).filter(function (el) {
      return el.offsetParent !== null && !el.classList.contains("disabled");
    });
  }

  function first() { return candidates()[0] || null; }

  // soft: highlight only. Used for pointer hover, so merely pointing at a
  // text box doesn't open the TV keyboard; OK or a click does.
  function focus(el, soft) {
    if (current) {
      current.classList.remove("focus");
      if (current.tagName === "INPUT" && current !== el) current.blur();
    }
    current = el;
    if (!el) return;
    el.classList.add("focus");
    if (el.tagName === "INPUT" && !soft) el.focus();
    reveal(el);
    if (el.onfocusin2) el.onfocusin2();
  }

  // Scroll every scrolling ancestor so el is visible with some margin.
  function reveal(el) {
    var node = el.parentNode;
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains("hscroll")) {
        var pad = window.innerWidth * 0.06;
        var left = el.offsetLeft - node.offsetLeft;
        var target = node.scrollLeft;
        if (left - pad < node.scrollLeft) target = left - pad;
        else if (left + el.offsetWidth + pad > node.scrollLeft + node.clientWidth) target = left + el.offsetWidth + pad - node.clientWidth;
        node.scrollLeft = Math.max(0, target);
      }
      if (node.classList && node.classList.contains("vscroll")) {
        var r = el.getBoundingClientRect(), box = node.getBoundingClientRect();
        var margin = window.innerHeight * 0.12;
        if (r.top - margin < box.top) node.scrollTop += r.top - margin - box.top;
        else if (r.bottom + margin > box.bottom) node.scrollTop += r.bottom + margin - box.bottom;
      }
      node = node.parentNode;
    }
  }

  // Nearest candidate in a direction, preferring elements that overlap on
  // the other axis (so moving down in a list stays in the column).
  function move(dir) {
    if (!current || !contains(current)) { focus(first()); return true; }
    var a = current.getBoundingClientRect();
    var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bestScore = Infinity, bestInRow = null, bestRowScore = Infinity;
    candidates().forEach(function (el) {
      if (el === current) return;
      var b = el.getBoundingClientRect();
      var bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var main, cross, overlap;
      if (dir === "left") { main = a.left - b.right; cross = Math.abs(ay - by); overlap = b.bottom > a.top && b.top < a.bottom; if (bx >= ax) return; }
      else if (dir === "right") { main = b.left - a.right; cross = Math.abs(ay - by); overlap = b.bottom > a.top && b.top < a.bottom; if (bx <= ax) return; }
      else if (dir === "up") { main = a.top - b.bottom; cross = Math.abs(ax - bx); overlap = b.right > a.left && b.left < a.right; if (by >= ay) return; }
      else { main = b.top - a.bottom; cross = Math.abs(ax - bx); overlap = b.right > a.left && b.left < a.right; if (by <= ay) return; }
      if (main < -2) main = 0;
      var score = (dir === "up" || dir === "down")
        ? main * 1 + cross * (overlap ? 0.3 : 2)          // vertical: rows first, then nearest column
        : main + cross * (overlap ? 0.5 : 8);            // horizontal: stay in the row
      if (score < bestScore) { bestScore = score; best = el; }
      if (overlap && score < bestRowScore) { bestRowScore = score; bestInRow = el; }
    });
    // Left/right stay in the current row whenever it has something there.
    if ((dir === "left" || dir === "right") && bestInRow) best = bestInRow;
    if (best) { focus(best); return true; }
    return false;
  }

  function activate() {
    if (current && current.tagName === "INPUT" && document.activeElement !== current) { current.focus(); return true; }
    if (current && typeof current.onactivate === "function") { current.onactivate(); return true; }
    if (current && current.tagName !== "INPUT") { current.click(); return true; }
    return false;
  }

  // el itself if it's still inside root; otherwise the element that replaced
  // it after a re-render, matched by its data-key (or null).
  function findSame(root, el) {
    if (!el || !root) return null;
    if (root.contains(el)) return el;
    var key = el.getAttribute && el.getAttribute("data-key");
    if (!key) return null;
    var all = U.$all("[data-key]", root);
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute("data-key") === key) return all[i];
    return null;
  }

  return { setRoot: setRoot, findSame: findSame, focus: focus, move: move, activate: activate, first: first, contains: contains,
    current: function () { return current; }, reveal: reveal };
})();
