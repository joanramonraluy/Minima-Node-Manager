#!/bin/bash

# Ideally run as root
if [ "$EUID" -ne 0 ]; then
  echo "Warning: Not running as root. Make sure you can signal the process."
fi

NODE_ID=$1

if [ -z "$NODE_ID" ]; then
    echo "Usage: ./stop_host_node.sh <NODE_ID>"
    exit 1
fi

DATA_NAME="nodes/host_node$NODE_ID"

echo "Stopping HOST Node $NODE_ID ($DATA_NAME)..."

# Kill Minima process for this specific node
# We use -data flag to identify the specific process
pkill -f "minima.jar.*-data $DATA_NAME"

if [ $? -eq 0 ]; then
    echo "Signal sent to Host Node $NODE_ID."
else
    echo "Could not find running process for Host Node $NODE_ID (or already stopped)."
fi
