'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const source = fs.readFileSync('runtime/bin/update.js', 'utf8');
function updater(files) {
  const writes = [], requests = [];
  const fakeFS = {
    readFileSync: p => { if (!(p in files)) throw Error('missing'); return files[p]; },
    mkdirSync: () => {},
    writeFileSync: (p, v) => writes.push([p, v]),
    renameSync: () => {}, existsSync: p => p in files
  };
  const sandbox = { module: { exports: {} }, process: { exitCode: 0 }, console: { error: () => {} }, Buffer, URL,
    require: name => name === 'fs' ? fakeFS : name === 'https' ? { request: () => { requests.push(true); throw Error('unexpected download'); } } : name === './patch-server.js' ? require('../runtime/bin/patch-server.js') : require(name) };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.module.exports, writes, requests };
}
(async () => {
  const u = updater({ '/media/developer/stremio/updates/pending': '4.22.5' });
  await u.api.updateServer(true);
  assert.equal(u.requests.length, 0, 'even forced updates must preserve pending recovery');
  assert(u.writes.some(x => x[1].includes('finish testing or roll back')));
  assert.throws(() => u.api.verifyCandidate('99.0.0', 'unverified'), /not been verified/);
  assert.throws(() => u.api.verifyCandidate('4.22.5', 'changed bundle'), /differs from/);
  // Test the approved exact-byte path without checking a 7 MB third-party bundle into git.
  const fakeSource = source.replace('32cd08023113bfd78585c1b19fd2683f034772836275573ee19c1bf8670a94f0', crypto.createHash('sha256').update('fixture').digest('hex'));
  const sandbox = { module: {exports:{}}, require: n => n === './patch-server.js' ? {} : require(n) };
  vm.runInNewContext(fakeSource, sandbox);
  sandbox.module.exports.verifyCandidate('4.22.5', 'fixture');
  console.log('server update safeguards passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
