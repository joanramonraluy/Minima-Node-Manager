#!/bin/bash
echo "--- Bridge Status ---"
ip addr show minima-br
echo ""
echo "--- Routing Table ---"
ip route show | grep 10.0.0
echo ""
echo "--- Ping Node 1 (10.0.0.11) ---"
ping -c 3 10.0.0.11
echo ""
echo "--- Node 1 Listening Ports ---"
# Check what ports are open inside the namespace
if ip netns list | grep -q "node1"; then
    sudo ip netns exec node1 ss -tuln
else
    echo "Namespace node1 not found."
fi
