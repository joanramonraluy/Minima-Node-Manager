#!/usr/bin/env node
// Prints the state of the Core test bed (headless nodes + Android nodes) and whether they are on the same chain.
// Usage: node scripts/testbed-status.js [--url http://localhost:3000] [--headless 2] [--json]
// Exit code: 0 = at least 2 nodes up, same chain tip (within 2 blocks, no fork); 1 = anything else.
// Read-only: it only calls GET /api/emulator/avds, GET /api/android-node/status and POST /api/nodes/:id/rpc {status}.
// Needs Node 18+ (global fetch); no dependencies.
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const BASE = opt('--url', 'http://localhost:3000');
const HEADLESS = parseInt(opt('--headless', '2'), 10);
const asJson = args.includes('--json');

const get = async p => (await fetch(BASE + p, { signal: AbortSignal.timeout(20000) })).json();
const post = async (p, body) => (await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })).json();

(async () => {
    const rows = [];
    for (let id = 1; id <= HEADLESS; id++) {
        const row = { name: `headless-${id}`, type: id === 1 ? 'headless (seed)' : 'headless', where: `10.0.0.${10 + id}:9001`, up: false };
        try {
            const r = await post(`/api/nodes/${id}/rpc`, { command: 'status' });
            const s = r.response;
            if (r.status === true && s) Object.assign(row, { up: true, block: +s.chain.block, hash: s.chain.hash, peers: s.network.connected, version: s.version });
        } catch (e) { row.error = e.message; }
        rows.push(row);
    }
    let avds = [];
    try { avds = ((await get('/api/emulator/avds')).avds || []).filter(a => a.running); } catch (e) { rows.push({ name: 'emulator-api', type: 'error', up: false, error: e.message }); }
    for (const a of avds) {
        const row = { name: a.name, type: 'android', where: a.serial, up: false };
        try {
            const s = await get('/api/android-node/status?avd=' + encodeURIComponent(a.name));
            if (s.error) row.error = s.error;
            else if (s.nodeUp) Object.assign(row, { up: true, block: s.block, hash: s.hash, peers: s.connected, port: s.port, version: s.version });
            else row.error = s.installed ? 'node app installed but the node is not started' : 'node app not installed';
        } catch (e) { row.error = e.message; }
        rows.push(row);
    }
    const up = rows.filter(r => r.up);
    let verdict = 'FEWER THAN 2 NODES UP', ok = false;
    if (up.length >= 2) {
        const byBlock = {};
        up.forEach(r => { (byBlock[r.block] = byBlock[r.block] || new Set()).add(r.hash); });
        const fork = Object.keys(byBlock).find(b => byBlock[b].size > 1);
        const spread = Math.max(...up.map(r => r.block)) - Math.min(...up.map(r => r.block));
        if (fork) verdict = `FORK at block ${fork}`;
        else if (spread > 2) verdict = `NOT IN SYNC: blocks differ by ${spread} (a node may still be syncing; a fresh Android node stuck at block 0 is described in docs/TESTBED.md)`;
        else { verdict = `IN SYNC (${up.length} nodes)`; ok = true; }
    }
    if (asJson) console.log(JSON.stringify({ ok, verdict, nodes: rows }, null, 2));
    else {
        const pad = (v, n) => String(v === undefined ? '-' : v).padEnd(n);
        console.log(pad('NODE', 26) + pad('TYPE', 17) + pad('BLOCK', 7) + pad('TIP HASH', 14) + pad('PEERS', 6) + 'WHERE / NOTE');
        rows.forEach(r => console.log(pad(r.name, 26) + pad(r.type, 17) + pad(r.up ? r.block : '-', 7) + pad(r.up ? String(r.hash).slice(0, 12) : '-', 14) + pad(r.up ? r.peers : '-', 6) + (r.up ? `${r.where}${r.port ? ' port ' + r.port : ''}` : `${r.where || ''} ${r.error ? '(' + r.error + ')' : '(down)'}`)));
        console.log('\n' + verdict);
    }
    process.exit(ok ? 0 : 1);
})().catch(e => { console.error('testbed-status failed: ' + e.message + ` (is the Node Manager running at ${BASE}?)`); process.exit(2); });
