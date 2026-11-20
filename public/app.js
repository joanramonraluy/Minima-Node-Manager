const socket = io();
// Global node mode: 'classic' (MDS) or 'core' (Minima Core 1.1). Persisted server-side in config.json.
window.nodeMode = 'classic';
function defaultMobilePackage() {
    return window.nodeMode === 'core' ? 'org.minima.core' : 'com.minima.android';
}
const MAX_NODES = 26;
let visibleNodes = 0;

// DOM Elements
// DOM Elements
// DOM Elements
let grid, globalLog, template;
let nodeCountInput;

document.addEventListener('DOMContentLoaded', () => {
    grid = document.querySelector('.grid');
    // globalLog = document.getElementById('global-log'); // Removed in favor of inline logs
    template = document.getElementById('node-template');
    nodeCountInput = document.getElementById('node-count-input');

    if (!template) {
        console.error("Critical: 'node-template' not found in DOM.");
        return;
    }

    if (nodeCountInput) {
        // Use 'input' for smoother feedback, but be careful with validation
        nodeCountInput.addEventListener('input', () => {
            let rawVal = parseInt(nodeCountInput.value);
            if (isNaN(rawVal)) return;

            let count = rawVal;
            if (count < 1) count = 1;
            if (count > MAX_NODES) count = MAX_NODES;

            // Only update value if it was clamped to prevent cursor jumping on valid inputs
            if (count !== rawVal) {
                nodeCountInput.value = count;
            }

            updateVisibleNodes(count);
        });
    }


    const toggleViewBtn = document.getElementById('toggle-view-btn');
    if (toggleViewBtn) {
        toggleViewBtn.onclick = () => {
            grid.classList.toggle('list-view');
        };
    }

    // Init: Load saved Global Start Configuration first, then initialize grid
    const savedGlobalConfig = (typeof loadGlobalStartConfig === 'function') ? loadGlobalStartConfig() : null;
    initGrid();
    if (savedGlobalConfig && savedGlobalConfig.hasApplied && typeof applyGlobalConfigToAllNodes === 'function') {
        applyGlobalConfigToAllNodes({ showFeedback: false });
    }
});

// Tab Switching Logic
// Tab Switching Logic
let transitionTimeout;
let lastDAppSwitchTime = 0;

window.openTab = function (evt, tabName) {
    if (transitionTimeout) {
        clearTimeout(transitionTimeout);
        transitionTimeout = null;
    }

    const nextTab = document.getElementById(tabName);
    const currentTab = document.querySelector(".tab-content.show");

    // Update Topbar Buttons
    const tabLinks = document.getElementsByClassName("topbar-link");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].className = tabLinks[i].className.replace(" active", "");
    }
    evt.currentTarget.className += " active";

    // Case 1: Clicking the tab that is already fully active
    if (currentTab === nextTab && nextTab.classList.contains("active")) {
        return;
    }

    // Case 2: Clicking the tab that is currently fading out (restoring it)
    if (currentTab === nextTab && !nextTab.classList.contains("active")) {
        requestAnimationFrame(() => nextTab.classList.add("active"));
        return;
    }

    // Case 3: Switching tabs
    if (currentTab) {
        currentTab.classList.remove("active"); // Start fade out

        transitionTimeout = setTimeout(() => {
            currentTab.classList.remove("show"); // Hide old

            if (nextTab) {
                nextTab.classList.add("show"); // Show new
                // Force reflow
                void nextTab.offsetWidth;
                nextTab.classList.add("active"); // Start fade in
            }
            transitionTimeout = null;
        }, 200); // Match CSS transition time
    } else {
        // Initial state or nothing selected
        if (nextTab) {
            nextTab.classList.add("show", "active");
        }
    }

    // Auto-refresh dApps when entering dApp tab
    if (tabName === 'tab-dapps') {
        const now = Date.now();
        // Debounce: Only refresh if > 2 seconds since last refresh
        if (now - lastDAppSwitchTime > 2000) {
            console.log("Switching to dApp tab - triggering auto-refresh");
            // Trigger refresh regardless of button state
            if (typeof socket !== 'undefined') {
                socket.emit('get-dapps');
                socket.emit('get-adb-devices');
                lastDAppSwitchTime = now;
            } else {
                console.error("Socket not defined when trying to auto-refresh dApps");
            }
        } else {
            console.log("Skipping dApp auto-refresh (debounce active)");
        }

        // Disable button if it exists (though it might be hidden now)
        const refreshBtn = document.getElementById('refresh-dapps-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
        }
    }

    if (tabName === 'tab-build') {
        // No longer need to fetch ADB devices here as build is source-only
    }
};

// Initialize Grid (Start with 2 nodes)

// Initialize Grid (Start with 2 nodes)
// Initialize Grid (Start with input value, default 2)
function initGrid() {
    let count = 2;
    if (nodeCountInput && nodeCountInput.value) {
        count = parseInt(nodeCountInput.value);
        // Safety check for NaN
        if (isNaN(count)) count = 2;
    }
    updateVisibleNodes(count);
}

