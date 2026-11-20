# Minima Node Manager

A web-based management interface for running and managing multiple Minima blockchain nodes in isolated network namespaces. Built with Node.js, Express, and Socket.IO.

![Minima Node Manager Interface](public/logo.jpeg)

The manager has two **modes**, chosen with the selector in the header and stored as `mode` in `config.json` (`"classic"` | `"core"`):

| | **Classic / MDS** (default) | **Core 1.1** |
|---|---|---|
| Node software | Minima Classic (`minima.jar`, with MDS) | Minima Core (`org.minima.Minima` + libs) |
| Node data | `nodes/` | `nodes-core/` |
| Web UI per node | Yes (MDS, port 9003) | No |
| dApps, Build Pipeline, Vite | Yes | No |
| RPC | Classic RPC | Enabled by the manager (port 9005, plain HTTP) |
| Android emulators | Not managed | Managed (Android nodes section) |

Classic and Core nodes are never mixed in the same harness. The mode cannot be switched while nodes are running.

- [Common features](#common-features)
- [Prerequisites and installation](#prerequisites)
- [Usage and configuration](#usage)
- [The interface](#the-interface)
- [Classic mode](#classic-mode-mds)
- [Core mode](#core-mode-minima-core-11x)
- [HTTP API](#http-api-debug--automation)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

## Common features

These work the same in both modes.

- **Multi-node management**: start and stop up to 26 nodes, each in its own network namespace with its own IP (`10.0.0.11` to `10.0.0.36`).
- **Real-time logs**: live terminal output for every node, plus a global system log. Log windows are vertically resizable.
- **Network controls**: connect/disconnect individual nodes from the network.
- **Batch operations**: start all, stop all, kill all and delete all node data.
- **Android (ADB) tools**: install/uninstall an APK, list packages and push files to a device.
- **Dark UI** with Minima's teal and orange accents and a responsive top navigation. Live updates through Socket.IO.

## Prerequisites

- **Node.js** (v14 or higher) and **npm** (v6 or higher)
- **Linux** (tested on Fedora, should work on Ubuntu/Debian)
- **sudo privileges** (required for network namespace management)
- **Classic mode**: Minima Classic installed and accessible in your PATH
- **Core mode**: a Minima Core jar and its libs, plus Java (see [Core mode](#core-mode-minima-core-11x))
- **Emulators (Core mode)**: the Android SDK (`adb`, `emulator`) and at least one AVD created with Android Studio

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

This starts the web server (with `sudo`) on `http://localhost:3000`. Open this URL in your browser to access the management interface.

### Alternative: Using systemd (for production)

If you want the manager to run as a background service:

1. **Copy the systemd service file** (if provided)
2. **Enable and start the service**
   ```bash
   sudo systemctl enable minima-manager
   sudo systemctl start minima-manager
   ```

### Configuration

The application stores its settings in `config.json`. The file is **local and not versioned** (the UI rewrites it: mode, paths, ADB settings). Copy `config.example.json` to `config.json` to start from a clean one; without a `config.json` the built-in defaults apply.

Common keys:
- **mode**: `"classic"` or `"core"`
- **adbPath**: path to `adb`
- **ramLimit** / **cpuLimit**: default resource limits per node

Classic keys (edited in the *Vite Server* tab and the Global Start Configuration):
- **projectPath**: path to your Vite/dApp project
- **dappName**: name of your dApp for UID lookup
- **envPath**: path where `.env` files should be exported
- **dappLocation**: path to your built `.minidapp` file

Core keys are listed in [Core mode](#core-mode-minima-core-11x).

## The interface

### Header
The mode selector (**Classic / MDS** or **Core 1.1**) and the tabs available for that mode.

| Tab | Classic | Core |
|---|---|---|
| Nodes | Yes | Yes |
| Android tools (ADB) | - | Yes |
| dApp Manager | Yes | - |
| Build Pipeline | Yes | - |
| Vite Server | Yes | - |

### Nodes tab
- **Classic**: a toolbar with *Start All Nodes*, *Stop All Nodes*, the node counter and *+ Add Node*; *Open All* (web UI of every running node); *Clear All Logs* and *Toggle View*; and a danger zone (*Kill All Processes*, *Delete All Data*). The gear opens the **Global Start Configuration**. Below: the global system log and one card per node (start command preview, Start/Stop, logs, command box, per-node network and delete-data buttons).
- **Core** is organised by node type, because the two kinds of node behave differently:
  - **Everything** bar: *Start Everything* (headless nodes, waiting for the seed's RPC, then the emulators, then the node app on each Android node, joined to the seed), *Stop Everything* (Android nodes, then headless nodes; tick *also close emulators* to close them too) and *Clear All Logs*.
  - **Network**: one table with every running node (headless and Android): block, tip hash and peers. Click a row to list that node's peers. The indicator says *in sync*, *not in sync* (blocks differ by more than 2; a freshly started node needs a while to catch up) or *FORK* (same block, different tip hash).
  - **Android nodes**: its own toolbar (*Open All Emulators*, *Stop All Emulators*, *+ New AVD*; *Start All Nodes*, *Stop All Nodes*; danger zone *Wipe All Node Data*) and one card per AVD (see [Android nodes](#android-nodes-emulators-and-coretestnode)).
  - **Test scenarios**: runs the scripts configured in `testScenarios` and shows their output (see [Test scenarios](#test-scenarios)).
  - **Headless nodes**: the node cards plus their toolbar (*Start All Nodes*, *Stop All Nodes*, counter, *+ Add Node*, *Toggle View*, *Kill All Processes*, *Delete All Data*). They are Java processes on this computer with no window.

> The *Nodes* buttons of each section act only on that kind of node: *Start All Nodes* in *Headless nodes* never launches an emulator, and *Open All Emulators* never starts a node. Use *Start Everything* for both.

## Classic mode (MDS)

### 🖥️ Multi-Node Management
- Up to 26 Classic nodes in isolated namespaces, with **host network mode**, **Clean** and **Genesis** options per node.
- Connect field and advanced parameters (`-mdsenable`, `-rpcenable`, `-rpcssl`, `-mdspassword`, ...). The global start configuration can be applied to all nodes, including peer sync from a URL.
- **Open All** opens the MDS web UI of every running node (`https://<node ip>:9003/`).

### ⚡ Vite Development Server
- Start and stop a Vite dev server from the UI and monitor its logs.
- One-click button to open your running application.
- Configure project paths and environment settings (and export a node's `.env`).

### 📦 dApp Management (*dApp Manager* tab)
- **Batch install/update**: deploy MiniDapps to all running nodes at once.
- **Centralized uninstall**: remove dApps from all nodes with one action.
- **Discovery**: list the dApps installed on running nodes.
- **Android (ADB)**: install/uninstall an APK and push files to a connected device or emulator. The default package name is `com.minima.android`.

### 🛠️ Build Pipeline
- Build and package your dApp with `npm run build` and `npm run minima:zip`, and zip & install to the nodes.

## Core mode (Minima Core 1.1.x)

Core nodes are plain Java processes started in the same namespaces and IPs as Classic nodes (`10.0.0.1N`, port 9001). Their data lives in `nodes-core/`, never in `nodes/`.

### Configuration

`config.json` keys used by Core:
- `coreJarPath` (**required**, empty by default): absolute path to the Core `minima.jar` (Main-Class `org.minima.Minima`), for example the one in the `app/libs/` folder of a checkout of `minima-core-android`
- `coreLibsPath` (**required**, empty by default): absolute path to a directory with `bcprov`, `bcpkix`, `bcutil` and `h2` jars (the Core jar does not bundle them; only those four are put on the classpath), for example the `lib/` folder of a Minima Classic source checkout
- `coreDbPassword`: value for `-dbpassword` (required on first start)
- If either path is empty, the server looks for them at startup: the `CORE_JAR` / `CORE_LIBS` environment variables, `./core/minima.jar` and `./core/lib/`, and a sibling `../MinimaAds/refs/` checkout (`minima-core-android-main/app/libs/minima.jar`, `Minima-1.0.45/lib/`). Detected values are used for the running server only; nothing is written to `config.json`. If nothing is found, starting a node in Core mode only logs a message and starts nothing.

### What changes in Core mode
- Nodes are started by `scripts/start_core_node.sh` with `java -cp <jar>:<libs> org.minima.Minima -data nodes-core/nodeN -dbpassword ... -port 9001 -host <ip> -rpccrlf` (`-rpccrlf` makes Core's RPC send CRLF headers, which Node's HTTP client requires). Node 1 uses `-solo` (private chain, creates genesis); the others use `-test -nop2p -connect 10.0.0.11:9001`. The per-node *Clean* checkbox adds `-clean`.
- Core has no RPC by default: once the process is running the manager sends `rpc enable:true password:123` over stdin (retrying until `status` answers), so RPC is on `10.0.0.1N:9005` (port + 4, user `minima`, password `123`, plain HTTP: Core has no HTTPS RPC). **The RPC listens on all interfaces with write access: this is a test harness, do not use it outside an isolated machine.**
- Core has no MDS or Maxima: the *dApp Manager*, *Build Pipeline* and *Vite Server* tabs, host-network mode, genesis/connect/advanced MDS flags, auto Maxima name and peer sync are hidden. Node logs, the per-node command console and the Android tools remain.
- The ADB default package name becomes `org.minima.core` (switching mode swaps it if it was still the other mode's default). Commands to a phone are not implemented (Core on Android only exposes IPC `minimaapi`, not RPC).
- Core mode uses `stop_core_node.sh`, `kill_all_core_nodes.sh` and `delete_core_node_data.sh`; none of them touches `nodes/`.

Not verified: Core and Classic nodes talking to each other; `-solo` only on node 1 with more than 2 nodes; Android nodes talking to each other (two emulators).

### Testing Core mode with 2 nodes
1. `sudo nodemanager` (or `sudo node server.js`), open http://localhost:3000 and pick **Core 1.1** in the header. Set Nodes = 2.
2. Start Node 1 and wait for `[Core] RPC is up on 10.0.0.11:9005` in its log, then Start Node 2.
3. In each node's command box run `status`: both must report the same block. Or through the proxy: `curl -X POST http://localhost:3000/api/nodes/1/rpc -H 'Content-Type: application/json' -d '{"command":"status"}'` (same with `/2/`).
4. On node 2 run `getaddress` and copy the address; on node 1 run `send address:<ADDR> amount:10`. After a block, `balance` on node 2 shows 10.

### Android nodes (emulators and CoreTestNode)

An **Android node** is an Android emulator (AVD) that runs a Minima Core node. The official Core app cannot be given node parameters (no `-solo`, no `-connect`, fixed port 11001), so it cannot join a private chain. Android nodes therefore run **CoreTestNode**, the development-only app of the MinimaAds repo (`docs/testing/tools/core-test-node/`), which hosts the same Core node with parameters passed at start. Test chains only: its database password is fixed and the APK is debuggable.

The *Android nodes* section of the Nodes tab lists the AVDs from `emulator -list-avds`, marks which ones are running (matched through `adb emu avd name`) and lists the `adb devices`. For each AVD:

- **Emulator**: *Start* opens the real emulator window on your desktop (if it is already running or starting, no second copy is started). *Open All Emulators* does the same for every AVD that is not running yet, one at a time with a short pause (`emulatorLaunchPauseMs`, default 3000 ms). Progress goes to the global log and the emulator output to `/tmp/emulator-<avd>.log`.
- **Minima node** (running AVDs): status line (block, peers, port), *Install node app*, *Start node*, *Stop node*, *Wipe data* and a command box.
  - *Start node* offers **join desktop seed** (`-test -nop2p -connect 10.0.0.11:9001 -port 12001`: the Android node syncs the chain of desktop node 1) or **own chain** (`-solo -port 12001`).
  - *Stop node* force-stops the app; the chain data is kept. *Wipe data* clears it.
  - The command box sends a Minima command to the node (printable ASCII, up to 300 chars) and shows the JSON reply.
- **Snapshots (sessions)** and **Port forwards** drawers, as described below.

Connectivity (measured on this setup): an emulator reaches the desktop nodes through the `minima-br` bridge (`10.0.0.1`, `10.0.0.11`, ...), so an Android node can dial the seed. The reverse does not work: the emulator's own address (`10.0.2.15`) is not routable from the desktop, and `adb forward` listens on `127.0.0.1` only, so desktop nodes cannot dial into an emulator. A chain is shared by having the Android node connect to the seed.

`config.json` keys:
- `androidSdkPath` (optional; otherwise derived from `adbPath`, i.e. the parent of `platform-tools`) and `emulatorArgs` (default `["-gpu","host"]`; `-gpu host` is required where the default SwiftShader renderer crashes).
- `coreTestNodeApk` (optional): path to `CoreTestNode.apk`. If empty, `./core/CoreTestNode.apk` and `../MinimaAds/docs/testing/tools/core-test-node/CoreTestNode.apk` are tried.
- `androidSeedHost` (default `10.0.0.11:9001`): the desktop seed that Android nodes connect to.

Notes:
- The emulator runs as the real desktop user (`SUDO_USER`, so start the manager with `sudo`), detached: stopping or restarting the Node Manager does not close it. The desktop **Java node processes, in contrast, are children of the server and stop with it**. Without `SUDO_USER` the launch is refused.
- Only the AVDs that exist are launched: to run two emulators you need two AVDs. *+ New AVD* (or `POST /api/emulator/create` with `{"name":"...","dataSize":"8G"}`) clones the config of the first existing AVD, so no `avdmanager` is needed; the system image must already be installed. Mind the internal storage: a full data partition makes the node app fail to install.
- Endpoints: `GET /api/emulator/avds`, `POST /api/emulator/launch` with `{"avd":"<name>"}`, `POST /api/emulator/launch-all`, `POST /api/emulator/create`; for the node: `GET /api/android-node/status?avd=`, `POST /api/android-node/{install,start,stop,wipe,cmd}`. AVD names must exactly match an AVD reported by `emulator -list-avds`, serials come from `adb devices`, and processes are spawned with argument arrays, never a shell string.

#### Saved sessions

**Start** only boots the emulator (the node app is controlled with the buttons above). Features of each AVD row:
- **Resume from** (stopped AVD): quickboot (default), cold boot (`-no-snapshot-load`) or a named snapshot (`-snapshot <name>`, names read from the AVD's `snapshots/` directory).
- **Stop**: `adb -s <serial> emu kill`, optionally saving a snapshot first (`emu avd snapshot save <name>`); the manager waits for the device to disappear from `adb devices` and logs it.
- **Snapshots (sessions)** drawer: list, save, load and delete for a running AVD (`adb emu avd snapshot ...`). A session is just an emulator snapshot, so the Core wallet, chain and app data of one day can be resumed another day. Restoring a snapshot of a node that already signed transactions reuses key state: use it only on test chains. Snapshots restore the disk, so reinstall the node app after a restore if it is missing.
- **Port forwards** drawer (running AVDs): list/add/remove `adb forward tcp:<host> tcp:<guest>`; host port 20000-60000 (suggested 21000 + AVD index), guest port 1024-65535 (default 11001, the official Core app).

### Test scenarios

The *Test scenarios* panel (Nodes tab, Core) runs scripts against the running harness and streams their output (Run, Stop, *show output*; the result is PASSED when the exit code is 0). Scenarios come from `testScenarios` in `config.json`:

```json
"testScenarios": [
  { "id": "my-flow", "name": "My flow", "description": "optional", "cmd": ["python3", "-I", "/path/script.py", "--rpc", "http://10.0.0.11:9005"], "cwd": "/optional/dir" }
]
```

If the list is empty and `../MinimaAds` is a sibling checkout, two scenarios for its `docs/testing/tools/escrow_flow.py` are offered: the escrow/channel lifecycle on node 1 alone, and with the viewer on node 2 (both nodes must be running and synced; 29/29 checks pass on a private chain). The command line comes only from `config.json`, is spawned without a shell and runs as the desktop user (`SUDO_USER`). API: `GET /api/scenarios`, `POST /api/scenarios/run` and `/stop` with `{"id":"..."}`, `GET /api/scenarios/:id/output`.

### Android tools (ADB)

The *Android tools* tab (Core only) holds the ADB block: target device, APK install/uninstall, file push and its operations log.

Limits: the AVDs must already exist (`avdmanager` is not used). Snapshot names match `[A-Za-z0-9._-]{1,64}` (and must exist for load/delete), and operations are serialized per AVD. Mocked tests (no adb/emulator/process is run): `node test/emulator.test.js`, `node test/android-node.test.js` and `node test/scenarios.test.js`.

**Security:** the Node Manager listens on all interfaces without authentication, so anyone who can reach port 3000 can launch emulators, send commands to Android nodes and run the configured scenarios as your user. Use it only on a trusted network. Requests and WebSocket handshakes that carry an `Origin` header for a different host than the one they were sent to are refused, so a web page on another site cannot drive the manager from your browser.

## HTTP API (Debug & Automation)

> [!WARNING]
> Aquesta és una API pensada exclusivament per a desenvolupament i depuració local (CLI, `curl`, scripts d'automatització). **No l'exposeu fora de `localhost`**, ja que no requereix autenticació.

Permet consultar l'estat i executar comandes als nodes sense necessitat d'obrir la interfície web ni dependre de Socket.IO. Funciona en els dos modes; per als endpoints d'emuladors (només Core) vegeu [Android nodes](#android-nodes-emulators-and-coretestnode).

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

## Architecture

### Network Setup
- Each node runs in an isolated network namespace (`node<N>`) attached to the `minima-br` bridge
- Nodes are assigned sequential IP addresses: `10.0.0.11`, `10.0.0.12`, etc.
- Port `9001` is used for Minima P2P communication (both modes)
- Port `9003` is used for the Minima MDS web interface (Classic only)
- Port `9005` is used for RPC commands (Core: P2P port + 4)

### File Structure
```
MinimaNodeManager/
├── server.js              # Main Express + Socket.IO server
├── index.js               # CLI interface (legacy)
├── nodemanager            # Launcher script
├── lib/
│   ├── emulator.js        # Android emulator launcher/sessions (Core)
│   ├── android-node.js    # Minima node inside an AVD, via CoreTestNode (Core)
│   └── scenarios.js       # Test scenarios runner (Core)
├── public/                # Frontend assets
│   ├── index.html         # Main UI
│   ├── app.js             # Frontend logic (nodes, tabs, Classic)
│   ├── android.js         # Android nodes, network table, Start/Stop Everything, scenarios (Core)
│   ├── style.css          # Minima-themed styles
│   └── logo.jpeg          # Minima logo
├── scripts/               # Shell scripts for node management
│   ├── setup_network.sh   # Network namespace setup
│   ├── start_node.sh      # Start individual node (Classic)
│   ├── start_core_node.sh # Start individual node (Core mode)
│   ├── stop_node.sh       # Stop individual node (Classic)
│   ├── stop_core_node.sh  # Stop individual node (Core mode)
│   ├── disconnect_node.sh # Disconnect node from network
│   └── reconnect_node.sh  # Reconnect node to network
├── nodes/                 # Classic node data
├── nodes-core/            # Core node data
├── config.example.json    # Template for config.json
└── config.json            # Local persistent configuration (not versioned)
```

## Troubleshooting

### "Command not found: nodemanager"
Make sure `~/.local/bin` is in your PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

### "Permission denied" errors
The application requires sudo privileges to manage network namespaces. Make sure you're running it with sudo or that the `nodemanager` script is using sudo correctly.

### An Android node is connected but stays at block 0
Observed on this setup (not understood): a fresh Android node (new install or *Wipe data*) that connects to a seed that is already running can stay at block 0 with 1 peer, for minutes. Restarting the Android node does not help, and if it had just synced it can lose what was not yet saved. In one test, stopping and starting the **seed (headless node 1)** while two Android nodes were connected made one of them download the chain within a minute; the other stayed at block 0. In the very first test the node synced within 40 s of its first start. *Start Everything* reports a node still at block 0 after 90 s ("need attention") instead of "all started". If it happens, restart the seed with the Android nodes connected and check the *Network* table; the cause inside Minima Core is not known.

### Nodes won't start
1. Classic: check that Minima is installed (`which minima`). Core: check `coreJarPath` / `coreLibsPath` and that Java is installed.
2. Verify network namespaces are set up: `sudo ip netns list`
3. Check logs in the UI or via: `sudo journalctl -u minima-manager -f`

### Start All Nodes only starts nodes (Core mode)
*Start All Nodes* starts the Core node processes of your computer. Emulators are launched with *Open All Emulators* (or each AVD's Start button in the *Android nodes* section), and you only get as many emulators as AVDs you have created.

### Port conflicts
If port 3000 is already in use, start the server with another one: `sudo PORT=3001 node server.js` (the `nodemanager` launcher runs `sudo node server.js`, so use `sudo env PORT=3001 node server.js`).

## Development

To contribute or modify the application:

1. **Frontend changes**: Edit files in `public/` - changes are served immediately
2. **Backend changes**: Edit `server.js` and restart the server
3. **Scripts**: Modify shell scripts in `scripts/` as needed
4. **Without sudo** (UI and API work, nodes cannot start because there are no network namespaces): `NODEMANAGER_DEV_NONROOT=1 NODEMANAGER_NO_BROWSER=1 PORT=3001 node server.js`

## License

MIT License - feel free to use and modify as needed.

## Credits

Built for the Minima blockchain ecosystem. UI inspired by [build.minima.global](https://build.minima.global/).

## Support

For issues, questions, or contributions, please open an issue on GitHub.
