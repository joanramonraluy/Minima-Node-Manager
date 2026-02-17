#!/bin/bash

# Arguments:
# $1: Node ID (e.g., 1, 2, 3...) or "all"
# $2: Node Type (optional, "host" or "virtual", defaults to virtual if not checkable currently, but we check dir existence)

NODE_ID=$1

if [ -z "$NODE_ID" ]; then
  echo "Error: Node ID required (or 'all')."
  exit 1
fi

BASE_DIR="$(pwd)/nodes"

if [ "$NODE_ID" == "all" ]; then
  echo "Deleting ALL node data..."
  # Delete all directories matching node* or host_node*
  rm -rf "${BASE_DIR}"/node*
  rm -rf "${BASE_DIR}"/host_node*
  echo "All node data deleted."
  exit 0
fi

# Determine directories to check
HOST_DIR="${BASE_DIR}/host_node${NODE_ID}"
VIRTUAL_DIR="${BASE_DIR}/node${NODE_ID}"

DELETED=false

if [ -d "$HOST_DIR" ]; then
  echo "Deleting Host Node ${NODE_ID} data at ${HOST_DIR}..."
  rm -rf "$HOST_DIR"
  DELETED=true
fi

if [ -d "$VIRTUAL_DIR" ]; then
  echo "Deleting Virtual Node ${NODE_ID} data at ${VIRTUAL_DIR}..."
  rm -rf "$VIRTUAL_DIR"
  DELETED=true
fi

if [ "$DELETED" = false ]; then
  echo "No data found for Node ${NODE_ID}."
else
  echo "Node ${NODE_ID} data deleted."
fi
