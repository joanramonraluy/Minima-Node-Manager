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

module.exports = function createEmulatorRouter({ getConfig, getAdbEnv, log }) {
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

    function runCapture(cmd, args, timeoutMs = 8000) {
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
                avds: avds.map(name => ({ name, running: !!running[name], serial: running[name] || null, launching: !!launching[name] })),
                devices
            });
        } catch (e) {
            res.status(502).json({ error: e.message });
        }
    });

    // Builds the exact spawn spec (exported for testing; does not spawn anything).
    function buildLaunch(avd) {
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
        const emuArgs = ['-avd', avd, ...extra];
        if (user.root) return { cmd: 'sudo', args: ['-u', user.name, '-H', 'env', ...envVars, emu, ...emuArgs] };
        return { cmd: 'env', args: [...envVars, emu, ...emuArgs] };
    }
    router._buildLaunch = buildLaunch;

    router.post('/launch', async (req, res) => {
        const avd = req.body && req.body.avd;
        if (typeof avd !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(avd)) return res.status(400).json({ error: 'Invalid AVD name' });
        try {
            const avds = await listAvds();
            if (!avds.includes(avd)) return res.status(404).json({ error: 'Unknown AVD' });
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
            const spec = buildLaunch(avd);
            const logPath = path.join(os.tmpdir(), `emulator-${avd}.log`);
            const fd = fs.openSync(logPath, 'a');
            const child = spawn(spec.cmd, spec.args, { detached: true, stdio: ['ignore', fd, fd] });
            child.on('error', e => log(`[Emulator] Failed to launch ${avd}: ${e.message}`));
            child.on('exit', () => { delete launching[avd]; });
            child.unref();
            fs.closeSync(fd);
            launching[avd] = { pid: child.pid, since: Date.now() };
            log(`[Emulator] Launching ${avd} as the desktop user (log: ${logPath})...`);
            watchBoot(avd);
            res.json({ ok: true, status: 'launching', log: logPath });
        } catch (e) {
            res.status(502).json({ error: e.message });
        }
    });

    function watchBoot(avd) {
        let tries = 0;
        const t = setInterval(async () => {
            tries++;
            if (tries > 60) { clearInterval(t); log(`[Emulator] ${avd}: boot not detected after 3 min (check the emulator log).`); return; }
            try {
                const running = await runningMap(await adbDevices());
                const serial = running[avd];
                if (!serial) return;
                const boot = (await runCapture(getConfig().adbPath || 'adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 4000)).trim();
                if (boot === '1') { clearInterval(t); log(`[Emulator] ${avd} booted (${serial}).`); }
            } catch (e) { /* keep polling */ }
        }, 3000);
    }

    return router;
};
