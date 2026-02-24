const express = require('express');
const http = require('http');
const https = require('https'); // Required for Minima RPC on port 9005
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Enforce Root Privileges
if (process.getuid && process.getuid() !== 0) {
    console.error('Error: server.js must be run as root (sudo node server.js)');
    process.exit(1);
}

const PORT = 3000;
const NODE_COUNT = 26; // Support A-Z

// Get the user who ran sudo
const sudoUser = process.env.SUDO_USER || 'joanramon';
// Store running processes: { id: process }
const nodeProcesses = {};
const nodeTypes = {}; // 'virtual' | 'host'

// Server-side Config State
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default Config
let globalConfig = {
    projectPath: '/home/joanramon/Minima/metachain',
    dappName: 'MetaChain',
    envPath: '/home/joanramon/Minima/metachain/.env',
    dappLocation: '/home/joanramon/Minima/metachain/build/dapp.minidapp',
    adbPath: 'adb', // Default to 'adb' in PATH, or full path like ~/Android/Sdk/platform-tools/adb
    apkInstallPath: '',
    adbPushPath: '',
    adbPushRemotePath: '/sdcard/Download/',
    mobilePackageName: 'com.minima.android',
    ramLimit: '256m',
    cpuLimit: 1
};

// Load Config from File
if (fs.existsSync(CONFIG_FILE)) {
    try {
        const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const savedConfig = JSON.parse(fileContent);
        globalConfig = { ...globalConfig, ...savedConfig };
        console.log('Loaded configuration from config.json');
    } catch (e) {
        console.error('Failed to load config.json:', e);
    }
}

function saveConfig() {
    try {
        const data = JSON.stringify(globalConfig, null, 2);
        fs.writeFileSync(CONFIG_FILE, data, 'utf-8');
        console.log('[Config] Saved to config.json:', data);
    } catch (e) {
        console.error('Failed to save configuration:', e);
    }
}

// Global ADB Environment Helper
function getAdbEnv() {
    const adbEnv = { ...process.env };
    if (process.env.SUDO_USER) {
        adbEnv.HOME = `/home/${process.env.SUDO_USER}`;
    } else {
        adbEnv.HOME = '/root';
    }
    return adbEnv;
}

// Serve static files from 'public' directory
app.use(express.static('public'));

// Process Management
function startNode(id, options = {}) {
    if (nodeProcesses[id]) return; // Already running

    // Determine type
    const isHost = options.isHost === true;
    nodeTypes[id] = isHost ? 'host' : 'virtual';
    console.log(`[System] Starting Node ${id} (Type: ${nodeTypes[id]})`);

    let cmd = './scripts/start_node.sh';
    let args = [];
    let fullCommandStr = '';

    if (options.command) {
        // Use the provided command string
        // Simple splitting by space (doesn't handle quoted arguments with spaces)
        const parts = options.command.trim().split(/\s+/);
        cmd = parts[0];
        args = parts.slice(1);
        fullCommandStr = options.command;
    } else {
        // Construct arguments from options
        const { clean, genesis, connect, advancedParams } = options;
        args.push(id);

        if (clean) args.push('-clean');
        if (genesis) args.push('-genesis');
        if (connect && connect.trim().length > 0) {
            args.push('-connect');
            args.push(connect);
        }

        // Add RAM limit if configured
        if (globalConfig.ramLimit) {
            args.push('-ram');
            args.push(globalConfig.ramLimit);
        }

        // Add CPU limit if configured
        if (globalConfig.cpuLimit) {
            args.push('-cpus');
            args.push(globalConfig.cpuLimit);
        }

        // Add Advanced Params
        if (advancedParams && Array.isArray(advancedParams)) {
            advancedParams.forEach(param => {
                if (param === '-clean' && clean) return;
                if (param === '-genesis' && genesis) return;
                args.push(param);
            });
        }
        fullCommandStr = `${cmd} ${args.join(' ')}`;
    }

    // Explicitly show the command in the logs
    io.emit('log-update', { id, type: 'system', content: `> Executing: ${fullCommandStr}\n` });

    // Spawn without 'sudo' prefix since server is already root
    const child = spawn(cmd, args);
    nodeProcesses[id] = child;

    // Stream Output to Socket.io
    child.stdout.on('data', (data) => {
        io.emit('log-update', { id, type: 'stdout', content: data.toString() });
    });

    child.stderr.on('data', (data) => {
        io.emit('log-update', { id, type: 'stderr', content: data.toString() });
    });

    child.on('close', (code) => {
        delete nodeProcesses[id];
        io.emit('node-status', { id, status: 'stopped', code });
        io.emit('log-update', { id, type: 'system', content: `[System] Node ${id} stopped with code ${code}\n` });
    });

    io.emit('node-status', { id, status: 'running' });
    io.emit('log-update', { id, type: 'system', content: `[System] Node ${id} started\n` });

    if (options.autoName) {
        scheduleAutoName(id);
    }
}

function stopNode(id) {
    // Determine script based on type
    // If we don't know the type, we default to 'virtual' as it's the most common
    // but a thorough 'Stop All' might want to try both if the server was restarted.
    const type = nodeTypes[id] || 'virtual';
    const script = type === 'host' ? './scripts/stop_host_node.sh' : './scripts/stop_node.sh';

    const stopScript = spawn(script, [id]);

    stopScript.stdout.on('data', (d) => {
        io.emit('log-update', { id, type: 'system', content: d.toString() });
    });

    // If the server was restarted and we don't have the child process reference, 
    // we can't wait for 'close'. The scripts will do their job.
    if (!nodeProcesses[id]) {
        console.log(`[System] Stop signal sent to external/restarted Node ${id}`);
    }
}

function stopAll() {
    console.log(`[System] Stopping all possible nodes (1-${NODE_COUNT})...`);
    for (let i = 1; i <= NODE_COUNT; i++) {
        stopNode(i);
    }
}

