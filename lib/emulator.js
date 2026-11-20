// Android emulator (AVD) list/launch API. Mounted at /api/emulator by server.js.
// The emulator is launched as the REAL desktop user (SUDO_USER when the server runs as root),
// detached, so restarting the Node Manager does not kill it.
// SECURITY: the AVD name must exactly match one returned by `emulator -list-avds`; all processes
// are spawned with argument arrays (never a shell string); no endpoint takes arbitrary commands/paths.
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

// `run` / `spawnProc` / `avdRoot` can be injected (used by test/emulator.test.js with a mocked adb).
module.exports = function createEmulatorRouter({ getConfig, getAdbEnv, log, run, spawnProc, avdRoot }) {
    const router = express.Router();
    router.use(express.json({ limit: '2kb' }));
    const launching = {}; // avd -> { pid, since }

    function sdkPath() {
        const cfg = getConfig();
        if (cfg.androidSdkPath) return cfg.androidSdkPath;
        const adb = cfg.adbPath || '';
        if (path.basename(adb) === 'adb' && path.basename(path.dirname(adb)) === 'platform-tools') {
            return path.dirname(path.dirname(adb));
        }
        return '';
    }

    // Who runs the emulator: SUDO_USER when root, otherwise the current (already real) user.
    function realUser() {
        if (process.getuid && process.getuid() === 0) {
            const u = process.env.SUDO_USER;
            if (!u || u === 'root' || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(u)) return null;
            return { name: u, root: true };
        }
        return { name: os.userInfo().username, root: false };
    }

    function userUid(user) {
        return parseInt(execFileSync('id', ['-u', user.name]).toString().trim(), 10);
    }

    function realRunCapture(cmd, args, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const child = spawn(cmd, args, { env: getAdbEnv() });
            let out = '', err = '';
            const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, timeoutMs);
            child.stdout.on('data', d => out += d);
            child.stderr.on('data', d => err += d);
            child.on('error', e => { clearTimeout(timer); reject(e); });
            child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(err.trim() || `exit ${code}`)); });
        });
    }

    const runCapture = run || realRunCapture;
    const spawnDetached = spawnProc || ((cmd, args, stdio) => spawn(cmd, args, { detached: true, stdio }));

    async function listAvds() {
        const sdk = sdkPath();
        const emu = path.join(sdk, 'emulator', 'emulator');
        if (!sdk || !fs.existsSync(emu)) throw new Error('Android SDK emulator not found (set androidSdkPath or adbPath in config.json)');
        const user = realUser();
        if (!user) throw new Error('SUDO_USER is not set: the emulator must run as the real desktop user (start the server with sudo)');
        const env = ['env', `ANDROID_HOME=${sdk}`, `ANDROID_SDK_ROOT=${sdk}`];
        let out;
        if (user.root) out = await runCapture('sudo', ['-u', user.name, '-H', ...env, emu, '-list-avds']);
        else out = await runCapture(emu, ['-list-avds'], 8000);
        return out.split('\n').map(s => s.trim()).filter(s => /^[A-Za-z0-9._-]+$/.test(s));
    }

    async function adbDevices() {
        const out = await runCapture(getConfig().adbPath || 'adb', ['devices']);
        return out.split('\n').filter(l => l.includes('\t')).map(l => {
            const [id, state] = l.split('\t');
            return { id: id.trim(), state: state.trim() };
        });
    }

    async function runningMap(devices) {
        const map = {}; // avd -> serial
        await Promise.all(devices.filter(d => d.id.startsWith('emulator-') && d.state === 'device').map(async d => {
            try {
                const out = await runCapture(getConfig().adbPath || 'adb', ['-s', d.id, 'emu', 'avd', 'name'], 4000);
                const name = out.split('\n')[0].trim();
                if (name) map[name] = d.id;
            } catch (e) { /* ignore */ }
        }));
        return map;
    }

    router.get('/avds', async (req, res) => {
        try {
            const [avds, devices] = await Promise.all([listAvds(), adbDevices().catch(() => [])]);
            const running = await runningMap(devices);
            res.json({
                avds: avds.map(name => ({ name, running: !!running[name], serial: running[name] || null, launching: !!launching[name] && !running[name] })),
                devices
            });
        } catch (e) {
            res.status(502).json({ error: e.message });
        }
    });

    // Builds the exact spawn spec (exported for testing; does not spawn anything).
    function buildLaunch(avd, resumeArgs = []) {
        const cfg = getConfig();
        const sdk = sdkPath();
        const emu = path.join(sdk, 'emulator', 'emulator');
        const user = realUser();
        if (!user) throw new Error('SUDO_USER is not set: the emulator must run as the real desktop user (start the server with sudo)');
        const extra = Array.isArray(cfg.emulatorArgs) ? cfg.emulatorArgs.filter(a => typeof a === 'string' && a.length <= 100) : ['-gpu', 'host'];
        const uid = userUid(user);
        const runDir = `/run/user/${uid}`;
        const envVars = [`ANDROID_HOME=${sdk}`, `ANDROID_SDK_ROOT=${sdk}`, `XDG_RUNTIME_DIR=${runDir}`];
        let entries = [];
        try { entries = fs.readdirSync(runDir); } catch (e) { /* ignore */ }
        const wl = entries.filter(f => /^wayland-\d+$/.test(f)).sort()[0];
        if (wl) envVars.push(`WAYLAND_DISPLAY=${wl}`);
        envVars.push(`DISPLAY=${process.env.DISPLAY || ':0'}`);
        const xauth = entries.find(f => /^(\.mutter-Xwaylandauth\.|xauth_)/.test(f));
        if (xauth) envVars.push(`XAUTHORITY=${path.join(runDir, xauth)}`);
        const emuArgs = ['-avd', avd, ...extra, ...resumeArgs];
        if (user.root) return { cmd: 'sudo', args: ['-u', user.name, '-H', 'env', ...envVars, emu, ...emuArgs] };
        return { cmd: 'env', args: [...envVars, emu, ...emuArgs] };
    }
    router._buildLaunch = buildLaunch;

    async function launchHandler(req, res) {
        const avd = req.body && req.body.avd;
        if (typeof avd !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(avd)) return res.status(400).json({ error: 'Invalid AVD name' });
        try {
            const avds = await listAvds();
            if (!avds.includes(avd)) return res.status(404).json({ error: 'Unknown AVD' });
            // Resume mode: quickboot (default), a named saved snapshot, or cold boot
            const resume = (req.body && req.body.resume) || { mode: 'quickboot' };
            let resumeArgs = [];
            if (resume.mode === 'cold') resumeArgs = ['-no-snapshot-load'];
            else if (resume.mode === 'snapshot') {
                if (typeof resume.name !== 'string' || !NAME_RE.test(resume.name)) return res.status(400).json({ error: 'Invalid snapshot name' });
                if (!(await stoppedSnapshots(avd)).includes(resume.name)) return res.status(404).json({ error: 'Unknown snapshot' });
                resumeArgs = ['-snapshot', resume.name];
            } else if (resume.mode !== 'quickboot') return res.status(400).json({ error: 'Invalid resume mode' });
            const running = await runningMap(await adbDevices().catch(() => []));
            if (running[avd]) {
                log(`[Emulator] ${avd} is already running (${running[avd]}).`);
                return res.json({ ok: true, status: 'already running', serial: running[avd] });
            }
            const prev = launching[avd];
            if (prev) {
                let alive = true;
                try { process.kill(prev.pid, 0); } catch (e) { alive = false; }
                if (alive) {
                    log(`[Emulator] ${avd} is already starting (pid ${prev.pid}).`);
                    return res.json({ ok: true, status: 'already starting' });
                }
                delete launching[avd];
            }
            const spec = buildLaunch(avd, resumeArgs);
            const logPath = path.join(os.tmpdir(), `emulator-${avd}.log`);
            const fd = fs.openSync(logPath, 'a');
            const child = spawnDetached(spec.cmd, spec.args, ['ignore', fd, fd]);
            child.on('error', e => log(`[Emulator] Failed to launch ${avd}: ${e.message}`));
            child.on('exit', () => { delete launching[avd]; });
            child.unref();
            fs.closeSync(fd);
            launching[avd] = { pid: child.pid, since: Date.now() };
            log(`[Emulator] Launching ${avd} (${resume.mode}${resumeArgs.length ? ' ' + resumeArgs.join(' ') : ''}) as the desktop user (log: ${logPath})...`);
            watchBoot(avd);
            res.json({ ok: true, status: 'launching', log: logPath });
        } catch (e) {
            res.status(502).json({ error: e.message });
        }
    }
    router.post('/launch', (req, res) => withLock(String((req.body && req.body.avd) || ''), () => launchHandler(req, res)));

    // Launch every AVD that is not running/starting, one at a time with a pause (default quickboot).
    function callLaunch(avd) {
        return new Promise(resolve => {
            const shim = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, ...j }); } };
            withLock(avd, () => launchHandler({ body: { avd } }, shim));
        });
    }
    router.post('/launch-all', async (req, res) => {
        try {
            const avds = await listAvds();
            const running = await runningMap(await adbDevices().catch(() => []));
            const plan = avds.map(name => ({
                name,
                plan: running[name] ? 'already running' : (launching[name] ? 'already starting' : 'launch')
            }));
            res.json({ ok: true, avds: plan });
            router._launchAllDone = (async () => {
                const pauseMs = getConfig().emulatorLaunchPauseMs !== undefined ? getConfig().emulatorLaunchPauseMs : 3000;
                for (const item of plan) {
                    if (item.plan !== 'launch') { log(`[Emulator] ${item.name}: ${item.plan}.`); continue; }
                    const r = await callLaunch(item.name);
                    if (r.error) log(`[Emulator] ${item.name}: ${r.error}`);
                    if (pauseMs) await new Promise(r2 => setTimeout(r2, pauseMs));
                }
                log('[Emulator] Open All finished.');
            })().catch(e => log(`[Emulator] Open All failed: ${e.message}`));
        } catch (e) {
            res.status(502).json({ error: e.message });
        }
    });


    // ---------------- Sessions (snapshots), stop, port forwards ----------------

    // Per-AVD serialization of mutating operations
    const locks = {};
    function withLock(avd, fn) {
        const next = (locks[avd] || Promise.resolve()).catch(() => { }).then(fn);
        locks[avd] = next;
        return next;
    }

    class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
    const adbBin = () => getConfig().adbPath || 'adb';

    // Validates the AVD name (must be in `emulator -list-avds`) and returns it.
    async function checkAvd(name) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new HttpError(400, 'Invalid AVD name');
        if (!(await listAvds()).includes(name)) throw new HttpError(404, 'Unknown AVD');
        return name;
    }
    // Serial of the running AVD (serial is taken from `adb devices`, never from the client).
    async function serialOf(avd) {
        return (await runningMap(await adbDevices()))[avd] || null;
    }
    async function needRunning(avd) {
        const serial = await serialOf(avd);
        if (!serial) throw new HttpError(409, 'AVD is not running');
        return serial;
    }
    function checkName(name) {
        if (typeof name !== 'string' || !NAME_RE.test(name)) throw new HttpError(400, 'Invalid snapshot name');
        return name;
    }

    // Real user's AVD root directory (~/.android/avd of SUDO_USER, or the injected test root)
    function avdRootDir() {
        let root = avdRoot ? avdRoot() : null;
        if (!root) {
            const user = realUser();
            if (!user) throw new HttpError(500, 'SUDO_USER is not set');
            let home = os.homedir();
            if (user.root) {
                const line = execFileSync('getent', ['passwd', user.name]).toString().trim().split(':');
                home = line[5];
            }
            root = path.join(home, '.android', 'avd');
        }
        return root;
    }

    // Real user's AVD directory (read-only). Uses the AVD .ini `path=` entry when present.
    function snapshotDir(avd) {
        const root = avdRootDir();
        let dir = path.join(root, `${avd}.avd`);
        try {
            const ini = fs.readFileSync(path.join(root, `${avd}.ini`), 'utf8');
            const m = ini.match(/^path=(.+)$/m);
            if (m) dir = m[1].trim();
        } catch (e) { /* default dir */ }
        return path.join(dir, 'snapshots');
    }
    async function stoppedSnapshots(avd) {
        try {
            return fs.readdirSync(snapshotDir(avd), { withFileTypes: true })
                .filter(d => d.isDirectory() && NAME_RE.test(d.name)).map(d => d.name).sort();
        } catch (e) { return []; }
    }
    // Parses `emu avd snapshot list` output (header/OK lines skipped; TAG is the 2nd column).
    function parseSnapshotList(out) {
        const names = [];
        for (const line of out.split('\n')) {
            const t = line.trim();
            if (!t || /^(List of|ID\b|OK\b|KO\b)/.test(t)) continue;
            const parts = t.split(/\s+/);
            if (parts.length >= 2 && NAME_RE.test(parts[1])) names.push(parts[1]);
        }
        return names;
    }
    async function runningSnapshots(serial) {
        return parseSnapshotList(await runCapture(adbBin(), ['-s', serial, 'emu', 'avd', 'snapshot', 'list'], 10000));
    }
    async function emuSnapshotCmd(serial, sub, name) {
        const out = await runCapture(adbBin(), ['-s', serial, 'emu', 'avd', 'snapshot', sub, name], 60000);
        if (/^KO/m.test(out)) throw new HttpError(502, `snapshot ${sub} failed: ${out.trim()}`);
        return out;
    }

    function wrap(handler) {
        return async (req, res) => {
            try { res.json(await handler(req)); }
            catch (e) { res.status(e instanceof HttpError ? e.code : 502).json({ error: e.message }); }
        };
    }

    router.get('/snapshots', wrap(async (req) => {
        const avd = await checkAvd(req.query.avd);
        const serial = await serialOf(avd);
        return { avd, running: !!serial, snapshots: serial ? await runningSnapshots(serial) : await stoppedSnapshots(avd) };
    }));

    for (const op of ['save', 'load', 'delete']) {
        router.post(`/snapshots/${op}`, wrap((req) => {
            const body = req.body || {};
            return withLock(String(body.avd), async () => {
                const avd = await checkAvd(body.avd);
                const name = checkName(body.name);
                const serial = await needRunning(avd);
                if (op !== 'save' && !(await runningSnapshots(serial)).includes(name)) throw new HttpError(404, 'Unknown snapshot');
                log(`[Emulator] ${avd}: snapshot ${op} '${name}'...`);
                await emuSnapshotCmd(serial, op, name);
                log(`[Emulator] ${avd}: snapshot ${op} '${name}' done.`);
                return { ok: true };
            });
        }));
    }

    router.post('/stop', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const saveAs = body.saveAs ? checkName(body.saveAs) : null;
            const serial = await needRunning(avd);
            if (saveAs) {
                log(`[Emulator] ${avd}: saving snapshot '${saveAs}' before stopping...`);
                await emuSnapshotCmd(serial, 'save', saveAs);
                log(`[Emulator] ${avd}: snapshot '${saveAs}' saved.`);
            }
            log(`[Emulator] ${avd}: stopping (${serial})...`);
            await runCapture(adbBin(), ['-s', serial, 'emu', 'kill'], 15000);
            const waitMs = (getConfig().emulatorStopPollMs || 1000);
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, waitMs));
                const still = (await adbDevices().catch(() => [])).some(d => d.id === serial);
                if (!still) { log(`[Emulator] ${avd} stopped.`); return { ok: true, status: 'stopped' }; }
            }
            log(`[Emulator] ${avd}: still listed by adb after 30s.`);
            throw new HttpError(504, 'Emulator did not exit in time');
        });
    }));

    // Port forwards (`adb -s <serial> forward ...`), filtered by serial
    async function listForwards(serial) {
        const out = await runCapture(adbBin(), ['forward', '--list'], 6000);
        return out.split('\n').map(l => l.trim().split(/\s+/)).filter(p => p.length === 3 && p[0] === serial)
            .map(p => ({ hostPort: parseInt(p[1].replace('tcp:', ''), 10), guestPort: parseInt(p[2].replace('tcp:', ''), 10) }))
            .filter(f => p_ok(f.hostPort) && p_ok(f.guestPort));
    }
    const p_ok = n => Number.isInteger(n);
    function checkPort(v, lo, hi, label) {
        if (!Number.isInteger(v) || v < lo || v > hi) throw new HttpError(400, `${label} must be an integer ${lo}-${hi}`);
        return v;
    }

    router.get('/forwards', wrap(async (req) => {
        const avd = await checkAvd(req.query.avd);
        const serial = await needRunning(avd);
        return { avd, serial, forwards: await listForwards(serial) };
    }));
    router.post('/forwards/add', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const hostPort = checkPort(body.hostPort, 20000, 60000, 'hostPort');
            const guestPort = checkPort(body.guestPort, 1024, 65535, 'guestPort');
            const serial = await needRunning(avd);
            await runCapture(adbBin(), ['-s', serial, 'forward', `tcp:${hostPort}`, `tcp:${guestPort}`], 6000);
            log(`[Emulator] ${avd}: forward tcp:${hostPort} -> tcp:${guestPort}`);
            return { ok: true };
        });
    }));
    router.post('/forwards/remove', wrap((req) => {
        const body = req.body || {};
        return withLock(String(body.avd), async () => {
            const avd = await checkAvd(body.avd);
            const hostPort = checkPort(body.hostPort, 20000, 60000, 'hostPort');
            const serial = await needRunning(avd);
            if (!(await listForwards(serial)).some(f => f.hostPort === hostPort)) throw new HttpError(404, 'No such forward for this device');
            await runCapture(adbBin(), ['-s', serial, 'forward', '--remove', `tcp:${hostPort}`], 6000);
            log(`[Emulator] ${avd}: removed forward tcp:${hostPort}`);
            return { ok: true };
        });
    }));

    // Creates a new AVD by cloning the config of an existing one (no cmdline-tools/avdmanager needed).
    // The system image is the template's, so it must already be installed. Writes only
    // <avdRoot>/<name>.ini and <avdRoot>/<name>.avd/config.ini, owned by the real desktop user.
    const AVD_NEW_RE = /^[A-Za-z0-9_-]{1,40}$/;
    router.post('/create', wrap(async (req) => {
        const body = req.body || {};
        const name = body.name;
        if (typeof name !== 'string' || !AVD_NEW_RE.test(name)) throw new HttpError(400, 'Invalid AVD name (letters, digits, _ and -, max 40)');
        const dataSize = body.dataSize === undefined ? '8G' : body.dataSize;
        if (typeof dataSize !== 'string' || !/^[1-9]\d?G$/.test(dataSize)) throw new HttpError(400, 'dataSize must look like 8G (1G-99G)');
        return withLock('create:' + name, async () => {
            const avds = await listAvds();
            if (avds.includes(name)) throw new HttpError(409, 'An AVD with that name already exists');
            const template = body.template === undefined ? avds[0] : body.template;
            if (!avds.includes(template)) throw new HttpError(404, 'Unknown template AVD (create one in Android Studio first)');
            const root = avdRootDir();
            // Template config.ini: from its .ini `path=`, else <root>/<template>.avd
            let tdir = path.join(root, `${template}.avd`);
            let target = '';
            try {
                const ini = fs.readFileSync(path.join(root, `${template}.ini`), 'utf8');
                const m = ini.match(/^path=(.+)$/m); if (m) tdir = m[1].trim();
                const t = ini.match(/^target=(.+)$/m); if (t) target = t[1].trim();
            } catch (e) { /* default */ }
            let cfg;
            try { cfg = fs.readFileSync(path.join(tdir, 'config.ini'), 'utf8'); }
            catch (e) { throw new HttpError(502, `Cannot read the template config (${tdir}/config.ini)`); }
            const set = (txt, key, val) => {
                const re = new RegExp(`^${key.replace(/\./g, '\\.')}=.*$`, 'm');
                return re.test(txt) ? txt.replace(re, `${key}=${val}`) : txt.replace(/\n?$/, `\n${key}=${val}\n`);
            };
            cfg = set(cfg, 'AvdId', name);
            cfg = set(cfg, 'avd.ini.displayname', name.replace(/_/g, ' '));
            cfg = set(cfg, 'disk.dataPartition.size', dataSize);
            cfg = cfg.replace(/^hw\.device\.hash2=.*\n?/m, '');
            const newDir = path.join(root, `${name}.avd`);
            const newIni = path.join(root, `${name}.ini`);
            if (fs.existsSync(newDir) || fs.existsSync(newIni)) throw new HttpError(409, 'AVD files already exist');
            fs.mkdirSync(newDir, { recursive: true });
            fs.writeFileSync(path.join(newDir, 'config.ini'), cfg);
            fs.writeFileSync(newIni, `avd.ini.encoding=UTF-8\npath=${newDir}\npath.rel=avd/${name}.avd\n${target ? `target=${target}\n` : ''}`);
            const user = realUser();
            if (user && user.root) {
                const uid = userUid(user);
                const gid = parseInt(execFileSync('id', ['-g', user.name]).toString().trim(), 10);
                for (const f of [newDir, path.join(newDir, 'config.ini'), newIni]) fs.chownSync(f, uid, gid);
            }
            log(`[Emulator] Created AVD ${name} from ${template} (data ${dataSize}).`);
            return { ok: true, name, template };
        });
    }));

    // Shared with lib/android-node.js (CoreTestNode on a running AVD)
    router._helpers = { checkAvd, needRunning, withLock, HttpError, wrap, runCapture, adbBin };

    function watchBoot(avd) {
        let tries = 0;
        const t = setInterval(async () => {
            tries++;
            if (tries > 60) { clearInterval(t); log(`[Emulator] ${avd}: boot not detected after 3 min. Check /tmp/emulator-${avd}.log and the desktop: after a crash the emulator can wait on an "Android Emulator closed unexpectedly" dialog that must be dismissed by hand.`); return; }
            try {
                const running = await runningMap(await adbDevices());
                const serial = running[avd];
                if (!serial) return;
                const boot = (await runCapture(getConfig().adbPath || 'adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 4000)).trim();
                if (boot === '1') { clearInterval(t); log(`[Emulator] ${avd} booted (${serial}).`); }
            } catch (e) { /* keep polling */ }
        }, 3000);
        t.unref();
    }

    return router;
};
