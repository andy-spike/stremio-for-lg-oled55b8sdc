'use strict';
const dns = require('dns');
const net = require('net');
const server = process.argv[2] || '127.0.0.2';
const hosts = ['v3-cinemeta.strem.io', 'opensubtitles-v3.strem.io', 'dl.strem.io', 'api.github.com'];
const resolver = new dns.Resolver({timeout: 18000, tries: 1}); resolver.setServers([server]);
const checks = hosts.map(host => new Promise((resolve, reject) => {
  const at = Date.now(); resolver.resolve4(host, (err, addresses) => {
    if (err) return reject(err);
    if (!addresses.length) return reject(new Error('no addresses: ' + host));
    console.log(JSON.stringify({host, milliseconds: Date.now()-at, addresses: addresses.length})); resolve();
  });
}));
checks.push(new Promise((resolve, reject) => {
  const q = Buffer.from('123401000001000000000000076578616d706c6503636f6d0000010001','hex');
  const client = net.connect(53, '127.0.0.2'); const at = Date.now(); let response = Buffer.alloc(0);
  client.setTimeout(18000, () => client.destroy(new Error('TCP DNS timeout')));
  client.on('error', reject);
  client.on('connect', () => {const prefix = Buffer.alloc(2); prefix.writeUInt16BE(q.length); client.write(Buffer.concat([prefix,q]));});
  client.on('data', chunk => {
    response = Buffer.concat([response, chunk]);
    if (response.length < 2 || response.length < response.readUInt16BE(0)+2) return;
    const r = response.subarray(2); client.destroy();
    if (r.length < 12 || r.readUInt16BE(0) !== 0x1234 || (r[3] & 15) || !r.readUInt16BE(6)) return reject(new Error('Invalid TCP DNS answer'));
    console.log(JSON.stringify({transport:'TCP',host:'example.com',milliseconds:Date.now()-at})); resolve();
  });
}));
Promise.all(checks).catch(e => {console.error(e.message);process.exitCode=1;});
