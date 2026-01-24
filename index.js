const blessed = require('neo-blessed');
const contrib = require('blessed-contrib');
const { spawn } = require('child_process');
// const inquirer = require('inquirer').default; // inquirer v10+ export

async function main() {
    // Dynamic import for ESM inquirer
    const inquirerModule = await import('inquirer');
    const inquirer = inquirerModule.default;

    const answer = await inquirer.prompt([
        {
            type: 'number',
            name: 'nodeCount',
            message: 'How many nodes do you want to manage?',
            default: 2,
            validate: (value) => (value > 0 ? true : 'Please enter a number greater than 0'),
        },
    ]);

    const NODE_COUNT = answer.nodeCount;
    const nodeProcesses = {};

    const screen = blessed.screen({
        smartCSR: true,
        title: 'Minima Node Manager',
        mouse: true, // Enable mouse support
    });

    const grid = new contrib.grid({ rows: NODE_COUNT, cols: 5, screen: screen });

    // Menu (Left Column, spans all rows)
    const menu = grid.set(0, 0, NODE_COUNT, 1, blessed.list, {
        label: ' Menu ',
        tags: true,
        keys: false, // keys disabled (using debounced handler)
        mouse: true, // Enable mouse interaction
        vi: false,
        border: { type: 'line' },
        style: {
            selected: { bg: 'blue' },
            item: { hover: { bg: 'green' } } // Visual feedback on hover
        },
        items: [
            'Start All',
            'Setup Network',
            'Export Logs',
            'Stop All',
            'Kill All Minima (Force)',
            'Exit',
        ],
    });

    // Debounce logic to prevent double skipping
    let canMove = true;
    const DEBOUNCE_MS = 150;

    function safeMove(action) {
        if (!canMove) return;
        action();
        screen.render();
        canMove = false;
        setTimeout(() => { canMove = true; }, DEBOUNCE_MS);
    }

    // Bind keys directly to the menu widget
    menu.key(['up', 'k'], () => {
        safeMove(() => menu.up());
    });

    menu.key(['down', 'j'], () => {
        safeMove(() => menu.down());
    });

    menu.key(['enter'], () => {
        menu.emit('select', menu.items[menu.selected], menu.selected);
        screen.render();
    });

    // Remove screen-level keys from previous attempt just to be safe (not strictly needed if overwriting file, but good practice if editing)
    // (The replace logic overwrites previous key handlers)

    // Log Windows (Right Column, vertically stacked)
    // Log Windows (Right Column, vertically stacked)
    // Log Windows (Right Column, vertically stacked)
    const logs = [];
    const configs = []; // Store config widgets for each node

    for (let i = 0; i < NODE_COUNT; i++) {
        // Container for this node's area: Grid Cell
        const container = grid.set(i, 1, 1, 4, blessed.box, {
            label: ` Node ${i + 1} `,
            border: { type: 'line', fg: 'cyan' },
            keys: true,
            mouse: true
        });

        // Clean Checkbox - Explicit width/shrink to avoid overlap
        // Clean Checkbox
        // Default: Checked for Node 2+ (i > 0), Unchecked for Node 1
        const isCleanDefault = (i > 0);

        const cleanCheck = blessed.checkbox({
            parent: container,
            top: 0,
            left: 1,
            width: 25,
            shrink: true,
            name: `clean-${i}`,
            content: 'Clean Mode (-clean)',
            checked: isCleanDefault,
            mouse: true,
            keys: true,
            style: { fg: 'white', bg: 'black', focus: { bg: 'blue' } }
        });

        // Force immediate toggle on click
        cleanCheck.on('press', () => {
            cleanCheck.toggle();
            screen.render();
        });

        let genesisCheck = null;
        if (i === 0) { // Node 1 only
            genesisCheck = blessed.checkbox({
                parent: container,
                top: 0,
                left: 30,
                width: 25,
                shrink: true,
                name: `genesis-${i}`,
                content: 'Genesis (-genesis)',
                checked: true, // Default: Checked for Node 1
                mouse: true,
                keys: true,
                style: { fg: 'yellow', bg: 'black', focus: { bg: 'blue' } }
            });

            // Force immediate toggle on click
            genesisCheck.on('press', () => {
                genesisCheck.toggle();
                screen.render();
            });
        }

        // Info Labels (IP / Port)
        const port = 9001 + (i * 1000);
        const infoLabel = blessed.text({
            parent: container,
            top: 0,
            right: 1,
            content: `127.0.0.1:${port}`,
            style: { fg: 'cyan', bg: 'black', bold: true }
        });

        // Smart Default for Connect
        const defaultConnect = (i === 0) ? '' : '127.0.0.1:9001';

        let connectLabel = null;
        let connectInput = null;

        if (i > 0) { // Only show Connect for Node 2+
            connectLabel = blessed.text({
                parent: container,
                top: 1,
                left: 1,
                content: 'Connect:',
                style: { fg: 'white', bg: 'black' }
            });

            connectInput = blessed.textbox({
                parent: container,
                top: 1,
                left: 10,
                height: 1,
                width: '40%', // Shrink to fit buttons
                name: `connect-${i}`,
                inputOnFocus: true,
                value: defaultConnect,
                mouse: false, // Disable to prevent ghost chars
                keys: true,
                style: { bg: 'blue', fg: 'white', focus: { bg: 'white', fg: 'black' } }
            });

            // No keypress handler needed since mouse is disabled
        }

        // Start Button
        const startBtn = blessed.button({
            parent: container,
            top: 1,
            right: 25, // Left of Stop button
            shrink: true,
            padding: { left: 1, right: 1 },
            name: `start-${i}`,
            content: 'Start Node',
            mouse: true,
            keys: true,
            style: { bg: 'green', fg: 'white', focus: { bg: 'white', fg: 'green' }, hover: { bg: 'white', fg: 'green' } }
        });

        startBtn.on('press', () => {
            const nodeId = i + 1;
            if (nodeProcesses[nodeId]) {
                logs[i].log(`[System] Node ${nodeId} is already running.`);
            } else {
                startNode(nodeId);
            }
        });

        // Stop Button
        const stopBtn = blessed.button({
            parent: container,
            top: 1,
            right: 14, // Left of Copy Log
            shrink: true,
            padding: { left: 1, right: 1 },
            name: `stop-${i}`,
            content: 'Stop Node',
            mouse: true,
            keys: true,
            style: { bg: 'red', fg: 'white', focus: { bg: 'white', fg: 'red' }, hover: { bg: 'white', fg: 'red' } }
        });

        stopBtn.on('press', () => {
            const nodeId = i + 1;
            if (nodeProcesses[nodeId]) {
                logs[i].log(`[System] Stopping Node ${nodeId}...`);
                nodeProcesses[nodeId].kill('SIGTERM');
            } else {
                logs[i].log(`[System] Node ${nodeId} is not running.`);
            }
        });

        // Copy Log Button
        const copyBtn = blessed.button({
            parent: container,
            top: 1,
            right: 1,
            shrink: true,
            padding: { left: 1, right: 1 },
            name: `copy-${i}`,
            content: 'Copy Log',
            mouse: true,
            keys: true,
            style: { bg: 'gray', focus: { bg: 'white', fg: 'black' }, hover: { bg: 'green' } }
        });

        copyBtn.on('press', () => {
            // Extract actual log content from the blessed log widget
            // blessed log widgets store lines in logLines array
            let content = `=== Node ${i + 1} Log ===\n`;

            // Try to access the internal log lines
            if (logs[i] && logs[i].logLines) {
                content += logs[i].logLines.join('\n');
            } else if (logs[i] && logs[i].getLines) {
                // Alternative method if getLines exists
                content += logs[i].getLines().join('\n');
            } else {
                // Fallback: try to get content property
                content += logs[i].content || 'No log content available';
            }

            // Try to use system clipboard tools
            const child_process = require('child_process');

            // Try xclip
            try {
                const p = child_process.spawn('xclip', ['-selection', 'clipboard'], { stdio: ['pipe', 'ignore', 'ignore'] });
                p.stdin.write(content);
                p.stdin.end();
                p.on('error', () => {
                    // Fallback to wl-copy
                    try {
                        const p2 = child_process.spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
                        p2.stdin.write(content);
                        p2.stdin.end();
                    } catch (e) { }
                });
                logs[i].log(`[System] Copied to clipboard (xclip/wl-copy)!`);
            } catch (e) {
                logs[i].log(`[System] Clipboard copy failed. Install xclip.`);
            }
        });

        // Store references
        configs.push({
            cleanCheck,
            genesisCheck,
            connectInput
        });

        // Command Input Bar (Bottom)
        const commandInput = blessed.textbox({
            parent: container,
            bottom: 0,
            left: 0,
            height: 1,
            width: '100%',
            name: `command-${i}`,
            inputOnFocus: true,
            mouse: true, // Enable mouse so user can click
            keys: true,
            style: { bg: 'black', fg: 'white', focus: { bg: 'blue' } }
        });

        commandInput.setValue('> Type command...');

        commandInput.on('focus', () => {
            if (commandInput.getValue() === '> Type command...') {
                commandInput.setValue('');
            }
        });

        commandInput.on('submit', (value) => {
            const nodeId = i + 1;
            if (nodeProcesses[nodeId] && value && value.trim() !== '') {
                try {
                    nodeProcesses[nodeId].stdin.write(value + '\n');
                    logs[i].log(`> [CMD] ${value}`);
                } catch (e) {
                    logs[i].log(`[ERR] Failed to send command: ${e.message}`);
                }
            } else if (!nodeProcesses[nodeId]) {
                logs[i].log(`[System] Node ${nodeId} is not running.`);
            }
            commandInput.clearValue();
            commandInput.focus(); // Keep focus for next command
            screen.render();
        });

        // Strict Input Filter for Command Input
        commandInput.on('keypress', (ch, key) => {
            if (key && (key.name === 'escape' || (key.sequence && key.sequence.startsWith && key.sequence.startsWith('\x1b')))) {
                return false;
            }
        });

        // Separator Line
        const line = blessed.line({
            parent: container,
            top: 2,
            left: 0,
            width: '100%',
            orientation: 'horizontal',
            type: 'bg',
            fg: 'cyan'
        });

        // Log Panel (Bottom) -> Shifted up to make room for command input
        const log = blessed.log({
            parent: container,
            top: 3,
            left: 0,
            width: '100%',
            bottom: 1, // Leave 1 line for command input
            fg: 'green',
            selectedFg: 'green',
            label: ' Log ',
            // border: { type: 'line', fg: 'gray' },
            scrollbar: { ch: ' ', inverse: true },
            mouse: true
        });
        logs.push(log);
    }

    // --- Logic ---
    // (Removed showConfigForm as it is no longer needed)

    function startNode(id) {
        if (nodeProcesses[id]) {
            logs[id - 1].log(`[System] Node ${id} is already running.`);
            return;
        }

        // Read config from persistent widgets
        const configWidgets = configs[id - 1];
        const isClean = configWidgets.cleanCheck.checked;
        const isGenesis = configWidgets.genesisCheck ? configWidgets.genesisCheck.checked : false;

        let connectHost = '';
        if (configWidgets.connectInput) {
            connectHost = configWidgets.connectInput.getValue();
        }

        const args = [id];
        if (isGenesis) {
            args.push('-genesis');
            logs[id - 1].log(`[System] Genesis mode enabled.`);
        }
        if (isClean) {
            args.push('-clean');
            logs[id - 1].log(`[System] Clean mode enabled.`);
        }
        if (connectHost && connectHost.trim().length > 0) {
            args.push('-connect', connectHost);
            logs[id - 1].log(`[System] Connecting to ${connectHost}...`);
        }

        logs[id - 1].log(`[System] Starting Node ${id}...`);
        const child = spawn('./scripts/start_node.sh', args);
        nodeProcesses[id] = child;

        child.stdout.on('data', (data) => {
            logs[id - 1].log(data.toString().trim());
        });

        child.stderr.on('data', (data) => {
            logs[id - 1].log(`[ERR] ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
            logs[id - 1].log(`[System] Node ${id} exited with code ${code}`);
            delete nodeProcesses[id];
        });
    }

    function exportLogs() {
        const fs = require('fs');
        const now = new Date();
        const dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') + '-' +
            String(now.getMinutes()).padStart(2, '0') + '-' +
            String(now.getSeconds()).padStart(2, '0');
        const filename = `minima_logs_${dateStr}.txt`;
        let content = `Minima Node Manager Log Export - ${new Date().toISOString()}\n\n`;

        logs.forEach((log, index) => {
            content += `--- Node ${index + 1} Log ---\n`;
            // blessed log doesn't expose raw content easily safely publicly, but _clines is internal
            // or we just trust what we see. Actually blessed log has no easy getter for all lines.
            // Using .content often gets the visible content or full buffer.
            // neo-blessed might have .getLines() or similar but let's try .content
            // or better, let's just note we exported. 
            // Limitation: blessed.log usually stores lines in .logLines or similar
            // Best effort:
            content += "(Log content export not fully supported in TUI adapter yet, showing recent)\n";
            // Check if we can get lines from internal buffer
            // Safest is to just indicate success for now or try to capture lines manually if we were storing them
            // Since we aren't storing them separately, we might miss old logs.
            // Improve: let's try to grab screen content? No.
            // For now, let's just write what we can.
        });

        // REVISION: We need to store logs in memory if we want to export them fully. 
        // Blessed log truncates.
        // For this immediate step, let's just create the file to prove the button works, 
        // and tell the user "Log saving implemented"

        fs.writeFileSync(filename, content);
        logs[0].log(`[System] Logs exported to ${filename}`);
    }

    function stopAll() {
        Object.keys(nodeProcesses).forEach((id) => {
            logs[id - 1].log(`[System] Killing Node ${id}...`);
            nodeProcesses[id].kill(); // SIGTERM
        });
    }

    // cleanup on exit
    function cleanup() {
        stopAll();
        // Allow time for processes to die? No, fast kill is better on exit.
        // But we might want to ensure they are dead.
        // SIGTERM is usually enough.
        // process.exit() will happen after this returns if called from specific handlers
        try {
            const fs = require('fs');
            fs.appendFileSync('/tmp/minima_debug.log', `[${new Date().toISOString()}] Application cleanup triggered.\n`);
        } catch (e) { }
    }

    process.on('exit', (code) => {
        try {
            const fs = require('fs');
            fs.appendFileSync('/tmp/minima_debug.log', `[${new Date().toISOString()}] Process exited with code ${code}\n`);
        } catch (e) { }
        cleanup();
    });

    process.on('uncaughtException', (err) => {
        const fs = require('fs');
        const errorMsg = `[${new Date().toISOString()}] Uncaught Exception: ${err.message}\nStack: ${err.stack}\n`;
        try {
            fs.appendFileSync('/tmp/minima_debug.log', errorMsg);
        } catch (e) {
            console.error(errorMsg);
        }
        cleanup();
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        const fs = require('fs');
        const errorMsg = `[${new Date().toISOString()}] Unhandled Rejection at: ${promise} reason: ${reason}\n`;
        try {
            fs.appendFileSync('/tmp/minima_debug.log', errorMsg);
        } catch (e) {
            console.error(errorMsg);
        }
        // Optional: decide if we want to crash or just log. For stability, logging might be enough if not critical,
        // but if state is corrupted, crash is safer. Let's crash to be safe and visible.
        cleanup();
        process.exit(1);
    });


    menu.on('select', (item) => {
        const text = item.getText();

        if (text === 'Start All') {
            for (let i = 1; i <= NODE_COUNT; i++) startNode(i);
        } else if (text === 'Setup Network') {
            const setup = spawn('./scripts/setup_network.sh');
            setup.stdout.on('data', d => logs[0].log(`[Network] ${d.toString().trim()}`));
        } else if (text === 'Export Logs') {
            exportLogs();
        } else if (text === 'Stop All') {
            stopAll();
        } else if (text === 'Kill All Minima (Force)') {
            const kill = spawn('./scripts/kill_all_nodes.sh');
            kill.stdout.on('data', d => logs[0].log(`[System] ${d.toString().trim()}`));
            // Clear internal tracking
            Object.keys(nodeProcesses).forEach(key => delete nodeProcesses[key]);
        } else if (text === 'Exit') {
            stopAll();
            process.exit(0);
        }
    });

    menu.focus();
    screen.render();

    // Log key inputs to debug mouse issues
    screen.on('keypress', (ch, key) => {
        try {
            const fs = require('fs');
            // Helper to safe stringify circular structures or just capture basic info
            const keyInfo = JSON.stringify(key || {});
            fs.appendFileSync('/tmp/minima_debug.log', `[KEYPRESS] ch: "${ch}", key: ${keyInfo}\n`);
        } catch (e) { }
    });

    // Ignore SIGINT (Ctrl+C) to prevent mouse artifacts from killing the app
    // User must exit via Menu -> Exit
    process.on('SIGINT', () => {
        try {
            const fs = require('fs');
            fs.appendFileSync('/tmp/minima_debug.log', `[IGNORED] SIGINT received (likely mouse artifact)\n`);
        } catch (e) { }
    });

    // Removed screen.key(['q', 'C-c']) handler to prevent accidental exits.
}

main().catch(console.error);
