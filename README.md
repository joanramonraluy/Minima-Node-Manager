# Minima Node Manager

A web-based management interface for running and managing multiple Minima blockchain nodes in isolated network namespaces. Built with Node.js, Express, and Socket.IO.

![Minima Node Manager Interface](public/logo.jpeg)

## Features

### 🖥️ Multi-Node Management
- **Start/Stop Multiple Nodes**: Manage up to 26 Minima nodes simultaneously
- **Isolated Network Namespaces**: Each node runs in its own network namespace with dedicated IP addresses (10.0.0.11-10.0.0.36)
- **Real-time Logs**: View live terminal output for each node with auto-scrolling
- **Network Controls**: Connect/disconnect nodes from the network, manage peer connections
- **Batch Operations**: Start all, stop all, or kill all nodes with a single click

### ⚡ Vite Development Server
- **Integrated Dev Server**: Start and stop Vite development server directly from the UI
- **Live Output**: Monitor Vite server logs in real-time
- **Quick Access**: One-click button to open your running application
- **Project Configuration**: Configure project paths and environment settings

### 📦 dApp Management
- **Batch Install/Update**: Deploy MiniDapps to all running nodes simultaneously
- **Centralized Uninstall**: Remove dApps from all nodes with one action
- **dApp Discovery**: Automatically fetch and list installed dApps from running nodes
- **Build Integration**: Build and package your dApp with `npm run build` and `npm run minima:zip`

### 🎨 Modern UI
- **Dark Theme**: Clean, modern interface with Minima's signature Teal and Orange accent colors
- **Responsive Design**: Horizontal top navigation that adapts to mobile and tablet screens
- **Resizable Terminals**: All log windows are vertically resizable for optimal viewing
- **Real-time Updates**: Socket.IO-powered live updates for node status, logs, and operations

## Prerequisites

- **Node.js** (v14 or higher)
- **npm** (v6 or higher)
- **Linux** (tested on Fedora, should work on Ubuntu/Debian)
- **sudo privileges** (required for network namespace management)
- **Minima** installed and accessible in your PATH

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/MinimaNodeManager.git
   cd MinimaNodeManager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Make scripts executable**
   ```bash
   chmod +x nodemanager
   chmod +x scripts/*.sh
   ```

4. **Set up the command-line launcher** (optional but recommended)
   ```bash
   # Create ~/.local/bin if it doesn't exist
   mkdir -p ~/.local/bin
   
   # Create symlink
   ln -sf $(pwd)/nodemanager ~/.local/bin/nodemanager
   
   # Add ~/.local/bin to PATH (if not already there)
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

## Usage

### Quick Start

Simply run:
```bash
nodemanager
```

This will start the web server on `http://localhost:3000`. Open this URL in your browser to access the management interface.

### Alternative: Using systemd (for production)

If you want the manager to run as a background service:

1. **Copy the systemd service file** (if provided)
2. **Enable and start the service**
   ```bash
   sudo systemctl enable minima-manager
   sudo systemctl start minima-manager
   ```

### Configuration

The application stores configuration in `config.json`:
- **projectPath**: Path to your Vite/dApp project
- **dappName**: Name of your dApp for UID lookup
- **envPath**: Path where `.env` files should be exported
- **dappLocation**: Path to your built `.minidapp` file

These can be configured through the UI in the "Vite Server" tab.

## HTTP API (Debug & Automation)

