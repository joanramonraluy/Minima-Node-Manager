// Test scenarios: runs scripts configured in config.json (`testScenarios`) against the harness and streams
// their output. Mounted at /api/scenarios by server.js.
// SECURITY: the client only picks a scenario id; the argv comes from config.json (never from the request),
// is spawned without a shell, and runs as the real desktop user (SUDO_USER) when the server is root.
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ID_RE = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_OUTPUT = 100 * 1024;

// Defaults: the MinimaAds escrow/channel flow, if its repo is a sibling checkout.
function defaultScenarios(baseDir) {
    const script = path.join(baseDir, '..', 'MinimaAds', 'docs', 'testing', 'tools', 'escrow_flow.py');
    if (!fs.existsSync(script)) return [];
    const n1 = ['--rpc', 'http://10.0.0.11:9005', '--user', 'minima', '--password', '123'];
    const n2 = ['--viewer-rpc', 'http://10.0.0.12:9005', '--viewer-user', 'minima', '--viewer-password', '123'];
    return [
        { id: 'escrow-flow-1-node', name: 'Escrow + channel flow (node 1 only)', description: 'MinimaAds escrow/channel lifecycle with creator and viewer on desktop node 1. Needs node 1 running.', cmd: ['python3', '-I', script, ...n1] },
        { id: 'escrow-flow-2-nodes', name: 'Escrow + channel flow (nodes 1 and 2)', description: 'Creator on desktop node 1, viewer on desktop node 2 (same chain). Needs both nodes running and synced.', cmd: ['python3', '-I', script, ...n1, ...n2] }
    ];
}

module.exports = function createScenariosRouter({ getConfig, emit, baseDir, spawnProc }) {
    const router = express.Router();
    router.use(express.json({ limit: '1kb' }));
    const runs = {}; // id -> { child, output, startedAt, endedAt, exit }
    const spawner = spawnProc || ((cmd, args, opts) => spawn(cmd, args, opts));

    function scenarios() {
        const cfg = getConfig();
        const list = Array.isArray(cfg.testScenarios) && cfg.testScenarios.length ? cfg.testScenarios : defaultScenarios(baseDir);
        return list.filter(s => s && ID_RE.test(s.id || '') && typeof s.name === 'string' && Array.isArray(s.cmd) && s.cmd.length > 0 && s.cmd.every(a => typeof a === 'string'));
    }
    const find = id => scenarios().find(s => s.id === id);

    function realUser() {
        if (process.getuid && process.getuid() === 0) {
            const u = process.env.SUDO_USER;
            return u && u !== 'root' && /^[a-z_][a-z0-9_-]{0,31}$/i.test(u) ? u : null;
        }
        return undefined; // already a normal user
    }

    router.get('/', (req, res) => {
        res.json({ scenarios: scenarios().map(s => {
            const r = runs[s.id];
            return { id: s.id, name: s.name, description: s.description || '', running: !!(r && !r.endedAt), lastRun: r ? { exit: r.exit, startedAt: r.startedAt, endedAt: r.endedAt || null } : null };
        }) });
    });

    router.get('/:id/output', (req, res) => {
        if (!find(req.params.id)) return res.status(404).json({ error: 'Unknown scenario' });
        const r = runs[req.params.id];
        res.json({ output: r ? r.output : '', running: !!(r && !r.endedAt), exit: r ? r.exit : null });
    });

    router.post('/run', (req, res) => {
        const sc = find(req.body && req.body.id);
        if (!sc) return res.status(404).json({ error: 'Unknown scenario' });
        if (runs[sc.id] && !runs[sc.id].endedAt) return res.status(409).json({ error: 'Scenario already running' });
        const user = realUser();
        if (user === null) return res.status(500).json({ error: 'SUDO_USER is not set: scenarios run as the real desktop user' });
        const [cmd, ...args] = sc.cmd;
        const spec = user ? ['sudo', ['-u', user, '-H', cmd, ...args]] : [cmd, args];
        const run = { output: '', startedAt: Date.now(), endedAt: null, exit: null, child: null };
        runs[sc.id] = run;
        const push = text => {
            run.output = (run.output + text).slice(-MAX_OUTPUT);
            emit('scenario-output', { id: sc.id, text });
        };
        push(`$ ${sc.cmd.join(' ')}\n`);
        try {
            run.child = spawner(spec[0], spec[1], { cwd: sc.cwd || os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) {
            run.endedAt = Date.now(); run.exit = -1; push(`[failed to start] ${e.message}\n`);
            return res.status(502).json({ error: e.message });
        }
        run.child.stdout.on('data', d => push(d.toString()));
        run.child.stderr.on('data', d => push(d.toString()));
        run.child.on('error', e => { push(`[error] ${e.message}\n`); });
        run.child.on('close', code => {
            run.endedAt = Date.now(); run.exit = code;
            push(`\n[exit ${code}] ${code === 0 ? 'PASSED' : 'FAILED'} in ${Math.round((run.endedAt - run.startedAt) / 1000)}s\n`);
            emit('scenario-done', { id: sc.id, exit: code });
        });
        res.json({ ok: true, id: sc.id });
    });

    router.post('/stop', (req, res) => {
        const r = runs[req.body && req.body.id];
        if (!r || r.endedAt || !r.child) return res.status(409).json({ error: 'Scenario is not running' });
        r.child.kill('SIGTERM');
        res.json({ ok: true });
    });

    router._scenarios = scenarios;
    return router;
};