function addNode() {
    if (visibleNodes >= MAX_NODES) {
        alert('Maximum number of nodes reached (26).');
        return;
    }

    visibleNodes++;
    const i = visibleNodes;
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.node-card');
    card.id = `node-${i}`;

    // Header
    card.querySelector('.node-id').textContent = i;
    // New IP Scheme: 10.0.0.1X (e.g. 11, 12..), Port 9001
    const ip = `10.0.0.${10 + i}`;
    const port = 9001;
    card.querySelector('.port-number').parentElement.textContent = `${ip}:${port}`;

    // Clickable Header to open Node MDS (Web UI)
    // Minima Web UI is on Port 9003 (MDS) and uses HTTPS
    const mdsPort = 9003;
    const nodeTitle = card.querySelector('.node-header h2');
    nodeTitle.title = `Open https://${ip}:${mdsPort}`;
    nodeTitle.onclick = () => {
        window.open(`https://${ip}:${mdsPort}/`, '_blank');
    };

    // Defaults
    const hostCheck = card.querySelector('.host-check');
    const cleanCheck = card.querySelector('.clean-check');
    const genesisCheck = card.querySelector('.genesis-check');
    const genesisContainer = card.querySelector('.genesis-container');
    const connectGroup = card.querySelector('.connect-group');
    const connectInput = card.querySelector('.connect-input');

    if (i === 1) {
        // Node 1: Genesis default ON, Clean default OFF/Hidden, No Connect Field
        genesisCheck.checked = true;
        cleanCheck.checked = false;
        cleanCheck.parentElement.style.display = 'none'; // Hide Clean Mode (Genesis implies clean)
        connectGroup.style.display = 'none'; // Hide Connect
    } else {
        // Node 2+: Clean default ON, Connect Field visible
        cleanCheck.checked = true;
        genesisContainer.style.display = 'none'; // Hide Genesis
        connectInput.value = '10.0.0.11:9001'; // Default connect to Node 1
    }

    // Hide "Connect to Node 1" button logic removed

    // Event Listeners
    // Event Listeners
    const startBtn = card.querySelector('.start-btn');
    const stopBtn = card.querySelector('.stop-btn');
    const copyBtn = card.querySelector('.copy-btn');
    const sendBtn = card.querySelector('.send-btn');
    const commandInput = card.querySelector('.command-bar .command-input');
    const disconnectBtn = card.querySelector('.disconnect-btn');
    const mainnetPresetBtn = card.querySelector('.mainnet-preset-btn');
    const deleteDataBtn = card.querySelector('.delete-data-btn');

    // ... existing button listeners ...

    if (deleteDataBtn) {
        deleteDataBtn.onclick = () => {
            deleteDataBtn.disabled = true;
            deleteDataBtn.textContent = 'Deleting...';
            socket.emit('delete-node-data', { id: i });
            // Re-enable after a delay or let status update handle it? 
            // Status update to 'stopped' will re-render card anyway, resetting button.
        };
    }

    if (mainnetPresetBtn) {
        mainnetPresetBtn.onclick = () => {
            // preset: Real Node ON, Test OFF, Connect to Megammr
            hostCheck.checked = true;

            // Find -test checkbox and uncheck it
            paramChecks.forEach(chk => {
                if (chk.value.trim() === '-test') {
                    chk.checked = false;
                }
            });

            // Set connect to mainnet seed
            if (i === 1) {
                // Force show connect input for Node 1 if Mainnet
                connectGroup.style.display = 'flex';
            }
            connectInput.value = 'megammr.minima.global:9001';

            updateCommandPreview();
        };
    }

    // Start Command Preview Logic
    const startCmdPreview = card.querySelector('.start-cmd-preview');
    const paramChecks = card.querySelectorAll('.param-check');

    const coreCleanCheck = card.querySelector('.core-clean-check');
    const coreRole = card.querySelector('.core-role');

    function updateCommandPreview() {
        if (window.nodeMode === 'core') {
            let ccmd = `./scripts/start_core_node.sh ${i}`;
            if (coreCleanCheck && coreCleanCheck.checked) ccmd += ' -clean';
            startCmdPreview.value = ccmd;
            if (coreRole) coreRole.textContent = i === 1 ? '-solo (creates genesis)' : '-test -nop2p -connect 10.0.0.11:9001';
            card.querySelector('.ip-port').innerHTML = `10.0.0.${10 + i}:<span class="port-number">9001</span> (RPC 9005)`;
            const coreTitle = card.querySelector('.node-header h2');
            coreTitle.title = '';
            coreTitle.onclick = null;
            return;
        }

        // If user manually edited, we might want to respect that?
        // For now, let's keep it simple: any checkbox change regenerates the command.

        const isHost = hostCheck.checked;

        // Auto-uncheck AND Disable Genesis logic REMOVED to allow Host + Genesis (Testnet)
        // ...

        let cmd = isHost ? `./scripts/start_host_node.sh ${i}` : `./scripts/start_node.sh ${i}`;

        if (cleanCheck.checked && cleanCheck.parentElement.style.display !== 'none') cmd += ' -clean';
        if (genesisCheck.checked && genesisContainer.style.display !== 'none') cmd += ' -genesis';

        const connectVal = connectInput.value.trim();
        const isMainnetMode = document.querySelector('input[name="global-network-mode"]:checked')?.value === 'mainnet';
        if (connectVal) {
            const flag = isMainnetMode ? '-p2pnodes' : '-connect';
            cmd += ` ${flag} ${connectVal}`;
        } else if (isMainnetMode) {
            cmd += ' -p2pnodes megammr.minima.global:9001';
        }


        paramChecks.forEach(chk => {
            // Mainnet: skip -test flag if checked
            if (isMainnetMode && chk.value.trim() === '-test') return;

            if (chk.checked) cmd += ` ${chk.value}`;
        });

        startCmdPreview.value = cmd;

        // Visual Updates for Host Node
        const portBase = isHost ? 9001 + (i - 1) * 100 : 9001;
        const ip = isHost ? '127.0.0.1' : `10.0.0.${10 + i}`;

        // Update Port Display
        card.querySelector('.ip-port').innerHTML = `${ip}:<span class="port-number">${portBase}</span>`;

        // Update Web UI Link
        const mdsPort = isHost ? 9003 + (i - 1) * 100 : 9003;
        const nodeTitle = card.querySelector('.node-header h2');
        nodeTitle.title = `Open https://${ip}:${mdsPort}`;
        nodeTitle.onclick = () => window.open(`https://${ip}:${mdsPort}/`, '_blank');

        // Update Connect Input placeholder/value if switching modes
        if (i > 1) {
            const node1Card = document.getElementById('node-1');
            const node1IsHost = node1Card ? node1Card.querySelector('.host-check').checked : false;

            let defaultTarget;
            if (node1IsHost) {
                // If Node 1 is Real, it's on the host. 
                // Virtual nodes reach it via the gateway (10.0.0.1).
                // Real nodes reach it via localhost.
                defaultTarget = isHost ? '127.0.0.1:9001' : '10.0.0.1:9001';
            } else {
                // If Node 1 is Virtual, it's always at 10.0.0.11.
                defaultTarget = '10.0.0.11:9001';
            }

            connectInput.placeholder = defaultTarget;

            // Auto-update value ONLY if it was previously matching a default and the default changed
            const oldValues = ['10.0.0.11:9001', '127.0.0.1:9001', '10.0.0.1:9001'];
            if (oldValues.includes(connectInput.value)) {
                connectInput.value = defaultTarget;
            }
        }
    }

    // Attach listeners to all inputs that affect the command
    hostCheck.addEventListener('change', updateCommandPreview);
    cleanCheck.addEventListener('change', updateCommandPreview);
    genesisCheck.addEventListener('change', updateCommandPreview);
    connectInput.addEventListener('input', updateCommandPreview);
    paramChecks.forEach(chk => chk.addEventListener('change', updateCommandPreview));
    if (coreCleanCheck) coreCleanCheck.addEventListener('change', updateCommandPreview);

    // Initialize Preview
    card.updatePreview = updateCommandPreview;
    updateCommandPreview();

    // If global start config was applied, sync this newly added card
    if (window._hasGlobalConfigApplied && typeof applyGlobalConfigToSingleNode === 'function') {
        applyGlobalConfigToSingleNode(card, i);
    }

    const clearLogBtn = card.querySelector('.clear-log-btn');
    if (clearLogBtn) {
        clearLogBtn.onclick = () => {
            card.querySelector('.log-content').textContent = '';
        };
    }

    startBtn.onclick = () => {
        // OLD: Collect Advanced Params
        /*
        const advancedParams = [];
        paramChecks.forEach(chk => {
            if (chk.checked) advancedParams.push(chk.value);
        });
    
        const options = {
            clean: cleanCheck.checked,
            genesis: i === 1 ? genesisCheck.checked : false,
            connect: i > 1 ? connectInput.value : '',
            advancedParams: advancedParams
        };
        socket.emit('start-node', { id: i, options });
        */

        // NEW: Send the raw command string
        // We trim just in case
        const rawCommand = startCmdPreview.value.trim();
        if (rawCommand) {
            const autoNameCheck = document.getElementById('auto-name-check');
            const autoName = autoNameCheck ? autoNameCheck.checked : false;
            socket.emit('start-node', { id: i, command: rawCommand, isHost: hostCheck.checked, autoName });

            // Auto-sync peers from URL if enabled
            const autoSyncCheck = document.getElementById('auto-sync-peers-check');
            const isMainnetMode = document.querySelector('input[name="global-network-mode"]:checked')?.value === 'mainnet';

            if (autoSyncCheck && autoSyncCheck.checked && isMainnetMode) {
                // Delay sync slightly to ensure node has time to open its ports/P2P
                setTimeout(() => {
                    socket.emit('sync-peers');
                }, 5000);
            }
        }
    };

    stopBtn.onclick = () => {
        socket.emit('stop-node', { id: i });
    };

    disconnectBtn.onclick = () => {
        if (disconnectBtn.textContent.includes('Disconnect')) {
            socket.emit('disconnect-node', { id: i });
            // Optimistic Update - Change to disconnected state
            disconnectBtn.textContent = 'Reconnect Net';
            disconnectBtn.classList.remove('btn-net-connected');
            disconnectBtn.classList.add('btn-net-disconnected');
        } else {
            socket.emit('reconnect-node', { id: i });
            // Change to connected state
            disconnectBtn.textContent = 'Disconnect Net';
            disconnectBtn.classList.remove('btn-net-disconnected');
            disconnectBtn.classList.add('btn-net-connected');
        }
    };

    // Export .env - REMOVED from card (Moved to Vite Tab)
    /* 
    const exportEnvBtn = card.querySelector('.export-env-btn');
    if (exportEnvBtn) { ... } 
    */

    /*
    // Connect to Node 1 Button Removed
    connectToNode1Btn.onclick = () => { ... }
    */

    sendBtn.onclick = () => sendCommand(i, commandInput);
    commandInput.onkeydown = (e) => {
        if (e.key === 'Enter') sendCommand(i, commandInput);
    };

    copyBtn.onclick = () => {
        const logContent = card.querySelector('.log-content').textContent;
        navigator.clipboard.writeText(logContent)
            .then(() => {
                const msg = `[System] Node ${i} log copied to clipboard.`;
                addToGlobalLog(msg);

                // Visual feedback: change button color
                const originalBg = copyBtn.style.backgroundColor;
                const originalColor = copyBtn.style.color;
                copyBtn.style.setProperty('background-color', '#38b000'); // Green for success
                copyBtn.style.color = '#000';
                copyBtn.textContent = '✓ Copied';
                setTimeout(() => {
                    copyBtn.style.backgroundColor = originalBg;
                    copyBtn.style.color = originalColor;
                    copyBtn.textContent = 'Copy Log';
                }, 1500);
            })
            .catch(err => console.error('Failed to copy code: ', err));
    };

    grid.appendChild(clone);
}



function sendCommand(id, input) {
    const command = input.value;
    if (command.trim()) {
        socket.emit('send-command', { id, command });
        input.value = '';
    }
}

// Global Controls
// nodeCountInput initialized in DOMContentLoaded and listener attached there
// See top of file

function updateVisibleNodes(targetCount) {
    // Add nodes if needed
    while (visibleNodes < targetCount) {
        addNode();
    }

    // Remove nodes if needed
    while (visibleNodes > targetCount) {
        removeNode();
    }
}

function removeNode() {
    if (visibleNodes <= 0) return;
    const i = visibleNodes;
    const card = document.getElementById(`node-${i}`);
    if (card) {
        card.remove();
    }
    visibleNodes--;
}

document.getElementById('start-all-btn').onclick = () => {
    addToGlobalLog('[System] Starting all nodes...');
    // Determine how many nodes to start - all visible ones
    for (let i = 1; i <= visibleNodes; i++) {
        const card = document.getElementById(`node-${i}`);
        if (card && card.querySelector('.start-btn').disabled === false) {
            card.querySelector('.start-btn').click();
        }
    }
};

document.getElementById('stop-all-btn').onclick = () => {
    addToGlobalLog('[System] Stopping all nodes...');
    socket.emit('stop-all');
};
document.getElementById('kill-all-btn').onclick = () => {
    addToGlobalLog('[System] Force killing all nodes...');
    socket.emit('kill-all');
};

const deleteAllDataBtn = document.getElementById('delete-all-data-btn');
if (deleteAllDataBtn) {
    deleteAllDataBtn.onclick = () => {
        deleteAllDataBtn.disabled = true;
        deleteAllDataBtn.textContent = ' WIPING DATA...';
        socket.emit('delete-all-data');
        // Re-enable after 3 seconds as feedback
        setTimeout(() => {
            deleteAllDataBtn.disabled = false;
            deleteAllDataBtn.textContent = '⚠ DELETE ALL DATA ⚠';
        }, 3000);
    };
}

const addNodeBtn = document.getElementById('add-node-btn');
if (addNodeBtn) {
    addNodeBtn.onclick = () => {
        let count = parseInt(nodeCountInput.value);
        if (count < MAX_NODES) {
            count++;
            nodeCountInput.value = count;
            updateVisibleNodes(count);
        } else {
            alert('Maximum number of nodes reached.');
        }
    };
}

const clearAllLogsBtn = document.getElementById('clear-all-logs-btn');
if (clearAllLogsBtn) {
    clearAllLogsBtn.onclick = () => {
        // Clear all node logs
        document.querySelectorAll('.log-content').forEach(el => el.textContent = '');
        // Clear global log if we want? Maybe distinct.
        // Let's clear the global log too for a full "clean slate" feel, or just node logs.
        // User asked "clean terminals", let's assume all.
        const systemLog = document.getElementById('system-log');
        if (systemLog) systemLog.innerHTML = '';

        addToGlobalLog('[System] All logs cleared.');
    };
}

