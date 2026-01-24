#!/bin/bash

# Must run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

NODE_ID=$1
VETH="veth$NODE_ID"

if ! ip link show $VETH > /dev/null 2>&1; then
    echo "Interface $VETH not found."
    exit 1
fi

echo "Reconnecting Node $NODE_ID..."
# Delete the tc rule
tc qdisc del dev $VETH root 2>/dev/null || true

echo "✓ NETWORK RECONNECTED - Node $NODE_ID connectivity restored"
echo "Node can now communicate with other nodes"
