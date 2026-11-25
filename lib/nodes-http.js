// HTTP control of the headless nodes (Core mode), so a script or agent can start and stop them without the UI.
// Mounted at /api/nodes by server.js. It exposes what the Socket.IO events 'start-node' / 'stop-node' /
// 'stop-all' already do; nothing new can be done through it. Core mode only: Classic nodes need the command
// built by the UI (host mode, connect, advanced parameters).
// SECURITY: like Socket.IO, these endpoints start and stop root-owned processes without authentication;
// server.js refuses cross-origin browser requests. The node id is an integer 1..26; no client value reaches a shell.
const express = require('express');

module.exports = function createNodesRouter({ isCoreMode, getConfig, nodeProcesses, startNode, stopNode, stopAll, nodeCount }) {
    const router = express.Router();
    router.use(express.json({ limit: '1kb' }));

    function checkReady(res) {
        if (!isCoreMode()) { res.status(409).json({ error: 'HTTP start/stop is for Core mode (switch the mode in the UI). Classic nodes are started from the UI.' }); return false; }
        const cfg = getConfig();
        if (!cfg.coreJarPath || !cfg.coreLibsPath) { res.status(409).json({ error: 'coreJarPath / coreLibsPath are not set in config.json (see README, "Core mode")' }); return false; }
        return true;
    }
    const parseId = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= nodeCount ? n : null; };

    // Which node processes the manager is running (children of this server)
    router.get('/', (req, res) => {
        const running = Object.keys(nodeProcesses).map(Number).filter(n => nodeProcesses[n]).sort((a, b) => a - b);
        res.json({ mode: isCoreMode() ? 'core' : 'classic', running });
    });

    // Start nodes 1..count (default 2, the UI default). Node 1 is the seed. Nodes already running are left alone.
    router.post('/start-all', (req, res) => {
        if (!checkReady(res)) return;
        const body = req.body || {};
        const count = body.count === undefined ? 2 : parseId(body.count);
        if (count === null) return res.status(400).json({ error: `count must be an integer 1-${nodeCount}` });
        const started = [], alreadyRunning = [];
        for (let id = 1; id <= count; id++) {
            if (nodeProcesses[id]) { alreadyRunning.push(id); continue; }
            startNode(id, {});
            started.push(id);
        }
        res.json({ ok: true, started, alreadyRunning, note: 'Nodes take a few seconds to boot; poll POST /api/nodes/<id>/rpc {"command":"status"} or scripts/testbed-status.js' });
    });

    router.post('/stop-all', (req, res) => {
        if (!isCoreMode()) return res.status(409).json({ error: 'HTTP start/stop is for Core mode' });
        stopAll();
        res.json({ ok: true });
    });

    router.post('/:id/start', (req, res) => {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: `Invalid node id (1-${nodeCount})` });
        if (!checkReady(res)) return;
        const body = req.body || {};
        if (body.clean !== undefined && typeof body.clean !== 'boolean') return res.status(400).json({ error: '"clean" must be true or false' });
        if (body.allowGenMessage !== undefined && typeof body.allowGenMessage !== 'boolean') return res.status(400).json({ error: '"allowGenMessage" must be true or false' });
        if (nodeProcesses[id]) return res.json({ ok: true, id, status: 'already running' });
        // clean:true passes -clean: it DELETES the node's chain and wallet before starting
        startNode(id, { clean: body.clean === true, allowGenMessage: body.allowGenMessage === true });
        res.json({ ok: true, id, status: 'starting', clean: body.clean === true, allowGenMessage: body.allowGenMessage === true });
    });

    router.post('/:id/stop', (req, res) => {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: `Invalid node id (1-${nodeCount})` });
        if (!isCoreMode()) return res.status(409).json({ error: 'HTTP start/stop is for Core mode' });
        stopNode(id);
        res.json({ ok: true, id, status: 'stopping' });
    });

    return router;
};
