// Mocked-runner tests for lib/emulator.js (no real adb/emulator is ever executed).
// Run: node test/emulator.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emutest-'));
fs.mkdirSync(path.join(tmp, 'sdk', 'emulator'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'sdk', 'emulator', 'emulator'), '');
const avdRoot = path.join(tmp, 'avd');
fs.mkdirSync(path.join(avdRoot, 'Stopped_AVD.avd', 'snapshots', 'day1'), { recursive: true });
fs.mkdirSync(path.join(avdRoot, 'Stopped_AVD.avd', 'snapshots', 'day2'), { recursive: true });

// Mock world
const state = { running: { 'emulator-5554': 'Run_AVD' }, snaps: ['s1'], forwards: ['emulator-5554 tcp:21000 tcp:11001'], calls: [], spawned: [] };
async function run(cmd, args) {
    state.calls.push([cmd, ...args]);
    const a = args.join(' ');
    if (args.includes('-list-avds')) return 'Run_AVD\nStopped_AVD\n';
    if (a === 'devices') return 'List of devices attached\n' + Object.keys(state.running).map(s => `${s}\tdevice`).join('\n') + '\n';
    let m = a.match(/^-s (\S+) emu avd name$/);
    if (m) return (state.running[m[1]] || '') + '\nOK\n';
    if (/emu avd snapshot list$/.test(a)) return 'List of snapshots present on all disks:\nID        TAG                 VM SIZE   DATE\n--        ' + state.snaps.join('  1G 2025\n--        ') + '  1G 2025\nOK\n';
    m = a.match(/emu avd snapshot (save|load|delete) (\S+)$/);
    if (m) { if (m[1] === 'save') state.snaps.push(m[2]); if (m[1] === 'delete') state.snaps = state.snaps.filter(n => n !== m[2]); return 'OK\n'; }
    if (/emu kill$/.test(a)) { delete state.running['emulator-5554']; return 'OK\n'; }
    if (a === 'forward --list') return state.forwards.join('\n') + '\n';
    m = a.match(/^-s (\S+) forward tcp:(\d+) tcp:(\d+)$/);
    if (m) { state.forwards.push(`${m[1]} tcp:${m[2]} tcp:${m[3]}`); return ''; }
    if (/forward --remove/.test(a)) { state.forwards = []; return ''; }
    throw new Error('unexpected call: ' + cmd + ' ' + a);
}
const logs = [];
const cfg = { androidSdkPath: path.join(tmp, 'sdk'), adbPath: 'adb', emulatorArgs: ['-gpu', 'host'], emulatorStopPollMs: 5 };
const router = require('../lib/emulator')({
    getConfig: () => cfg, getAdbEnv: () => process.env, log: m => logs.push(m), run, avdRoot: () => avdRoot,
    spawnProc: (cmd, args) => { state.spawned.push([cmd, ...args]); return { pid: process.pid, on() { }, unref() { } }; }
});

