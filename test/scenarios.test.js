// Mocked tests for lib/scenarios.js (no real process is spawned). Run: node test/scenarios.test.js
const assert = require('assert');
const express = require('express');
const { EventEmitter } = require('events');

const spawned = []; const events = [];
function fakeSpawn(cmd, args, opts) {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = sig => { child.killed = sig; setImmediate(() => child.emit('close', 143)); };
    spawned.push({ cmd, args, opts, child });
    return child;
}
const cfg = { testScenarios: [
    { id: 'ok', name: 'OK', cmd: ['python3', '-I', '/x/flow.py', '--rpc', 'http://10.0.0.11:9005'] },
    { id: 'bad id!', name: 'Rejected', cmd: ['true'] },
    { id: 'nocmd', name: 'No cmd', cmd: [] }
] };
const router = require('../lib/scenarios')({ getConfig: () => cfg, emit: (e, d) => events.push([e, d]), baseDir: '/nonexistent', spawnProc: fakeSpawn });

(async () => {
    const app = express(); app.use('/api/scenarios', router);
    const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api/scenarios`;
    const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
    const get = async p => { const r = await fetch(base + p); return { s: r.status, j: await r.json() }; };
    let n = 0; const ok = name => console.log('ok', ++n, name);

    let r = await get('/'); assert.deepEqual(r.j.scenarios.map(s => s.id), ['ok']); ok('only valid scenarios are listed');
    r = await post('/run', { id: 'nope' }); assert.equal(r.s, 404); ok('unknown id 404');
    r = await post('/run', { id: 'bad id!' }); assert.equal(r.s, 404); ok('invalid id never runs');
    r = await post('/run', { id: 'ok', cmd: ['rm', '-rf', '/'] }); assert.equal(r.s, 200);
    const root = process.getuid && process.getuid() === 0;
    const last = spawned[spawned.length - 1];
    if (!root) { assert.equal(last.cmd, 'python3'); assert.deepEqual(last.args, ['-I', '/x/flow.py', '--rpc', 'http://10.0.0.11:9005']); ok('argv comes from config, client cmd ignored'); }
    assert.deepEqual(last.opts.stdio, ['ignore', 'pipe', 'pipe']); ok('no shell, stdin closed');
    r = await post('/run', { id: 'ok' }); assert.equal(r.s, 409); ok('second run while running refused');
    last.child.stdout.emit('data', Buffer.from('  [PASS] one\n'));
    last.child.stderr.emit('data', Buffer.from('warn\n'));
    r = await get('/ok/output'); assert.ok(r.j.output.includes('[PASS] one') && r.j.output.includes('warn') && r.j.running); ok('output buffered while running');
    last.child.emit('close', 0);
    r = await get('/ok/output'); assert.equal(r.j.exit, 0); assert.ok(r.j.output.includes('PASSED') && !r.j.running); ok('exit 0 reported as PASSED');
    assert.ok(events.some(e => e[0] === 'scenario-done' && e[1].exit === 0) && events.some(e => e[0] === 'scenario-output')); ok('socket events emitted');
    r = await post('/run', { id: 'ok' }); assert.equal(r.s, 200); const c2 = spawned[spawned.length - 1];
    r = await post('/stop', { id: 'ok' }); assert.equal(r.s, 200); assert.equal(c2.child.killed, 'SIGTERM');
    await new Promise(r2 => setTimeout(r2, 20));
    r = await get('/ok/output'); assert.equal(r.j.exit, 143); assert.ok(r.j.output.includes('FAILED')); ok('stop kills the process, reported as FAILED');
    r = await post('/stop', { id: 'ok' }); assert.equal(r.s, 409); ok('stop when not running 409');
    srv.close();
    console.log(`\nAll ${n} scenario checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
