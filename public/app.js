const socket = io();
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

    // Init
    initGrid();
});

// Tab Switching Logic
// Tab Switching Logic
let transitionTimeout;

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

    // Start Command Preview Logic
    const startCmdPreview = card.querySelector('.start-cmd-preview');
    const paramChecks = card.querySelectorAll('.param-check');

    function updateCommandPreview() {
        // If user manually edited, we might want to respect that?
        // For now, let's keep it simple: any checkbox change regenerates the command.
        // If the user wants a custom command, they edit it and DON'T touch checkboxes after.

        let cmd = `./scripts/start_node.sh ${i}`;

        if (cleanCheck.checked && cleanCheck.parentElement.style.display !== 'none') cmd += ' -clean';
        if (genesisCheck.checked && genesisContainer.style.display !== 'none') cmd += ' -genesis';

        const connectVal = connectInput.value.trim();
        if ((i > 1) && connectVal) {
            cmd += ` -connect ${connectVal}`;
        }

        paramChecks.forEach(chk => {
            if (chk.checked) cmd += ` ${chk.value}`;
        });

        startCmdPreview.value = cmd;
    }

    // Attach listeners to all inputs that affect the command
    cleanCheck.addEventListener('change', updateCommandPreview);
    genesisCheck.addEventListener('change', updateCommandPreview);
    connectInput.addEventListener('input', updateCommandPreview);
    paramChecks.forEach(chk => chk.addEventListener('change', updateCommandPreview));

    // Initialize Preview
    updateCommandPreview();

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
            socket.emit('start-node', { id: i, command: rawCommand, autoName });
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
                copyBtn.style.setProperty('background-color', 'var(--accent-primary)');
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

