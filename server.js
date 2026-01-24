const express = require('express');
const http = require('http');
const https = require('https'); // Required for Minima RPC on port 9005
const { Server } = require('socket.io');
const { spawn } = require('child_process');
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

    const { clean, genesis, connect, advancedParams } = options;
    const args = [id];

    // Construct arguments for start_node.sh
    if (clean) args.push('-clean');
    if (genesis) args.push('-genesis');
    if (connect && connect.trim().length > 0) {
        args.push('-connect');
        args.push(connect);
    }

    // Add Advanced Params
    if (advancedParams && Array.isArray(advancedParams)) {
        advancedParams.forEach(param => {
            // Avoid duplicates if handled elsewhere (e.g. genesis/clean)
            if (param === '-clean' && clean) return;
            if (param === '-genesis' && genesis) return;
            args.push(param);
        });
    }

    // Spawn without 'sudo' prefix since server is already root
    // Using explicit path to ensure script execution
    const child = spawn('./scripts/start_node.sh', args);
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
}

function stopNode(id) {
    if (nodeProcesses[id]) {
        // Send SIGTERM to the shell script
        nodeProcesses[id].kill('SIGTERM');
        // 'close' event will handle the rest
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
        startNode(data.id, data.options);
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
        const nodeIp = `10.0.0.1${idStr}`;

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
                            io.emit('global-log', `[Error] Dapp '${targetDappName}' not found on Node ${id} (Available: ${availableNames})`);
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
                                io.emit('global-log', `[Error] Failed to write .env: ${err.message}`);
                            } else {
                                io.emit('global-log', `[Success] Exported .env for Node ${id} to ${finalPath}`);
                            }
                        });

                    } else {
                        io.emit('global-log', `[Error] Invalid RPC response from Node ${id}`);
                    }
                } catch (e) {
                    io.emit('global-log', `[Error] Failed to parse RPC from Node ${id}: ${e.message}`);
                }
            });
        });

        req.on('error', e => {
            io.emit('global-log', `[Error] RPC Request failed for Node ${id}: ${e.message}. Is -allowallip enabled?`);
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

    // --- Batch dApp Management (RPC Based) ---

    // Helper for RPC commands
    function sendMinimaRpc(id, command, callback) {
        const idStr = id.toString();
        const nodeIp = `10.0.0.1${idStr}`;

        // Use Minima RPC on port 9005 (HTTPS) as 9002 is not available/enabled
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
        const nodeIp = `10.0.0.1${idStr}`;

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
        const { filePath } = data;
        if (!filePath || filePath.trim() === '') {
            io.emit('dapp-log', '[Error] No file path provided for dApp installation.');
            return;
        }

        io.emit('dapp-log', `[Batch] Installing dApp from ${filePath} on all running nodes...`);

        Object.keys(nodeProcesses).forEach((id) => {
            // Use RPC to get feedback
            const command = `mds action:install file:"${filePath}"`;

            sendMinimaRpc(id, command, (err, json) => {
                if (err) {
                    io.emit('dapp-log', `[Batch] Node ${id}: Request Failed - ${err.message}`);
                } else {
                    if (json.status) {
                        const respStr = json.response ? JSON.stringify(json.response) : 'Done';
                        io.emit('dapp-log', `[Batch] Node ${id}: Success - ${respStr}`);
                    } else {
                        const errStr = json.message || json.error || 'Unknown Error';
                        io.emit('dapp-log', `[Batch] Node ${id}: Failed - ${errStr}`);
                    }
                }
            });
        });
    });

    socket.on('batch-dapp-uninstall', (data) => {
        const { uid } = data;
        if (!uid || uid.trim() === '') {
            io.emit('dapp-log', '[Error] No UID provided for dApp uninstallation.');
            return;
        }

        io.emit('dapp-log', `[Batch] Uninstalling dApp ${uid} from all running nodes...`);

        Object.keys(nodeProcesses).forEach((id) => {
            const command = `mds action:uninstall uid:"${uid}"`;
            sendMinimaRpc(id, command, (err, json) => {
                if (err) {
                    io.emit('dapp-log', `[Batch] Node ${id}: Request Failed - ${err.message}`);
                } else {
                    if (json.status) {
                        io.emit('dapp-log', `[Batch] Node ${id}: Uninstall Success`);
                    } else {
                        io.emit('dapp-log', `[Batch] Node ${id}: Uninstall Failed - ${json.message}`);
                    }
                }
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
        const build = spawn('npm run build && npm run minima:zip', {
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
    setup.stdout.on('data', d => console.log(`[Network Setup] ${d.toString().trim()}`));
    setup.stderr.on('data', d => console.error(`[Network Setup Error] ${d.toString().trim()}`));
});
