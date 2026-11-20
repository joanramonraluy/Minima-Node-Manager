// Tests for lib/request-guard.js. Run: node test/request-guard.test.js
const assert = require('assert');
const { hostAllowed, originAllowed, bindHost, isLoopback, hostname } = require('../lib/request-guard');
const req = (host, origin) => ({ headers: { host, ...(origin ? { origin } : {}) } });
let n = 0; const ok = name => console.log('ok', ++n, name);

for (const h of ['localhost:3000', 'localhost', '127.0.0.1:3001', '[::1]:3000', 'LOCALHOST:3000']) assert.ok(hostAllowed(req(h)), h);
ok('loopback hosts are allowed (with or without port, any case)');
for (const h of ['evil.example', 'evil.example:3000', '192.168.1.20:3000', '10.0.0.1:3000', 'localhost.evil.example', '127.0.0.1.evil.example', '', undefined]) assert.ok(!hostAllowed(req(h)), String(h));
ok('other hosts are refused (DNS rebinding, LAN addresses, look-alike names, missing Host)');
assert.ok(hostAllowed(req('192.168.1.20:3000'), ['192.168.1.20']) && hostAllowed(req('Box.Local'), ['box.local']) && !hostAllowed(req('other:3000'), ['192.168.1.20'])); ok('allowedHosts adds exact names');
assert.equal(hostname('[::1]:3000'), '[::1]'); assert.equal(hostname('[bad'), ''); ok('hostname parsing');

assert.ok(originAllowed(req('localhost:3000'))); ok('no Origin (curl, scripts, same-origin GET): allowed');
assert.ok(originAllowed(req('localhost:3000', 'http://localhost:3000'))); ok('same-origin browser request: allowed');
assert.ok(!originAllowed(req('localhost:3000', 'http://evil.example'))); assert.ok(!originAllowed(req('localhost:3000', 'http://localhost:4000'))); assert.ok(!originAllowed(req('localhost:3000', 'not a url'))); ok('other origins (site, other port, garbage): refused');

// DNS rebinding: the page's own domain resolves to 127.0.0.1, so Origin and Host agree: Origin alone lets it through, Host stops it
const rebound = req('evil.example:3000', 'http://evil.example:3000');
assert.ok(originAllowed(rebound)); assert.ok(!hostAllowed(rebound)); ok('DNS rebinding passes the Origin check and is stopped by the Host check');

assert.equal(bindHost({}, {}), '127.0.0.1'); assert.equal(bindHost({ bindHost: '0.0.0.0' }, {}), '0.0.0.0'); assert.equal(bindHost({ bindHost: '0.0.0.0' }, { NODEMANAGER_BIND: '127.0.0.1' }), '127.0.0.1');
assert.ok(isLoopback('127.0.0.1') && !isLoopback('0.0.0.0')); ok('bind address: loopback by default, config or env to change it');
console.log(`\nAll ${n} request-guard checks passed.`);