// Core: open every AVD that is not running yet (button in the Android nodes section; does not start nodes)
const openAllEmulatorsBtn = document.getElementById('open-all-emulators-btn');
if (openAllEmulatorsBtn) openAllEmulatorsBtn.onclick = () => {
    fetch('/api/emulator/launch-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(r => r.json()).then(j => {
            if (j.error) { addToGlobalLog(`[Emulator] ${j.error}`); return; }
            const todo = j.avds.filter(a => a.plan === 'launch').length;
            addToGlobalLog(`[Emulator] Open All: ${todo} to launch, ${j.avds.length - todo} already running/starting (progress below).`);
            setTimeout(refreshAndroidDevices, 4000);
        }).catch(e => addToGlobalLog(`[Emulator] ${e.message}`));
};

// Classic: open the MDS web UI of every running node
document.getElementById('open-all-btn').onclick = () => {
    let opened = 0;
    // Determine loop range
    for (let i = 1; i <= visibleNodes; i++) {
        const card = document.getElementById(`node-${i}`);
        if (card) {
            const indicator = card.querySelector('.status-indicator');
            // Check for running class
            if (indicator && indicator.classList.contains('running')) {
                const isHost = card.querySelector('.host-check').checked;
                const ip = isHost ? '127.0.0.1' : `10.0.0.${10 + i}`;
                const mdsPort = isHost ? 9003 + (i - 1) * 100 : 9003;
                window.open(`https://${ip}:${mdsPort}/`, '_blank');
                opened++;
            }
        }
    }

    if (opened === 0) {
        alert('No running nodes found to open. Start some nodes first!');
    } else {
        addToGlobalLog(`[System] Opening ${opened} nodes in browser tabs... (If blocked, please allow popups!)`);
    }
};
// toggle-view-btn listener moved to DOMContentLoaded


// Vite Controls
const startViteBtn = document.getElementById('start-vite-btn');
const stopViteBtn = document.getElementById('stop-vite-btn');
const openAppBtn = document.getElementById('open-app-btn');

// Config / Settings
const configProjectPathInput = document.getElementById('config-project-path');
const configDappNameInput = document.getElementById('config-dapp-name');
const configEnvPathInput = document.getElementById('config-env-path');
const configAdbPathInput = document.getElementById('config-adb-path');
const saveConfigBtn = document.getElementById('save-config-btn');

// Default Config
let globalConfig = {
    projectPath: '/home/joanramon/dev/Minima/metachain',
    dappName: 'MetaChain',
    envPath: '/home/joanramon/dev/Minima/metachain/.env',
    dappLocation: '/home/joanramon/dev/Minima/metachain/build/dapp.minidapp',
    adbPath: 'adb',
    apkInstallPath: '',
    adbPushPath: '',
    adbPushRemotePath: '/sdcard/Download/',
    mobilePackageName: 'com.minima.android',
    mode: 'classic',
    ramLimit: '256m',
    cpuLimit: 1
};

// Listen for Config from Server
function applyNodeMode(mode) {
    const m = mode === 'core' ? 'core' : 'classic';
    const changed = window.nodeMode !== m;
    window.nodeMode = m;
    document.body.dataset.mode = m;
    const nodesLabel = document.getElementById('nodes-group-label');
    if (nodesLabel) nodesLabel.textContent = m === 'core' ? 'Desktop nodes' : 'Nodes';
    const startAllBtn = document.getElementById('start-all-btn');
    if (startAllBtn) startAllBtn.title = m === 'core'
        ? 'Start every Core node process on this computer (does NOT launch emulators or Android nodes)'
        : 'Start every visible Classic node';
    if (m === 'core' && typeof refreshNetwork === 'function') setTimeout(refreshNetwork, 300);
    // The ADB/log block lives in dApp Manager (Classic) or the Emulators tab (Core)
    const adbBlock = document.getElementById('android-mgmt-block');
    const adbSlot = document.getElementById(m === 'core' ? 'emulators-adb-slot' : 'tab-dapps');
    if (adbBlock && adbSlot && adbBlock.parentElement !== adbSlot) adbSlot.appendChild(adbBlock);
    const sel = document.getElementById('mode-select');
    if (sel) sel.value = m;
    if (changed) {
        // Regenerate every node card's command preview for the new mode
        document.querySelectorAll('.node-card').forEach(c => { if (c.updatePreview) c.updatePreview(); });
        // Leave a tab that is hidden in this mode
        const shown = document.querySelector('.tab-content.show');
        if (shown && getComputedStyle(shown).display === 'none') {
            const nodesBtn = document.querySelector('.topbar-link');
            if (nodesBtn) nodesBtn.click();
        }
    }
}

const modeSelectEl = document.getElementById('mode-select');
if (modeSelectEl) {
    modeSelectEl.addEventListener('change', () => {
        // Server persists it and echoes config-update (it reverts the selector if nodes are running)
        socket.emit('update-config', { ...globalConfig, mode: modeSelectEl.value });
    });
}

socket.on('config-update', (config) => {
    globalConfig = { ...globalConfig, ...config };
    applyNodeMode(globalConfig.mode);

    // Update UI Inputs
    if (configProjectPathInput) configProjectPathInput.value = globalConfig.projectPath;
    if (configDappNameInput) configDappNameInput.value = globalConfig.dappName;
    if (configEnvPathInput) configEnvPathInput.value = globalConfig.envPath;
    if (configAdbPathInput) configAdbPathInput.value = globalConfig.adbPath || 'adb';

    const configMobilePkgInput = document.getElementById('config-mobile-package-name');
    const apkPackageNameInput = document.getElementById('apk-package-name-input');
    if (configMobilePkgInput) configMobilePkgInput.value = config.mobilePackageName || defaultMobilePackage();
    if (apkPackageNameInput) apkPackageNameInput.value = config.mobilePackageName || defaultMobilePackage();

    const ramLimitInput = document.getElementById('global-ram-limit');
    if (ramLimitInput) ramLimitInput.value = globalConfig.ramLimit || '256m';

    const cpuLimitInput = document.getElementById('global-cpu-limit');
    if (cpuLimitInput) cpuLimitInput.value = globalConfig.cpuLimit || 1;

    const dappLocationInput = document.getElementById('dapp-location-config');
    if (dappLocationInput) dappLocationInput.value = globalConfig.dappLocation;

    // Also update build workspace path if it exists
    const buildWorkspaceInput = document.getElementById('build-workspace-path');
    if (buildWorkspaceInput) buildWorkspaceInput.value = globalConfig.projectPath;

    // Update APK Install and ADB Push paths
    const apkLocationInput = document.getElementById('apk-location-input');
    const adbPushLocalInput = document.getElementById('adb-push-local-input');
    const adbPushRemoteInput = document.getElementById('adb-push-remote-input');

    if (apkLocationInput) apkLocationInput.value = globalConfig.apkInstallPath || '';
    if (adbPushLocalInput) adbPushLocalInput.value = globalConfig.adbPushPath || '';
    if (adbPushRemoteInput) adbPushRemoteInput.value = globalConfig.adbPushRemotePath || '/sdcard/Download/';

    // Sync Global Start Configuration from server if present and not in local storage
    if (globalConfig.globalStartConfig && typeof applyGlobalStartConfigToUI === 'function') {
        try {
            const local = localStorage.getItem('minima_global_start_config');
            if (!local) {
                applyGlobalStartConfigToUI(globalConfig.globalStartConfig, true);
            }
        } catch (e) {
            console.error('Error checking localStorage for global start config:', e);
        }
    }

    // Log only if it seems like a new update (to avoid log spam on connect)
    // addToGlobalLog('[System] Configuration synced from server.');
});

// Load defaults
configProjectPathInput.value = globalConfig.projectPath;
configDappNameInput.value = globalConfig.dappName;
configEnvPathInput.value = globalConfig.envPath;
configAdbPathInput.value = globalConfig.adbPath;

saveConfigBtn.onclick = () => {
    globalConfig.projectPath = configProjectPathInput.value.trim();
    globalConfig.dappName = configDappNameInput.value.trim();
    globalConfig.envPath = configEnvPathInput.value.trim();
    globalConfig.adbPath = configAdbPathInput.value.trim() || 'adb';

    const configMobilePkgInput = document.getElementById('config-mobile-package-name');
    const apkPackageNameInput = document.getElementById('apk-package-name-input');
    if (configMobilePkgInput) {
        globalConfig.mobilePackageName = configMobilePkgInput.value.trim() || defaultMobilePackage();
    } else if (apkPackageNameInput) {
        globalConfig.mobilePackageName = apkPackageNameInput.value.trim() || defaultMobilePackage();
    }

    const ramLimitInput = document.getElementById('global-ram-limit');
    if (ramLimitInput) {
        globalConfig.ramLimit = ramLimitInput.value.trim() || '256m';
    }

    const cpuLimitInput = document.getElementById('global-cpu-limit');
    if (cpuLimitInput) {
        globalConfig.cpuLimit = parseInt(cpuLimitInput.value) || 1;
    }

    addToGlobalLog(`[Config] Saved: Project=${globalConfig.projectPath}, Dapp=${globalConfig.dappName}, ADB=${globalConfig.adbPath}`);

    // Send update to server
    socket.emit('update-config', globalConfig);
};


// Vite Controls
if (startViteBtn) {
    startViteBtn.onclick = () => {
        const logObj = document.getElementById('vite-log');
        if (logObj) logObj.textContent = 'Starting Vite Server...\n';

        startViteBtn.disabled = true;
        startViteBtn.textContent = 'Starting...';
        socket.emit('start-vite');
    };
}

if (stopViteBtn) {
    stopViteBtn.onclick = () => {
        stopViteBtn.disabled = true;
        socket.emit('stop-vite');
    };
}

const viteBuildBtn = document.getElementById('vite-build-btn');
if (viteBuildBtn) {
    viteBuildBtn.onclick = () => {
        const logObj = document.getElementById('vite-log');
        if (logObj) logObj.textContent = 'Starting Build Process...\n';

        viteBuildBtn.disabled = true;
        viteBuildBtn.textContent = 'Building...';
        socket.emit('run-vite-build-only');
    };

    socket.on('vite-build-complete', () => {
        viteBuildBtn.disabled = false;
        viteBuildBtn.textContent = 'Build Project';
    });
}

if (openAppBtn) {
    openAppBtn.onclick = () => {
        // We need to know the port. Usually 5173. 
        // We can just open localhost:5173 for now or parse from logs if complex.
        window.open('http://localhost:5173', '_blank');
    };
}

