// Mocked-runner tests for lib/android-node.js (no real adb/emulator is ever executed).
// Run: node test/android-node.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antest-'));
fs.mkdirSync(path.join(tmp, 'sdk', 'emulator'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'sdk', 'emulator', 'emulator'), '');
const apk = path.join(tmp, 'CoreTestNode.apk'); fs.writeFileSync(apk, 'x');

const st = { installed: false, nodeUp: false, calls: [], replies: {} };
async function run(cmd, args) {
    st.calls.push(args.join(' '));
    const a = args.join(' ');
    if (args.includes('-list-avds')) return 'Phone_A\nPhone_B\n';
    if (a === 'devices') return 'List of devices attached\nemulator-5554\tdevice\n';
    if (/emu avd name$/.test(a)) return 'Phone_A\nOK\n';
    if (/pm list packages/.test(a)) return st.installed ? 'package:org.minima.coretestnode\n' : '';
    if (/ install -r /.test(' ' + a)) { st.installed = true; return 'Success\n'; }
    if (/force-stop|pm clear/.test(a)) { st.nodeUp = false; return ''; }
    if (/start-foreground-service/.test(a)) { st.nodeUp = true; return 'Starting service\n'; }
    let m = a.match(/am broadcast .* --es id (\S+) --es cmd '(.*)'$/);
    if (m) { st.lastId = m[1]; st.lastCmd = m[2]; return 'Broadcast completed\n'; }
    if (/logcat -d -s CoreTestNode/.test(a)) {
        if (!st.nodeUp || !st.lastId) return '';
        const body = JSON.stringify({ command: 'status', status: true, response: { version: '1.1.2', chain: { block: 306, hash: '0xABC' }, network: { connected: 1, port: 12001 }, uptime: '1m' } });
        const half = Math.floor(body.length / 2);
        return `11-20 14:00 I CoreTestNode: RESULT ${st.lastId} 2/2 ${body.slice(half)}\n11-20 14:00 I CoreTestNode: RESULT ${st.lastId} 1/2 ${body.slice(0, half)}\n`;
    }
    throw new Error('unexpected call: ' + cmd + ' ' + a);
}
const logs = [];
const cfg = { androidSdkPath: path.join(tmp, 'sdk'), adbPath: 'adb', coreTestNodeApk: apk, androidNodePollMs: 5, androidNodeStatusWaitMs: 200, emulatorStopPollMs: 5 };
const emu = require('../lib/emulator')({ getConfig: () => cfg, getAdbEnv: () => process.env, log: m => logs.push(m), run, avdRoot: () => tmp, spawnProc: () => ({ pid: 1, on() { }, unref() { } }) });
const router = require('../lib/android-node')({ getConfig: () => cfg, log: m => logs.push(m), helpers: emu._helpers });

(async () => {
    const app = express(); app.use('/api/android-node', router);
    const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api/android-node`;
    const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
    const get = async p => { const r = await fetch(base + p); return { s: r.status, j: await r.json() }; };
    let n = 0; const ok = name => console.log('ok', ++n, name);

    let r = await get('/status?avd=Phone_A'); assert.equal(r.s, 200);
    assert.deepEqual([r.j.running, r.j.installed, r.j.nodeUp, r.j.apk], [true, false, false, true]); ok('status: running, not installed');
    r = await get('/status?avd=Phone_B'); assert.equal(r.j.running, false); ok('status: AVD not running');
    r = await get('/status?avd=evil'); assert.equal(r.s, 404); ok('unknown AVD 404');
    r = await get('/status?avd=a;b'); assert.equal(r.s, 400); ok('bad AVD name 400');

    r = await post('/start', { avd: 'Phone_A' }); assert.equal(r.s, 409); ok('start refused before install');
    r = await post('/install', { avd: 'Phone_B' }); assert.equal(r.s, 409); ok('install refused for a stopped AVD');
    r = await post('/install', { avd: 'Phone_A' }); assert.equal(r.s, 200);
    assert.ok(st.calls.some(c => c === `-s emulator-5554 install -r ${apk}`)); ok('install uses the serial from adb devices');

    r = await post('/start', { avd: 'Phone_A' }); assert.equal(r.s, 200);
    assert.equal(r.j.params, '-test -nop2p -connect 10.0.0.11:9001 -port 12001'); ok('default start joins the desktop seed');
    assert.ok(st.calls.some(c => /start-foreground-service .* --es params '-test -nop2p -connect 10\.0\.0\.11:9001 -port 12001'$/.test(c))); ok('params travel in one quoted argument');
    r = await post('/start', { avd: 'Phone_A', mode: 'solo', port: 13001 }); assert.equal(r.j.params, '-solo -port 13001'); ok('solo mode');
    r = await post('/start', { avd: 'Phone_A', mode: 'x' }); assert.equal(r.s, 400); ok('bad mode 400');
    r = await post('/start', { avd: 'Phone_A', port: 80 }); assert.equal(r.s, 400); ok('bad port 400');
    r = await post('/start', { avd: 'Phone_A', port: '12001;rm' }); assert.equal(r.s, 400); ok('non-integer port 400');
    cfg.androidSeedHost = "1.2.3.4:9001' ; reboot"; r = await post('/start', { avd: 'Phone_A' }); assert.equal(r.s, 500); delete cfg.androidSeedHost; ok('invalid seed in config rejected');

    await post('/start', { avd: 'Phone_A' });
    r = await get('/status?avd=Phone_A');
    assert.deepEqual([r.j.nodeUp, r.j.block, r.j.connected, r.j.port, r.j.hash], [true, 306, 1, 12001, '0xABC']); ok('status parses a chunked reply (out of order)');

    r = await post('/cmd', { avd: 'Phone_A', command: "send address:Mx'1" }); assert.equal(r.s, 200);
    assert.equal(st.lastCmd, "send address:Mx'\\''1"); ok('single quote escaped for the device shell');
    r = await post('/cmd', { avd: 'Phone_A', command: 'status\nreboot' }); assert.equal(r.s, 400); ok('control characters rejected');
    r = await post('/cmd', { avd: 'Phone_A', command: 'x'.repeat(301) }); assert.equal(r.s, 400); ok('too long command rejected');
    r = await post('/cmd', { avd: 'Phone_A' }); assert.equal(r.s, 400); ok('missing command rejected');

    r = await post('/stop', { avd: 'Phone_A' }); assert.equal(r.s, 200); assert.equal(st.nodeUp, false); ok('stop');
    r = await post('/wipe', { avd: 'Phone_A' }); assert.equal(r.s, 200); assert.ok(st.calls.some(c => /pm clear org\.minima\.coretestnode/.test(c))); ok('wipe');
    r = await post('/cmd', { avd: 'Phone_A', command: 'status' }); assert.equal(r.s, 504); ok('no reply when node stopped (504)');

    srv.close();
    console.log(`\nAll ${n} android-node checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
