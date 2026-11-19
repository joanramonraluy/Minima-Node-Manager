#!/bin/bash
# Stop one Core node (matches only nodes-core/ data dirs).
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi
NODE_ID=$1
echo "Stopping Core Node $NODE_ID..."
pkill -f "org.minima.Minima.*-data nodes-core/node$NODE_ID "
echo "Signal sent to Core node$NODE_ID."
