# Using the Core test bed (for agents and people who test against it)

Node Manager in **Core mode** is a local test bed for Minima Core: headless Core nodes on this computer plus Android emulators that run a Core node, all on one private chain. It was built for the MinimaAds Core migration (phase 1 of `MinimaAds/docs/ecosystem/CORE_MIGRATION_PLAN.md`), but nothing here is MinimaAds specific. Test chains only: no real funds, no mainnet.

This page is for whoever *uses* the test bed (for example an agent working in the MinimaAds repo). To change Node Manager itself, read [AGENTS.md](../AGENTS.md); for the UI, [README.md](../README.md).

## 1. What you can and cannot do alone

| | Agent without sudo | Needs the maintainer |
|---|---|---|
| Read state (nodes, blocks, logs) | yes, HTTP | |
| Android emulators and nodes: start, stop, wipe, send commands | yes, HTTP (`/api/emulator`, `/api/android-node`) | |
| Run test scenarios | yes, HTTP (`/api/scenarios`) | |
| Run `escrow_flow.py` directly against the nodes | yes | |
| **Start / stop the Node Manager server** | no | **yes**: `./nodemanager` runs `sudo node server.js` and needs the password |
| Start / stop the headless nodes | yes, HTTP (`/api/nodes/...start`, `.../stop`, `start-all`, `stop-all`) once the server runs | |
| Backend code changes taking effect | no | restart the server |

Two facts that surprise people:

- **The headless Java nodes are children of the server.** Restarting the server stops them (and loses the in-memory logs). The emulators are detached and survive.
- **Headless nodes can be started and stopped over HTTP** (section 4), but only while the server runs, and the server needs the maintainer. Android nodes and emulators have their own HTTP endpoints.

## 2. Is it up? One command

```bash
node scripts/testbed-status.js            # from the Node Manager checkout; --headless N, --url, --json
```

It lists every node (block, tip hash, peers) and ends with `IN SYNC (N nodes)`, `FORK at block X`, `NOT IN SYNC` or `FEWER THAN 2 NODES UP`. Exit code 0 only when at least two nodes are on the same chain tip. It is read-only. If it says the Node Manager is not reachable, ask the maintainer to start it (section 1).

The same information is in the UI: Nodes tab, **Network** table.

## 3. Topology

| Node | Address | Notes |
|---|---|---|
| Headless node N | `10.0.0.(10+N)`, P2P port 9001 | One network namespace each. Node 1 is the seed (`-solo`, creates the genesis); the others use `-test -nop2p -connect 10.0.0.11:9001`. Data in `nodes-core/nodeN`. |
| Headless RPC | `http://10.0.0.(10+N):9005` | Plain HTTP (Core has no HTTPS RPC), Basic Auth user `minima`, password `123`. Enabled by the manager after start. Listens on all interfaces with write access: test machine only. |
| Android node | one per AVD, inside the emulator | Runs **CoreTestNode** (MinimaAds `docs/testing/tools/core-test-node`), not the official Core app: the official app cannot take node parameters. **No RPC**: send commands through the manager (section 5). |

How they see each other:

- An emulator reaches the headless nodes through the bridge (`10.0.0.1`, `10.0.0.11`, ...). Android nodes therefore **dial out to the seed**; headless nodes cannot dial into an emulator (its `10.0.2.x` address is not routable and `adb forward` listens on `127.0.0.1` only).
- All Android nodes appear to the seed as `10.0.0.1:<their -port>` (see gotcha 1 below).
- Headless nodes are `10.0.0.11`, `10.0.0.12`, ... one namespace each.

## 4. Starting everything

Ask the maintainer to press **Start Everything** (Nodes tab, top bar). It starts the headless nodes (seed first, waits for its RPC), opens the emulators, installs the node app where missing, starts each Android node joined to the seed (random port) and retries a node that stays at block 0. Then run `scripts/testbed-status.js`. If the server is already running you can do the pieces yourself:

```bash
M=http://localhost:3000

# Headless nodes (Core mode). Idempotent: a node that is already running is left alone
curl -s $M/api/nodes                                                    # {"mode":"core","running":[1,2]}
curl -s -X POST $M/api/nodes/start-all -H 'Content-Type: application/json' -d '{"count":2}'   # nodes 1..count, seed first (default 2)
curl -s -X POST $M/api/nodes/1/start                                    # one node; add {"clean":true} ONLY to delete its chain and wallet
curl -s -X POST $M/api/nodes/2/stop
curl -s -X POST $M/api/nodes/stop-all


# Emulators and Android nodes (all idempotent enough to repeat)
curl -s $M/api/emulator/avds                                           # AVDs, running or not, with adb serials
curl -s -X POST $M/api/emulator/launch -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2"}'
curl -s "$M/api/android-node/status?avd=Minima_Node_2"                 # installed? node up? block, hash, peers, port
curl -s -X POST $M/api/android-node/install -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2"}'
curl -s -X POST $M/api/android-node/start   -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2","mode":"connect"}'
curl -s -X POST $M/api/android-node/cmd     -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2","command":"status"}'
curl -s -X POST $M/api/android-node/stop    -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2"}'
curl -s -X POST $M/api/android-node/wipe    -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2"}'   # deletes its chain
```

The headless endpoints answer straight away; the nodes need a few seconds to boot (poll `scripts/testbed-status.js`). They work in Core mode only and need `coreJarPath`/`coreLibsPath` in `config.json` (409 with the reason otherwise). Starting the Android nodes before the seed is up works too, but the seed should be first.

`mode` for an Android node is `connect` (join the seed: `-test -nop2p -connect 10.0.0.11:9001`) or `solo` (own private chain). The start picks a random `-port` (12001-12999); you can pass `"port"` but keep it different per node and per start (gotcha 1).

## 5. Talking to the nodes

```bash
# Headless node N: RPC through the manager (no credentials needed from you)
curl -s -X POST $M/api/nodes/1/rpc -H 'Content-Type: application/json' -d '{"command":"status"}'
curl -s "$M/api/nodes/1/log?lines=50&type=stdout"          # in-memory log, last 2000 lines per node

# Headless node N: RPC directly (same thing, with credentials)
curl -s -u minima:123 -d status http://10.0.0.11:9005/     # command in the body or URL path

# Android node: a command through the manager (printable ASCII, max 300 chars)
curl -s -X POST $M/api/android-node/cmd -H 'Content-Type: application/json' -d '{"avd":"Minima_Node_2","command":"balance"}'
```

Core's `status` reply carries `chain.block`, `chain.hash`, `network.connected` and `chain.cascade`. To compare nodes, compare **block and hash together**: the same block with a different hash is a fork.

The manager refuses requests whose `Origin` header names another host (a web page on another site cannot drive it). `curl` and scripts send no `Origin` and are fine.

## 6. Running tests

**MinimaAds escrow and channel flow** (`docs/testing/tools/escrow_flow.py` in the MinimaAds repo), checked live against this test bed: 29/29 with the creator on headless node 1 and the viewer on headless node 2.

```bash
# From the UI: Nodes tab > Test scenarios > Run (needs the sibling ../MinimaAds checkout, or testScenarios in config.json)
curl -s $M/api/scenarios                                              # what is configured
curl -s -X POST $M/api/scenarios/run -H 'Content-Type: application/json' -d '{"id":"escrow-flow-2-nodes"}'
curl -s $M/api/scenarios/escrow-flow-2-nodes/output                   # {output, running, exit}; exit 0 = PASSED

# Or directly (takes about 2.5 minutes; use -u to see the output as it happens)
python3 -u MinimaAds/docs/testing/tools/escrow_flow.py \
  --rpc http://10.0.0.11:9005 --user minima --password 123 \
  --viewer-rpc http://10.0.0.12:9005 --viewer-user minima --viewer-password 123
```