// Socket.io Connection
io.on('connection', (socket) => {
    // console.log('Client connected'); // Optional noise reduction

    // Send initial status
    // Send initial status
    for (let i = 1; i <= NODE_COUNT; i++) {
        socket.emit('node-status', {
            id: i,
            status: nodeProcesses[i] ? 'running' : 'stopped'
        });
    }

    // Send current configuration
    socket.emit('config-update', globalConfig);

    // Handle Start Node
    socket.on('start-node', (data) => {
        // Handle both legacy (options object) and new (command string) formats
        const opts = data.command ? { command: data.command } : data.options || {};
        if (data.autoName) opts.autoName = true;
        if (data.isHost) opts.isHost = true; // Pass through host flag
        startNode(data.id, opts);
    });

    // Handle Stop Node
    socket.on('stop-node', (data) => {
        stopNode(data.id);
    });

    // Handle Send Command
    socket.on('send-command', (data) => {
        const { id, command } = data;
        if (nodeProcesses[id] && command) {
            nodeProcesses[id].stdin.write(command + '\n');
            io.emit('log-update', { id, type: 'command', content: `> ${command}\n` });
        }
    });

    // Handle Stop All
    socket.on('stop-all', () => {
        stopAll();
    });

    // Handle Kill All (Force)
    socket.on('kill-all', () => {
        const kill = spawn('./scripts/kill_all_nodes.sh');
        kill.stdout.on('data', d => io.emit('global-log', d.toString()));
        // Force clear internal state
        Object.keys(nodeProcesses).forEach(id => delete nodeProcesses[id]);
        for (let i = 1; i <= NODE_COUNT; i++) io.emit('node-status', { id: i, status: 'stopped' });
    });

    // Handle Setup Network
    socket.on('setup-network', () => {
        const setup = spawn('./scripts/setup_namespaces.sh'); // No sudo needed
        setup.stdout.on('data', d => io.emit('global-log', d.toString()));
    });

    // Handle Network Disconnect (Packet Loss)
    socket.on('disconnect-node', (data) => {
        const { id } = data;
        const proc = spawn('./scripts/disconnect_node.sh', [id]); // No sudo needed
        proc.stdout.on('data', d => io.emit('log-update', { id, type: 'system', content: d.toString() }));
        proc.stderr.on('data', d => io.emit('log-update', { id, type: 'system', content: d.toString() }));
        proc.on('close', (code) => {
            if (code === 0) io.emit('network-status', { id, status: 'disconnected' });
        });
    });

    // Handle Delete Node Data
    socket.on('delete-node-data', (data) => {
        const { id } = data;
        io.emit('log-update', { id, type: 'system', content: `[System] Stopping node and deleting data for Node ${id}...\n` });
        // First ensure node is stopped
        stopNode(id);

        setTimeout(() => {
            const proc = spawn('./scripts/delete_node_data.sh', [id]);
            proc.stdout.on('data', d => io.emit('log-update', { id, type: 'system', content: d.toString() }));
            proc.on('close', () => {
                io.emit('log-update', { id, type: 'system', content: `[System] Node ${id} data deletion complete.\n` });
            });
        }, 1000); // Wait 1s for stop command to process
    });

    // Handle Delete All Data
    socket.on('delete-all-data', () => {
        io.emit('global-log', '[System] TERMINATING ALL NODES AND WIPING ALL DATA...\n');
        stopAll();
        setTimeout(() => {
            const proc = spawn('./scripts/delete_node_data.sh', ['all']);
            proc.stdout.on('data', d => io.emit('global-log', d.toString()));
            proc.on('close', () => {
                io.emit('global-log', '[System] GLOBAL DATA WIPE COMPLETE.\n');
            });
        }, 2000); // Wait 2s for all nodes to stop
    });

    // Handle Sync Peers from URL
    socket.on('sync-peers', () => {
        io.emit('global-log', '[System] Fetching peers from spartacusrex.com...\n');

        https.get('https://spartacusrex.com/minimapeers.txt', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const allPeers = data.trim().split(',').map(p => p.trim()).filter(p => p);
                if (allPeers.length === 0) {
                    io.emit('global-log', '[Error] No peers found in list.\n');
                    return;
                }

                // Shuffle and pick only 2 peers to avoid connection flood (especially in test mode)
                const peers = allPeers.sort(() => 0.5 - Math.random()).slice(0, 2);

                io.emit('global-log', `[System] Found ${allPeers.length} peers. Selecting 2 random peers for synchronization to all nodes...\n`);

                // Distribute to all running nodes
                Object.keys(nodeProcesses).forEach(id => {
                    peers.forEach(peer => {
                        const cmd = `connect host:${peer}`;
                        if (nodeProcesses[id]) {
                            nodeProcesses[id].stdin.write(cmd + '\n');
                        }
                    });
                    io.emit('log-update', { id, type: 'system', content: `[System] Connection attempts started for ${peers.length} random peers from discovery URL.\n` });
                });

                io.emit('global-log', '[System] Peer synchronization complete.\n');
            });
        }).on('error', (err) => {
            io.emit('global-log', `[Error] Peer sync failed: ${err.message}\n`);
        });
    });

    // Handle Network Reconnect
    socket.on('reconnect-node', (data) => {
        const { id } = data;
        const proc = spawn('./scripts/reconnect_node.sh', [id]); // No sudo needed
        proc.stdout.on('data', d => io.emit('log-update', { id, type: 'system', content: d.toString() }));
        proc.on('close', (code) => {
            if (code === 0) io.emit('network-status', { id, status: 'connected' });
        });
    });

    // --- .env Export & Vite Features ---

    // Config Update Handler
    socket.on('update-config', (newConfig) => {
        // Log incoming update
        console.log('[Config] Incoming update from client:', JSON.stringify(newConfig));

        // Deep merge or at least ensure new keys are preserved
        globalConfig = { ...globalConfig, ...newConfig };

        saveConfig();
        // Broadcast the update back to all clients so they stay in sync
        io.emit('config-update', globalConfig);
        io.emit('global-log', `[Server] Config updated & saved: ADB Path = ${globalConfig.adbPath}`);
    });

    socket.on('export-env', async (data) => {
        // ... (existing export-env logic logic kept mostly same but using config if needed)
        // For now, rely on data passed from client, which comes from globalConfig in client.
        // We will keep the existing implementation but note that data.targetPath comes from client.
        const { id, targetPath, dappName } = data;
        const targetDappName = dappName || globalConfig.dappName;

        // ... (rest of export logic)
        // Clean up duplicate declarations
        // (Block removed to fix redeclaration error)

        // Use sendMinimaRpc to abstract Host/Virtual logic
        const command = 'mds';

        sendMinimaRpc(id, command, (err, json) => {
            if (err) {
                io.emit('vite-log', `[Error] RPC Request failed for Node ${id}: ${err.message}. Is -allowallip enabled?`);
                return;
            }

            try {
                if (json.status && json.response) {
                    const dapps = json.response;
                    let sessionUid = '';
                    const list = Array.isArray(dapps) ? dapps : (dapps.minidapps || []);

                    const targetDapp = list.find(d => {
                        const name = d.conf ? d.conf.name : d.name;
                        return name && name.toLowerCase() === targetDappName.toLowerCase();
                    });

                    if (targetDapp) {
                        sessionUid = targetDapp.sessionid || targetDapp.uid;
                    } else {
                        const availableNames = list.map(d => d.conf ? d.conf.name : d.name).join(', ');
                        io.emit('vite-log', `[Error] Dapp '${targetDappName}' not found on Node ${id} (Available: ${availableNames})`);
                        return;
                    }

                    // For .env, we need to know the IP and Port
                    // Get them just like sendMinimaRpc does
                    const type = nodeTypes[id] || 'virtual';
                    const nodeIp = type === 'host' ? '127.0.0.1' : `10.0.0.${10 + parseInt(id)}`;
                    const mdsPort = type === 'host' ? (9003 + (parseInt(id) - 1) * 100) : 9003;

                    const envContent = `VITE_DEBUG=true
VITE_DEBUG_HOST=${nodeIp}
#Node${id}
VITE_DEBUG_MDS_PORT=${mdsPort}
VITE_DEBUG_SESSION_ID=${sessionUid}
`;
                    const finalPath = targetPath || globalConfig.envPath;

                    fs.writeFile(finalPath, envContent, err => {
                        if (err) {
                            io.emit('vite-log', `[Error] Failed to write .env: ${err.message}`);
                        } else {
                            io.emit('vite-log', `[Success] Exported .env for Node ${id} to ${finalPath}`);
                        }
                    });

                } else {
                    io.emit('vite-log', `[Error] Invalid RPC response from Node ${id}`);
                }
            } catch (e) {
                io.emit('vite-log', `[Error] Failed to process RPC response from Node ${id}: ${e.message}`);
            }
        });
    });

    // Vite Server Management
    let viteProcess = null;

    socket.on('start-vite', (data) => {
        if (viteProcess) {
            io.emit('vite-log', '[Vite] Server already running.');
            return;
        }

        const cwd = globalConfig.projectPath;
        if (!fs.existsSync(cwd)) {
            io.emit('vite-log', `[Vite Error] Project path does not exist: ${cwd}`);
            return;
        }

        io.emit('vite-log', `[Vite] Starting server in ${cwd}...`);
        io.emit('vite-log', `[Vite] Running as user: ${sudoUser}`);

        // npm run dev as non-root
        viteProcess = spawn(`sudo -u ${sudoUser} npm run dev`, { cwd, shell: true });

        viteProcess.stdout.on('data', d => {
            const msg = d.toString();
            io.emit('vite-log', `[Vite] ${msg}`);
        });

        viteProcess.stderr.on('data', d => {
            io.emit('vite-log', `[Vite] ${d.toString()}`);
        });

        viteProcess.on('error', (err) => {
            io.emit('vite-log', `[Vite Failed] Process Error: ${err.message}`);
        });

        viteProcess.on('close', code => {
            viteProcess = null;
            io.emit('vite-log', `[Vite] Server stopped with code ${code}`);
            io.emit('vite-status', 'stopped');
        });

        io.emit('vite-status', 'running');
    });

    socket.on('stop-vite', () => {
        if (viteProcess) {
            // Forceful alternative:
            spawn('pkill', ['-f', 'vite']);

            viteProcess = null;
            io.emit('vite-log', '[Vite] Stopping server...');
            io.emit('vite-status', 'stopped');
        } else {
            io.emit('vite-log', '[Vite] No server running.');
        }
    });

    socket.on('run-vite-build-only', () => {
        const cwd = globalConfig.projectPath;
        io.emit('vite-log', `[System] Starting 'npm run build' as user ${sudoUser} in ${cwd}...\n`);

        const build = spawn(`sudo -u ${sudoUser} npm run build`, {
            cwd,
            shell: true
        });

        build.stdout.on('data', (data) => {
            io.emit('vite-log', data.toString());
        });

        build.stderr.on('data', (data) => {
            io.emit('vite-log', `[stderr] ${data.toString()}`);
        });

        build.on('close', (code) => {
            io.emit('vite-log', `\n[System] Build process exited with code ${code}\n`);
            io.emit('vite-build-complete', { success: code === 0 });
        });
    });

    // --- Batch dApp Management (RPC Based) ---

    // Helper for RPC commands


    // Get dApps List (Query first available running node)
    // Get dApps List (Query first available running node)
    socket.on('get-dapps', () => {
        // Find a running node
        const runningNodeId = Object.keys(nodeProcesses).find(id => nodeProcesses[id]);

        if (!runningNodeId) {
            // io.emit('dapp-log', '[Error] No nodes are running. Start a node to fetch dApps.');
            io.emit('dapp-list', []);
            return;
        }

        // Use sendMinimaRpc to abstract Host/Virtual logic
        sendMinimaRpc(runningNodeId, 'mds', (err, json) => {
            if (err) {
                io.emit('dapp-log', `[Error] Request failed: ${err.message}`);
                io.emit('dapp-list', []);
                return;
            }

            try {
                if (json.status && json.response) {
                    const dapps = json.response;
                    const list = Array.isArray(dapps) ? dapps : (dapps.minidapps || []);

                    const simplifiedList = list.map(d => ({
                        name: d.conf ? d.conf.name : d.name,
                        uid: d.uid,
                        version: d.conf ? d.conf.version : d.version
                    }));

                    io.emit('dapp-list', simplifiedList);
                } else {
                    io.emit('dapp-log', `[Error] Failed to fetch dApps from Node ${runningNodeId}`);
                    io.emit('dapp-list', []);
                }
            } catch (e) {
                io.emit('dapp-log', `[Error] Failed to parse response: ${e.message}`);
                io.emit('dapp-list', []);
            }
        });
    });

    socket.on('batch-dapp-install', (data) => {
        const { filePath, writeMode } = data;
        if (!filePath || filePath.trim() === '') {
            io.emit('dapp-log', '[Error] No file path provided for dApp installation.');
            return;
        }

        const modeStr = writeMode ? '(Write Mode)' : '(Read Mode)';
        const nodes = Object.keys(nodeProcesses);

        if (nodes.length === 0) {
            io.emit('dapp-log', '[Error] No nodes are running. Start at least one node.');
            return;
        }

        io.emit('dapp-log', `\n[Batch] Starting Smart Deploy ${modeStr} from ${filePath} on ${nodes.length} nodes...`);

        nodes.forEach((id) => {
            const sendAction = (nodeId, cmd, label) => {
                sendMinimaRpc(nodeId, cmd, (err, json) => {
                    if (err) {
                        io.emit('dapp-log', `\n[Batch] Node ${nodeId}: ${label} Request Failed - ${err.message}`);
                    } else {
                        if (json.status) {
                            const respStr = json.response ? (typeof json.response === 'string' ? json.response : JSON.stringify(json.response)) : 'Done';
                            io.emit('dapp-log', `\n[Batch] Node ${nodeId}: ${label} Success - ${respStr}`);
                        } else {
                            const errStr = json.message || json.error || 'Unknown Error';
                            io.emit('dapp-log', `\n[Batch] Node ${nodeId}: ${label} Failed - ${errStr}`);
                        }
                    }
                });
            }

            // 1. Check if dApp exists to decide between Install or Update
            const targetName = globalConfig.dappName;
            if (!targetName) {
                io.emit('dapp-log', `\n[Batch] Node ${id}: Cannot deploy - No 'Dapp Name' configured in settings.`);
                return;
            }

            sendMinimaRpc(id, 'mds', (err, json) => {
                const trustParams = writeMode ? ' trust:write' : '';

                if (err || !json.status || !json.response) {
                    // Fallback to fresh install if check fails (might be clean node)
                    const command = `mds action:install file:"${filePath}"${trustParams}`;
                    sendAction(id, command, "Install");
                    return;
                }

                const dapps = json.response;
                const list = Array.isArray(dapps) ? dapps : (dapps.minidapps || []);

                const foundDapp = list.find(d => {
                    const name = d.conf ? d.conf.name : d.name;
                    return name && name.toLowerCase() === targetName.toLowerCase();
                });

                if (foundDapp) {
                    const uid = foundDapp.uid;
                    io.emit('dapp-log', `\n[Batch] Node ${id}: Found dApp '${targetName}' (${uid.substring(0, 8)}). Updating...`);
                    const command = `mds action:update uid:"${uid}" file:"${filePath}"${trustParams}`;
                    sendAction(id, command, "Update");
                } else {
                    io.emit('dapp-log', `\n[Batch] Node ${id}: dApp '${targetName}' not found. Installing fresh...`);
                    const command = `mds action:install file:"${filePath}"${trustParams}`;
                    sendAction(id, command, "Install");
                }
            });
        });
    });

    socket.on('batch-dapp-uninstall', (data) => {
        const { uid, name } = data;
        if (!name || name.trim() === '') {
            io.emit('dapp-log', '[Error] No dApp name provided for uninstallation.');
            return;
        }

        const nodes = Object.keys(nodeProcesses);
        io.emit('dapp-log', `\n[Batch] Uninstalling dApp '${name}' from ${nodes.length} nodes: ${nodes.join(', ')}...`);

        nodes.forEach((id) => {
            // First, get the list of dApps on this node to find the correct UID
            sendMinimaRpc(id, 'mds', (err, json) => {
                if (err || !json.status || !json.response) {
                    io.emit('dapp-log', `\n[Batch] Node ${id}: Failed to fetch dApp list - ${err ? err.message : 'Invalid response'}`);
                    return;
                }

                const dapps = json.response;
                const list = Array.isArray(dapps) ? dapps : (dapps.minidapps || []);

                const foundDapp = list.find(d => {
                    const dappName = d.conf ? d.conf.name : d.name;
                    return dappName && dappName.toLowerCase() === name.toLowerCase();
                });

                if (!foundDapp) {
                    io.emit('dapp-log', `\n[Batch] Node ${id}: dApp '${name}' not found (skipping)`);
                    return;
                }

                const nodeUid = foundDapp.uid;
                io.emit('dapp-log', `\n[Batch] Node ${id}: Found '${name}' with UID ${nodeUid.substring(0, 12)}... - Uninstalling...`);

                // Now uninstall using the correct UID for this node
                const command = `mds action:uninstall uid:"${nodeUid}"`;
                sendMinimaRpc(id, command, (err, json) => {
                    if (err) {
                        io.emit('dapp-log', `\n[Batch] Node ${id}: Uninstall Request Failed - ${err.message}`);
                    } else {
                        if (json.status) {
                            io.emit('dapp-log', `\n[Batch] Node ${id}: Uninstall Success ✓`);
                        } else {
                            io.emit('dapp-log', `\n[Batch] Node ${id}: Uninstall Failed - ${json.message || 'Unknown error'}`);
                        }
                    }
                });
            });
        });
    });

    // File System Browsing
    socket.on('list-directory', (dirPath) => {
        const targetDir = dirPath || process.cwd();

        fs.readdir(targetDir, { withFileTypes: true }, (err, files) => {
            if (err) {
                io.emit('directory-list', { path: targetDir, error: err.message, entries: [] });
                return;
            }

            const entries = files.map(file => ({
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.join(targetDir, file.name)
            }));

            // Sort: Directories first, then files
            entries.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });

            io.emit('directory-list', { path: targetDir, entries });
        });
    });

    socket.on('run-build-zip', () => {
        const cwd = globalConfig.projectPath;
        io.emit('build-output', `[System] Starting 'npm run build && npm run minima:zip' as user ${sudoUser} in ${cwd}...\n`);

        // Run as a shell command to allow chaining &&
        // Removed redundant 'npm run build' as 'npm run minima:zip' already includes it
        const build = spawn(`sudo -u ${sudoUser} npm run generate:routes && sudo -u ${sudoUser} npm run build && sudo -u ${sudoUser} npm run minima:zip`, {
            cwd,
            shell: true
        });

        build.stdout.on('data', (data) => {
            io.emit('build-output', data.toString());
        });

        build.stderr.on('data', (data) => {
            io.emit('build-output', `[stderr] ${data.toString()}`);
        });

        build.on('close', (code) => {
            io.emit('build-output', `\n[System] Process exited with code ${code}\n`);
            if (code === 0) {
                io.emit('build-output', `\n✅ Build & Zip Summary:\n`);
                io.emit('build-output', `  - Routes generated\n`);
                io.emit('build-output', `  - MiniDapp built & zipped\n`);
                io.emit('build-output', `\n✨ All steps completed successfully!\n`);
            } else {
                io.emit('build-output', `\n❌ Process failed. Summary check showed errors.\n`);
            }
            io.emit('build-complete', { success: code === 0 });
        });
    });

    socket.on('run-android-build', (data) => {
        const { deviceId } = data || {};
        const cwd = globalConfig.projectPath;
        const adb = globalConfig.adbPath || 'adb';

        io.emit('build-output', `[System] Starting Refined Android Build & Install (Clean Pipeline) as user ${sudoUser}...\n`);
        io.emit('build-output', `[System] Project Path: ${cwd}\n`);
        io.emit('build-output', `[System] Using ADB: ${adb}\n`);
        io.emit('build-output', `[System] Target Device: ${deviceId || 'Auto (Default)'}\n`);
        io.emit('build-output', `[System] This will perform a clean, deterministic build of the Android APK using the Manager script.\n\n`);

        // Execute the centralized build script from MinimaNodeManager/scripts
        const scriptPath = './scripts/build_android_clean.sh';
        // Command format: ./scripts/build_android_clean.sh <PROJECT_DIR> <ADB_PATH> [DEVICE_ID]
        // Force --no-install as we now separate build and install
        let innerCommand = `${scriptPath} "${cwd}" "${adb}" "--no-install"`;

        const command = `sudo -u ${sudoUser} ${innerCommand}`;

        const build = spawn(command, {
            cwd: __dirname, // Execute from Manager root where scripts reside
            shell: true
        });

        build.stdout.on('data', (data) => {
            io.emit('build-output', data.toString());
        });

        build.stderr.on('data', (data) => {
            io.emit('build-output', `[stderr] ${data.toString()}`);
        });

        build.on('close', (code) => {
            io.emit('build-output', `\n[System] Process exited with code ${code}\n`);
            if (code === 0) {
                io.emit('build-output', `\n✅ APK built and installed successfully!\n`);
                io.emit('build-output', `📍 APK location: ${cwd}/android/app/build/outputs/apk/debug/app-debug.apk\n`);
            } else {
                io.emit('build-output', `\n❌ Process failed. Check output above for details.\n`);
            }
            io.emit('build-complete', { success: code === 0 });
        });
    });

    socket.on('run-full-build', (data) => {
        const { deviceId } = data || {};
        const cwd = globalConfig.projectPath;
        const adb = globalConfig.adbPath || 'adb';

        io.emit('build-output', `[System] Starting Refined Build All (Clean Pipeline: MiniDapp + Android) as user ${sudoUser}...\n`);
        io.emit('build-output', `[System] Project Path: ${cwd}\n`);
        io.emit('build-output', `[System] Using ADB: ${adb}\n`);
        io.emit('build-output', `[System] Target Device: ${deviceId || 'Auto (Default)'}\n\n`);

        // Execute the centralized build script
        const scriptPath = './scripts/build_android_clean.sh';
        // Use --no-install flag to separate build and deploy stages
        let innerCommand = `${scriptPath} "${cwd}" "${adb}" "--no-install"`;

        const command = `sudo -u ${sudoUser} ${innerCommand} && cd ${cwd} && sudo -u ${sudoUser} npm run minima:zip`;

        const build = spawn(command, {
            cwd: __dirname, // Execute from Manager root
            shell: true
        });

        build.stdout.on('data', (data) => {
            io.emit('build-output', data.toString());
        });

        build.stderr.on('data', (data) => {
            io.emit('build-output', `[stderr] ${data.toString()}`);
        });

        build.on('close', (code) => {
            io.emit('build-output', `\n[System] Process exited with code ${code}\n`);
            if (code === 0) {
                io.emit('build-output', `\n✅ FULL Build & Install Summary:\n`);
                io.emit('build-output', `  - Routes generated\n`);
                io.emit('build-output', `  - MiniDapp built & zipped\n`);
                io.emit('build-output', `  - Web assets synced to Android\n`);
                io.emit('build-output', `  - Android APK generated\n`);
                io.emit('build-output', `  - APK installed on device\n`);
                io.emit('build-output', `\n✨ FULL process completed successfully!\n`);
            } else {
                io.emit('build-output', `\n❌ FULL Build failed. Review the step-by-step logs.\n`);
            }
            io.emit('build-complete', { success: code === 0 });
        });
    });

    socket.on('get-adb-devices', () => {
        const adb = globalConfig.adbPath || 'adb';
        console.log(`[ADB] Fetching devices using path: ${adb}`);

        // Pass HOME env variable so ADB can find its config/keys
        const adbEnv = { ...process.env };
        if (process.env.SUDO_USER) {
            adbEnv.HOME = `/home/${process.env.SUDO_USER}`;
        } else {
            adbEnv.HOME = '/root';
        }

        const deviceList = spawn(adb, ['devices'], { env: getAdbEnv() });

        let stdout = '';
        let stderr = '';
        deviceList.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        deviceList.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        deviceList.on('close', (code) => {
            if (code === 0) {
                console.log(`[ADB] devices output:\n${stdout}`);
                if (stderr) console.log(`[ADB] devices stderr:\n${stderr}`);

                // Parse device list
                const lines = stdout.split('\n').filter(line => line.trim());

                // Robust parsing: Look for lines with tabs, which indicate a device serial and status
                const devices = lines
                    .filter(line => line.includes('\t'))
                    .map(line => {
                        const [id, status] = line.split('\t');
                        return { id: id.trim(), status: status.trim() };
                    });

                console.log(`[ADB] Found ${devices.length} devices:`, JSON.stringify(devices));
                io.emit('adb-device-list', devices);

                if (devices.length === 0) {
                    io.emit('global-log', `[ADB] No devices found. Check if they are connected and 'adb devices' works manually.`);
                }
            } else {
                console.error(`[ADB] devices failed with code ${code}. Stderr: ${stderr}`);
                io.emit('adb-device-list', []);
                io.emit('global-log', `[ADB] Error listing devices (code ${code}): ${stderr || 'Unknown error'}`);
            }
        });
    });

    socket.on('run-adb-install', (data) => {
        const { filePath, deviceId } = data;
        const adb = globalConfig.adbPath || 'adb';

        if (!filePath) {
            io.emit('build-output', '[Error] No APK file path provided.\n');
            return;
        }

        // Update and save config
        globalConfig.apkInstallPath = filePath;
        saveConfig();
        io.emit('config-update', globalConfig);

        io.emit('build-output', `[System] Installing APK: ${filePath}\n`);
        io.emit('build-output', `[System] Using ADB: ${adb}\n`);
        if (deviceId) {
            io.emit('build-output', `[System] Target Device: ${deviceId}\n\n`);
        } else {
            io.emit('build-output', `[System] Target Device: Auto\n\n`);
        }

        const args = deviceId ? ['-s', deviceId, 'install', '-r', '-d', filePath] : ['install', '-r', '-d', filePath];
        const install = spawn(adb, args, { env: getAdbEnv() });

        install.stdout.on('data', (data) => {
            io.emit('build-output', data.toString());
        });

        install.stderr.on('data', (data) => {
            io.emit('build-output', `[stderr] ${data.toString()}`);
        });

        install.on('close', (code) => {
            io.emit('build-output', `\n[System] ADB install exited with code ${code}\n`);
            if (code === 0) {
                io.emit('build-output', `\n✅ ADB Install Summary:\n`);
                io.emit('build-output', `  - APK installed successfully to device\n`);
                io.emit('build-output', `\n✨ ADB Install completed successfully!\n`);
            } else {
                io.emit('build-output', `\n❌ ADB Install failed. Check the logs above.\n`);
            }
            io.emit('build-complete', { success: code === 0 });
        });
    });

    socket.on('run-adb-push', (data) => {
        const { localPath, remotePath, deviceId } = data;
        const adb = globalConfig.adbPath || 'adb';

        if (!localPath || !remotePath) {
            io.emit('build-output', '[Error] Missing local path or remote destination for ADB Push.\n');
            return;
        }

        // Update and save config
        globalConfig.adbPushPath = localPath;
        globalConfig.adbPushRemotePath = remotePath;
        saveConfig();
        io.emit('config-update', globalConfig);

        io.emit('build-output', `[System] Pushing file: ${localPath} -> ${remotePath}\n`);
        io.emit('build-output', `[System] Using ADB: ${adb}\n`);
        if (deviceId) {
            io.emit('build-output', `[System] Target Device: ${deviceId}\n\n`);
        } else {
            io.emit('build-output', `[System] Target Device: Auto\n\n`);
        }

        const args = deviceId ? ['-s', deviceId, 'push', localPath, remotePath] : ['push', localPath, remotePath];
        const push = spawn(adb, args, { env: getAdbEnv() });

        push.stdout.on('data', (data) => {
            io.emit('build-output', data.toString());
        });

        push.stderr.on('data', (data) => {
            io.emit('build-output', `[stderr] ${data.toString()}`);
        });

        push.on('close', (code) => {
            io.emit('build-output', `\n[System] ADB push exited with code ${code}\n`);
            if (code === 0) {
                io.emit('build-output', `✅ File pushed successfully!\n`);
            } else {
                io.emit('build-output', `❌ Push failed.\n`);
            }
            io.emit('build-complete', { success: code === 0 });
        });
    });

    socket.on('run-adb-uninstall', (data) => {
        const { packageName, deviceId } = data;
        const adb = globalConfig.adbPath || 'adb';

        if (!packageName) {
            io.emit('build-output', '[Error] No package name provided for uninstall.\n');
            return;
        }

        // Update and save config
        globalConfig.mobilePackageName = packageName;
        saveConfig();
        io.emit('config-update', globalConfig);

        io.emit('build-output', `[System] Uninstalling APK: ${packageName}\n`);
        io.emit('build-output', `[System] Using ADB: ${adb}\n`);
        if (deviceId) {
            io.emit('build-output', `[System] Target Device: ${deviceId}\n\n`);
        } else {
            io.emit('build-output', `[System] Target Device: Auto\n\n`);
        }

        const args = deviceId ? ['-s', deviceId, 'uninstall', packageName] : ['uninstall', packageName];
        const uninstall = spawn(adb, args, { env: getAdbEnv() });

        uninstall.stdout.on('data', (data) => {
            io.emit('build-output', data.toString());
        });

        uninstall.stderr.on('data', (data) => {
            io.emit('build-output', `[stderr] ${data.toString()}`);
        });

        uninstall.on('close', (code) => {
            io.emit('build-output', `\n[System] ADB uninstall exited with code ${code}\n`);
            if (code === 0) {
                io.emit('build-output', `✅ APK '${packageName}' uninstalled successfully!\n`);
            } else {
                io.emit('build-output', `❌ APK uninstall failed. Is the package name correct?\n`);
            }
            io.emit('build-complete', { success: code === 0 });
        });
    });

    socket.on('get-adb-packages', (data) => {
        const { deviceId } = data;
        const adb = globalConfig.adbPath || 'adb';

        const args = deviceId ? ['-s', deviceId, 'shell', 'pm', 'list', 'packages', '-3'] : ['shell', 'pm', 'list', 'packages', '-3'];

        exec(`${adb} ${args.join(' ')}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`ADB error: ${error}`);
                socket.emit('adb-package-list', { error: stderr || error.message });
                return;
            }

            const packages = stdout
                .split('\n')
                .map(line => line.replace('package:', '').trim())
                .filter(pkg => pkg.length > 0)
                .sort();

            socket.emit('adb-package-list', { packages });
        });
    });

    socket.on('mobile-dapp-push', async (data) => {
        const { filePath, deviceId } = data;
        const adb = globalConfig.adbPath || 'adb';
        const pkg = globalConfig.mobilePackageName || 'com.minima.android';

        if (!filePath) {
            io.emit('dapp-log', '[Error] No dApp path provided.\n');
            io.emit('mobile-push-complete');
            return;
        }

        io.emit('dapp-log', `[Mobile Push] Starting Hybrid Push for: ${filePath}\n`);
        io.emit('dapp-log', `[Mobile Push] Target Package: ${pkg}\n`);

        let tmpDir = null;
        let mdsFileRemotePath = `/sdcard/Download/metachain_mobile_push.mds`;
        const localRpcPort = 19005;
        const adbPrefix = deviceId ? `${adb} -s ${deviceId}` : adb;
        const adbEnv = { ...process.env };
        if (process.env.SUDO_USER) {
            adbEnv.HOME = `/home/${process.env.SUDO_USER}`;
        }

        try {
            // --- STEP 1: RPC INSTALL ATTEMPT ---
            let rpcSuccess = false;

            if (fs.statSync(filePath).isFile() && filePath.endsWith('.zip')) {
                io.emit('dapp-log', `[Mobile Push] Source is a zip, trying RPC install first...\n`);

                // Push ZIP file
                await new Promise((resolve, reject) => {
                    exec(`${adbPrefix} push "${filePath}" "${mdsFileRemotePath}"`, { env: adbEnv }, (err, stdout, stderr) => {
                        if (err) reject(new Error(stderr || err.message));
                        else resolve();
                    });
                });

                // Try common Minima ports (9005=RPC, 9001=RPC, 9003=MDS SSL, 9004=MDS)
                const portsToTry = [9005];

                for (const port of portsToTry) {
                    if (rpcSuccess) break;
                    io.emit('dapp-log', `[Mobile Push] Probing RPC on port ${port}...\n`);

                    await new Promise((resolve) => {
                        exec(`${adbPrefix} forward tcp:${localRpcPort} tcp:${port}`, { env: adbEnv }, () => resolve());
                    });
                    await new Promise(resolve => setTimeout(resolve, 500));

                    for (const isHttps of [true, false]) {
                        try {
                            const protocol = isHttps ? https : http;
                            const rpcPath = '/mds' + encodeURIComponent(` action:install file:"${mdsFileRemotePath}"`);
                            const rpcOptions = {
                                hostname: 'localhost', port: localRpcPort, path: rpcPath, method: 'GET',
                                rejectUnauthorized: false,
                                headers: { 'Authorization': 'Basic ' + Buffer.from('minima:123').toString('base64') }
                            };

                            const resJson = await new Promise((resolve, reject) => {
                                const req = protocol.request(rpcOptions, res => {
                                    let body = '';
                                    res.on('data', chunk => body += chunk);
                                    res.on('end', () => {
                                        try {
                                            resolve(JSON.parse(body));
                                        } catch (e) {
                                            reject(new Error('Invalid JSON response'));
                                        }
                                    });
                                });
                                req.on('error', e => reject(e));
                                req.setTimeout(2000, () => { req.destroy(); reject(new Error('Timeout')); });
                                req.end();
                            });

                            if (resJson.status) {
                                io.emit('dapp-log', `✅ RPC Install successful on port ${port} (${isHttps ? 'HTTPS' : 'HTTP'})!\n`);
                                rpcSuccess = true;
                                break;
                            }
                        } catch (e) { }
                    }
                    // Cleanup tunnel
                    exec(`${adbPrefix} forward --remove tcp:${localRpcPort}`, { env: adbEnv });
                }
            }

            if (rpcSuccess) {
                // Cleanup remote zip
                exec(`${adbPrefix} shell rm "${mdsFileRemotePath}"`, { env: adbEnv });
                io.emit('dapp-log', `\n✨ Mobile Push completed via RPC.\n`);
            } else {
                // --- STEP 2: MANUAL PUSH FALLBACK ---
                io.emit('dapp-log', `[Mobile Push] RPC failed or unavailable. Falling back to Manual File Push...\n`);

                let sourceDir = filePath;

                // If it's a file, unzip it
                if (fs.statSync(filePath).isFile()) {
                    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minima-push-'));
                    io.emit('dapp-log', `[Mobile Push] Unzipping package...\n`);
                    await new Promise((resolve, reject) => {
                        exec(`unzip -o "${filePath}" -d "${tmpDir}"`, (err) => { // -o to overwrite existing files
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    sourceDir = tmpDir;
                }

                // Read dapp.conf
                const confPath = path.join(sourceDir, 'dapp.conf');
                if (!fs.existsSync(confPath)) throw new Error('dapp.conf not found');
                const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
                const dappname = conf.name;

                io.emit('dapp-log', `[Mobile Push] Detected dApp: ${dappname}. Moving to internal storage...\n`);

                const remoteTmpPath = `/sdcard/Download/MinimaDapps/${dappname}`;
                await new Promise((resolve) => exec(`${adbPrefix} shell mkdir -p "${remoteTmpPath}"`, { env: adbEnv }, () => resolve()));
                await new Promise((resolve, reject) => {
                    exec(`${adbPrefix} push "${sourceDir}/." "${remoteTmpPath}/"`, { env: adbEnv }, (err, stdout, stderr) => {
                        if (err) reject(new Error(stderr || err.message)); else resolve();
                    });
                });

                // Permissions
                await new Promise((resolve) => exec(`${adbPrefix} shell "chmod -R 777 ${remoteTmpPath}"`, { env: adbEnv }, () => resolve()));

                // Target internal storage - We try two possible paths
                const targetPaths = [`files/minima/dapps/${dappname}`, `files/dapps/${dappname}`];
                let manualPushSuccess = false;

                for (const targetPath of targetPaths) {
                    if (manualPushSuccess) break;
                    io.emit('dapp-log', `[Mobile Push] Attempting to copy to ${targetPath}...\n`);
                    const runAsCheck = `${adbPrefix} shell "run-as ${pkg} id"`;

                    try {
                        // Check if run-as is even possible
                        await new Promise((resolve, reject) => {
                            exec(runAsCheck, { env: adbEnv }, (err, stdout, stderr) => {
                                if (err || (stderr && stderr.includes('not debuggable'))) {
                                    reject(new Error(stderr || 'Package not debuggable'));
                                } else resolve();
                            });
                        });

                        const runAsCmd = `${adbPrefix} shell "run-as ${pkg} mkdir -p ${targetPath} && run-as ${pkg} cp -r ${remoteTmpPath}/* ${targetPath}/"`;
                        await new Promise((resolve, reject) => {
                            exec(runAsCmd, { env: adbEnv }, (err, stdout, stderr) => {
                                if (err) reject(new Error(stderr || 'mkdir/cp failed'));
                                else resolve();
                            });
                        });
                        io.emit('dapp-log', `[Mobile Push] Successfully copied to ${targetPath} using 'run-as cp'.\n`);
                        manualPushSuccess = true;
                    } catch (e) {
                        if (e.message.includes('not debuggable')) {
                            io.emit('dapp-log', `[Mobile Push] ⚠️ 'run-as' blocked (package not debuggable). Manual push impossible on release APK.\n`);
                            break;
                        }

                        io.emit('dapp-log', `[Mobile Push] 'run-as cp' failed for ${targetPath}: ${e.message}. Trying recursive cat fallback...\n`);
                        try {
                            const pushRecursive = async (localDirPath, remoteDirPath) => {
                                const items = fs.readdirSync(localDirPath, { withFileTypes: true });
                                for (const item of items) {
                                    const localP = path.join(localDirPath, item.name);
                                    const remoteP = `${remoteDirPath}/${item.name}`;
                                    if (item.isDirectory()) {
                                        await new Promise((resolve, reject) => {
                                            exec(`${adbPrefix} shell "run-as ${pkg} mkdir -p ${remoteP}"`, { env: adbEnv }, (err, stdout, stderr) => {
                                                if (err) reject(new Error(stderr)); else resolve();
                                            });
                                        });
                                        await pushRecursive(localP, remoteP);
                                    } else {
                                        const catCmd = `${adbPrefix} shell "run-as ${pkg} sh -c 'cat > \\"${remoteP}\\"'" < "${localP}"`;
                                        await new Promise((resolve, reject) => {
                                            exec(catCmd, { env: adbEnv }, (err, stdout, stderr) => {
                                                if (err) reject(new Error(stderr)); else resolve();
                                            });
                                        });
                                    }
                                }
                            };
                            await pushRecursive(sourceDir, targetPath);
                            io.emit('dapp-log', `[Mobile Push] Successfully copied to ${targetPath} using 'run-as cat' fallback.\n`);
                            manualPushSuccess = true;
                        } catch (catErr) {
                            io.emit('dapp-log', `[Mobile Push] Fallback failed for ${targetPath}: ${catErr.message}\n`);
                        }
                    }
                }

                if (!manualPushSuccess) {
                    throw new Error('Manual push failed. Ensure the App is debuggable or use RPC method.');
                }

                // Cleanup
                exec(`${adbPrefix} shell rm -rf "${remoteTmpPath}"`, { env: adbEnv });
                if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });

                io.emit('dapp-log', `\n✅ dApp pushed manually. Please RESTART Minima on your phone to see it!\n`);
            }

        } catch (error) {
            io.emit('dapp-log', `\n❌ Mobile Push failed: ${error.message}\n`);
            // Attempt tunnel cleanup if error occurred
            try {
                exec(`${adbPrefix} forward --remove tcp:${localRpcPort}`, { env: adbEnv });
            } catch (e) { /* ignore */ }
            if (tmpDir) {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
            try { exec(`${adbPrefix} shell rm "${mdsFileRemotePath}"`, { env: adbEnv }); } catch (e) { /* ignore */ }
        } finally {
            io.emit('mobile-push-complete');
        }
    });

});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Remember to connect to: http://localhost:${PORT}`);

    // Auto Setup Network
    console.log('Running Auto Network Setup...');
    const setup = spawn('./scripts/setup_namespaces.sh');
    setup.stderr.on('data', d => console.error(`[Network Setup Error] ${d.toString().trim()}`));

    // Auto-open Browser
    const pEnv = process.env;
    const sudoUser = pEnv.SUDO_USER;
    const url = `http://localhost:${PORT}`;

    let openCmd = `xdg-open ${url}`;
    if (sudoUser) {
        openCmd = `sudo -u ${sudoUser} DISPLAY=:0 xdg-open ${url}`;
    }

    console.log(`Opening browser at ${url}...`);

    let cmd, args;
    if (sudoUser) {
        cmd = 'sudo';
        args = ['-u', sudoUser, 'DISPLAY=:0', 'xdg-open', url];
    } else {
        cmd = 'xdg-open';
        args = [url];
    }

    const subprocess = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore'
    });

    subprocess.unref();

    subprocess.on('error', (err) => {
        console.error(`Failed to open browser: ${err.message}`);
        console.log(`Please manually open: ${url}`);
    });
});


