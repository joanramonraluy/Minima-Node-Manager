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
    const start = mk('button', { textContent: 'Start node', className: 'btn btn-small btn-primary' });
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
            const row = { name: a.name, type: 'android', where: `${a.serial} (port 12001)`, block: null, hash: null, peers: null, order: 100,
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
    return spread <= 2 ? { text: `in sync (${up.length} nodes)`, cls: 'ok' } : { text: `diverging: blocks differ by ${spread}`, cls: 'bad' };
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
    const v = networkVerdict(rows);
    chip.textContent = v.text; chip.className = 'net-chip ' + v.cls;
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

// Installs the node app if missing and (re)starts the node joined to the seed. Returns true when started.
async function startAndroidNode(avdName, tag = 'AndroidNode') {
    let st = (await androidNodeApi('GET', '/status?avd=' + encodeURIComponent(avdName))).j;
    if (st.nodeUp) { gl(tag, `${avdName}: node already up (block ${st.block}).`); return true; }
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
async function forEachRunningAvd(fn) {
    const avds = await runningAvds();
    if (!avds.length) gl('AndroidNode', 'No emulator is running.');
    const results = [];
    for (const a of avds) results.push(await fn(a));
    return results;
}

document.addEventListener('DOMContentLoaded', () => {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = async () => { el.disabled = true; try { await fn(); } catch (e) { gl('AndroidNode', e.message); } finally { el.disabled = false; setTimeout(refreshAndroidDevices, 1500); setTimeout(refreshNetwork, 12000); } }; };
    on('start-android-nodes-btn', async () => { await forEachRunningAvd(a => startAndroidNode(a.name)); });
    on('stop-android-nodes-btn', async () => {
        await forEachRunningAvd(async a => { const r = await androidNodeApi('POST', '/stop', { avd: a.name }); gl('AndroidNode', `${a.name}: ${r.ok ? 'node stopped' : (r.j.error || 'error')}`); });
    });
    on('stop-all-emulators-btn', async () => {
        await forEachRunningAvd(async a => { const r = await emuApi('POST', '/api/emulator/stop', { avd: a.name }); gl('Emulator', `${a.name}: ${r.ok ? 'stopped' : (r.j.error || 'error')}`); });
    });
    on('wipe-android-nodes-btn', async () => {
        if (!confirm('Stop the node and delete the chain data on EVERY running emulator?')) return;
        await forEachRunningAvd(async a => { const r = await androidNodeApi('POST', '/wipe', { avd: a.name }); gl('AndroidNode', `${a.name}: ${r.ok ? 'node data wiped' : (r.j.error || 'error')}`); });
    });

    // + New AVD
    const form = document.getElementById('new-avd-form');
    const newBtn = document.getElementById('new-avd-btn');
    if (form && newBtn) {
        newBtn.onclick = () => { form.style.display = form.style.display === 'none' ? 'flex' : 'none'; };
        document.getElementById('new-avd-cancel-btn').onclick = () => { form.style.display = 'none'; };
        document.getElementById('new-avd-create-btn').onclick = async () => {
            const name = document.getElementById('new-avd-name').value.trim();
            const dataSize = document.getElementById('new-avd-size').value.trim() || '8G';
            const r = await emuApi('POST', '/api/emulator/create', { name, dataSize });
            gl('Emulator', r.ok ? `AVD ${name} created (start it with its Start button).` : `create AVD failed: ${r.j.error || 'error'}`);
            if (r.ok) { form.style.display = 'none'; document.getElementById('new-avd-name').value = ''; refreshAndroidDevices(); }
        };
    }

    // Global Clear All Logs delegates to the existing (hidden in Core) handler
    const clearGlobal = document.getElementById('clear-logs-global-btn');
    if (clearGlobal) clearGlobal.onclick = () => document.getElementById('clear-all-logs-btn').click();

    // Start / Stop Everything
    const status = document.getElementById('everything-status');
    const setStatus = (t, cls = '') => { if (status) { status.textContent = t; status.className = 'net-chip ' + cls; } };
    let busy = false;
    const startBtn = document.getElementById('start-everything-btn');
    const stopBtn = document.getElementById('stop-everything-btn');
    const tag = 'Everything';
    if (startBtn) startBtn.onclick = async () => {
        if (busy) return; busy = true; startBtn.disabled = stopBtn.disabled = true;
        try {
            // 1. Headless nodes, seed first: wait for node 1's RPC
            setStatus('starting headless nodes...');
            gl(tag, 'Starting the headless nodes...');
            document.getElementById('start-all-btn').click();
            const seedUp = await waitFor(async () => {
                const r = await fetch('/api/nodes/1/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'status' }) }).then(x => x.json());
                return r && r.status === true;
            }, 90000, 3000);
            if (!seedUp) { gl(tag, 'The seed (headless node 1) did not answer within 90 s: stopping here.'); setStatus('seed not up', 'bad'); return; }
            gl(tag, 'Seed is up.');
            // 2. Emulators
            setStatus('starting emulators...');
            const la = await emuApi('POST', '/api/emulator/launch-all', {});
            if (!la.ok) { gl(tag, `launch-all failed: ${la.j.error || 'error'}`); setStatus('emulators failed', 'bad'); return; }
            const wanted = la.j.avds.map(a => a.name);
            gl(tag, `Emulators: ${wanted.length} AVD(s) (${la.j.avds.filter(a => a.plan === 'launch').length} to launch).`);
            // 3. Per AVD: wait until it answers adb commands, then install/start the node
            let failed = 0;
            for (const name of wanted) {
                setStatus(`waiting for ${name}...`);
                const ready = await waitFor(async () => {
                    const r = await androidNodeApi('GET', '/status?avd=' + encodeURIComponent(name));
                    return r.ok && r.j.running ? r.j : null;
                }, 240000, 4000);
                if (!ready) { failed++; gl(tag, `${name}: not ready within 4 min (skipped). If it crashed earlier, check for an "emulator closed unexpectedly" dialog.`); continue; }
                setStatus(`starting node on ${name}...`);
                if (!(await startAndroidNode(name, tag))) failed++;
            }
            setStatus(failed ? `started, ${failed} Android node(s) failed` : 'all started', failed ? 'bad' : 'ok');
            gl(tag, failed ? `Done with ${failed} failure(s): see the lines above.` : 'Done. See the Network table for the sync state.');
            setTimeout(refreshAndroidDevices, 1000); setTimeout(refreshNetwork, 15000); setTimeout(refreshNetwork, 40000);
        } catch (e) { gl(tag, e.message); setStatus('error', 'bad'); }
        finally { busy = false; startBtn.disabled = stopBtn.disabled = false; }
    };
    if (stopBtn) stopBtn.onclick = async () => {
        if (busy) return; busy = true; startBtn.disabled = stopBtn.disabled = true;
        try {
            setStatus('stopping...');
            const closeEmus = document.getElementById('stop-emulators-chk').checked;
            const avds = await runningAvds().catch(() => []);
            for (const a of avds) {
                const r = await androidNodeApi('POST', '/stop', { avd: a.name });
                gl(tag, `${a.name}: ${r.ok ? 'node stopped' : (r.j.error || 'error')}`);
                if (closeEmus) { const e = await emuApi('POST', '/api/emulator/stop', { avd: a.name }); gl(tag, `${a.name}: ${e.ok ? 'emulator stopped' : (e.j.error || 'error')}`); }
            }
            gl(tag, 'Stopping the headless nodes...');
            document.getElementById('stop-all-btn').click();
            setStatus('stopped', '');
            setTimeout(refreshAndroidDevices, 1500); setTimeout(refreshNetwork, 5000);
        } catch (e) { gl(tag, e.message); setStatus('error', 'bad'); }
        finally { busy = false; startBtn.disabled = stopBtn.disabled = false; }
    };
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