// Batch dApp Management
const dappLocationConfigInput = document.getElementById('dapp-location-config');
const batchInstallBtn = document.getElementById('batch-install-btn');
const batchUpdateBtn = document.getElementById('batch-update-btn');
const dappSelect = document.getElementById('dapp-select');
const refreshDappsBtn = document.getElementById('refresh-dapps-btn');
const batchUninstallBtn = document.getElementById('batch-uninstall-btn');

// Set default location
dappLocationConfigInput.value = globalConfig.dappLocation;

const dappWriteModeCheck = document.getElementById('dapp-write-mode-check');

batchInstallBtn.onclick = () => {
    const logObj = document.getElementById('dapp-log');
    if (logObj) logObj.textContent = 'Starting Smart Deployment Process...\n';

    const filePath = dappLocationConfigInput.value.trim();
    const writeMode = dappWriteModeCheck ? dappWriteModeCheck.checked : false;
    if (filePath) {
        socket.emit('batch-dapp-install', { filePath, writeMode });
    } else {
        alert('Please specify the dApp Build Location file path.');
    }
};

const mobilePushBtn = document.getElementById('mobile-push-btn');
if (mobilePushBtn) {
    mobilePushBtn.onclick = () => {
        const logObj = document.getElementById('dapp-log');
        if (logObj) logObj.textContent = 'Starting Direct Mobile Push Process...\n';

        const filePath = dappLocationConfigInput.value.trim();
        const deviceId = getSelectedAdbDevice('dapps');

        if (filePath) {
            socket.emit('mobile-dapp-push', { filePath, deviceId });
            mobilePushBtn.disabled = true;
            mobilePushBtn.textContent = 'Pushing...';
        } else {
            alert('Please specify the dApp Build Location file path.');
        }
    };

    socket.on('mobile-push-complete', () => {
        if (mobilePushBtn) {
            mobilePushBtn.disabled = false;
            mobilePushBtn.textContent = 'Push to Mobile (ADB)';
        }
    });
}

// dApp Refresh List Logic
refreshDappsBtn.onclick = () => {
    refreshDappsBtn.disabled = true;
    socket.emit('get-dapps');
};

// Config Dapp Fetch
const refreshConfigDappsBtn = document.getElementById('refresh-config-dapps-btn');
const dappNameList = document.getElementById('dapp-name-list');

if (refreshConfigDappsBtn) {
    refreshConfigDappsBtn.onclick = () => {
        refreshConfigDappsBtn.disabled = true;
        socket.emit('get-dapps');
    };
}

socket.on('dapp-list', (dapps) => {
    if (refreshDappsBtn) refreshDappsBtn.disabled = false;
    if (refreshConfigDappsBtn) refreshConfigDappsBtn.disabled = false;

    // 1. Update Uninstall Dropdown
    if (dappSelect) {
        dappSelect.innerHTML = '<option value="">-- Select dApp to Uninstall --</option>';
        if (dapps && dapps.length > 0) {
            dapps.forEach(dapp => {
                const option = document.createElement('option');
                option.value = dapp.uid;
                option.setAttribute('data-name', dapp.name);
                option.textContent = `${dapp.name} (${dapp.version}) - ${dapp.uid.substring(0, 8)}...`;
                dappSelect.appendChild(option);
            });
        }
    }

    // 2. Update Dapp Name Datalist
    if (dappNameList) {
        dappNameList.innerHTML = '';
        if (dapps) {
            // Unique names
            const names = [...new Set(dapps.map(d => d.name))];
            names.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                dappNameList.appendChild(option);
            });
        }
    }

    if (dapps && dapps.length > 0) {
        addToGlobalLog(`[System] Loaded ${dapps.length} dApps.`);
    } else {
        addToGlobalLog(`[System] No dApps found or failed to fetch.`);
    }
});

batchUninstallBtn.onclick = () => {
    const logObj = document.getElementById('dapp-log');
    if (logObj) logObj.textContent = 'Starting Uninstall Process...\n';

    const uid = dappSelect.value;
    if (uid) {
        const selectedOption = dappSelect.options[dappSelect.selectedIndex];
        const name = selectedOption.getAttribute('data-name');
        socket.emit('batch-dapp-uninstall', { uid, name });
        // Optimistic removal from list
        dappSelect.remove(dappSelect.selectedIndex);
        dappSelect.value = "";
    } else {
        alert('Please select a dApp to uninstall.');
    }
};

// Generic APK Install
let isApkInstalling = false;
let isApkUninstalling = false;
const apkLocationInput = document.getElementById('apk-location-input');
const apkInstallBtn = document.getElementById('apk-install-btn');

if (apkInstallBtn) {
    apkInstallBtn.onclick = () => {
        const filePath = apkLocationInput.value.trim();
        const deviceId = getSelectedAdbDevice('dapps');

        if (filePath) {
            const dappLog = document.getElementById('dapp-log');
            if (dappLog) dappLog.textContent = `Starting APK installation: ${filePath}...\n`;

            isApkInstalling = true;
            apkInstallBtn.disabled = true;
            socket.emit('run-adb-install', { filePath, deviceId });
        } else {
            alert('Please select or enter an APK file path.');
        }
    };

    // Unified build-complete handler for all build/ADB operations
    socket.on('build-complete', () => {
        // Build Pipeline Tab Buttons
        if (buildZipBtn) buildZipBtn.disabled = false;
        if (buildAndroidBtn) buildAndroidBtn.disabled = false;
        if (buildFullBtn) buildFullBtn.disabled = false;

        // dApp Manager Tab Buttons
        if (apkInstallBtn) apkInstallBtn.disabled = false;
        if (apkUninstallBtn) apkUninstallBtn.disabled = false;
        if (adbPushBtn) adbPushBtn.disabled = false;

        // Reset Flags
        isApkInstalling = false;
        isApkUninstalling = false;
        isAdbPushing = false;
    });
}

// ADB Push
let isAdbPushing = false;
const adbPushLocalInput = document.getElementById('adb-push-local-input');
const adbPushRemoteInput = document.getElementById('adb-push-remote-input');
const adbPushBtn = document.getElementById('adb-push-btn');

if (adbPushBtn) {
    adbPushBtn.onclick = () => {
        const localPath = adbPushLocalInput.value.trim();
        const remotePath = adbPushRemoteInput.value.trim();
        const deviceId = getSelectedAdbDevice('dapps');

        if (localPath && remotePath) {
            const dappLog = document.getElementById('dapp-log');
            if (dappLog) dappLog.textContent = `Starting ADB Push: ${localPath} -> ${remotePath}...\n`;

            isAdbPushing = true;
            adbPushBtn.disabled = true;
            socket.emit('run-adb-push', { localPath, remotePath, deviceId });
        } else {
            alert('Please select a local file and enter a remote destination.');
        }
    };

    // (Unified handler above)
}

// Generic APK Uninstall
const apkUninstallBtn = document.getElementById('apk-uninstall-btn');
const apkPackageNameInput = document.getElementById('apk-package-name-input');
const apkPackageNameSelect = document.getElementById('apk-package-name-select');
const refreshAdbPackagesBtn = document.getElementById('refresh-adb-packages-btn');

if (apkUninstallBtn) {
    apkUninstallBtn.onclick = () => {
        const packageName = apkPackageNameSelect.value;
        const deviceId = getSelectedAdbDevice('dapps');

        if (packageName) {
            const dappLog = document.getElementById('dapp-log');
            if (dappLog) dappLog.textContent = `Starting APK uninstallation for: ${packageName}...\n`;

            isApkUninstalling = true;
            apkUninstallBtn.disabled = true;
            socket.emit('run-adb-uninstall', { packageName, deviceId });
        } else {
            alert('Please select a package name to uninstall.');
        }
    };

    // (Unified handler above)
}

if (refreshAdbPackagesBtn) {
    refreshAdbPackagesBtn.onclick = () => {
        const deviceId = getSelectedAdbDevice('dapps');
        refreshAdbPackagesBtn.disabled = true;
        refreshAdbPackagesBtn.textContent = '🔄...';
        socket.emit('get-adb-packages', { deviceId });
    };
}

socket.on('adb-package-list', (data) => {
    if (refreshAdbPackagesBtn) {
        refreshAdbPackagesBtn.disabled = false;
        refreshAdbPackagesBtn.textContent = '🔄 Packages';
    }

    if (data.error) {
        addToGlobalLog(`[ADB] Error listing packages: ${data.error}`);
        return;
    }

    if (apkPackageNameSelect) {
        const currentVal = apkPackageNameSelect.value || globalConfig.mobilePackageName;
        apkPackageNameSelect.innerHTML = '<option value="">-- Select Package --</option>';
        data.packages.forEach(pkg => {
            const option = document.createElement('option');
            option.value = pkg;
            option.textContent = pkg;
            apkPackageNameSelect.appendChild(option);
        });

        // Restore selection if it exists in new list
        if (data.packages.includes(currentVal)) {
            apkPackageNameSelect.value = currentVal;
            if (apkPackageNameInput) apkPackageNameInput.value = currentVal;
        }
    }
});

if (apkPackageNameSelect) {
    apkPackageNameSelect.onchange = () => {
        const val = apkPackageNameSelect.value;
        if (apkPackageNameInput) {
            apkPackageNameInput.value = val;
            // Trigger change to auto-save config
            apkPackageNameInput.dispatchEvent(new Event('change'));
        }
        // Also update globalConfig directly for immediate use
        globalConfig.mobilePackageName = val;
        socket.emit('update-config', globalConfig);
    };
}

// Auto-refresh on dropdown interaction
if (dappSelect) {
    // We use 'mousedown' to trigger before the menu opens, though standard selects are tricky.
    // It's a best-effort attempt.
    let lastRefresh = 0;
    dappSelect.addEventListener('mousedown', () => {
        const now = Date.now();
        // Throttle to avoid excessive requests (e.g. 5 seconds)
        if (now - lastRefresh > 5000) {
            console.log("Dropdown interaction - triggering auto-refresh");
            socket.emit('get-dapps');
            lastRefresh = now;
        }
    });
}

