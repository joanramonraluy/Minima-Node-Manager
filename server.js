const express = require('express');
const http = require('http');
const https = require('https'); // Required for Minima RPC on port 9005
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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
// Store running processes: { id: process }
const nodeProcesses = {};

// Server-side Config State
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default Config
let globalConfig = {
    projectPath: '/home/joanramon/Minima/metachain',
    dappName: 'MetaChain',
    envPath: '/home/joanramon/Minima/metachain/.env',
    dappLocation: '/home/joanramon/Minima/metachain/build/dapp.minidapp'
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
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(globalConfig, null, 2), 'utf-8');
        console.log('Configuration saved to config.json');
    } catch (e) {
        console.error('Failed to save configuration:', e);
    }
}

// Serve static files from 'public' directory
app.use(express.static('public'));

// Process Management
function startNode(id, options = {}) {
    if (nodeProcesses[id]) return; // Already running

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
    if (nodeProcesses[id]) {
        // Use the helper script to kill the process inside the namespace
        const stopScript = spawn('./scripts/stop_node.sh', [id]);

        stopScript.stdout.on('data', (d) => {
            io.emit('log-update', { id, type: 'system', content: d.toString() });
        });

        // We don't manually delete nodeProcesses[id] here; 
        // the startNode child process will emit 'close' when it actually exits,
        // and that listener cleans up the map and updates status.
    }
}

