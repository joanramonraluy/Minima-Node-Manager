#!/bin/bash

BRIDGE="minima-br"
GATEWAY_IP="10.0.0.1/24"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

# Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1 > /dev/null

# Create bridge if not exists
if ! ip link show $BRIDGE > /dev/null 2>&1; then
    echo "Creating bridge $BRIDGE..."
    ip link add name $BRIDGE type bridge
    ip addr add $GATEWAY_IP dev $BRIDGE
    ip link set $BRIDGE up
else
    echo "Bridge $BRIDGE already exists."
fi

# Setup NAT (Masquerade) for outgoing access if needed (optional for pure local test, but good for realism)
# iptables -t nat -A POSTROUTING -s 10.0.0.0/24 ! -d 10.0.0.0/24 -j MASQUERADE
