// Mocked tests for lib/nodes-http.js (no process is started). Run: node test/nodes-http.test.js
const assert = require('assert');
const express = require('express');

const calls = []; const procs = {};
const state = { core: true, cfg: { coreJarPath: '/x/minima.jar', coreLibsPath: '/x/lib' } };
const router = require('../lib/nodes-http')({
    isCoreMode: () => state.core, getConfig: () => state.cfg, nodeProcesses: procs, nodeCount: 26,
    startNode: (id, o) => { calls.push(['start', id, o]); procs[id] = {}; },
    stopNode: id => { calls.push(['stop', id]); delete procs[id]; },
    stopAll: () => calls.push(['stopAll'])
});

(async () => {
    const app = express(); app.use('/api/nodes', router);
    const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api/nodes`;
    const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
    const get = async p => { const r = await fetch(base + p); return { s: r.status, j: await r.json() }; };
    let n = 0; const ok = name => console.log('ok', ++n, name);

    let r = await get('/'); assert.deepEqual(r.j, { mode: 'core', running: [] }); ok('list: nothing running');
    r = await post('/1/start'); assert.equal(r.s, 200); assert.equal(r.j.status, 'starting');
    assert.deepEqual(calls.pop(), ['start', 1, { clean: false, allowGenMessage: false }]); ok('start one node (no body, never -clean by default)');
    r = await post('/1/start'); assert.equal(r.j.status, 'already running'); assert.equal(calls.length, 0); ok('starting a running node does nothing');
    r = await get('/'); assert.deepEqual(r.j.running, [1]); ok('list shows running nodes');
    r = await post('/3/start', { clean: true }); assert.deepEqual(calls.pop(), ['start', 3, { clean: true, allowGenMessage: false }]); ok('clean must be requested explicitly');
    r = await post('/4/start', { clean: 'yes' }); assert.equal(r.s, 400); ok('clean must be a boolean');
    r = await post('/5/start', { allowGenMessage: true }); assert.deepEqual(calls.pop(), ['start', 5, { clean: false, allowGenMessage: true }]); ok('allowGenMessage must be requested explicitly and never implies clean');
    r = await post('/6/start', { allowGenMessage: 'yes' }); assert.equal(r.s, 400); ok('allowGenMessage must be a boolean');
    r = await post('/0/start'); assert.equal(r.s, 400); r = await post('/27/start'); assert.equal(r.s, 400); r = await post('/x;y/start'); assert.equal(r.s, 400); ok('invalid ids refused');
    r = await post('/1/stop'); assert.equal(r.s, 200); assert.deepEqual(calls.pop(), ['stop', 1]); ok('stop one node');
    r = await post('/stop-all'); assert.equal(r.s, 200); assert.deepEqual(calls.pop(), ['stopAll']); ok('stop all');

    for (const k of Object.keys(procs)) delete procs[k]; calls.length = 0;
    r = await post('/start-all'); assert.deepEqual([r.j.started, r.j.alreadyRunning], [[1, 2], []]);
    assert.deepEqual(calls.map(c => c[1]), [1, 2]); ok('start-all defaults to 2 nodes, seed first');
    r = await post('/start-all', { count: 3 }); assert.deepEqual([r.j.started, r.j.alreadyRunning], [[3], [1, 2]]); ok('start-all leaves running nodes alone');
    r = await post('/start-all', { count: 0 }); assert.equal(r.s, 400); r = await post('/start-all', { count: 99 }); assert.equal(r.s, 400); r = await post('/start-all', { count: '2;ls' }); assert.equal(r.s, 400); ok('bad count refused');

    calls.length = 0; state.core = false;
    r = await post('/1/start'); assert.equal(r.s, 409); r = await post('/start-all'); assert.equal(r.s, 409); r = await post('/1/stop'); assert.equal(r.s, 409); r = await post('/stop-all'); assert.equal(r.s, 409);
    assert.equal(calls.length, 0); ok('Classic mode: everything refused with 409');
    state.core = true; state.cfg = {};
    r = await post('/1/start'); assert.equal(r.s, 409); assert.ok(/coreJarPath/.test(r.j.error)); assert.equal(calls.length, 0); ok('missing Core jar/libs paths: 409 with the reason');
    srv.close();
    console.log(`\nAll ${n} nodes-http checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
