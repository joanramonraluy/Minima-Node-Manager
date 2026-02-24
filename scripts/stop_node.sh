#!/bin/bash

# Must run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

NODE_ID=$1
NS="node$NODE_ID"

echo "Stopping Node $NODE_ID in namespace $NS..."

# Check if namespace exists
if ! ip netns list | grep -q "$NS"; then
    echo "Namespace $NS does not exist (Node likely already stopped)."
    exit 0
fi

# Kill Minima process for this specific node
# We use -data flag with 'nodes/' prefix and trailing space to identify the specific process
pkill -f "minima.jar.*-data nodes/node$NODE_ID "

echo "Signal sent to Minima node$NODE_ID."