function stopAll() {
    Object.keys(nodeProcesses).forEach(id => stopNode(id));
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
        // Handle both legacy (options object) and new (command string) formats
        const opts = data.command ? { command: data.command } : data.options || {};
        if (data.autoName) opts.autoName = true;
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
        globalConfig = { ...globalConfig, ...newConfig };
        saveConfig();
        // Broadcast the update back to all clients so they stay in sync
        io.emit('config-update', globalConfig);
        io.emit('global-log', `[Server] Config updated & saved: Project Root = ${globalConfig.projectPath}`);
    });

    socket.on('export-env', async (data) => {
        // ... (existing export-env logic logic kept mostly same but using config if needed)
        // For now, rely on data passed from client, which comes from globalConfig in client.
        // We will keep the existing implementation but note that data.targetPath comes from client.
        const { id, targetPath, dappName } = data;
        const targetDappName = dappName || globalConfig.dappName;

        // ... (rest of export logic)
        const idStr = id.toString();
        const nodeIp = `10.0.0.${10 + parseInt(id)}`;

        const rpcOptions = {
            hostname: nodeIp,
            port: 9005,
            path: '/mds',
            method: 'GET',
            rejectUnauthorized: false,
            headers: {
                'Authorization': 'Basic ' + Buffer.from('minima:123').toString('base64')
            }
        };

        const req = https.request(rpcOptions, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
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

                        const envContent = `VITE_DEBUG=true
VITE_DEBUG_HOST=${nodeIp}
#Node${id}
VITE_DEBUG_MDS_PORT=9003
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
                    io.emit('vite-log', `[Error] Failed to parse RPC from Node ${id}: ${e.message}`);
                }
            });
        });

        req.on('error', e => {
            io.emit('vite-log', `[Error] RPC Request failed for Node ${id}: ${e.message}. Is -allowallip enabled?`);
        });
        req.end();
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

        // npm run dev
        viteProcess = spawn('npm', ['run', 'dev'], { cwd, shell: true });

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
        io.emit('vite-log', `[System] Starting 'npm run build' in ${cwd}...\n`);

        const build = spawn('npm', ['run', 'build'], {
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
    socket.on('get-dapps', () => {
        // Find a running node
        const runningNodeId = Object.keys(nodeProcesses).find(id => nodeProcesses[id]);

        if (!runningNodeId) {
            io.emit('dapp-log', '[Error] No nodes are running. Start a node to fetch dApps.');
            io.emit('dapp-list', []);
            return;
        }

        const idStr = runningNodeId.toString();
        const nodeIp = `10.0.0.${10 + parseInt(runningNodeId)}`;

        const rpcOptions = {
            hostname: nodeIp,
            port: 9005,
            path: '/mds',
            method: 'GET',
            rejectUnauthorized: false,
            headers: { 'Authorization': 'Basic ' + Buffer.from('minima:123').toString('base64') }
        };

        const req = https.request(rpcOptions, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
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

        req.on('error', (e) => {
            io.emit('dapp-log', `[Error] Request failed: ${e.message}`);
            io.emit('dapp-list', []);
        });
        req.end();
    });

    socket.on('batch-dapp-install', (data) => {
        const { filePath, writeMode, update } = data;
        if (!filePath || filePath.trim() === '') {
            io.emit('dapp-log', '[Error] No file path provided for dApp installation.');
            return;
        }

        const modeStr = writeMode ? '(Write Mode)' : '(Read Mode)';
        const actionStr = update ? 'Updating' : 'Installing';

        const nodes = Object.keys(nodeProcesses);
        io.emit('dapp-log', `\n[Batch] ${actionStr} dApp ${modeStr} from ${filePath} on ${nodes.length} nodes: ${nodes.join(', ')}...`);

        nodes.forEach((id) => {
            // Helper to perform the actual install/update
            const performInstall = () => {
                const trustParams = writeMode ? ' trust:write' : '';
                const command = `mds action:install file:"${filePath}"${trustParams}`;
                const actionLabel = "Install";

                sendAction(id, command, actionLabel);
            };

            const performUpdate = (uid) => {
                // Update doesn't seemingly take trust params in same way, but usually inherits or we just update code.
                // Minima help: mds action:update uid:.. file:.. [trust:..]
                const trustParams = writeMode ? ' trust:write' : '';
                const command = `mds action:update uid:"${uid}" file:"${filePath}"${trustParams}`;
                const actionLabel = "Update";

                sendAction(id, command, actionLabel);
            };

            const sendAction = (nodeId, cmd, label) => {
                sendMinimaRpc(nodeId, cmd, (err, json) => {
                    if (err) {
                        io.emit('dapp-log', `\n[Batch] Node ${nodeId}: ${label} Request Failed - ${err.message}`);
                    } else {
                        if (json.status) {
                            const respStr = json.response ? JSON.stringify(json.response) : 'Done';
                            io.emit('dapp-log', `\n[Batch] Node ${nodeId}: ${label} Success - ${respStr}`);
                        } else {
                            const errStr = json.message || json.error || 'Unknown Error';
                            io.emit('dapp-log', `\n[Batch] Node ${nodeId}: ${label} Failed - ${errStr}`);
                        }
                    }
                });
            }

            if (update) {
                // 1. Find the dApp UID by name
                const targetName = globalConfig.dappName;
                if (!targetName) {
                    io.emit('dapp-log', `\n[Batch] Node ${id}: Cannot update - No 'Dapp Name' configured in settings.`);
                    return;
                }

                // Get list of dapps
                sendMinimaRpc(id, 'mds', (err, json) => {
                    if (err || !json.status || !json.response) {
                        io.emit('dapp-log', `\n[Batch] Node ${id}: Failed to fetch dApps list for update check.`);
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
                        io.emit('dapp-log', `\n[Batch] Node ${id}: Found dApp '${targetName}' (UID: ${uid}). Updating...`);
                        performUpdate(uid);
                    } else {
                        io.emit('dapp-log', `\n[Batch] Node ${id}: dApp '${targetName}' not found. Cannot update. (To install fresh, uncheck Update)`);
                    }
                });

            } else {
                // FRESH INSTALL
                performInstall();
            }
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
        io.emit('build-output', `[System] Starting 'npm run build && npm run minima:zip' in ${cwd}...\n`);

        // Run as a shell command to allow chaining &&
        const build = spawn('npm run generate:routes && npm run build && npm run minima:zip', {
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
            io.emit('build-complete', { success: code === 0 });
        });
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
        // Run as the original user. 
        // We use 'sudo -u' instead of 'su -' to avoid a full login shell that wipes variables.
        // We likely need to set DISPLAY=:0 for GUI apps to find the session.
        // potentially need DBUS_SESSION_BUS_ADDRESS as well, but DISPLAY=:0 often suffices for simple xdg-open.
        openCmd = `sudo -u ${sudoUser} DISPLAY=:0 xdg-open ${url}`;
    }

    console.log(`Opening browser at ${url}...`);
    console.log(`Opening browser at ${url}...`);

    // Use spawn instead of exec to detach the process
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
    const idStr = id.toString();
    const nodeIp = `10.0.0.${10 + parseInt(id)}`;

    // Use Minima RPC on port 9005 (HTTPS)
    const rpcOptions = {
        hostname: nodeIp,
        port: 9005,
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
    const maxAttempts = 15;
    const intervalTime = 2000;

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
