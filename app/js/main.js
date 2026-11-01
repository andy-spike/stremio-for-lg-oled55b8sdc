// App shell: a stack of screens, remote-control keys, and startup.
//
// A screen is { el, show(), hide(), key(code) -> handled, destroy() }. The
// top screen is visible and owns focus; Back closes it.

var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27, BACKSPACE: 8,
  PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, CH_UP: 33, CH_DOWN: 34 };

var App = (function () {
  var stack = [];
  var host = null;
  var toastTimer = null;

  function top() { return stack[stack.length - 1] || null; }

  function push(screen) {
    var prev = top();
    if (prev) { prev.focusMemo = Nav.current(); if (prev.hide) prev.hide(); prev.el.style.display = "none"; }
    stack.push(screen);
    host.appendChild(screen.el);
    if (screen.show) screen.show();
    Nav.setRoot(screen.el, screen.initialFocus ? screen.initialFocus() : null, screen.focusScope);
  }

  function pop() {
    if (stack.length <= 1) return false;
    var s = stack.pop();
    if (s.destroy) s.destroy();
    host.removeChild(s.el);
    var t = top();
    t.el.style.display = "";
    if (t.show) t.show(true);
    Nav.setRoot(t.el, t.focusMemo, t.focusScope);
    return true;
  }

  // Replace the whole stack (e.g. after signing in or out).
  function reset(screen) {
    while (stack.length) { var s = stack.pop(); if (s.destroy) s.destroy(); host.removeChild(s.el); }
    push(screen);
  }

  function refocus(preferred) { var t = top(); if (t) Nav.setRoot(t.el, preferred || Nav.current(), t.focusScope); }

  function toast(text, ms) {
    var t = U.$("#toast");
    t.textContent = text;
    t.classList.add("open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("open"); }, ms || 3500);
  }

  function onKey(e) {
    var code = e.keyCode;
    var t = top();
    if (t && t.key && t.key(code, e)) { e.preventDefault(); return; }
    if (code === KEY.LEFT) { Nav.move("left"); e.preventDefault(); }
    else if (code === KEY.RIGHT) { Nav.move("right"); e.preventDefault(); }
    else if (code === KEY.UP) { Nav.move("up"); e.preventDefault(); }
    else if (code === KEY.DOWN) { Nav.move("down"); e.preventDefault(); }
    else if (code === KEY.OK) { if (Nav.activate()) e.preventDefault(); }
    else if (code === KEY.BACK || code === KEY.ESC || (code === KEY.BACKSPACE && document.activeElement.tagName !== "INPUT")) {
      e.preventDefault();
      if (!pop()) window.close();
    }
  }

  function start() {
    host = U.$("#screens");
    document.addEventListener("keydown", onKey, true);
    // The Magic Remote pointer: hovering focuses, clicking activates. Only
    // inside the part of the screen that owns focus (see Nav.focusScope);
    // a click outside an open panel goes to the screen's dismiss().
    document.addEventListener("mouseover", function (e) {
      var el = e.target.closest ? e.target.closest(".focusable") : null;
      if (el && Nav.contains(el) && el !== Nav.current()) Nav.focus(el);
    });
    document.addEventListener("click", function (e) {
      if (!e.isTrusted) return;
      var t = top(), scope = t && t.focusScope && t.focusScope();
      if (scope && !scope.contains(e.target)) {
        e.preventDefault(); e.stopPropagation();
        if (t.dismissScope) t.dismissScope();
        return;
      }
      var el = e.target.closest ? e.target.closest(".focusable") : null;
      if (el && el.onactivate) { e.preventDefault(); el.onactivate(); }
    }, true);
    // Coming back to the app: refresh the library from the account.
    document.addEventListener("webkitvisibilitychange", function () {
      var t = top();
      if (t && t.visibility) t.visibility(!document.webkitHidden);
      if (!document.webkitHidden) {
        Engine.ensure().catch(function () {});
        if (Account.signedIn()) Account.sync().then(function (changed) { if (changed && t && t.refresh) t.refresh(); }, function () {});
      }
    });

    Engine.detectCaps();
    Engine.ensure().catch(function (e) { toast(e.message, 6000); });
    if (Account.signedIn() || U.load("guest", false)) Screens.enter();
    else push(Screens.login());
  }

  return { start: start, push: push, pop: pop, reset: reset, top: top, refocus: refocus, toast: toast };
})();

window.addEventListener("load", App.start);
