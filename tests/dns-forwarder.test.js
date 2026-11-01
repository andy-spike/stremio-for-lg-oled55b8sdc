'use strict';
const assert = require('assert');
const {validQuery, failure, createResolver, upstream} = require('../runtime/bin/dns-forwarder');
const {EventEmitter} = require('events');
const q = Buffer.from('123401000001000000000000076578616d706c6503636f6d0000010001','hex');
(async () => {
  assert(validQuery(q)); assert(!validQuery(Buffer.alloc(12))); const response = failure(q); assert(!validQuery(response)); assert.equal(response[3] & 15, 2);
  let attempts = [];
  const resolver = createResolver(async (query, ip) => {attempts.push(ip); if (ip === '1.0.0.1') throw Error('unreachable'); return response;});
  assert.deepEqual(await resolver(q), response); assert.deepEqual(attempts, ['1.0.0.1','1.1.1.1']);
  const stalled = createResolver((query, ip) => ip === '1.0.0.1' ? new Promise(() => {}) : Promise.resolve(response));
  assert.deepEqual(await stalled(q), response, 'a stalled address must not delay the healthy address');
  assert.equal(await resolver(Buffer.alloc(2)), null);
  const fail = createResolver(async () => {throw Error('offline');}); assert.equal((await fail(q))[3] & 15, 2);
  const releases = [];
  const bounded = createResolver(() => new Promise(resolve => releases.push(() => resolve(response))));
  const pending = Array.from({length:32}, () => bounded(q)); assert.equal((await bounded(q))[3] & 15, 2); releases.forEach(f => f()); await Promise.all(pending);
  async function transport(status, data, contentType) {
    return upstream(q, '1.1.1.1', (options, callback) => {
      assert.equal(options.servername, 'cloudflare-dns.com'); assert.notEqual(options.rejectUnauthorized, false); assert.equal(options.hostname, '1.1.1.1');
      const req = new EventEmitter(); req.destroy = e => {req.emit('error',e);req.emit('close');};
      req.end = () => {const res = new EventEmitter(); res.statusCode=status; res.headers={'content-type':contentType}; callback(res); res.emit('data',data); res.emit('end'); req.emit('close');}; return req;
    });
  }
  assert.deepEqual(await transport(200,response,'application/dns-message'),response);
  await assert.rejects(transport(503,response,'application/dns-message'));
  await assert.rejects(transport(200,response,'text/html'));
  const wrong = Buffer.from(response); wrong[0]++; await assert.rejects(transport(200,wrong,'application/dns-message'));
  console.log('DNS forwarder: fallback, offline, overload, malformed input, TLS options and response validation passed');
})().catch(e => {console.error(e); process.exitCode=1;});
