const net = require('net');
const host = '10.0.0.11';
const startPort = 9000;
const endPort = 9020;

console.log(`Scanning open ports on ${host} from ${startPort} to ${endPort}...`);

for (let port = startPort; port <= endPort; port++) {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
        console.log(`[OPEN] Port ${port}`);
        socket.destroy();
    });
    socket.on('timeout', () => {
        // console.log(`[TIMEOUT] Port ${port}`);
        socket.destroy();
    });
    socket.on('error', (err) => {
        if (err.code !== 'ECONNREFUSED') {
            console.log(`[ERROR] Port ${port}: ${err.message}`);
        }
    });
    socket.connect(port, host);
}