socket.on('vite-status', (status) => {
    if (status === 'running') {
        startViteBtn.disabled = true;
        stopViteBtn.disabled = false;
        startViteBtn.textContent = 'Vite Running...';
        // Show Open App Button (assuming standard port 5173 for now, could be dynamic)
        openAppBtn.style.display = 'inline-block';
    } else {
        startViteBtn.disabled = false;
        stopViteBtn.disabled = true;
        startViteBtn.textContent = 'Start Vite Server';
        openAppBtn.style.display = 'none';
    }
});

// Build & Zip Feature
const buildZipBtn = document.getElementById('build-zip-btn');
const buildAndroidBtn = document.getElementById('build-android-btn');
const buildOutputObj = document.getElementById('build-output');
const copyBuildOutputBtn = document.getElementById('copy-build-output-btn');

if (buildZipBtn) {
    buildZipBtn.onclick = () => {
        buildOutputObj.textContent = 'Starting Build & Zip process...\n';
        buildZipBtn.disabled = true;
        if (buildAndroidBtn) buildAndroidBtn.disabled = true;
        if (buildFullBtn) buildFullBtn.disabled = true;
        socket.emit('run-build-zip');
    };
}

if (buildAndroidBtn) {
    buildAndroidBtn.onclick = () => {
        buildOutputObj.textContent = 'Starting Refined Android Build process (Clean Pipeline)...\n';
        buildAndroidBtn.disabled = true;
        if (buildZipBtn) buildZipBtn.disabled = true;
        if (buildFullBtn) buildFullBtn.disabled = true;
        // Server will now force --no-install
        socket.emit('run-android-build');
    };
}

const buildFullBtn = document.getElementById('build-full-btn');
if (buildFullBtn) {
    buildFullBtn.onclick = () => {
        buildOutputObj.textContent = 'Starting Refined Build All process (Clean Pipeline: MiniDapp + Android)...\n';
        buildFullBtn.disabled = true;
        if (buildZipBtn) buildZipBtn.disabled = true;
        if (buildAndroidBtn) buildAndroidBtn.disabled = true;
        // Server will now force --no-install
        socket.emit('run-full-build');
    };
}


const zipInstallBtn = document.getElementById('zip-install-btn');
if (zipInstallBtn) {
    zipInstallBtn.onclick = () => {
        const workspace = document.getElementById('build-workspace-path').value.trim();
        buildOutputObj.textContent = 'Starting Zip & Install...\n';
        zipInstallBtn.disabled = true;
        socket.emit('run-zip-install', { workspace });
    };
}

socket.on('zip-install-complete', () => {
    if (zipInstallBtn) zipInstallBtn.disabled = false;
});

if (copyBuildOutputBtn) {
    copyBuildOutputBtn.onclick = () => {
        navigator.clipboard.writeText(buildOutputObj.textContent)
            .then(() => {
                const originalText = copyBuildOutputBtn.textContent;
                copyBuildOutputBtn.textContent = 'Copied!';
                setTimeout(() => copyBuildOutputBtn.textContent = originalText, 1500);
            });
    };
}

socket.on('build-output', (data) => {
    // Both build-output and dApp log should use appendLog for consistency
    appendLog('build-output', data, false);

    // Mirror to dApp log if APK is installing, uninstalling or ADB push is running
    if (isApkInstalling || isApkUninstalling || isAdbPushing) {
        appendLog('dapp-log', data, false);
    }
});

socket.on('build-complete', (data) => {
    const { success } = data;
    buildOutputObj.textContent += `\n=== Process ${success ? 'Completed Successfully' : 'Failed'} ===\n`;
});


// --- File Picker Logic ---
const filePickerModal = document.getElementById('file-picker-modal');
const closeFilePickerBtn = document.getElementById('close-file-picker');
const fpCurrentPathInput = document.getElementById('fp-current-path');
const fileListContainer = document.getElementById('file-list');
const fpUpBtn = document.getElementById('fp-up-btn');
const fpSelectBtn = document.getElementById('fp-select-btn');
const fpCancelBtn = document.getElementById('fp-cancel-btn');

let fpTargetInputId = null;
let fpSelectionType = 'file'; // 'file' or 'dir'
let fpCurrentPath = '/';
let fpSelectedEntry = null;

// Open Picker
document.querySelectorAll('.browse-btn').forEach(btn => {
    btn.onclick = () => {
        fpTargetInputId = btn.getAttribute('data-target');
        fpSelectionType = btn.getAttribute('data-type'); // 'file' or 'dir'

        const targetInput = document.getElementById(fpTargetInputId);
        let initialPath = targetInput.value.trim();

        fpCurrentPath = initialPath || '/';

        // Update Title
        document.getElementById('file-picker-title').textContent =
            fpSelectionType === 'dir' ? 'Select Directory' : 'Select File';

        fpSelectBtn.textContent = fpSelectionType === 'dir' ? 'Select Current Directory' : 'Select File';
        fpSelectBtn.disabled = fpSelectionType === 'file'; // Disable until file selected

        filePickerModal.style.display = 'block';
        loadDirectory(fpCurrentPath);
    };
});

function loadDirectory(path) {
    socket.emit('list-directory', path);
    fpCurrentPathInput.value = 'Loading...';
    fileListContainer.innerHTML = 'Loading...';
    fpSelectedEntry = null;
    if (fpSelectionType === 'file') fpSelectBtn.disabled = true;
}

socket.on('directory-list', (data) => {
    const { path, entries, error } = data;

    if (error) {
        if (path !== '/') {
            loadDirectory('/');
        } else {
            fileListContainer.innerHTML = `<div style="color:red">Error: ${error}</div>`;
        }
        return;
    }

    fpCurrentPath = path;
    fpCurrentPathInput.value = path;
    fileListContainer.innerHTML = '';

    entries.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'file-item';
        const icon = entry.isDirectory ? '📁' : '📄';
        div.innerHTML = `<span class="file-item-icon">${icon}</span> ${entry.name}`;

        div.onclick = () => {
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            fpSelectedEntry = entry;

            if (!entry.isDirectory && fpSelectionType === 'file') {
                fpSelectBtn.disabled = false;
                fpSelectBtn.textContent = 'Select ' + entry.name;
            }
        };

        div.ondblclick = () => {
            if (entry.isDirectory) {
                loadDirectory(entry.path);
            } else if (fpSelectionType === 'file') {
                fpSelectedEntry = entry;
                confirmSelection();
            }
        };

        fileListContainer.appendChild(div);
    });
});

fpUpBtn.onclick = () => {
    const parts = fpCurrentPath.split('/').filter(p => p);
    parts.pop();
    const newPath = '/' + parts.join('/');
    loadDirectory(newPath);
};

fpSelectBtn.onclick = confirmSelection;

function confirmSelection() {
    if (fpSelectionType === 'dir') {
        if (fpSelectedEntry && fpSelectedEntry.isDirectory) {
            document.getElementById(fpTargetInputId).value = fpSelectedEntry.path;
        } else {
            document.getElementById(fpTargetInputId).value = fpCurrentPath;
        }
    } else {
        if (fpSelectedEntry && !fpSelectedEntry.isDirectory) {
            document.getElementById(fpTargetInputId).value = fpSelectedEntry.path;
        } else {
            return;
        }
    }

    filePickerModal.style.display = 'none';

    // Auto Update Config logic
    const targetInput = document.getElementById(fpTargetInputId);

    // If updating config-project-path, update global config and sync build-workspace-path
    if (fpTargetInputId === 'config-project-path') {
        globalConfig.projectPath = targetInput.value;
        const buildWorkspace = document.getElementById('build-workspace-path');
        if (buildWorkspace) buildWorkspace.value = targetInput.value;
    }

    // If updating config-env-path
    if (fpTargetInputId === 'config-env-path') {
        globalConfig.envPath = targetInput.value;
    }

    // If updating dapp-location-config
    if (fpTargetInputId === 'dapp-location-config') {
        globalConfig.dappLocation = targetInput.value;
    }

    if (fpTargetInputId === 'apk-location-input') {
        globalConfig.apkInstallPath = targetInput.value;
    }

    if (fpTargetInputId === 'adb-push-local-input') {
        globalConfig.adbPushPath = targetInput.value;
    }

    // Auto-save automatically when using file picker
    socket.emit('update-config', globalConfig);
}

// Auto-save on manual input change
function setupAutoSave(inputId, configKey) {
    const input = document.getElementById(inputId);
    if (input) {
        input.addEventListener('change', () => {
            globalConfig[configKey] = input.value.trim();
            socket.emit('update-config', globalConfig);
            // addToGlobalLog(`[Config] Auto-saved ${configKey}`);
        });
    }
}

setupAutoSave('config-project-path', 'projectPath');
setupAutoSave('config-dapp-name', 'dappName');
setupAutoSave('config-env-path', 'envPath');
setupAutoSave('dapp-location-config', 'dappLocation');
setupAutoSave('apk-location-input', 'apkInstallPath');
setupAutoSave('apk-package-name-input', 'mobilePackageName');
setupAutoSave('config-mobile-package-name', 'mobilePackageName');
setupAutoSave('adb-push-local-input', 'adbPushPath');
setupAutoSave('adb-push-remote-input', 'adbPushRemotePath');

fpCancelBtn.onclick = () => {
    filePickerModal.style.display = 'none';
};

closeFilePickerBtn.onclick = () => {
    filePickerModal.style.display = 'none';
};

// Global Configuration Modal
const globalConfigModal = document.getElementById('global-config-modal');
const globalConfigBtn = document.getElementById('global-config-btn');
const closeGlobalConfigBtn = document.getElementById('close-global-config');

if (globalConfigBtn) {
    globalConfigBtn.onclick = () => {
        globalConfigModal.style.display = 'block';
    };
}

if (closeGlobalConfigBtn) {
    closeGlobalConfigBtn.onclick = () => {
        globalConfigModal.style.display = 'none';
        if (typeof saveGlobalStartConfig === 'function') {
            saveGlobalStartConfig({ immediate: true });
        }
    };
}

