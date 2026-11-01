// node tests/account.test.js — library sync against a fake Stremio API.
// Runs util.js and account.js in a sandbox with stubbed storage and network.
const vm = require("vm"), fs = require("fs"), path = require("path"), assert = require("assert");

function sandbox() {
  const store = {};
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Date, Math,
    localStorage: {
      getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.localStorage.setItem("auth", JSON.stringify({ key: "k1", user: { email: "a@b" } }));
  for (const f of ["util.js", "account.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/js", f), "utf8"), ctx, { filename: f });
  // Fake API: calls wait until released, so tests control the interleaving.
  const calls = [];
  ctx.U.request = (url, opts) => new Promise(resolve => {
    calls.push({ method: url.split("/").pop(), body: JSON.parse(JSON.stringify(opts.body)), resolve });
  });
  return { ctx, calls, Account: ctx.Account };
}
const tick = () => new Promise(r => setImmediate(r));
async function release(calls, method, result) {
  for (let i = 0; i < 50 && !calls.some(c => c.method === method && !c.done); i++) await tick();
  const c = calls.find(c => c.method === method && !c.done);
  assert.ok(c, "expected a " + method + " call");
  c.done = true;
  c.resolve({ result });
  await tick();
  return c;
}

(async () => {
  // 1. A change made while an upload is in flight must be uploaded too.
  {
    const { calls, Account } = sandbox();
    const item = Account.itemFor({ id: "tt1", type: "movie", name: "M" });
    Account.progress(item, "tt1", 60000, 6000000);
    Account.put(item, false);
    const first = Account.sync();
    await release(calls, "datastoreMeta", []);
    const put1 = calls.find(c => c.method === "datastorePut");
    assert.strictEqual(put1.body.changes[0].state.timeOffset, 60000);
    // While that upload is pending, the player saves a newer position and asks to sync.
    await new Promise(r => setTimeout(r, 5));   // a later _mtime
    Account.progress(item, "tt1", 120000, 6000000);
    Account.put(item, false);
    Account.sync();
    await release(calls, "datastorePut", null);
    // A second round must upload the newer position.
    await release(calls, "datastoreMeta", [["tt1", put1.body.changes[0]._mtime]]);
    const put2 = calls.filter(c => c.method === "datastorePut")[1];
    assert.ok(put2, "the change made during the first upload was never sent");
    assert.strictEqual(put2.body.changes[0].state.timeOffset, 120000);
    await release(calls, "datastorePut", null);
    await first;
  }
  // 2. Signing out mid-sync must not bring the old account's items back.
  {
    const { calls, Account } = sandbox();
    const p = Account.sync().catch(() => {});
    await release(calls, "datastoreMeta", [["tt9", Date.now()]]);
    Account.logout();
    await release(calls, "datastoreGet", [{ _id: "tt9", type: "movie", name: "Old", state: { timeOffset: 5 }, _mtime: new Date().toISOString() }]);
    await p;
    assert.strictEqual(Account.get("tt9"), null, "old account's item leaked into the signed-out library");
  }
  console.log("account ok");
})().catch(e => { console.error(e); process.exit(1); });
