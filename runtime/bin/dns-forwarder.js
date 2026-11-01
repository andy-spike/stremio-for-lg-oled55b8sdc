// Loopback DNS -> authenticated HTTPS. No npm dependencies; TV Node 16.
'use strict';
const dgram = require('dgram');
const net = require('net');
const https = require('https');
const HOST = '127.0.0.2';
function validQuery(q) {
  return q.length >= 17 && q.length <= 4096 && !(q[2] & 0xf8) && q.readUInt16BE(4) === 1;
}
function failure(q) {
  const r = Buffer.from(q); r[2] = (r[2] | 0x80) & ~0x02; r[3] = (r[3] & 0xf0) | 0x82;
  r.writeUInt16BE(0, 6); r.writeUInt16BE(0, 8); return r;
}
function upstream(q, ip, request = https.request) {
  return new Promise((resolve, reject) => {
    let stage = 'connecting';
    const req = request({hostname: ip, servername: 'cloudflare-dns.com', port: 443,
      path: '/dns-query', method: 'POST', agent: false,
      headers: {Host: 'cloudflare-dns.com', 'Content-Type': 'application/dns-message', Accept: 'application/dns-message', 'Content-Length': q.length}}, res => {
      const chunks = []; let size = 0;
      res.on('data', c => {size += c.length; if (size > 65535) req.destroy(new Error('oversized DNS response')); else chunks.push(c);});
      res.on('error', reject);
      res.on('end', () => {
        const r = Buffer.concat(chunks);
        if (res.statusCode !== 200 || !/^application\/dns-message(?:;|$)/i.test(res.headers['content-type'] || '') || r.length < 12 || !(r[2] & 0x80) || !r.subarray(0, 2).equals(q.subarray(0, 2))) return reject(new Error('invalid DNS response'));
        resolve(r);
      });
    });
    // Absolute deadline, including connecting and TLS (not just idle sockets).
    req.on('socket', socket => { socket.on('connect', () => {stage = 'TLS';}); socket.on('secureConnect', () => {stage = 'response';}); });
    const timer = setTimeout(() => req.destroy(new Error('DNS HTTPS deadline: ' + stage)), 8000);
    req.on('error', reject); req.on('close', () => clearTimeout(timer)); req.end(q);
  });
}
function createResolver(fetch = upstream) {
  let active = 0;
  const stats = {queries: 0, successes: 0, fallbacks: 0, failures: 0};
  const resolve = async q => {
    if (!validQuery(q)) return null;
    stats.queries++;
    if (active >= 32) {stats.failures++; return failure(q);}
    active++;
    // Race both addresses so a stalled route cannot delay a healthy response.
    const jobs = ['1.0.0.1', '1.1.1.1'].map(ip => Promise.resolve().then(() => fetch(q, ip)).catch(e => {
      stats.fallbacks++; stats.lastError = e.code || e.message; throw e;
    }));
    try {
      const r = await Promise.any(jobs); stats.successes++; return r;
    } catch (_) {
      stats.failures++; return failure(q);
    } finally {
      // Include the slower request in the connection limit until it finishes.
      Promise.allSettled(jobs).then(() => {active--;});
    }
  };
  resolve.stats = stats;
  return resolve;
}
function start(port = 53, host = HOST) {
  const resolve = createResolver(); const udp = dgram.createSocket('udp4');
  process.on('SIGUSR1', () => console.log(JSON.stringify({dns: resolve.stats, rssBytes: process.memoryUsage().rss, uid: process.getuid()})));
  udp.on('message', async (q, peer) => {
    if (peer.address !== '127.0.0.1' && peer.address !== HOST) return;
    let r = await resolve(q); if (!r) return;
    if (r.length > 1232) {r = Buffer.from(q); r[2] |= 0x82; r[3] |= 0x80; r.writeUInt16BE(0, 6); r.writeUInt16BE(0, 8);}
    udp.send(r, peer.port, peer.address, () => {});
  });
  let connections = 0;
  const tcp = net.createServer(socket => {
    connections++; socket.on('close', () => connections--);
    if (connections > 32) {socket.destroy(); return;}
    socket.on('error', () => {}); socket.setTimeout(12000, () => socket.destroy());
    let buf = Buffer.alloc(0), busy = false;
    socket.on('data', async chunk => {
      if (busy) {socket.destroy(); return;}
      buf = Buffer.concat([buf, chunk]); if (buf.length > 4098) {socket.destroy(); return;}
      if (buf.length < 2 || buf.length < buf.readUInt16BE(0) + 2) return;
      busy = true; const q = buf.subarray(2, buf.readUInt16BE(0) + 2); const r = await resolve(q);
      if (!r) {socket.destroy(); return;}
      const prefix = Buffer.alloc(2); prefix.writeUInt16BE(r.length); socket.end(Buffer.concat([prefix, r]));
    });
  });
  function fatal(e) {console.error('DNS forwarder: ' + e.message); process.exit(1);}
  udp.on('error', fatal); tcp.on('error', fatal);
  let bound = 0;
  function ready() {
    if (++bound !== 2) return;
    if (process.getuid && process.getuid() === 0) {process.setgroups([]); process.setgid('nogroup'); process.setuid('nobody');}
    console.log('DNS forwarder ready on ' + host + ':' + port + ' (UDP/TCP -> HTTPS)');
  }
  udp.bind(port, host, ready); tcp.listen(port, host, ready);
  return {udp, tcp};
}
module.exports = {validQuery, failure, upstream, createResolver, start};
if (require.main === module) start(Number(process.argv[2] || 53));