document.getElementById('open-all-btn').onclick = () => {
    let opened = 0;
    // Determine loop range
    for (let i = 1; i <= visibleNodes; i++) {
        const card = document.getElementById(`node-${i}`);
        if (card) {
            const indicator = card.querySelector('.status-indicator');
            // Check for running class
            if (indicator && indicator.classList.contains('running')) {
                const ip = `10.0.0.${10 + i}`;
                const mdsPort = 9003;
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
const saveConfigBtn = document.getElementById('save-config-btn');

// Default Config
let globalConfig = {
    projectPath: '/home/joanramon/Minima/metachain',
    dappName: 'MetaChain',
    envPath: '/home/joanramon/Minima/metachain/.env',
    dappLocation: '/home/joanramon/Minima/metachain/build/dapp.minidapp'
};

// Listen for Config from Server
socket.on('config-update', (config) => {
    globalConfig = { ...globalConfig, ...config };

    // Update UI Inputs
    if (configProjectPathInput) configProjectPathInput.value = globalConfig.projectPath;
    if (configDappNameInput) configDappNameInput.value = globalConfig.dappName;
    if (configEnvPathInput) configEnvPathInput.value = globalConfig.envPath;
    if (dappLocationConfigInput) dappLocationConfigInput.value = globalConfig.dappLocation;

    // Also update build workspace path if it exists
    if (buildWorkspacePathInput) buildWorkspacePathInput.value = globalConfig.projectPath;

    // Log only if it seems like a new update (to avoid log spam on connect)
    // addToGlobalLog('[System] Configuration synced from server.');
});

// Load defaults
configProjectPathInput.value = globalConfig.projectPath;
configDappNameInput.value = globalConfig.dappName;
configEnvPathInput.value = globalConfig.envPath;

saveConfigBtn.onclick = () => {
    globalConfig.projectPath = configProjectPathInput.value.trim();
    globalConfig.dappName = configDappNameInput.value.trim();
    globalConfig.envPath = configEnvPathInput.value.trim();

    addToGlobalLog(`[Config] Saved: Project=${globalConfig.projectPath}, Dapp=${globalConfig.dappName}`);

    // Send update to server if needed, or just use these values in other emits
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
    if (logObj) logObj.textContent = 'Starting Install Process...\n';

    const filePath = dappLocationConfigInput.value.trim();
    const writeMode = dappWriteModeCheck ? dappWriteModeCheck.checked : false;
    if (filePath) {
        socket.emit('batch-dapp-install', { filePath, writeMode });
    } else {
        alert('Please specify the dApp Build Location file path.');
    }
};

batchUpdateBtn.onclick = () => {
    const logObj = document.getElementById('dapp-log');
    if (logObj) logObj.textContent = 'Starting Update Process...\n';

    const filePath = dappLocationConfigInput.value.trim();
    const writeMode = dappWriteModeCheck ? dappWriteModeCheck.checked : false;
    if (filePath) {
        socket.emit('batch-dapp-install', { filePath, update: true, writeMode });
    } else {
        alert('Please specify the dApp Build Location file path.');
    }
};

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
const buildOutputObj = document.getElementById('build-output');
const copyBuildOutputBtn = document.getElementById('copy-build-output-btn');

if (buildZipBtn) {
    buildZipBtn.onclick = () => {
        buildOutputObj.textContent = 'Starting Build & Zip process...\n';
        buildZipBtn.disabled = true;
        socket.emit('run-build-zip');
    };
}

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
    buildOutputObj.textContent += data;
    // Auto scroll
    buildOutputObj.scrollTop = buildOutputObj.scrollHeight;
});

socket.on('build-complete', (data) => {
    buildZipBtn.disabled = false;
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
    };
}

// Close modal when clicking outside
window.onclick = (event) => {
    if (event.target === globalConfigModal) {
        globalConfigModal.style.display = 'none';
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
    }
});

socket.on('log-update', (data) => {
    const { id, content } = data;
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
function appendLog(elementId, content) {
    const logContainer = document.getElementById(elementId);
    if (!logContainer) return;

    // Check if user is near the bottom (within 50px tolerance)
    const threshold = 50;
    const isNearBottom = logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight <= threshold;

    // Append text safely
    logContainer.textContent += content + '\n';

    // If we were near bottom (or it was empty/small), force scroll to bottom
    if (isNearBottom) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}
// Wrap existing addToGlobalLog if it exists, or just ensure global-log socket uses separate function.
// For compatibility with other parts of app.js calling addToGlobalLog:
window.addToGlobalLog = (content) => appendLog('system-log', content);

// Init
// Init call moved to DOMContentLoaded listener at the top

// --- Global Start Command Logic ---
const applyGlobalCmdBtn = document.getElementById('apply-global-cmd-btn');
const globalCmdTemplateInput = document.getElementById('global-cmd-template');

// Global Params Elements
const globalCleanCheck = document.getElementById('global-clean-check');
const globalGenesisCheck = document.getElementById('global-genesis-check');
const globalConnectInput = document.getElementById('global-connect-input');
// Note: We need to use a static NodeList or re-query if dynamic, but these are static in HTML now
const globalParamChecks = document.querySelectorAll('.global-param-check');

function updateGlobalTemplate() {
    let cmd = './scripts/start_node.sh $ID';

    // Add Clean/Genesis if checked
    if (globalCleanCheck && globalCleanCheck.checked) cmd += ' -clean';
    if (globalGenesisCheck && globalGenesisCheck.checked) cmd += ' -genesis';

    // Add Connect if present
    if (globalConnectInput && globalConnectInput.value.trim()) {
        cmd += ` -connect ${globalConnectInput.value.trim()}`;
    }

    // Add Advanced Params
    if (globalParamChecks) {
        globalParamChecks.forEach(chk => {
            if (chk.checked) cmd += ` ${chk.value}`;
        });
    }

    if (globalCmdTemplateInput) {
        globalCmdTemplateInput.value = cmd;
    }
}

// Attach Listeners
if (globalCleanCheck) globalCleanCheck.addEventListener('change', updateGlobalTemplate);
if (globalGenesisCheck) globalGenesisCheck.addEventListener('change', updateGlobalTemplate);
if (globalConnectInput) globalConnectInput.addEventListener('input', updateGlobalTemplate);
if (globalParamChecks) globalParamChecks.forEach(chk => chk.addEventListener('change', updateGlobalTemplate));

// Initialize Global Template if elements exist
if (globalCleanCheck) updateGlobalTemplate();

if (applyGlobalCmdBtn && globalCmdTemplateInput) {
    applyGlobalCmdBtn.onclick = () => {
        const template = globalCmdTemplateInput.value;
        if (!template.trim()) {
            alert('Please enter a command template.');
            return;
        }

        // Confirm removed as per user request
        // Iterate all visible nodes
        for (let i = 1; i <= visibleNodes; i++) {
            const card = document.getElementById(`node-${i}`);
            if (card) {
                const previewInput = card.querySelector('.start-cmd-preview');
                if (previewInput) {
                    // Replace $ID with actual ID
                    let newCmd = template.replace(/\$ID/g, i);

                    // Node 1: Remove -connect if present (Node 1 doesn't connect to anyone typically in this star topology)
                    // Node > 1: Remove -genesis if present
                    if (i === 1) {
                        // Remove -connect and its argument
                        newCmd = newCmd.replace(/\s+-connect\s+\S+/g, '');
                        // Also cleanup simple flag if arg missing (defensive)
                        newCmd = newCmd.replace(/\s+-connect\b/g, '');
                    } else {
                        // Remove -genesis
                        newCmd = newCmd.replace(/\s+-genesis\b/g, '');
                    }

                    // Clean up double spaces
                    newCmd = newCmd.replace(/\s+/g, ' ').trim();

                    previewInput.value = newCmd;

                    // Visual feedback
                    previewInput.style.backgroundColor = '#2a2a2a';
                    setTimeout(() => previewInput.style.backgroundColor = '', 500);
                }
            }
        }
        addToGlobalLog(`[System] Applied global command template to ${visibleNodes} nodes.`);

        // Close modal after applying for better UX
        if (globalConfigModal) globalConfigModal.style.display = 'none';
    };
}
