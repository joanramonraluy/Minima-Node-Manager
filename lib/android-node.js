// "Android node" API: runs a Minima Core node inside a running AVD through CoreTestNode
// (development-only app from MinimaAds: docs/testing/tools/core-test-node). Mounted at /api/android-node.
// The official Core app cannot be given node parameters, so it cannot join a private chain; CoreTestNode can.
// SECURITY: the AVD must be a running AVD (helpers.needRunning); the serial comes from `adb devices`, never
// from the client; node parameters are built here from validated values; the Minima command sent to the node
// is restricted to printable ASCII and single-quote escaped for the device shell. All host-side processes
// are spawned with argument arrays.
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

const PKG = 'org.minima.coretestnode';
// Every emulator reaches the seed through the host bridge, so the seed sees all Android nodes as
// 10.0.0.1:<port>. Minima sends the initial block download (the chain) only ONCE per host:port until the
// seed restarts, so two nodes (or a wiped node) on the same port never sync. Hence a different port per start.
const PORT_LO = 12001, PORT_HI = 12999;
const randomPort = () => crypto.randomInt(PORT_LO, PORT_HI + 1);
const DEFAULT_SEED = '10.0.0.11:9001'; // node 1 (-solo) of the desktop harness, reachable from the emulator
const SEED_RE = /^[A-Za-z0-9.-]{1,100}:\d{1,5}$/;
const CMD_RE = /^[\x20-\x7e]{1,300}$/;

