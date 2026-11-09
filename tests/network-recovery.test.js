'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function helpers() {
  const requests = [], timers = new Map(); let timerId = 0;
  function XHR() { requests.push(this); }
  XHR.prototype.open = function (method, url) { this.method = method; this.url = url; };
  XHR.prototype.setRequestHeader = function () {};
  XHR.prototype.send = function (body) { this.body = body; };
  XHR.prototype.abort = function () { this.aborted = true; this.onabort(); };
  XHR.prototype.respond = function (status, body) { this.status = status; this.responseText = body; this.onload(); };
  const context = { XMLHttpRequest: XHR, Promise, setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, delay}); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync('app/js/util.js', 'utf8'), context);
  return { U: context.U, requests, timers, fire() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); return timer.delay; } };
}
(async () => {
  {
    const h = helpers();
    const p = h.U.request('/slow'); const rejected = assert.rejects(p, /Cancelled/);
    p.cancel(); await rejected; assert.ok(h.requests[0].aborted);
    const q = h.U.request('/timeout'); const timedout = assert.rejects(q, /Timed out/);
    h.requests[1].ontimeout(); await timedout;
    const r = h.U.request('/bad'); const bad = assert.rejects(r, e => e.status === 503);
    h.requests[2].respond(503, ''); await bad;
    const good = h.U.request('/good'); h.requests[3].respond(200, '{"ok":true}'); assert.equal((await good).ok, true);
  }
  {
    const h = helpers(); let successes = 0, failures = 0;
    const stop = h.U.retry(() => h.U.request('/catalog'), () => successes++, () => failures++);
    for (const delay of [3000, 6000, 12000, 15000]) {
      h.requests[h.requests.length - 1].onerror(); await tick();
      assert.equal(h.timers.size, 1); assert.equal(h.fire(), delay);
    }
    h.requests[h.requests.length - 1].respond(200, '{}'); await tick();
    assert.equal(successes, 1); assert.equal(failures, 4); assert.equal(h.timers.size, 0); stop();
  }
  {
    const h = helpers(); let failures = 0;
    const stop = h.U.retry(() => h.U.request('/catalog'), () => assert.fail('stale success'), () => failures++);
    stop(); await tick(); assert.ok(h.requests[0].aborted); assert.equal(failures, 0); assert.equal(h.timers.size, 0);
    h.U.retry(() => h.U.request('/missing'), () => {}, () => failures++);
    h.requests[1].respond(404, ''); await tick(); assert.equal(h.timers.size, 0);
    const stopTimer = h.U.retry(() => h.U.request('/offline'), () => {}, () => {});
    h.requests[2].onerror(); await tick(); stopTimer(); assert.equal(h.timers.size, 0);
  }
  {
    const h = helpers();
    const addons = ['healthy', 'offline', 'missing'].map(name => ({ transportUrl: 'https://' + name + '/manifest.json', manifest: { resources: ['stream'], types: ['movie'] } }));
    h.U.load = () => addons;
    const context = { U: h.U, Promise }; vm.createContext(context);
    vm.runInContext(fs.readFileSync('app/js/addons.js', 'utf8'), context);
    const completed = {}, groups = [];
    const first = context.Addons.streams('movie', 'tt1', a => groups.push(a.transportUrl), completed);
    h.requests[0].respond(200, '{"streams":[]}'); h.requests[1].onerror(); h.requests[2].respond(404, '');
    const results = await first; assert.equal(results.filter(r => r === null).length, 1);
    const second = context.Addons.streams('movie', 'tt1', a => groups.push(a.transportUrl), completed);
    assert.equal(h.requests.length, 4); assert.ok(h.requests[3].url.includes('offline'));
    h.requests[3].respond(200, '{"streams":[]}'); await second;
    assert.equal(groups.length, 2);
    await context.Addons.streams('movie', 'tt1', () => assert.fail('duplicate addon'), completed);
    assert.equal(h.requests.length, 4);
    const catalog = context.Addons.catalog({addon: addons[0], catalog: {type: 'movie', id: 'top'}});
    const cancelled = assert.rejects(catalog, /Cancelled/); catalog.cancel(); await cancelled;
  }
  // Exercise the actual Home and startup functions with a small DOM stand-in.
  {
    const h = helpers();
    function node(spec, attrs, children) {
      const n = { spec, children: children || [], classList: {add() {}, remove() {}, contains() { return false; }},
        appendChild(child) { this.children.push(child); return child; },
        querySelector(selector) { if (selector === '.strip') return this.strip; return null; },
        remove() { this.removed = true; } };
      return n;
    }
    h.U.el = node; h.U.clear = n => { n.children = []; return n; };
    const entry = {addon: {manifest: {name: 'Test'}}, catalog: {name: 'Catalog', type: 'movie'}};
    let active;
    const context = { U: h.U, Promise, el: node, tr: s => s,
      screen: (name, children) => node(name, {}, children), topBar: () => node('header'), skelCards: () => [],
      row: () => { const r = node('row'); r.strip = node('strip'); return r; },
      typeLabel: s => s, showArtIn() {}, card: m => node(m.name),
      Account: {continueWatching: () => []},
      Addons: {boardCatalogs: () => [entry], catalog: () => h.U.request('/catalog')},
      App: {top: () => active, refocus() {}}, Nav: {current: () => null} };
    vm.createContext(context);
    const source = fs.readFileSync('app/js/screens.js', 'utf8');
    vm.runInContext(source.slice(source.indexOf('  function limited('), source.indexOf('  function login(')) .split('  // ----------')[0], context);
    vm.runInContext(source.slice(source.indexOf('  function home()'), source.indexOf('  // ---------- search')), context);
    active = context.home();
    const r = active.el.children[1].children[1];
    h.requests[0].onerror(); await tick();
    assert.ok(!r.removed); assert.equal(r.strip.children[0].spec, 'div.error');
    h.fire(); h.requests[1].respond(200, '[{"name":"Recovered"}]'); await tick();
    assert.equal(r.strip.children[0].spec, 'Recovered'); active.destroy();
    active = context.home(); active.destroy(); await tick();
    assert.ok(h.requests[2].aborted); assert.equal(h.timers.size, 0);
    context.Account.sync = () => Promise.resolve();
    let loads = 0;
    context.Addons.load = () => ++loads === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
    context.brand = () => node('brand'); context.skelRow = () => node('skeleton'); context.button = () => node('button');
    context.home = () => ({el: node('recovered-home')});
    context.App.reset = next => { if (active && active.destroy) active.destroy(); active = next; };
    vm.runInContext(source.slice(source.indexOf('  function enter()'), source.indexOf('  // ---------- home')), context);
    context.enter(); await tick(); assert.equal(active.el.className, 'screen splash');
    h.fire(); await tick(); assert.equal(active.el.spec, 'recovered-home');
  }
  console.log('Network recovery: cancellation, timeouts, backoff, cleanup, permanent errors and partial-addon recovery passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
