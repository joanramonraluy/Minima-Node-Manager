// Android nodes (emulators + CoreTestNode), Core network overview, bulk actions.
// Loaded after app.js; uses its globals (addToGlobalLog, socket, visibleNodes, ...) at call time.

// --- Android nodes: AVDs with Start (resume-from), Stop (save first), Snapshots, Port forwards. Both modes. ---
const androidOpenDrawers = new Set(); // "avd:snap" / "avd:fwd" drawers that stay open across refreshes

function emuApi(method, url, body) {
    return fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json().then(j => ({ ok: r.ok, j })));
}
function emuLog(msg) { if (typeof addToGlobalLog === 'function') addToGlobalLog(msg); }
function mk(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    kids.forEach(k => e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
    return e;
}

function buildAvdRow(avd, index) {
    const li = mk('li', { className: 'avd-card' });
    const name = mk('a', { textContent: avd.name, className: 'avd-name', title: 'Start (uses the resume-from selector)' });
    const status = mk('span', { className: 'avd-state ' + (avd.running ? 'on' : 'off'), textContent: avd.running ? `running (${avd.serial})` : (avd.launching ? 'starting...' : 'stopped') });
    li.append(name, status);

    const doAction = (promise, okMsg) => promise.then(({ ok, j }) => {
        if (!ok) emuLog(`[Emulator] ${j.error || 'error'}`); else if (okMsg) emuLog(`[Emulator] ${okMsg(j)}`);
        setTimeout(refreshAndroidDevices, 1000);
        return { ok, j };
    }).catch(e => emuLog(`[Emulator] ${e.message}`));

    if (!avd.running) {
        const resume = mk('select', {}, mk('option', { value: 'quickboot', textContent: 'resume: quickboot' }),
            mk('option', { value: 'cold', textContent: 'resume: cold boot' }));
        resume.className = 'command-input';
        resume.style.cssText = 'width: auto; margin: 0 6px;';
        resume.addEventListener('focus', () => {
            if (resume.dataset.loaded) return;
            resume.dataset.loaded = '1';
            fetch('/api/emulator/snapshots?avd=' + encodeURIComponent(avd.name)).then(r => r.json()).then(j => {
                (j.snapshots || []).forEach(n => resume.appendChild(mk('option', { value: 'snap:' + n, textContent: 'resume: snapshot ' + n })));
            });
        });
        const start = mk('button', { textContent: 'Start', className: 'btn btn-small btn-primary' });
        const startFn = () => {
            let r = { mode: 'quickboot' };
            if (resume.value === 'cold') r = { mode: 'cold' };
            else if (resume.value.startsWith('snap:')) r = { mode: 'snapshot', name: resume.value.slice(5) };
            doAction(emuApi('POST', '/api/emulator/launch', { avd: avd.name, resume: r }), j => `${avd.name}: ${j.status}`);
        };
        start.onclick = startFn;
        name.onclick = startFn;
        li.append(resume, start);
    } else {
        const saveChk = mk('input', { type: 'checkbox' });
        const saveName = mk('input', { type: 'text', placeholder: 'snapshot name', value: 'session-' + new Date().toISOString().slice(0, 10) });
        saveName.className = 'command-input';
        saveName.style.cssText = 'width: 150px; margin-left: 4px;';
        const stop = mk('button', { textContent: 'Stop', className: 'btn btn-small btn-danger' });
        stop.onclick = () => {
            const body = { avd: avd.name };
            if (saveChk.checked) body.saveAs = saveName.value.trim();
            stop.disabled = true;
            doAction(emuApi('POST', '/api/emulator/stop', body), () => `${avd.name} stopped.`).then(() => { stop.disabled = false; });
        };
        li.append(stop, mk('label', {}, ' ', saveChk, ' save to snapshot first '), saveName);
        name.onclick = () => emuLog(`[Emulator] ${avd.name} is already running (${avd.serial}).`);
    }

    // Minima node inside the running emulator (CoreTestNode)
    if (avd.running) li.appendChild(buildAndroidNodeBlock(avd, doAction));

    // Snapshots drawer
    const snapD = mk('details', {}, mk('summary', { textContent: 'Snapshots (sessions)' }));
    snapD.open = androidOpenDrawers.has(avd.name + ':snap');
    snapD.addEventListener('toggle', () => { snapD.open ? androidOpenDrawers.add(avd.name + ':snap') : androidOpenDrawers.delete(avd.name + ':snap'); if (snapD.open) loadSnaps(); });
    const snapBody = mk('div', {});
    snapD.appendChild(mk('div', { textContent: 'Warning: restoring a snapshot of a node that already signed transactions reuses key state. Use it only on test chains.' })).style.cssText = 'color: #fab005; font-size: 0.8rem; margin: 4px 0;';
    snapD.appendChild(snapBody);
    function loadSnaps() {
        snapBody.innerHTML = '';
        fetch('/api/emulator/snapshots?avd=' + encodeURIComponent(avd.name)).then(r => r.json()).then(j => {
            if (j.error) { snapBody.textContent = j.error; return; }
            if (!j.snapshots.length) snapBody.appendChild(mk('div', { textContent: 'No snapshots.' }));
            j.snapshots.forEach(n => {
                const row = mk('div', {}, n + ' ');
                if (j.running) {
                    const load = mk('button', { textContent: 'Load', className: 'btn btn-small btn-neutral' });
                    load.onclick = () => doAction(emuApi('POST', '/api/emulator/snapshots/load', { avd: avd.name, name: n }), () => `${avd.name}: snapshot ${n} loaded`).then(loadSnaps);
                    const del = mk('button', { textContent: 'Delete', className: 'btn btn-small btn-danger' });
                    del.onclick = () => { if (confirm(`Delete snapshot ${n}?`)) doAction(emuApi('POST', '/api/emulator/snapshots/delete', { avd: avd.name, name: n }), () => `${avd.name}: snapshot ${n} deleted`).then(loadSnaps); };
                    row.append(load, del);
                }
                snapBody.appendChild(row);
            });
            if (j.running) {
                const nm = mk('input', { type: 'text', placeholder: 'new snapshot name' });
                nm.className = 'command-input'; nm.style.cssText = 'width: 160px;';
                const save = mk('button', { textContent: 'Save snapshot', className: 'btn btn-small btn-primary' });
                save.onclick = () => doAction(emuApi('POST', '/api/emulator/snapshots/save', { avd: avd.name, name: nm.value.trim() }), () => `${avd.name}: snapshot saved`).then(loadSnaps);
                snapBody.append(nm, save);
            } else {
                snapBody.appendChild(mk('small', { textContent: 'Start the AVD to save/load/delete; stopped AVDs can resume from a snapshot with Start.' }));
            }
        });
    }
    li.appendChild(snapD);

    // Port forwards drawer (running AVDs only)
    if (avd.running) {
        const fwdD = mk('details', {}, mk('summary', { textContent: 'Port forwards' }));
        fwdD.open = androidOpenDrawers.has(avd.name + ':fwd');
        const fwdBody = mk('div', {});
        fwdD.appendChild(fwdBody);
        fwdD.addEventListener('toggle', () => { fwdD.open ? androidOpenDrawers.add(avd.name + ':fwd') : androidOpenDrawers.delete(avd.name + ':fwd'); if (fwdD.open) loadFwd(); });
        function loadFwd() {
            fwdBody.innerHTML = '';
            fetch('/api/emulator/forwards?avd=' + encodeURIComponent(avd.name)).then(r => r.json()).then(j => {
                if (j.error) { fwdBody.textContent = j.error; return; }
                j.forwards.forEach(f => {
                    const row = mk('div', {}, `host ${f.hostPort} -> guest ${f.guestPort} `);
                    const rm = mk('button', { textContent: 'Remove', className: 'btn btn-small btn-danger' });
                    rm.onclick = () => doAction(emuApi('POST', '/api/emulator/forwards/remove', { avd: avd.name, hostPort: f.hostPort }), () => `${avd.name}: forward ${f.hostPort} removed`).then(loadFwd);
                    row.appendChild(rm); fwdBody.appendChild(row);
                });
                const hp = mk('input', { type: 'number', value: 21000 + index, min: 20000, max: 60000 });
                const gp = mk('input', { type: 'number', value: 11001, min: 1024, max: 65535 });
                [hp, gp].forEach(x => { x.className = 'command-input'; x.style.cssText = 'width: 90px;'; });
                const add = mk('button', { textContent: 'Add forward', className: 'btn btn-small btn-primary' });
                add.onclick = () => doAction(emuApi('POST', '/api/emulator/forwards/add', { avd: avd.name, hostPort: parseInt(hp.value, 10), guestPort: parseInt(gp.value, 10) }), () => `${avd.name}: forward added`).then(loadFwd);
                fwdBody.append('host ', hp, ' guest ', gp, ' ', add);
            });
        }
        li.appendChild(fwdD);
        if (fwdD.open) loadFwd();
    }
    if (snapD.open) loadSnaps();
    return li;
}


// ---- Android node (CoreTestNode inside a running AVD) ----
function androidNodeApi(method, path, body) {
    return fetch('/api/android-node' + path, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json().then(j => ({ ok: r.ok, j })));
}

function describeAndroidNode(st) {
    if (!st.installed) return st.apk ? 'node app not installed' : 'node app not installed (CoreTestNode.apk not found: set coreTestNodeApk in config.json)';
    if (!st.nodeUp) return 'node stopped';
    return `node up - block ${st.block} - ${st.connected} peer(s) - port ${st.port}`;
}

function buildAndroidNodeBlock(avd, doAction) {
    const box = mk('div', { className: 'anode' });
    const status = mk('span', { className: 'anode-status', textContent: 'Minima node: checking...' });
    const mode = mk('select', {}, mk('option', { value: 'connect', textContent: 'join desktop seed' }), mk('option', { value: 'solo', textContent: 'own chain (-solo)' }));
    mode.className = 'command-input';
    const install = mk('button', { textContent: 'Install node app', className: 'btn btn-small btn-neutral' });
    const start = mk('button', { textContent: 'Start / restart node', className: 'btn btn-small btn-primary', title: 'Starts the node, or restarts it (clean stop, new random port) when it is already running' });
    const stop = mk('button', { textContent: 'Stop node', className: 'btn btn-small btn-danger' });
    const wipe = mk('button', { textContent: 'Wipe data', className: 'btn btn-small btn-danger', title: 'Stop the node and delete its chain (fresh chain next start)' });
    const cmd = mk('input', { type: 'text', placeholder: 'minima command (e.g. status)' });
    cmd.className = 'command-input'; cmd.style.cssText = 'width: 220px;';
    const send = mk('button', { textContent: 'Send', className: 'btn btn-small btn-neutral' });
    const out = mk('pre', { textContent: '' });
    out.style.display = 'none';
    const buttons = [install, start, stop, wipe, send];

    function applyState(st) {
        status.textContent = 'Minima node: ' + describeAndroidNode(st);
        status.style.color = st.nodeUp ? '#40c057' : '#aaa';
        install.style.display = st.installed ? 'none' : '';
        [start, stop, wipe, mode, cmd, send].forEach(e => { e.style.display = st.installed ? '' : 'none'; });
    }
    function update() {
        return androidNodeApi('GET', '/status?avd=' + encodeURIComponent(avd.name)).then(({ ok, j }) => {
            if (!ok) { status.textContent = 'Minima node: ' + (j.error || 'error'); return; }
            applyState(j);
        }).catch(e => { status.textContent = 'Minima node: ' + e.message; });
    }
    function run(btn, path, body, okMsg) {
        buttons.forEach(b => b.disabled = true);
        status.textContent = 'Minima node: working...'; status.style.color = '#fab005';
        return androidNodeApi('POST', path, body).then(({ ok, j }) => {
            emuLog(ok ? `[AndroidNode] ${avd.name}: ${okMsg(j)}` : `[AndroidNode] ${avd.name}: ${j.error || 'error'}`);
            return { ok, j };
        }).catch(e => emuLog(`[AndroidNode] ${e.message}`)).finally(() => {
            buttons.forEach(b => b.disabled = false);
            // The node needs a moment to boot before it answers `status`
            update(); setTimeout(update, 8000); setTimeout(update, 20000);
            if (typeof refreshNetwork === 'function') setTimeout(refreshNetwork, 9000);
        });
    }
    install.onclick = () => run(install, '/install', { avd: avd.name }, () => 'CoreTestNode installed');
    start.onclick = () => run(start, '/start', { avd: avd.name, mode: mode.value }, j => `node starting (${j.params})`);
    stop.onclick = () => run(stop, '/stop', { avd: avd.name }, () => 'node stopped');
    wipe.onclick = () => { if (confirm(`Delete the chain data of the Android node on ${avd.name}?`)) run(wipe, '/wipe', { avd: avd.name }, () => 'node data wiped'); };
    const sendFn = () => {
        const c = cmd.value.trim();
        if (!c) return;
        out.style.display = ''; out.textContent = '> ' + c + '\n...';
        androidNodeApi('POST', '/cmd', { avd: avd.name, command: c }).then(({ ok, j }) => {
            out.textContent = '> ' + c + '\n' + (ok ? JSON.stringify(j.reply, null, 2) : (j.error || 'error'));
        }).catch(e => { out.textContent = e.message; });
    };
    send.onclick = sendFn;
    cmd.addEventListener('keydown', e => { if (e.key === 'Enter') sendFn(); });

    box.append(status, install, mode, start, stop, wipe, mk('br'), cmd, send, out);
    [start, stop, wipe, mode, cmd, send].forEach(e => { e.style.display = 'none'; });
    update();
    // Keep the status line fresh while this row is on screen (the row is rebuilt on refresh)
    const timer = setInterval(() => { if (!document.body.contains(box)) { clearInterval(timer); return; } if (!document.hidden) update(); }, 15000);
    return box;
}

// ---- Core: network overview (headless + Android nodes) ----
const networkExpanded = new Set(); // row names whose peer list is open
const shortHash = h => (h ? String(h).slice(0, 10) + '...' : '-');
const peerLines = conns => (conns || []).map(c => `${c.incoming ? 'incoming from' : 'outgoing to'} ${c.host}:${c.minimaport || c.port}${c.isconnected === false ? ' (not connected)' : ''}`);

async function collectNetworkRows() {
    const rows = [];
    // Headless nodes: the cards that show a running indicator
    const cards = [...document.querySelectorAll('.node-card')].filter(c => c.querySelector('.status-indicator.running'));
    await Promise.all(cards.map(async card => {
        const id = card.id.replace('node-', '');
        const rpc = command => fetch(`/api/nodes/${id}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) }).then(x => x.json());
        const row = { name: 'Headless ' + id, type: 'headless' + (id === '1' ? ' (seed)' : ''), where: `10.0.0.${10 + Number(id)}:9001`, block: null, hash: null, peers: null, order: Number(id),
            peersLoader: async () => peerLines(((await rpc('network')).response || {}).connections) };
        try {
            const s = (await rpc('status')).response || {};
            row.block = s.chain && s.chain.block; row.hash = s.chain && s.chain.hash; row.peers = s.network && s.network.connected;
        } catch (e) { /* RPC not up yet */ }
        rows.push(row);
    }));
    // Android nodes: running AVDs with the node app
    try {
        const data = await fetch('/api/emulator/avds').then(r => r.json());
        await Promise.all((data.avds || []).filter(a => a.running).map(async a => {
            const row = { name: a.name, type: 'android', where: `${a.serial}`, block: null, hash: null, peers: null, order: 100,
                peersLoader: async () => { const r = await androidNodeApi('POST', '/cmd', { avd: a.name, command: 'network' }); return r.ok ? peerLines(((r.j.reply || {}).response || {}).connections) : [r.j.error || 'error']; } };
            try {
                const st = await fetch('/api/android-node/status?avd=' + encodeURIComponent(a.name)).then(r => r.json());
                if (st.nodeUp) { row.block = st.block; row.hash = st.hash; row.peers = st.connected; row.where = `${a.serial} (port ${st.port})`; }
                else row.where += st.installed ? ' - node stopped' : ' - node app not installed';
            } catch (e) { /* ignore */ }
            rows.push(row);
        }));
    } catch (e) { /* adb/emulator unavailable */ }
    return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function networkVerdict(rows) {
    const up = rows.filter(r => typeof r.block === 'number');
    if (up.length < 2) return { text: up.length ? '1 node up' : 'no nodes', cls: '' };
    // Same height, different tip hash = the chains have split
    const byBlock = {};
    up.forEach(r => { if (r.hash) (byBlock[r.block] = byBlock[r.block] || new Set()).add(r.hash); });
    const fork = Object.keys(byBlock).find(b => byBlock[b].size > 1);
    if (fork) return { text: `FORK at block ${fork}`, cls: 'bad' };
    const spread = Math.max(...up.map(r => r.block)) - Math.min(...up.map(r => r.block));
    return spread <= 2 ? { text: `in sync (${up.length} nodes)`, cls: 'ok' } : { text: `not in sync: blocks differ by ${spread} (a node may still be syncing)`, cls: 'bad' };
}

let previousProblems = new Set();
// Why a node that answers looks wrong (null when fine). The seed (headless 1) alone legitimately has no peers.
function rowProblem(r, rows) {
    if (typeof r.block !== 'number') return null;
    const up = rows.filter(x => typeof x.block === 'number');
    const max = Math.max(...up.map(x => x.block));
    const sameHeightHashes = new Set(up.filter(x => x.block === r.block && x.hash).map(x => x.hash));
    if (sameHeightHashes.size > 1) return `forked at block ${r.block}`;
    if (up.length > 1 && max - r.block > 2) return `${max - r.block} blocks behind`;
    if (r.peers === 0 && !r.type.includes('seed')) return 'no peers';
    return null;
}

async function refreshNetwork() {
    if (window.nodeMode !== 'core') return;
    const rowsEl = document.getElementById('network-rows');
    const chip = document.getElementById('network-sync');
    if (!rowsEl) return;
    const rows = await collectNetworkRows();
    rowsEl.innerHTML = '';
    if (!rows.length) rowsEl.appendChild(mk('tr', {}, mk('td', { colSpan: 6, textContent: 'No node is running.' })));
    rows.forEach(r => {
        const tr = mk('tr', { className: 'net-row', title: 'Click to show the peers of this node' },
            mk('td', { textContent: r.name }), mk('td', { textContent: r.type }), mk('td', { textContent: r.where }),
            mk('td', { textContent: r.block === null ? '-' : String(r.block) }),
            mk('td', { className: 'net-hash', textContent: shortHash(r.hash), title: r.hash || '' }),
            mk('td', { textContent: r.peers === null ? '-' : String(r.peers) }));
        rowsEl.appendChild(tr);
        const showPeers = async (open) => {
            let sub = tr.nextSibling && tr.nextSibling.classList && tr.nextSibling.classList.contains('net-peers') ? tr.nextSibling : null;
            if (!open) { if (sub) sub.remove(); networkExpanded.delete(r.name); return; }
            networkExpanded.add(r.name);
            if (!sub) { sub = mk('tr', { className: 'net-peers' }, mk('td', { colSpan: 6, textContent: 'loading peers...' })); tr.after(sub); }
            try { const lines = await r.peersLoader(); sub.firstChild.textContent = lines.length ? lines.join('  |  ') : 'no peers'; }
            catch (e) { sub.firstChild.textContent = 'peers unavailable: ' + e.message; }
        };
        tr.onclick = () => showPeers(!(tr.nextSibling && tr.nextSibling.classList && tr.nextSibling.classList.contains('net-peers')));
        if (networkExpanded.has(r.name)) showPeers(true);
    });
    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n ? `(${n} running)` : ''; };
    setCount('subtab-count-headless', rows.filter(r => r.type.startsWith('headless')).length);
    setCount('subtab-count-android', rows.filter(r => r.type === 'android').length);
    const v = networkVerdict(rows);
    chip.textContent = v.text; chip.className = 'net-chip ' + v.cls;
    const gs = document.getElementById('global-sync');
    if (gs) {
        const up = rows.filter(r => typeof r.block === 'number');
        gs.textContent = up.length ? `${v.text} - block ${Math.max(...up.map(r => r.block))}` : v.text;
        gs.className = 'net-chip ' + v.cls;
    }
    // A problem must show up in two refreshes in a row (a node that has just started has no peers for a moment)
    const problems = { headless: [], android: [] };
    const nowSeen = new Set();
    rows.forEach(r => {
        const why = rowProblem(r, rows); if (!why) return;
        const key = `${r.name}: ${why}`; nowSeen.add(key);
        if (previousProblems.has(key)) problems[r.type.startsWith('headless') ? 'headless' : 'android'].push(key);
    });
    previousProblems = nowSeen;
    for (const k of ['headless', 'android']) {
        const dot = document.getElementById('subtab-alert-' + k);
        if (dot) { dot.hidden = !problems[k].length; dot.title = problems[k].join('\n'); }
    }
    return rows;
}
document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('refresh-network-btn');
    if (b) b.addEventListener('click', refreshNetwork);
    setInterval(() => {
        const nodesTab = document.getElementById('tab-nodes');
        if (window.nodeMode === 'core' && !document.hidden && nodesTab && nodesTab.classList.contains('show')) refreshNetwork();
    }, 15000);
});

function refreshAndroidDevices() {
    const avdList = document.getElementById('avd-list');
    const devList = document.getElementById('adb-device-list-panel');
    if (!avdList || !devList) return;
    fetch('/api/emulator/avds').then(r => r.json()).then(data => {
        avdList.innerHTML = '';
        devList.innerHTML = '';
        if (data.error) {
            avdList.appendChild(mk('li', { textContent: data.error })).style.color = '#fa5252';
            return;
        }
        if (data.avds.length === 0) avdList.appendChild(mk('li', { textContent: 'No AVDs found (create them with Android Studio; avdmanager is not used).' })).style.color = '#888';
        data.avds.forEach((avd, i) => avdList.appendChild(buildAvdRow(avd, i)));
        (data.devices || []).forEach(d => devList.appendChild(mk('li', { textContent: `${d.id} - ${d.state}` })));
        if (!data.devices || data.devices.length === 0) devList.appendChild(mk('li', { textContent: 'No devices.' })).style.color = '#888';
    }).catch(e => console.error('Android devices fetch failed', e));
}
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('refresh-android-devices-btn');
    if (btn) btn.addEventListener('click', refreshAndroidDevices);
    const panel = document.getElementById('android-devices-panel');
    if (panel) panel.addEventListener('toggle', () => { if (panel.open) refreshAndroidDevices(); });
    refreshAndroidDevices();
});


// ---- Android bulk actions (toolbar of the Android nodes section) ----
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, stepMs = 2000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { /* keep waiting */ } await sleepMs(stepMs); }
    return null;
}
async function runningAvds() {
    const d = await fetch('/api/emulator/avds').then(r => r.json());
    if (d.error) throw new Error(d.error);
    return (d.avds || []).filter(a => a.running);
}
const gl = (tag, msg) => addToGlobalLog(`[${tag}] ${msg}`);

// Installs the node app if missing and (re)starts the node joined to the seed (each start picks a new random
// -port). Returns true when the start was requested. `force` restarts a node that is already up.
async function startAndroidNode(avdName, tag = 'AndroidNode', force = false) {
    let st = (await androidNodeApi('GET', '/status?avd=' + encodeURIComponent(avdName))).j;
    if (!force && st.nodeUp && st.connected > 0) { gl(tag, `${avdName}: node already up (block ${st.block}, ${st.connected} peer(s)).`); return true; }
    if (st.nodeUp) gl(tag, `${avdName}: node is up but ${force ? 'is being restarted' : 'has no peers (the seed probably restarted): restarting it to rejoin the seed'}.`);
    if (!st.installed) {
        if (!st.apk) { gl(tag, `${avdName}: CoreTestNode.apk not found (set coreTestNodeApk in config.json).`); return false; }
        gl(tag, `${avdName}: installing the node app...`);
        const r = await androidNodeApi('POST', '/install', { avd: avdName });
        if (!r.ok) { gl(tag, `${avdName}: install failed: ${r.j.error || 'error'}`); return false; }
    }
    const r = await androidNodeApi('POST', '/start', { avd: avdName, mode: 'connect' });
    if (!r.ok) { gl(tag, `${avdName}: start failed: ${r.j.error || 'error'}`); return false; }
    gl(tag, `${avdName}: node starting (${r.j.params}).`);
    return true;
}

// Android "Start All": open the emulators that are not running, wait for each to boot, install/start the node,
// then check that every node got the chain. Returns the number of nodes that need attention.
async function startAllAndroid(tag, setStatus) {
    setStatus('starting emulators...');
    const la = await emuApi('POST', '/api/emulator/launch-all', {});
    if (!la.ok) { gl(tag, `launch-all failed: ${la.j.error || 'error'}`); setStatus('emulators failed', 'bad'); return 1; }
    const wanted = la.j.avds.map(a => a.name);
    gl(tag, `Emulators: ${wanted.length} AVD(s) (${la.j.avds.filter(a => a.plan === 'launch').length} to launch).`);
    let failed = 0;
    const started = [];
    for (const name of wanted) {
        setStatus(`waiting for ${name}...`);
        const ready = await waitFor(async () => {
            const r = await androidNodeApi('GET', '/status?avd=' + encodeURIComponent(name));
            return r.ok && r.j.running ? r.j : null;
        }, 240000, 4000);
        if (!ready) { failed++; gl(tag, `${name}: not ready within 4 min (skipped). If it crashed earlier, check for an "emulator closed unexpectedly" dialog.`); continue; }
        setStatus(`starting node on ${name}...`);
        if (await startAndroidNode(name, tag)) started.push(name); else failed++;
    }
    // The seed sends the chain once per host:port and each start picks a new random port, so a node still at
    // block 0 is restarted once (new port) before warning.
    setStatus('checking sync...');
    const atBlock0 = async name => { const r = await androidNodeApi('GET', '/status?avd=' + encodeURIComponent(name)); return r.ok && r.j.nodeUp && !(r.j.block > 0); };
    const syncWait = name => waitFor(async () => !(await atBlock0(name)), 60000, 5000);
    for (const name of started) {
        if (await syncWait(name)) continue;
        gl(tag, `${name}: still at block 0 after 60 s: restarting its node on a new port.`);
        await startAndroidNode(name, tag, true);
        if (await syncWait(name)) continue;
        gl(tag, `${name}: still at block 0. See the README troubleshooting entry (the seed sends the chain once per address).`);
        failed++;
    }
    setStatus(failed ? `${failed} node(s) need attention` : 'all started', failed ? 'bad' : 'ok');
    gl(tag, failed ? `Done with ${failed} problem(s): see the lines above.` : 'Android nodes started. See the Network table for the sync state.');
    setTimeout(refreshAndroidDevices, 1000); setTimeout(refreshNetwork, 15000); setTimeout(refreshNetwork, 40000);
    return failed;
}

// Android "Stop All": stop the node on every running emulator; optionally close the emulators too.
async function stopAllAndroid(tag, closeEmulators) {
    const avds = await runningAvds().catch(() => []);
    if (!avds.length) gl(tag, 'No emulator is running.');
    for (const a of avds) {
        const r = await androidNodeApi('POST', '/stop', { avd: a.name });
        gl(tag, `${a.name}: ${r.ok ? 'node stopped' : (r.j.error || 'error')}`);
        if (closeEmulators) { const e = await emuApi('POST', '/api/emulator/stop', { avd: a.name }); gl(tag, `${a.name}: ${e.ok ? 'emulator stopped' : (e.j.error || 'error')}`); }
    }
    setTimeout(refreshAndroidDevices, 1500); setTimeout(refreshNetwork, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    const chip = (id) => (t, cls = '') => { const el = document.getElementById(id); if (el) { el.textContent = t; el.className = 'net-chip ' + cls; } };
    const setAndroidStatus = chip('android-status');
    const setEverythingStatus = chip('everything-status');
    let busy = false;
    const guarded = (btns, fn) => async () => {
        if (busy) return; busy = true; btns.forEach(b => b && (b.disabled = true));
        try { await fn(); } catch (e) { gl('Android', e.message); } finally { busy = false; btns.forEach(b => b && (b.disabled = false)); }
    };
    const $ = id => document.getElementById(id);

    // Remember the "also close emulators" checkboxes between sessions (kept in sync with each other)
    const closeChks = ['stop-emulators-chk', 'stop-android-emus-chk'].map($).filter(Boolean);
    try { const saved = localStorage.getItem('closeEmulators') === '1'; closeChks.forEach(c => { c.checked = saved; }); } catch (e) { /* storage may be blocked */ }
    closeChks.forEach(c => c.addEventListener('change', () => {
        closeChks.forEach(o => { o.checked = c.checked; });
        try { localStorage.setItem('closeEmulators', c.checked ? '1' : '0'); } catch (e) { /* ignore */ }
    }));

    // Android section toolbar
    const aStart = $('start-android-btn'), aStop = $('stop-android-btn');
    if (aStart) aStart.onclick = guarded([aStart, aStop], () => startAllAndroid('AndroidNode', setAndroidStatus));
    if (aStop) aStop.onclick = guarded([aStart, aStop], async () => {
        setAndroidStatus('stopping...');
        await stopAllAndroid('AndroidNode', $('stop-android-emus-chk').checked);
        setAndroidStatus('stopped');
    });
    const wipe = $('wipe-android-nodes-btn');
    if (wipe) wipe.onclick = guarded([wipe], async () => {
        if (!confirm('Stop the node and delete the chain data on EVERY running emulator?')) return;
        for (const a of await runningAvds()) { const r = await androidNodeApi('POST', '/wipe', { avd: a.name }); gl('AndroidNode', `${a.name}: ${r.ok ? 'node data wiped' : (r.j.error || 'error')}`); }
        setTimeout(refreshNetwork, 3000);
    });

    // + New AVD
    const form = $('new-avd-form'), newBtn = $('new-avd-btn');
    if (form && newBtn) {
        newBtn.onclick = () => { form.style.display = form.style.display === 'none' ? 'flex' : 'none'; };
        $('new-avd-cancel-btn').onclick = () => { form.style.display = 'none'; };
        $('new-avd-create-btn').onclick = async () => {
            const name = $('new-avd-name').value.trim();
            const dataSize = $('new-avd-size').value.trim() || '8G';
            const r = await emuApi('POST', '/api/emulator/create', { name, dataSize });
            gl('Emulator', r.ok ? `AVD ${name} created (start it with its Start button).` : `create AVD failed: ${r.j.error || 'error'}`);
            if (r.ok) { form.style.display = 'none'; $('new-avd-name').value = ''; refreshAndroidDevices(); }
        };
    }

    // Global Clear All Logs delegates to the existing (hidden in Core) handler
    const clearGlobal = $('clear-logs-global-btn');
    if (clearGlobal) clearGlobal.onclick = () => $('clear-all-logs-btn').click();

    // Start / Stop Everything = headless nodes (seed first) + the Android routine above
    const startBtn = $('start-everything-btn'), stopBtn = $('stop-everything-btn');
    const tag = 'Everything';
    if (startBtn) startBtn.onclick = guarded([startBtn, stopBtn], async () => {
        setEverythingStatus('starting headless nodes...');
        gl(tag, 'Starting the headless nodes...');
        $('start-all-btn').click();
        const seedUp = await waitFor(async () => {
            const r = await fetch('/api/nodes/1/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'status' }) }).then(x => x.json());
            return r && r.status === true;
        }, 90000, 3000);
        if (!seedUp) { gl(tag, 'The seed (headless node 1) did not answer within 90 s: stopping here.'); setEverythingStatus('seed not up', 'bad'); return; }
        gl(tag, 'Seed is up.');
        const failed = await startAllAndroid(tag, setEverythingStatus);
        setEverythingStatus(failed ? `started, ${failed} Android node(s) need attention` : 'all started', failed ? 'bad' : 'ok');
    });
    // Wipe Everything = wipe the Android nodes' chain + the headless nodes' data (one confirmation)
    const wipeAllBtn = $('wipe-everything-btn');
    if (wipeAllBtn) wipeAllBtn.onclick = guarded([startBtn, stopBtn, wipeAllBtn], async () => {
        if (!confirm('Delete ALL node data: the chain of every Android node on a running emulator and the data of every headless node? This cannot be undone.')) return;
        setEverythingStatus('wiping...');
        for (const a of await runningAvds()) { const r = await androidNodeApi('POST', '/wipe', { avd: a.name }); gl(tag, `${a.name}: ${r.ok ? 'node data wiped' : (r.j.error || 'error')}`); }
        gl(tag, 'Deleting the headless nodes data...');
        $('delete-all-data-btn').click();
        setEverythingStatus('wiped', 'ok');
        setTimeout(refreshAndroidDevices, 1500); setTimeout(refreshNetwork, 5000);
    });
    if (stopBtn) stopBtn.onclick = guarded([startBtn, stopBtn], async () => {
        setEverythingStatus('stopping...');
        await stopAllAndroid(tag, $('stop-emulators-chk').checked);
        gl(tag, 'Stopping the headless nodes...');
        $('stop-all-btn').click();
        setEverythingStatus('stopped');
    });
});

// ---- Test scenarios ----
async function refreshScenarios() {
    const list = document.getElementById('scenario-list');
    if (!list) return;
    const d = await fetch('/api/scenarios').then(r => r.json()).catch(() => ({ scenarios: [] }));
    list.innerHTML = '';
    if (!d.scenarios.length) { list.appendChild(mk('div', { textContent: 'No scenarios configured (testScenarios in config.json; the MinimaAds escrow flow is detected when ../MinimaAds is a sibling checkout).' })).style.color = '#888'; return; }
    d.scenarios.forEach(sc => {
        const run = mk('button', { textContent: sc.running ? 'Running...' : 'Run', className: 'btn btn-small btn-primary', disabled: sc.running });
        const stop = mk('button', { textContent: 'Stop', className: 'btn btn-small btn-danger', disabled: !sc.running });
        const res = sc.lastRun && sc.lastRun.endedAt ? mk('span', { className: 'net-chip ' + (sc.lastRun.exit === 0 ? 'ok' : 'bad'), textContent: sc.lastRun.exit === 0 ? 'PASSED' : 'FAILED' }) : mk('span', {});
        run.onclick = async () => {
            const out = document.getElementById('scenario-output'); out.style.display = ''; out.textContent = '';
            const r = await fetch('/api/scenarios/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sc.id }) }).then(x => x.json());
            if (r.error) out.textContent = r.error;
            window.activeScenario = sc.id; refreshScenarios();
        };
        stop.onclick = () => fetch('/api/scenarios/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sc.id }) });
        const show = mk('a', { textContent: 'show output', className: 'avd-name' });
        show.onclick = async () => { const o = await fetch(`/api/scenarios/${encodeURIComponent(sc.id)}/output`).then(x => x.json()); const out = document.getElementById('scenario-output'); out.style.display = ''; out.textContent = o.output; window.activeScenario = sc.id; };
        list.appendChild(mk('div', { className: 'scenario' }, mk('strong', { textContent: sc.name }), ' ', run, stop, ' ', res, ' ', show, mk('span', { className: 'scenario-desc', textContent: sc.description })));
    });
}
if (typeof socket !== 'undefined') {
    socket.on('scenario-output', d => {
        if (d.id !== window.activeScenario) return;
        const out = document.getElementById('scenario-output');
        if (out) { out.style.display = ''; out.textContent += d.text; out.scrollTop = out.scrollHeight; }
    });
    socket.on('scenario-done', () => refreshScenarios());
}
document.addEventListener('DOMContentLoaded', () => {
    const det = document.getElementById('scenarios-details');
    if (det) det.addEventListener('toggle', () => { if (det.open) refreshScenarios(); });
});


// ---- Android > Apps (APK): update the node app on the running emulators ----
const fmtSize = b => (b / 1048576).toFixed(1) + ' MB';
async function updateNodeApp(name, tag, restart) {
    const st = (await androidNodeApi('GET', '/status?avd=' + encodeURIComponent(name))).j;
    if (!st.running) { gl(tag, `${name}: emulator not running.`); return false; }
    const wasUp = !!st.nodeUp;
    if (wasUp) {
        gl(tag, `${name}: stopping the node before updating...`);
        const s = await androidNodeApi('POST', '/stop', { avd: name });
        if (!s.ok) { gl(tag, `${name}: stop failed: ${s.j.error || 'error'}`); return false; }
    }
    gl(tag, `${name}: installing the APK...`);
    const r = await androidNodeApi('POST', '/install', { avd: name });
    if (!r.ok) { gl(tag, `${name}: update failed: ${r.j.error || 'error'}`); return false; }
    gl(tag, `${name}: node app updated.`);
    if (wasUp && restart) await startAndroidNode(name, tag, true);
    return true;
}

async function refreshApps() {
    if (window.nodeMode !== 'core') return;
    const info = document.getElementById('apk-info'), rowsEl = document.getElementById('apps-rows');
    if (!info || !rowsEl) return;
    const apk = (await androidNodeApi('GET', '/apk').catch(() => ({ j: { found: false } }))).j;
    info.textContent = apk.found ? `APK: ${apk.path} (${fmtSize(apk.size)}, built ${new Date(apk.mtime).toLocaleString()})` : 'CoreTestNode.apk not found: set coreTestNodeApk in config.json.';
    const avds = await runningAvds().catch(() => []);
    rowsEl.innerHTML = '';
    if (!avds.length) rowsEl.appendChild(mk('tr', {}, mk('td', { colSpan: 4, textContent: 'No emulator is running.' })));
    for (const a of avds) {
        const st = (await androidNodeApi('GET', `/status?avd=${encodeURIComponent(a.name)}&details=1`).catch(() => ({ j: {} }))).j;
        let installed = 'not installed', cls = '';
        if (st.installed) {
            installed = (st.appVersion && st.appVersion !== 'null' ? 'v' + st.appVersion : 'installed') + (st.appUpdated ? ` (${st.appUpdated})` : '');
            if (apk.found && st.appUpdated && new Date(apk.mtime) > new Date(st.appUpdated.replace(' ', 'T'))) { installed += ' - APK is newer'; cls = 'apk-old'; } else cls = 'apk-ok';
        }
        const btn = mk('button', { textContent: st.installed ? 'Update' : 'Install', className: 'btn btn-small btn-primary', disabled: !apk.found });
        btn.onclick = async () => {
            btn.disabled = true;
            try { await updateNodeApp(a.name, 'Apps', document.getElementById('update-restart-chk').checked); }
            catch (e) { gl('Apps', `${a.name}: ${e.message}`); }
            refreshApps(); refreshAndroidDevices();
        };
        rowsEl.appendChild(mk('tr', {}, mk('td', { textContent: a.name }), mk('td', { className: cls, textContent: installed }),
            mk('td', { textContent: st.nodeUp ? `up - block ${st.block}` : 'stopped' }), mk('td', {}, btn)));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const all = document.getElementById('update-apps-btn'), ref = document.getElementById('refresh-apps-btn');
    const status = document.getElementById('apps-status');
    if (ref) ref.onclick = refreshApps;
    if (all) all.onclick = async () => {
        all.disabled = true; status.textContent = 'updating...'; status.className = 'net-chip';
        let failed = 0;
        try {
            const restart = document.getElementById('update-restart-chk').checked;
            for (const a of await runningAvds()) { if (!(await updateNodeApp(a.name, 'Apps', restart))) failed++; }
        } catch (e) { gl('Apps', e.message); failed++; }
        status.textContent = failed ? `${failed} failed` : 'done'; status.className = 'net-chip ' + (failed ? 'bad' : 'ok');
        all.disabled = false; refreshApps(); refreshAndroidDevices();
    };
});
