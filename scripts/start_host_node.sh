#!/bin/bash

# Ideally run as root, but not strictly required for host ports > 1024
if [ "$EUID" -ne 0 ]; then
  echo "Warning: Not running as root. Ensure you have permissions for ports > 1024 and 'nodes/' directory."
fi

NODE_ID=$1
shift

if [ -z "$NODE_ID" ]; then
    echo "Usage: ./start_host_node.sh <NODE_ID> [flags]"
    exit 1
fi

# Configuration
# Base Port 9001 for Node 1.
# Node 1: 9001 (P2P), 9002 (RPC), 9003 (MDS), 9004 (Auth)
# Node 2: 9101, 9102, 9103, 9104
# Offset = (ID - 1) * 100
OFFSET=$(( (NODE_ID - 1) * 100 ))
PORT=$(( 9001 + OFFSET ))
RPC_PORT=$(( 9002 + OFFSET ))
MDS_PORT=$(( 9003 + OFFSET ))

DATA_NAME="nodes/host_node$NODE_ID"

# Ensure directory exists
mkdir -p "$DATA_NAME"

echo "Starting HOST Node $NODE_ID ($DATA_NAME)"
echo "  P2P: $PORT"
echo "  RPC: $RPC_PORT"
echo "  MDS: http://127.0.0.1:$MDS_PORT"

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
      # Preserve other flags
      other_flags="$other_flags $1"
      shift
      ;;
  esac
done

export MINIMA_PORT=$PORT

# Execute Minima directly on host
# We use nohup or just exec if called from node spawn
# Since server.js spawns this, we can just exec java
exec java -jar ./minima.jar \
  -data $DATA_NAME \
  -basefolder $DATA_NAME \
  -port $PORT \
  -host 0.0.0.0 \
  $clean_flag \
  $genesis_flag \
  $connect_flag \
  $other_flags | tee "$DATA_NAME/startup.log"
