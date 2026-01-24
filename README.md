<<<<<<< HEAD
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
│   ├── start_node.sh      # Start individual node
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
=======