// Close modal when clicking outside
window.onclick = (event) => {
    if (event.target === globalConfigModal) {
        globalConfigModal.style.display = 'none';
        if (typeof saveGlobalStartConfig === 'function') {
            saveGlobalStartConfig({ immediate: true });
        }
    }
    if (event.target === filePickerModal) {
        filePickerModal.style.display = 'none';
    }
};

// Sync Build Workspace input on load
const buildWorkspacePathInput = document.getElementById('build-workspace-path');
if (buildWorkspacePathInput && configProjectPathInput) {
    buildWorkspacePathInput.value = configProjectPathInput.value;

    configProjectPathInput.addEventListener('change', () => {
        buildWorkspacePathInput.value = configProjectPathInput.value;
    });
}

// Export .env Feature (Centralized)
const exportEnvBtn = document.getElementById('export-env-btn');
const exportNodeSelect = document.getElementById('export-node-select');
// Helper to track running nodes for dropdown
const runningNodesSet = new Set();

function updateExportDropdown() {
    if (!exportNodeSelect) return;

    // Save current selection
    const currentVal = exportNodeSelect.value;

    // Clear (keep default)
    exportNodeSelect.innerHTML = '<option value="">-- Select a Running Node --</option>';

    // Populate
    const sortedIds = Array.from(runningNodesSet).sort((a, b) => a - b);
    sortedIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `Node ${id}`;
        exportNodeSelect.appendChild(option);
    });

    // Restore selection if possible
    if (runningNodesSet.has(parseInt(currentVal))) {
        exportNodeSelect.value = currentVal;
    }
}

if (exportEnvBtn) {
    exportEnvBtn.onclick = () => {
        const logObj = document.getElementById('vite-log');
        if (logObj) logObj.textContent = 'Starting Export .env Process...\n';

        const nodeId = exportNodeSelect.value;
        if (!nodeId) {
            alert('Please select a running node to export from.');
            return;
        }

        // Use Global Config directly
        const { dappName, envPath } = globalConfig;
        if (!envPath) {
            alert('Please configure .env path in Settings first!');
            return;
        }

        socket.emit('export-env', { id: parseInt(nodeId), targetPath: envPath, dappName: dappName });

        // Visual Feedback
        const originalText = exportEnvBtn.textContent;
        exportEnvBtn.textContent = 'Exporting...';
        exportEnvBtn.disabled = true;
        setTimeout(() => {
            exportEnvBtn.textContent = originalText;
            exportEnvBtn.disabled = false;
        }, 2000);
    };
}

// Socket Events
socket.on('node-status', (data) => {
    const { id, status } = data;

    // Update Dropdown Set
    if (status === 'running') {
        runningNodesSet.add(id);
    } else {
        runningNodesSet.delete(id);
    }
    updateExportDropdown();

    // If node ID is higher than current visible nodes AND is running, ensure it's rendered
    // (e.g. on page refresh if nodes are running). 
    // If it's stopped, ignored - let user add manually.
    if (status === 'running') {
        while (visibleNodes < id) {
            addNode();
        }
    }

    const card = document.getElementById(`node-${id}`);
    if (!card) return; // Should not happen after while loop

    const indicator = card.querySelector('.status-indicator');
    const startBtn = card.querySelector('.start-btn');
    const stopBtn = card.querySelector('.stop-btn');
    const disconnectBtn = card.querySelector('.disconnect-btn');
    // const exportEnvBtn = card.querySelector('.export-env-btn'); // REMOVED

    if (status === 'running') {
        indicator.classList.remove('stopped');
        indicator.classList.add('running');
        startBtn.disabled = true;
        stopBtn.disabled = false;
        if (disconnectBtn) {
            disconnectBtn.disabled = false;
            // Set initial state as connected (green)
            disconnectBtn.textContent = 'Disconnect Net';
            disconnectBtn.classList.remove('btn-net-disconnected');
            disconnectBtn.classList.add('btn-net-connected');
        }
        // if (exportEnvBtn) exportEnvBtn.disabled = false; // REMOVED
    } else {
        indicator.classList.remove('running');
        indicator.classList.add('stopped');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (disconnectBtn) {
            disconnectBtn.disabled = true;
            // Reset to default state when stopped
            disconnectBtn.textContent = 'Disconnect Net';
            disconnectBtn.classList.remove('btn-net-disconnected');
        }
        // if (exportEnvBtn) exportEnvBtn.disabled = true; // REMOVED

        // Always enable Delete Data when stopped
        const deleteDataBtn = card.querySelector('.delete-data-btn');
        if (deleteDataBtn) {
            deleteDataBtn.disabled = false;
            deleteDataBtn.textContent = 'Delete Data';
        }
    }
});

socket.on('log-update', (data) => {
    const { id, content, type } = data; // Check type

    // Mirror 'system' logs to Global Log for better visibility
    if (type === 'system') {
        addToGlobalLog(`[Node ${id}] ${content.trim()}`);
    }

    const card = document.getElementById(`node-${id}`);
    if (!card) return;

    const logPre = card.querySelector('.log-content');
    const logWindow = card.querySelector('.log-window');

    logPre.textContent += content; // Using textContent safe against HTML injection

    // Always scroll to bottom as requested
    logWindow.scrollTop = logWindow.scrollHeight;
});

socket.on('global-log', (content) => {
    // System logs go to the main Nodes tab log
    appendLog('system-log', content);
});

socket.on('vite-log', (content) => {
    appendLog('vite-log', content);
});

socket.on('dapp-log', (content) => {
    appendLog('dapp-log', content);
});

// Helper Function
function appendLog(elementId, content, addNewline = true) {
    const logContainer = document.getElementById(elementId);
    if (!logContainer) return;

    // Check if user is near the bottom (within 100px tolerance)
    const threshold = 100;
    const isNearBottom = logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight <= threshold;

    // Append text safely
    logContainer.textContent += content + (addNewline ? '\n' : '');

    // If we were near bottom (or it was empty/small), force scroll to bottom
    if (isNearBottom) {
        const doScroll = () => {
            logContainer.scrollTop = logContainer.scrollHeight;
        };
        // Use requestAnimationFrame AND a short timeout to ensure the DOM is ready
        requestAnimationFrame(doScroll);
        setTimeout(doScroll, 10);
        setTimeout(doScroll, 50); // Final check for heavy renders
    }
}
// Wrap existing addToGlobalLog if it exists, or just ensure global-log socket uses separate function.
// For compatibility with other parts of app.js calling addToGlobalLog:
window.addToGlobalLog = (content) => appendLog('system-log', content);

// Init
// Init call moved to DOMContentLoaded listener at the top

// --- Global Start Configuration & Command Logic ---
const STORAGE_KEY_GLOBAL_START = 'minima_global_start_config';
window._isGlobalTemplateCustom = false;
window._hasGlobalConfigApplied = false;

const applyGlobalCmdBtn = document.getElementById('apply-global-cmd-btn');
const saveGlobalConfigBtn = document.getElementById('save-global-config-btn');
const globalCmdTemplateInput = document.getElementById('global-cmd-template');
const globalHostCheck = document.getElementById('global-host-check');
const globalCleanCheck = document.getElementById('global-clean-check');
const globalGenesisCheck = document.getElementById('global-genesis-check');
const globalConnectInput = document.getElementById('global-connect-input');
const globalParamChecks = document.querySelectorAll('.global-param-check');
const globalNetworkRadios = document.querySelectorAll('input[name="global-network-mode"]');
const syncPeersBtn = document.getElementById('sync-peers-btn');
const autoSyncPeersCheck = document.getElementById('auto-sync-peers-check');
const globalConfigStatus = document.getElementById('global-config-status');

function applyNetworkModeState(isMainnet) {
    if (globalHostCheck) {
        if (isMainnet) {
            globalHostCheck.checked = true;
            globalHostCheck.disabled = true;
            if (globalHostCheck.parentElement) {
                globalHostCheck.parentElement.style.opacity = '0.5';
                globalHostCheck.parentElement.title = "Forced ON for Mainnet (Public Access Required)";
            }
        } else {
            globalHostCheck.disabled = false;
            if (globalHostCheck.parentElement) {
                globalHostCheck.parentElement.style.opacity = '1';
                globalHostCheck.parentElement.title = "Binds directly to your computer's network interface (0.0.0.0). Required for public Mainnet access.";
            }
        }
    }
}

function updateGlobalTemplate() {
    let script = './scripts/start_node.sh';
    if (globalHostCheck && globalHostCheck.checked) {
        script = './scripts/start_host_node.sh';
    }
    let cmd = `${script} $ID`;

    // Check Network Mode
    let isMainnet = false;
    if (globalNetworkRadios) {
        globalNetworkRadios.forEach(r => {
            if (r.checked && r.value === 'mainnet') isMainnet = true;
        });
    }

    // Auto-switch default values
    const connectVal = globalConnectInput ? globalConnectInput.value.trim() : '';
    if (isMainnet && connectVal === '10.0.0.11:9001') {
        globalConnectInput.value = 'megammr.minima.global:9001';
        updateGlobalTemplate();
        return;
    } else if (!isMainnet && connectVal === 'megammr.minima.global:9001') {
        globalConnectInput.value = '10.0.0.11:9001';
        updateGlobalTemplate();
        return;
    }

    // Add Clean/Genesis
    if (globalCleanCheck && globalCleanCheck.checked) cmd += ' -clean';
    // Genesis only if NOT Mainnet (Mainnet never uses Genesis)
    if (!isMainnet && globalGenesisCheck && globalGenesisCheck.checked) cmd += ' -genesis';

    // Add Connect
    if (connectVal) {
        const flag = isMainnet ? '-p2pnodes' : '-connect';
        cmd += ` ${flag} ${connectVal}`;
    } else if (isMainnet) {
        // If Mainnet AND no custom connect, force megammr
        cmd += ' -p2pnodes megammr.minima.global:9001';
    }

    // Add Advanced Params
    if (globalParamChecks) {
        globalParamChecks.forEach(chk => {
            // If Mainnet, SKIP -test flag even if checked
            if (isMainnet && chk.value.trim() === '-test') return;

            if (chk.checked) cmd += ` ${chk.value}`;
        });
    }

    if (globalCmdTemplateInput && !window._isGlobalTemplateCustom) {
        globalCmdTemplateInput.value = cmd;
    }
}