module.exports = function createAndroidNodeRouter({ getConfig, log, helpers, pickPort = randomPort }) {
    const { checkAvd, needRunning, withLock, HttpError, wrap, runCapture, adbBin } = helpers;
    const router = express.Router();
    router.use(express.json({ limit: '2kb' }));

    // adb errors can be whole Java stack traces: keep the line that says what failed
    function shortErr(e) {
        const lines = String(e && e.message || e).split('\n').map(l => l.trim()).filter(Boolean);
        const hit = lines.find(l => /INSTALL_FAILED\w+|Failure \[|Caused by:|error:/i.test(l)) || lines[0] || 'unknown error';
        return hit.slice(0, 200);
    }
    const adb = (serial, args, timeoutMs = 10000) => runCapture(adbBin(), ['-s', serial, ...args], timeoutMs);

    function apkPath() {
        const cfg = getConfig();
        const candidates = [
            cfg.coreTestNodeApk,
            path.join(__dirname, '..', 'core', 'CoreTestNode.apk'),
            path.join(__dirname, '..', '..', 'MinimaAds', 'docs', 'testing', 'tools', 'core-test-node', 'CoreTestNode.apk')
        ].filter(Boolean);
        return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
    }

    function seedAddress() {
        const s = getConfig().androidSeedHost || DEFAULT_SEED;
        if (!SEED_RE.test(s)) throw new HttpError(500, `Invalid androidSeedHost in config.json: ${s}`);
        return s;
    }

    async function isInstalled(serial) {
        const out = await adb(serial, ['shell', 'pm', 'list', 'packages', PKG], 8000);
        return out.split('\n').some(l => l.trim() === `package:${PKG}`);
    }

    // Sends a command to the node (broadcast) and reads the chunked reply from logcat (tag CoreTestNode).
    async function nodeCmd(serial, command, waitMs = 15000) {
        if (typeof command !== 'string' || !CMD_RE.test(command)) throw new HttpError(400, 'Invalid command (printable ASCII, max 300 chars)');
        const id = 'r' + Math.random().toString(36).slice(2, 10);
        const q = command.replace(/'/g, `'\\''`);
        await adb(serial, ['shell', `am broadcast -a ${PKG}.CMD -p ${PKG} --es id ${id} --es cmd '${q}'`], 8000);
        const pollMs = getConfig().androidNodePollMs || 500;
        const deadline = Date.now() + waitMs;
        const re = new RegExp(`RESULT ${id} (\\d+)/(\\d+) (.*)$`);
        while (Date.now() < deadline) {
            const out = await adb(serial, ['logcat', '-d', '-s', 'CoreTestNode'], 8000).catch(() => '');
            const chunks = {};
            let total = 0;
            for (const line of out.split('\n')) {
                const m = line.match(re);
                if (m) { chunks[+m[1]] = m[3]; total = +m[2]; }
            }
            if (total > 0 && Object.keys(chunks).length >= total) {
                const text = Object.keys(chunks).map(Number).sort((a, b) => a - b).map(k => chunks[k]).join('');
                try { return JSON.parse(text); } catch (e) { return { raw: text }; }
            }
            await new Promise(r => setTimeout(r, pollMs));
        }
        throw new HttpError(504, 'No reply from CoreTestNode (is the node started?)');
    }

    router.get('/status', wrap(async (req) => {
        const avd = await checkAvd(req.query.avd);
        const info = { avd, running: false, installed: false, nodeUp: false, apk: !!apkPath() };
        let serial;
        try { serial = await needRunning(avd); } catch (e) { return info; }
        info.running = true; info.serial = serial;
        info.installed = await isInstalled(serial);
        if (!info.installed) return info;
        try {
            const r = await nodeCmd(serial, 'status', getConfig().androidNodeStatusWaitMs || 4000);
            const s = r.response || {};
            info.nodeUp = r.status === true;
            if (info.nodeUp) {
                info.version = s.version;
                info.block = s.chain && s.chain.block;
                info.hash = s.chain && s.chain.hash;
                info.connected = s.network && s.network.connected;
                info.port = s.network && s.network.port;
                info.uptime = s.uptime;
            }
        } catch (e) { /* node not started: nodeUp stays false */ }
        return info;
    }));

    router.post('/install', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const serial = await needRunning(avd);
            const apk = apkPath();
            if (!apk) throw new HttpError(404, 'CoreTestNode.apk not found (set coreTestNodeApk in config.json)');
            log(`[AndroidNode] ${avd}: installing CoreTestNode...`);
            try { await adb(serial, ['install', '-r', apk], 120000); }
            catch (e) { throw new HttpError(502, 'install failed: ' + shortErr(e)); }
            log(`[AndroidNode] ${avd}: CoreTestNode installed.`);
            return { ok: true };
        });
    }));

    // mode: 'connect' (join the desktop seed) or 'solo' (own private chain)
    function buildParams(mode, port) {
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new HttpError(400, 'port must be an integer 1024-65535');
        if (mode === 'solo') return `-solo -port ${port}`;
        if (mode === 'connect') return `-test -nop2p -connect ${seedAddress()} -port ${port}`;
        throw new HttpError(400, "mode must be 'connect' or 'solo'");
    }
    router._buildParams = buildParams;

    router.post('/start', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const serial = await needRunning(avd);
            if (!(await isInstalled(serial))) throw new HttpError(409, 'CoreTestNode is not installed on this AVD');
            const params = buildParams(body.mode || 'connect', body.port === undefined ? pickPort() : body.port);
            // Restart cleanly; the chain data survives (it lives in the app files dir)
            await adb(serial, ['shell', 'am', 'force-stop', PKG], 8000);
            log(`[AndroidNode] ${avd}: starting node (${params})...`);
            // The parameters travel inside one single-quoted argument of the device shell
            await adb(serial, ['shell', `am start-foreground-service -n ${PKG}/.NodeService --es params '${params}'`], 10000);
            return { ok: true, params };
        });
    }));

    router.post('/stop', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const serial = await needRunning(avd);
            await adb(serial, ['shell', 'am', 'force-stop', PKG], 8000);
            log(`[AndroidNode] ${avd}: node stopped.`);
            return { ok: true };
        });
    }));

    router.post('/wipe', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const serial = await needRunning(avd);
            await adb(serial, ['shell', 'am', 'force-stop', PKG], 8000);
            await adb(serial, ['shell', 'pm', 'clear', PKG], 15000);
            log(`[AndroidNode] ${avd}: node data wiped (fresh chain on next start).`);
            return { ok: true };
        });
    }));

    router.post('/cmd', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const serial = await needRunning(avd);
            return { reply: await nodeCmd(serial, body.command) };
        });
    }));

    return router;
};