> [!WARNING]
> Aquesta és una API pensada exclusivament per a desenvolupament i depuració local (CLI, `curl`, scripts d'automatització). **No l'exposeu fora de `localhost`**, ja que no requereix autenticació.

Permet consultar l'estat i executar comandes als nodes sense necessitat d'obrir la interfície web ni dependre de Socket.IO.

### 1. Consultar logs d'un node (Ring-Buffer)
Retorna en **text pla** (`text/plain`) les últimes N línies capturades al buffer en memòria del node (fins a un màxim de 2000 línies retingudes):

```
GET /api/nodes/:id/log?lines=200&type=stdout|stderr|all
```

- **`id`**: Identificador numèric del node (ex. `1`).
- **`lines`**: Nombre de línies a retornar (per defecte `200`).
- **`type`**: Filtre de canal (`stdout`, `stderr` o `all`, per defecte `all`).

**Exemples:**
```bash
# Obtenir les darreres 20 línies del Node 1
curl http://localhost:3000/api/nodes/1/log?lines=20

# Filtrar només el canal stdout
curl http://localhost:3000/api/nodes/1/log?lines=50&type=stdout

# Filtrar només el canal stderr
curl http://localhost:3000/api/nodes/1/log?lines=50&type=stderr
```

### 2. Proxy RPC de Minima
Envia comandes RPC al node a través de `sendMinimaRpc` i en retorna la resposta JSON directa:

```
POST /api/nodes/:id/rpc
Content-Type: application/json

{ "command": "<comanda-minima>" }
```

**Exemples:**
```bash
# Consultar el bloc actual
curl -X POST http://localhost:3000/api/nodes/1/rpc \
  -H 'Content-Type: application/json' \
  -d '{"command":"block"}'

# Consultar monedes
curl -X POST http://localhost:3000/api/nodes/1/rpc \
  -H 'Content-Type: application/json' \
  -d '{"command":"coins"}'

# Consultar l'estat general del node
curl -X POST http://localhost:3000/api/nodes/1/rpc \
  -H 'Content-Type: application/json' \
  -d '{"command":"status"}'
```

## Core mode (Minima Core 1.1.x)

Besides the default **Classic / MDS** mode, the manager has a global **Core** mode, chosen with the selector in the header (`mode` in `config.json`: `"classic"` | `"core"`). The choice is persisted and restored on the next launch. The mode cannot be switched while nodes are running, and Classic and Core nodes are never mixed in the same harness (Core data lives in `nodes-core/`, Classic data in `nodes/`).

`config.json` keys used by Core:
- `coreJarPath` (**required**, empty by default): absolute path to the Core `minima.jar` (Main-Class `org.minima.Minima`), for example the one in the `app/libs/` folder of a checkout of `minima-core-android`
- `coreLibsPath` (**required**, empty by default): absolute path to a directory with `bcprov`, `bcpkix`, `bcutil` and `h2` jars (the Core jar does not bundle them; only those four are put on the classpath), for example the `lib/` folder of a Minima Classic source checkout
- If either is empty, starting a node in Core mode only logs a message and starts nothing.
- `coreDbPassword`: value for `-dbpassword` (required on first start)

What changes in Core mode:
- Nodes are started by `scripts/start_core_node.sh` (same namespaces / IPs `10.0.0.1N`, port 9001) with `java -cp <jar>:<libs> org.minima.Minima -data nodes-core/nodeN -dbpassword ... -port 9001 -host <ip> -rpccrlf` (`-rpccrlf` makes Core's RPC send CRLF headers, which Node's HTTP client requires). Node 1 uses `-solo` (private chain, creates genesis); the others use `-test -nop2p -connect 10.0.0.11:9001`. The per-node *Clean* checkbox adds `-clean`.
- Core has no RPC by default: once the process is running the manager sends `rpc enable:true password:123` over stdin (retrying until `status` answers), so RPC is on `10.0.0.1N:9005` (port + 4, user `minima`, password `123`, plain HTTP: Core has no HTTPS RPC). **The RPC listens on all interfaces with write access: this is a test harness, do not use it outside an isolated machine.**
- Core has no MDS or Maxima: the dApp install/uninstall panel, the Build Pipeline and Vite tabs, host-network mode, genesis/connect/advanced MDS flags, auto Maxima name and peer sync are hidden. Node logs, the per-node command console and the ADB section remain.
- ADB: the default package name becomes `org.minima.core` (switching mode swaps it if it was still the other mode's default). Commands to a phone are not implemented (Core on Android only exposes IPC `minimaapi`, not RPC).
- Core mode uses `stop_core_node.sh`, `kill_all_core_nodes.sh` and `delete_core_node_data.sh`; none of them touches `nodes/`.

Not verified: Core and Classic nodes talking to each other; `-solo` only on node 1 with more than 2 nodes.

### Testing Core mode with 2 nodes
1. `sudo nodemanager` (or `sudo node server.js`), open http://localhost:3000 and pick **Core 1.1** in the header. Set Nodes = 2.
2. Start Node 1 and wait for `[Core] RPC is up on 10.0.0.11:9005` in its log, then Start Node 2.
3. In each node's command box run `status`: both must report the same block. Or through the proxy: `curl -X POST http://localhost:3000/api/nodes/1/rpc -H 'Content-Type: application/json' -d '{"command":"status"}'` (same with `/2/`).
4. On node 2 run `getaddress` and copy the address; on node 1 run `send address:<ADDR> amount:10`. After a block, `balance` on node 2 shows 10.

## Android emulator launcher

The *Android Devices* panel (Nodes tab, Classic and Core modes) lists the AVDs from `emulator -list-avds`, marks which ones are running (matched through `adb emu avd name`) and lists the `adb devices`. Clicking an AVD name opens that emulator's real window on your desktop; if it is already running (or starting) no second copy is started. Progress ("Launching...", "booted") goes to the global log, and the emulator output to `/tmp/emulator-<avd>.log`.

- The emulator runs as the real desktop user (`SUDO_USER`, so start the manager with `sudo`), detached: stopping or restarting the Node Manager does not close it. Without `SUDO_USER` the launch is refused.
- `config.json`: `androidSdkPath` (optional; otherwise derived from `adbPath`, i.e. the parent of `platform-tools`) and `emulatorArgs` (default `["-gpu","host"]`; `-gpu host` is required where the default SwiftShader renderer crashes).
- Endpoints: `GET /api/emulator/avds` and `POST /api/emulator/launch` with `{"avd":"<name>"}`. The name must exactly match an AVD reported by `emulator -list-avds`; processes are spawned with argument arrays, never a shell string.

**Security:** the Node Manager listens on all interfaces without authentication, so anyone who can reach port 3000 can launch emulators as your user. Use it only on a trusted network.

## Architecture

### Network Setup
- Each node runs in an isolated network namespace (`minima-ns-X`)
- Nodes are assigned sequential IP addresses: `10.0.0.11`, `10.0.0.12`, etc.
- Port `9001` is used for Minima P2P communication
- Port `9003` is used for the Minima MDS web interface
- Port `9005` is used for RPC commands

### File Structure
```
MinimaNodeManager/
├── server.js              # Main Express + Socket.IO server
├── index.js               # CLI interface (legacy)
├── nodemanager            # Launcher script
├── public/                # Frontend assets
│   ├── index.html         # Main UI
│   ├── app.js             # Frontend logic
│   ├── style.css          # Minima-themed styles
│   └── logo.jpeg          # Minima logo
├── scripts/               # Shell scripts for node management
│   ├── setup_network.sh   # Network namespace setup
│   ├── start_node.sh      # Start individual node (Classic)
│   ├── start_core_node.sh # Start individual node (Core mode)
│   ├── stop_node.sh       # Stop individual node
│   ├── disconnect_node.sh # Disconnect node from network
│   └── reconnect_node.sh  # Reconnect node to network
└── config.json            # Persistent configuration
```

## Troubleshooting

### "Command not found: nodemanager"
Make sure `~/.local/bin` is in your PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

### "Permission denied" errors
The application requires sudo privileges to manage network namespaces. Make sure you're running it with sudo or that the `nodemanager` script is using sudo correctly.

### Nodes won't start
1. Check that Minima is installed: `which minima`
2. Verify network namespaces are set up: `sudo ip netns list`
3. Check logs in the UI or via: `sudo journalctl -u minima-manager -f`

### Port conflicts
If port 3000 is already in use, you can change it in `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
```

## Development

To contribute or modify the application:

1. **Frontend changes**: Edit files in `public/` - changes are served immediately
2. **Backend changes**: Edit `server.js` and restart the server
3. **Scripts**: Modify shell scripts in `scripts/` as needed

## License

MIT License - feel free to use and modify as needed.

## Credits

Built for the Minima blockchain ecosystem. UI inspired by [build.minima.global](https://build.minima.global/).

## Support

For issues, questions, or contributions, please open an issue on GitHub.