function getGlobalStartConfigFromUI() {
    const networkModeRadio = document.querySelector('input[name="global-network-mode"]:checked');
    const networkMode = networkModeRadio ? networkModeRadio.value : 'testnet';
    const host = globalHostCheck ? globalHostCheck.checked : false;
    const clean = globalCleanCheck ? globalCleanCheck.checked : true;
    const genesis = globalGenesisCheck ? globalGenesisCheck.checked : true;
    const connect = globalConnectInput ? globalConnectInput.value.trim() : '';
    const autoNameCheck = document.getElementById('auto-name-check');
    const autoName = autoNameCheck ? autoNameCheck.checked : true;
    const ramLimitInput = document.getElementById('global-ram-limit');
    const ramLimit = ramLimitInput ? ramLimitInput.value.trim() : '256m';
    const cpuLimitInput = document.getElementById('global-cpu-limit');
    const cpuLimit = cpuLimitInput ? (parseInt(cpuLimitInput.value) || 1) : 1;
    const autoSyncCheck = document.getElementById('auto-sync-peers-check');
    const autoSyncPeers = autoSyncCheck ? autoSyncCheck.checked : true;

    const advancedParams = [];
    if (globalParamChecks) {
        globalParamChecks.forEach(chk => {
            if (chk.checked) advancedParams.push(chk.value);
        });
    }

    const cmdTemplate = globalCmdTemplateInput ? globalCmdTemplateInput.value.trim() : '';

    return {
        networkMode,
        host,
        clean,
        genesis,
        connect,
        autoName,
        ramLimit,
        cpuLimit,
        autoSyncPeers,
        advancedParams,
        cmdTemplate,
        isTemplateCustom: !!window._isGlobalTemplateCustom,
        hasApplied: !!window._hasGlobalConfigApplied
    };
}

let saveGlobalConfigTimeout = null;

function saveGlobalStartConfig(extra = {}) {
    if (extra.hasApplied !== undefined) {
        window._hasGlobalConfigApplied = extra.hasApplied;
    }
    if (extra.isTemplateCustom !== undefined) {
        window._isGlobalTemplateCustom = extra.isTemplateCustom;
    }

    const currentConfig = getGlobalStartConfigFromUI();
    if (extra.hasApplied !== undefined) {
        currentConfig.hasApplied = extra.hasApplied;
    }

    // 1. Immediately persist to localStorage
    try {
        localStorage.setItem(STORAGE_KEY_GLOBAL_START, JSON.stringify(currentConfig));
        localStorage.setItem('auto-sync-peers', currentConfig.autoSyncPeers);
    } catch (e) {
        console.error('Failed to save global start config to localStorage:', e);
    }

    // 2. Sync to server globalConfig (debounced or immediate)
    if (saveGlobalConfigTimeout) clearTimeout(saveGlobalConfigTimeout);

    const performServerSync = () => {
        globalConfig.globalStartConfig = currentConfig;
        globalConfig.ramLimit = currentConfig.ramLimit;
        globalConfig.cpuLimit = currentConfig.cpuLimit;
        socket.emit('update-config', globalConfig, { silent: !extra.notifyServer });
    };

    if (extra.immediate) {
        performServerSync();
    } else {
        saveGlobalConfigTimeout = setTimeout(performServerSync, 350);
    }
}

function applyGlobalStartConfigToUI(config, skipTemplateUpdate = false) {
    if (!config) return;

    if (config.hasApplied !== undefined) {
        window._hasGlobalConfigApplied = !!config.hasApplied;
    }
    if (config.isTemplateCustom !== undefined) {
        window._isGlobalTemplateCustom = !!config.isTemplateCustom;
    }

    // Network Mode
    const isMainnet = config.networkMode === 'mainnet';
    const targetRadio = document.querySelector(`input[name="global-network-mode"][value="${isMainnet ? 'mainnet' : 'testnet'}"]`);
    if (targetRadio) {
        targetRadio.checked = true;
    }
    applyNetworkModeState(isMainnet);

    // Host
    if (globalHostCheck && !isMainnet && config.host !== undefined) {
        globalHostCheck.checked = config.host === true;
    }

    // Clean
    if (globalCleanCheck && config.clean !== undefined) {
        globalCleanCheck.checked = config.clean === true;
    }

    // Genesis
    if (globalGenesisCheck && config.genesis !== undefined) {
        globalGenesisCheck.checked = config.genesis === true;
    }

    // Connect
    if (globalConnectInput && config.connect !== undefined) {
        globalConnectInput.value = config.connect;
    }

    // Auto-name
    const autoNameCheck = document.getElementById('auto-name-check');
    if (autoNameCheck && config.autoName !== undefined) {
        autoNameCheck.checked = config.autoName === true;
    }

    // RAM Limit
    const ramLimitInput = document.getElementById('global-ram-limit');
    if (ramLimitInput && config.ramLimit !== undefined) {
        ramLimitInput.value = config.ramLimit;
        globalConfig.ramLimit = config.ramLimit;
    }

    // CPU Limit
    const cpuLimitInput = document.getElementById('global-cpu-limit');
    if (cpuLimitInput && config.cpuLimit !== undefined) {
        cpuLimitInput.value = config.cpuLimit;
        globalConfig.cpuLimit = config.cpuLimit;
    }

    // Auto-sync Peers
    const autoSyncCheck = document.getElementById('auto-sync-peers-check');
    if (autoSyncCheck && config.autoSyncPeers !== undefined) {
        autoSyncCheck.checked = config.autoSyncPeers === true;
    }

    // Advanced Params
    if (globalParamChecks && Array.isArray(config.advancedParams)) {
        globalParamChecks.forEach(chk => {
            chk.checked = config.advancedParams.includes(chk.value);
        });
    }

    // Command Template
    if (config.cmdTemplate && (config.isTemplateCustom || skipTemplateUpdate)) {
        if (globalCmdTemplateInput) {
            globalCmdTemplateInput.value = config.cmdTemplate;
        }
    } else if (!skipTemplateUpdate) {
        updateGlobalTemplate();
    }
}

function loadGlobalStartConfig() {
    let saved = null;
    try {
        const local = localStorage.getItem(STORAGE_KEY_GLOBAL_START);
        if (local) {
            saved = JSON.parse(local);
        }
    } catch (e) {
        console.error('Failed to parse localStorage global start config:', e);
    }

    if (!saved && globalConfig && globalConfig.globalStartConfig) {
        saved = globalConfig.globalStartConfig;
    }

    if (saved) {
        applyGlobalStartConfigToUI(saved, true);
        return saved;
    } else {
        // Apply default template if no saved config
        if (globalCleanCheck) updateGlobalTemplate();
    }
    return null;
}

function applyGlobalConfigToSingleNode(card, i) {
    if (!card) return;
    // Core mode: the Classic global template does not apply
    if (window.nodeMode === 'core') {
        if (card.updatePreview) card.updatePreview();
        return;
    }
    const isMainnetMode = document.querySelector('input[name="global-network-mode"]:checked')?.value === 'mainnet';
    const connectInput = card.querySelector('.connect-input');
    const connectGroup = card.querySelector('.connect-group');
    const hostCheck = card.querySelector('.host-check');
    const cleanCheck = card.querySelector('.clean-check');
    const genesisCheck = card.querySelector('.genesis-check');
    const previewInput = card.querySelector('.start-cmd-preview');

    if (connectInput && globalConnectInput) {
        connectInput.value = globalConnectInput.value.trim();
    }

    if (i === 1 && connectGroup) {
        connectGroup.style.display = isMainnetMode ? 'flex' : 'none';
    }

    if (globalHostCheck && hostCheck) {
        hostCheck.checked = globalHostCheck.checked;
        if (i === 1 && globalHostCheck.checked && genesisCheck) {
            genesisCheck.checked = false;
        }
    }

    if (globalCleanCheck && cleanCheck) {
        cleanCheck.checked = globalCleanCheck.checked;
    }

    if (i === 1 && globalGenesisCheck && genesisCheck) {
        genesisCheck.checked = !isMainnetMode && globalGenesisCheck.checked;
    }

    if (globalParamChecks) {
        const localParamChecks = card.querySelectorAll('.param-check');
        globalParamChecks.forEach(gChk => {
            const localChk = Array.from(localParamChecks).find(l => l.value === gChk.value);
            if (localChk) localChk.checked = gChk.checked;
        });
    }

    if (hostCheck) hostCheck.dispatchEvent(new Event('change'));

    const template = globalCmdTemplateInput ? globalCmdTemplateInput.value.trim() : '';
    if (previewInput && template) {
        let newCmd = template.replace(/\$ID/g, i);
        if (i === 1 && !isMainnetMode) {
            newCmd = newCmd.replace(/\s+-connect\s+\S+/g, '').replace(/\s+-connect\b/g, '');
        } else if (i > 1) {
            newCmd = newCmd.replace(/\s+-genesis\b/g, '');
        }
        newCmd = newCmd.replace(/\s+/g, ' ').trim();
        previewInput.value = newCmd;
    }
}

function applyGlobalConfigToAllNodes(options = { showFeedback: true }) {
    const template = globalCmdTemplateInput ? globalCmdTemplateInput.value.trim() : '';
    if (!template) {
        if (options.showFeedback) alert('Please enter a command template.');
        return;
    }

    for (let i = 1; i <= visibleNodes; i++) {
        const card = document.getElementById(`node-${i}`);
        if (card) {
            applyGlobalConfigToSingleNode(card, i);
            if (options.showFeedback) {
                const previewInput = card.querySelector('.start-cmd-preview');
                if (previewInput) {
                    previewInput.style.backgroundColor = '#2a2a2a';
                    setTimeout(() => previewInput.style.backgroundColor = '', 500);
                }
            }
        }
    }

    if (options.showFeedback) {
        addToGlobalLog(`[System] Applied global command template to ${visibleNodes} nodes.`);
    }
}