// Helper for RPC commands (Global)
function sendMinimaRpc(id, command, callback) {
    // Determine target IP and Port based on Node Type
    const type = nodeTypes[id] || 'virtual';
    let nodeIp, rpcPort;

    if (type === 'host') {
        nodeIp = '127.0.0.1';
        rpcPort = 9005 + (parseInt(id) - 1) * 100;
    } else {
        nodeIp = `10.0.0.${10 + parseInt(id)}`;
        rpcPort = 9005;
    }

    const rpcOptions = {
        hostname: nodeIp,
        port: rpcPort,
        path: '/' + encodeURIComponent(command),
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
            'Authorization': 'Basic ' + Buffer.from('minima:123').toString('base64')
        }
    };

    const req = https.request(rpcOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                callback(null, json);
            } catch (e) {
                callback(e);
            }
        });
    });

    req.on('error', (e) => callback(e));
    req.end();
}

function scheduleAutoName(id) {
    const name = `user${id}`;
    io.emit('log-update', { id, type: 'system', content: `[Auto-Name] Waiting for RPC to set name to '${name}'...\n` });

    let attempts = 0;
    const maxAttempts = 20;
    const intervalTime = 3000;

    const poller = setInterval(() => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(poller);
            io.emit('log-update', { id, type: 'system', content: `[Auto-Name] Failed to set name: Timeout waiting for RPC.\n` });
            return;
        }

        // Try to set name
        const command = `maxima action:setname name:"${name}"`;
        sendMinimaRpc(id, command, (err, json) => {
            if (!err && json && json.status) {
                clearInterval(poller);
                const resp = json.response ? JSON.stringify(json.response) : 'Success';
                io.emit('log-update', { id, type: 'system', content: `[Auto-Name] Name set to '${name}': ${resp}\n` });
            }
        });

    }, intervalTime);
}

