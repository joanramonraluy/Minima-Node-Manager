# AGENTS.md

Guidance for coding agents working on this repo. For what the project is and how to use it, see [README.md](README.md).

## Running and testing
- The server needs `sudo` (network namespaces): `./nodemanager` runs `sudo node server.js` on http://localhost:3000. An agent cannot type the sudo password, so ask the user to start/restart it. Frontend files in `public/` are served from disk; backend changes need a restart.
- No test runner is configured (`npm test` is a placeholder). The only tests are mocked ones: `node test/emulator.test.js` and `node test/android-node.test.js` (no adb/emulator is run).
- Check frontend JS syntax with `node --check public/app.js`.
- Don't start or kill nodes, launch emulators or run `delete_*` / `kill_all_*` scripts unless the user asked: they act on the user's machine.

## Two modes, one UI
- Modes are `classic` (MDS) and `core`. The server checks `isCoreMode()` (`server.js`); the frontend uses `window.nodeMode` and `applyNodeMode()` in `public/app.js`, which also sets `body[data-mode]`.
- Visibility is CSS-driven (`public/style.css`): `.classic-only` (hidden in Core), `.core-only` (shown only in Core, inside Nodes content) and `.core-tab` (a whole tab or nav button hidden in Classic). Don't use `.core-only` on a `.tab-content`: it forces `display: block`.
- Core Nodes tab, by node type: *Network* table (`refreshNetwork()`), *Android nodes* (AVD rows built by `buildAvdRow()`, with the CoreTestNode controls from `buildAndroidNodeBlock()`) and *Desktop nodes* (the cards). Core-only tab: *Android tools* (ADB). Classic-only tabs: *dApp Manager*, *Build Pipeline*, *Vite Server*. `#android-mgmt-block` (ADB tools + log) is moved by `applyNodeMode()` between `#tab-dapps` (Classic) and `#emulators-adb-slot` (Core), so keep its element IDs stable.
- The mode-dependent toolbar label (*Nodes* / *Desktop nodes*) and the *Start All Nodes* tooltip are set in `applyNodeMode()`; *Open All* (Web UIs) is Classic-only and *Open All Emulators* lives in the Android nodes section. *Start All Nodes* starts node processes only; emulators are launched by *Open All Emulators* / the AVD Start buttons (`lib/emulator.js`). Android nodes run **CoreTestNode** (from the MinimaAds repo) because the official Core app cannot take node parameters; its API is `lib/android-node.js` (shares AVD checks/locks with the emulator router through `router._helpers`).
- Keep Classic and Core data separate: `nodes/` vs `nodes-core/`, and the `*_core_*` scripts.

## Local state
- `config.json` is local and gitignored, and the UI rewrites it. Changing the mode in the header persists it. To preview the other mode in a browser without saving, call `applyNodeMode('classic' | 'core')` from the page console, and restore the original mode afterwards.
- Never write personal paths into `config.example.json`; Core jar/libs paths are auto-detected at startup and not saved.

## Testing the UI with Claude in Chrome
- Two Chrome instances can be connected (for example a Windows one and the local Linux one). `localhost:3000` only works in the Linux browser on this computer: use `list_connected_browsers` and `select_browser` for the local one.
- Clicking Start on an AVD boots a real emulator; the panel's Stop button shuts it down. Desktop Java nodes are children of the server (they stop when it restarts); emulators are detached and survive.
- Backend changes (`server.js`, `lib/`) need a server restart, which only the user can do (sudo).

## Security
- The manager and its RPC listen on all interfaces without authentication: this is a test harness for an isolated machine. Don't add features that widen that exposure, and keep spawning processes with argument arrays, never shell strings.