Each run spends coins of the private chain; re-running is fine. The nodes must be running and in sync first (section 2).

Not verified: running a scenario with an **Android node as the viewer**. `escrow_flow.py` takes an RPC URL for the viewer and the Android nodes have no RPC. An idea that has not been tried: enable RPC on the Android node with `rpc enable:true password:...` through `/api/android-node/cmd` (it would listen on port 12005 inside the emulator) and reach it with `adb forward`.

Add your own scenario by listing it in `config.json`: see README, *Test scenarios*.

## 7. Gotchas (all hit while building this)

1. **A node only sends the chain once per peer address.** Minima keeps an in-memory set of `host:port` it already sent the initial block download to, until it restarts. The emulators all reach the seed as `10.0.0.1:<port>`, so two Android nodes (or one that was wiped) on the **same port** never sync: they connect, show 1 peer and stay at block 0. The manager uses a random port on every start for this reason. Restarting the seed also clears the list.
2. **Do not restart an Android node that has just synced**: blocks it has not saved yet are lost (it falls back a few blocks and re-syncs).
3. **A restarted server means no headless nodes** (they are its children), and the Android nodes lose their peer. *Start Everything* handles both; a node that is up with 0 peers is restarted on a new port.
4. **Emulator storage.** An AVD with a full data partition cannot install the node app (`INSTALL_FAILED_INSUFFICIENT_STORAGE`). Create AVDs with 8 GB or more (*+ New AVD*, or `POST /api/emulator/create`).
5. **The emulator needs `-gpu host`** on this machine (the default software renderer segfaults); the manager passes it (`emulatorArgs`).
6. **A crashed emulator can leave a modal dialog** ("Android Emulator closed unexpectedly") that blocks the next window start; the manager then shows "launching" forever. Dismiss it by hand.
7. **Quickboot restores the processes.** An emulator started from a snapshot that had the node running comes back with it running. A cold boot does not start the node (CoreTestNode has no boot receiver; the official Core app does start itself).
8. **Core has no MDS, no Maxima, and its IPC (`minimaapi`) is Android-only.** Dapp and Maxima flows cannot run here; the test bed is for `txn*`/chain-level logic and for the transport you add on top.
9. **CoreTestNode is debug-only**: debuggable APK, fixed database password. Never put real funds on it.
10. **Sudo and users**: emulators and scenarios run as the desktop user (`SUDO_USER`); the server itself is root. Hence the manager cannot be started by an agent.

## 8. Safety rules

- Private test chains only. The manager listens on `127.0.0.1` only and refuses any `Host` other than `localhost`/`127.0.0.1`/`[::1]`, so call it as `http://localhost:3000` (the machine's name or LAN address answers 403). It has no login: any process on this computer can use it. The headless RPC ports are open inside the host; do not expose them.
- Do not pass `{"clean":true}` to a start, and do not run `kill_all_*`, `delete_*` scripts, *Delete All Data* or *Wipe All Node Data*, unless asked: they destroy the chain the other tests rely on.
- Do not start or stop the maintainer's emulators or nodes just to look around; read state with `scripts/testbed-status.js`.
- If you start something (a node, an emulator, a scenario), say what you left running when you finish.

## 9. Where things are

| What | Where |
|---|---|
| Server, headless nodes, RPC proxy | `server.js`, `scripts/start_core_node.sh` |
| Emulators, snapshots, create AVD | `lib/emulator.js` |
| Android nodes (CoreTestNode) | `lib/android-node.js` |
| HTTP start/stop of headless nodes | `lib/nodes-http.js` |
| Scenarios | `lib/scenarios.js` |
| UI for Core (network table, Start Everything, scenarios) | `public/android.js` |
| Mocked tests | `test/*.test.js` (`node test/emulator.test.js`, `android-node`, `scenarios`, `nodes-http`) |
| Status script | `scripts/testbed-status.js` |
