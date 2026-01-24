#!/bin/bash

# Must run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

NODE_ID=$1
VETH="veth$NODE_ID"

if ! ip link show $VETH > /dev/null 2>&1; then
    echo "Interface $VETH not found. Is node running?"
    exit 1
fi

echo "Disconnecting Node $NODE_ID (Simulating 100% Packet Loss)..."
# Add 100% packet loss to the interface
tc qdisc add dev $VETH root netem loss 100%

if [ $? -eq 0 ]; then
    echo "✗ NETWORK DISCONNECTED - Node $NODE_ID is now isolated (100% packet loss)"
    echo "Use 'Reconnect Net' button to restore connectivity"
else
    echo "Failed to disconnect network for Node $NODE_ID"
    exit 1
fi