// Auto-save on any change inside the Global Config Modal
const autoSaveGlobal = () => {
    saveGlobalStartConfig();
};

// Attach Listeners
if (globalHostCheck) {
    globalHostCheck.addEventListener('change', () => {
        window._isGlobalTemplateCustom = false;
        updateGlobalTemplate();
        autoSaveGlobal();
    });
}
if (globalCleanCheck) {
    globalCleanCheck.addEventListener('change', () => {
        window._isGlobalTemplateCustom = false;
        updateGlobalTemplate();
        autoSaveGlobal();
    });
}
if (globalGenesisCheck) {
    globalGenesisCheck.addEventListener('change', () => {
        window._isGlobalTemplateCustom = false;
        updateGlobalTemplate();
        autoSaveGlobal();
    });
}
if (globalConnectInput) {
    globalConnectInput.addEventListener('input', () => {
        window._isGlobalTemplateCustom = false;
        updateGlobalTemplate();
        autoSaveGlobal();
    });
}
if (globalParamChecks) {
    globalParamChecks.forEach(chk => chk.addEventListener('change', () => {
        window._isGlobalTemplateCustom = false;
        updateGlobalTemplate();
        autoSaveGlobal();
    }));
}
if (globalNetworkRadios) {
    globalNetworkRadios.forEach(r => {
        r.addEventListener('change', () => {
            const isMainnet = r.checked && r.value === 'mainnet';
            applyNetworkModeState(isMainnet);
            window._isGlobalTemplateCustom = false;
            updateGlobalTemplate();
            autoSaveGlobal();

            // Update all individual node previews
            for (let i = 1; i <= visibleNodes; i++) {
                const card = document.getElementById(`node-${i}`);
                if (card && card.updatePreview) {
                    card.updatePreview();
                }
            }
        });
    });
}

const autoNameCheck = document.getElementById('auto-name-check');
if (autoNameCheck) {
    autoNameCheck.addEventListener('change', autoSaveGlobal);
}
const ramLimitGlobalInput = document.getElementById('global-ram-limit');
if (ramLimitGlobalInput) {
    ramLimitGlobalInput.addEventListener('input', autoSaveGlobal);
}
const cpuLimitGlobalInput = document.getElementById('global-cpu-limit');
if (cpuLimitGlobalInput) {
    cpuLimitGlobalInput.addEventListener('input', autoSaveGlobal);
}
if (autoSyncPeersCheck) {
    autoSyncPeersCheck.addEventListener('change', autoSaveGlobal);
}
if (globalCmdTemplateInput) {
    globalCmdTemplateInput.addEventListener('input', () => {
        window._isGlobalTemplateCustom = true;
        autoSaveGlobal();
    });
}

// Peer Discovery Automation Logic
if (syncPeersBtn) {
    syncPeersBtn.onclick = () => {
        syncPeersBtn.disabled = true;
        syncPeersBtn.textContent = 'Syncing...';
        socket.emit('sync-peers');
        setTimeout(() => {
            syncPeersBtn.disabled = false;
            syncPeersBtn.textContent = 'Sync Peers from URL Now';
        }, 3000);
    };
}

// Save and Apply Buttons
if (saveGlobalConfigBtn) {
    saveGlobalConfigBtn.onclick = () => {
        saveGlobalStartConfig({ immediate: true, notifyServer: true });
        if (globalConfigStatus) {
            globalConfigStatus.textContent = '✓ Configuration saved successfully';
            setTimeout(() => {
                if (globalConfigStatus) globalConfigStatus.textContent = '';
            }, 3000);
        }
        addToGlobalLog('[Config] Global Start Configuration saved.');
    };
}

if (applyGlobalCmdBtn && globalCmdTemplateInput) {
    applyGlobalCmdBtn.onclick = () => {
        const template = globalCmdTemplateInput.value;
        if (!template.trim()) {
            alert('Please enter a command template.');
            return;
        }

        applyGlobalConfigToAllNodes({ showFeedback: true });
        saveGlobalStartConfig({ hasApplied: true, immediate: true, notifyServer: true });

        // Close modal after applying
        if (globalConfigModal) globalConfigModal.style.display = 'none';
    };
}

// Initial restoration of Global Start Configuration
loadGlobalStartConfig();
// ADB Device Management
socket.on('adb-device-list', (devices) => {
    document.querySelectorAll('.adb-device-select').forEach(select => {
        const context = select.id.endsWith('dapps') ? 'dapps' : 'build';
        const savedDevice = localStorage.getItem(`selected-adb-device-${context}`);
        const currentVal = select.value || savedDevice;
        const isManual = (currentVal === 'manual');

        select.innerHTML = `
            <option value="">Auto (single device)</option>
            <option value="manual">-- Enter Manually --</option>
        `;

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `${device.id} (${device.status})`;
            select.appendChild(option);
        });

        // Restore value: 1. Manual mode, 2. Previously selected/saved ID, 3. Auto-select if only 1 device
        if (isManual) {
            select.value = 'manual';
        } else if (currentVal && devices.some(d => d.id === currentVal)) {
            select.value = currentVal;
        } else if (devices.length === 1) {
            select.value = devices[0].id;
        }

        // Ensure manual container visibility is correct after refresh
        const container = document.getElementById(`manual-device-id-container-${context}`);
        if (container) {
            container.style.display = (select.value === 'manual') ? 'flex' : 'none';
        }
    });

    if (devices.length > 0) {
        addToGlobalLog(`[System] Found ${devices.length} ADB devices.`);
    }
});

function getSelectedAdbDevice(context) {
    const select = document.getElementById(`adb-device-select-${context}`);
    if (!select) return null;

    if (select.value === 'manual') {
        const manualInput = document.getElementById(`manual-device-id-${context}`);
        return manualInput ? manualInput.value.trim() : null;
    }

    return select.value || null;
}

// Toggle manual input visibility & save selection
document.querySelectorAll('.adb-device-select').forEach(select => {
    select.addEventListener('change', () => {
        const context = select.id.endsWith('dapps') ? 'dapps' : 'build';
        const container = document.getElementById(`manual-device-id-container-${context}`);
        if (container) {
            container.style.display = (select.value === 'manual') ? 'flex' : 'none';
        }
        // Persist selection
        if (select.value && select.value !== 'manual') {
            localStorage.setItem(`selected-adb-device-${context}`, select.value);
        } else if (select.value === '') {
            localStorage.removeItem(`selected-adb-device-${context}`);
        }
    });
});

document.querySelectorAll('.refresh-adb-devices-btn').forEach(btn => {
    btn.onclick = () => {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '🔄...';
        socket.emit('get-adb-devices');
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
        }, 1000);
    };
});


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
    const li = mk('li', {});
    li.style.cssText = 'margin: 6px 0; padding: 6px; background: #1a1a1a; border-radius: 4px;';
    const name = mk('a', { textContent: avd.name, title: 'Start (uses the resume-from selector)' });
    name.style.cssText = 'color: #74c0fc; cursor: pointer; font-weight: bold;';
    const status = mk('span', { textContent: avd.running ? ` running (${avd.serial}) ` : (avd.launching ? ' starting... ' : ' stopped ') });
    status.style.color = avd.running ? '#40c057' : '#888';
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

// ---- Core: network overview (desktop + Android nodes) ----
async function refreshNetwork() {
    if (window.nodeMode !== 'core') return;
    const rowsEl = document.getElementById('network-rows');
    const chip = document.getElementById('network-sync');
    if (!rowsEl) return;
    const rows = [];
    // Desktop nodes: the cards that show a running indicator
    const cards = [...document.querySelectorAll('.node-card')].filter(c => c.querySelector('.status-indicator.running'));
    await Promise.all(cards.map(async card => {
        const id = card.id.replace('node-', '');
        const row = { name: 'Desktop ' + id, type: 'desktop' + (id === '1' ? ' (seed)' : ''), where: `10.0.0.${10 + Number(id)}:9001`, block: null, peers: null, order: Number(id) };
        try {
            const r = await fetch(`/api/nodes/${id}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'status' }) }).then(x => x.json());
            const s = r.response || {};
            row.block = s.chain && s.chain.block; row.peers = s.network && s.network.connected;
        } catch (e) { /* RPC not up yet */ }
        rows.push(row);
    }));
    // Android nodes: running AVDs with the node app
    try {
        const data = await fetch('/api/emulator/avds').then(r => r.json());
        await Promise.all((data.avds || []).filter(a => a.running).map(async a => {
            const row = { name: a.name, type: 'android', where: `${a.serial} (port 12001)`, block: null, peers: null, order: 100 };
            try {
                const st = await fetch('/api/android-node/status?avd=' + encodeURIComponent(a.name)).then(r => r.json());
                if (st.nodeUp) { row.block = st.block; row.peers = st.connected; row.where = `${a.serial} (port ${st.port})`; }
                else row.where += st.installed ? ' - node stopped' : ' - node app not installed';
            } catch (e) { /* ignore */ }
            rows.push(row);
        }));
    } catch (e) { /* adb/emulator unavailable */ }
    rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    rowsEl.innerHTML = '';
    if (!rows.length) rowsEl.appendChild(mk('tr', {}, mk('td', { colSpan: 5, textContent: 'No node is running.' })));
    rows.forEach(r => rowsEl.appendChild(mk('tr', {},
        mk('td', { textContent: r.name }), mk('td', { textContent: r.type }), mk('td', { textContent: r.where }),
        mk('td', { textContent: r.block === null ? '-' : String(r.block) }), mk('td', { textContent: r.peers === null ? '-' : String(r.peers) }))));
    const blocks = rows.map(r => r.block).filter(b => typeof b === 'number');
    if (blocks.length < 2) { chip.textContent = blocks.length ? '1 node up' : 'no nodes'; chip.className = 'net-chip'; }
    else {
        const spread = Math.max(...blocks) - Math.min(...blocks);
        chip.textContent = spread <= 2 ? `in sync (${blocks.length} nodes)` : `diverging: blocks differ by ${spread}`;
        chip.className = 'net-chip ' + (spread <= 2 ? 'ok' : 'bad');
    }
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