(async () => {
    const app = express(); app.use('/api/emulator', router);
    const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api/emulator`;
    const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
    const get = async p => { const r = await fetch(base + p); return { s: r.status, j: await r.json() }; };
    let n = 0; const ok = (name) => console.log('ok', ++n, name);

    // lists
    let r = await get('/avds'); assert.equal(r.s, 200);
    assert.deepEqual(r.j.avds.map(a => [a.name, a.running]), [['Run_AVD', true], ['Stopped_AVD', false]]); ok('avds');
    r = await get('/snapshots?avd=Run_AVD'); assert.deepEqual(r.j.snapshots, ['s1']); assert.equal(r.j.running, true); ok('running snapshot list parsed');
    r = await get('/snapshots?avd=Stopped_AVD'); assert.deepEqual(r.j.snapshots, ['day1', 'day2']); assert.equal(r.j.running, false); ok('stopped snapshot dir listing');
    r = await get('/snapshots?avd=evil'); assert.equal(r.s, 404); ok('unknown avd 404');
    r = await get('/snapshots?avd=a;b'); assert.equal(r.s, 400); ok('bad avd 400');

    // snapshots mutating
    r = await post('/snapshots/save', { avd: 'Run_AVD', name: 'checkpoint' }); assert.equal(r.s, 200);
    assert.ok(state.calls.some(c => c.join(' ') === 'adb -s emulator-5554 emu avd snapshot save checkpoint')); ok('save');
    r = await post('/snapshots/save', { avd: 'Run_AVD', name: 'x y;rm' }); assert.equal(r.s, 400); ok('bad snapshot name 400');
    r = await post('/snapshots/load', { avd: 'Run_AVD', name: 'nonexistent' }); assert.equal(r.s, 404); ok('load unknown 404');
    r = await post('/snapshots/load', { avd: 'Run_AVD', name: 's1' }); assert.equal(r.s, 200); ok('load');
    r = await post('/snapshots/delete', { avd: 'Run_AVD', name: 'checkpoint' }); assert.equal(r.s, 200); assert.ok(!state.snaps.includes('checkpoint')); ok('delete');
    r = await post('/snapshots/save', { avd: 'Stopped_AVD', name: 'abc' }); assert.equal(r.s, 409); ok('save on stopped AVD 409');

    // forwards
    r = await get('/forwards?avd=Run_AVD'); assert.deepEqual(r.j.forwards, [{ hostPort: 21000, guestPort: 11001 }]); ok('forward list filtered');
    r = await post('/forwards/add', { avd: 'Run_AVD', hostPort: 21001, guestPort: 11001 }); assert.equal(r.s, 200); ok('forward add');
    for (const b of [{ hostPort: 80, guestPort: 11001 }, { hostPort: 21002, guestPort: 80 }, { hostPort: '21002', guestPort: 11001 }, { hostPort: 70000, guestPort: 11001 }]) {
        r = await post('/forwards/add', { avd: 'Run_AVD', ...b }); assert.equal(r.s, 400, JSON.stringify(b));
    } ok('forward port validation');
    r = await post('/forwards/remove', { avd: 'Run_AVD', hostPort: 22222 }); assert.equal(r.s, 404); ok('remove unknown forward 404');
    r = await post('/forwards/remove', { avd: 'Run_AVD', hostPort: 21000 }); assert.equal(r.s, 200); ok('forward remove');

    // launch: already running -> no spawn
    r = await post('/launch', { avd: 'Run_AVD' }); assert.equal(r.j.status, 'already running'); assert.equal(state.spawned.length, 0); ok('already running, no spawn');
    // launch variants on the stopped AVD
    r = await post('/launch', { avd: 'Stopped_AVD', resume: { mode: 'snapshot', name: 'nope' } }); assert.equal(r.s, 404); ok('launch unknown snapshot 404');
    r = await post('/launch', { avd: 'Stopped_AVD', resume: { mode: 'bogus' } }); assert.equal(r.s, 400); ok('bad resume mode 400');
    r = await post('/launch', { avd: 'Stopped_AVD', resume: { mode: 'snapshot', name: 'day1' } }); assert.equal(r.j.status, 'launching');
    let spec = state.spawned[0].join(' '); assert.ok(/-avd Stopped_AVD -gpu host -snapshot day1$/.test(spec), spec); ok('launch -snapshot day1 with -gpu host');
    r = await post('/launch', { avd: 'Stopped_AVD' }); assert.equal(r.j.status, 'already starting'); assert.equal(state.spawned.length, 1); ok('launching protection');

    // Open All: skips running AVDs, launches only the stopped one(s) (Stopped_AVD is already 'starting' here)
    r = await post('/launch-all', {}); assert.equal(r.s, 200);
    assert.deepEqual(r.j.avds.map(a => [a.name, a.plan]), [['Run_AVD', 'already running'], ['Stopped_AVD', 'already starting']]);
    await router._launchAllDone; assert.equal(state.spawned.length, 1); ok('launch-all: running/starting skipped, nothing spawned');
    // simulate the stopped AVD no longer starting (exit handler) by using a fresh router state
    const router2 = require('../lib/emulator')({
        getConfig: () => ({ ...cfg, emulatorLaunchPauseMs: 0 }), getAdbEnv: () => process.env, log: m => logs.push(m), run, avdRoot: () => avdRoot,
        spawnProc: (cmd, args) => { state.spawned.push([cmd, ...args]); return { pid: process.pid, on() { }, unref() { } }; }
    });
    const app2 = express(); app2.use('/api/emulator', router2); const srv2 = app2.listen(0);
    const r2 = await fetch(`http://127.0.0.1:${srv2.address().port}/api/emulator/launch-all`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(x => x.json());
    assert.deepEqual(r2.avds.map(a => [a.name, a.plan]), [['Run_AVD', 'already running'], ['Stopped_AVD', 'launch']]);
    await router2._launchAllDone;
    assert.equal(state.spawned.length, 2);
    assert.ok(/-avd Stopped_AVD -gpu host$/.test(state.spawned[1].join(' '))); assert.ok(!state.spawned[1].some(x => x.startsWith('-snapshot') || x === '-no-snapshot-load'));
    assert.ok(!state.spawned.some(c => c.includes('Run_AVD'))); ok('launch-all launches only the stopped AVD, quickboot, -gpu host');
    srv2.close();

    // stop with save-first (order: save then kill)
    state.calls.length = 0;
    r = await post('/stop', { avd: 'Run_AVD', saveAs: 'endofday' }); assert.equal(r.s, 200);
    const seq = state.calls.map(c => c.join(' ')).filter(c => /snapshot save|emu kill/.test(c));
    assert.deepEqual(seq, ['adb -s emulator-5554 emu avd snapshot save endofday', 'adb -s emulator-5554 emu kill']); ok('stop saves then kills');
    r = await post('/stop', { avd: 'Run_AVD' }); assert.equal(r.s, 409); ok('stop non-running 409');
    r = await post('/stop', { avd: 'Run_AVD', saveAs: '../x' }); assert.equal(r.s, 400); ok('stop bad snapshot name 400');

    // every adb/emulator call is an argv array with no shell metacharacters from client input
    assert.ok(!state.calls.some(c => c.join(' ').includes(';'))); ok('no injected metacharacters');
    srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\nAll ${n} checks passed`); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
