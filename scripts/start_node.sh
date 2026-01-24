#!/bin/bash

# Must run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

NODE_ID=$1
shift

BRIDGE="minima-br"
NS="node$NODE_ID"
VETH="veth$NODE_ID"
VETH_PEER="vPeer$NODE_ID"
IP="10.0.0.1$NODE_ID/24"
GW="10.0.0.1"

# --- Networking Setup ---

# Create Namespace if not exists
if ! ip netns list | grep -q "$NS"; then
    echo "Creating namespace $NS..."
    ip netns add $NS
    ip netns exec $NS ip link set lo up
fi

# Create veth pair if not exists
if ! ip link show $VETH > /dev/null 2>&1; then
    echo "Creating veth pair $VETH <-> $VETH_PEER..."
    ip link add $VETH type veth peer name $VETH_PEER
    
    # Attach host side to bridge
    ip link set $VETH master $BRIDGE
    ip link set $VETH up
    
    # Move peer to namespace
    ip link set $VETH_PEER netns $NS
    
    # Configure namespace interface
    ip netns exec $NS ip addr add $IP dev $VETH_PEER
    ip netns exec $NS ip link set $VETH_PEER up
    ip netns exec $NS ip route add default via $GW
fi

# --- Minima Configuration ---

# Use Node ID directly for folder naming (node1, node2, etc.)
DATA_NAME="node$NODE_ID"
# Port is always 9001 because each node has its own IP!
PORT=9001 

echo "Starting Node $NODE_ID ($DATA_NAME) in namespace $NS on $IP:$PORT..."

# Flags
clean_flag=""
connect_flag=""
genesis_flag=""

# Parse Args
while [[ $# -gt 0 ]]; do
  case $1 in
    -clean)
      clean_flag="-clean"
      shift
      ;;
    -genesis)
      genesis_flag="-genesis"
      shift
      ;;
    -connect)
      CONNECT_TARGET="$2"
      if [ -n "$CONNECT_TARGET" ]; then
          connect_flag="-connect $CONNECT_TARGET"
      fi
      shift 2
      ;;
    *)
      # Preserve other flags (e.g., -mdsenable, -test, etc.)
      other_flags="$other_flags $1"
      shift
      ;;
  esac
done

export MINIMA_PORT=$PORT

# Execute Minima inside Namespace
# We use 'exec' so the shell process is replaced by ip netns exec -> java
exec ip netns exec $NS java -jar ./minima.jar \
  -data $DATA_NAME \
  -basefolder $DATA_NAME \
  -port $PORT \
  -host ${IP%/*} \
  $clean_flag \
  $genesis_flag \
  $connect_flag \
  $other_flags \
  -mdspassword 123 \
  -allowallip \
  -rpcenable \
  -rpcssl \
  -rpccrlf \
  -showparams | tee "$DATA_NAME/startup.log"
