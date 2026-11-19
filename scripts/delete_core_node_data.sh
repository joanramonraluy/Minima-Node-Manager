#!/bin/bash
# Delete Core node data. Only touches nodes-core/ (never nodes/).
NODE_ID=$1
if [ -z "$NODE_ID" ]; then echo "Error: Node ID required (or 'all')."; exit 1; fi
BASE_DIR="$(pwd)/nodes-core"
if [ "$NODE_ID" == "all" ]; then
  echo "Deleting ALL Core node data..."
  rm -rf "${BASE_DIR}"/node*
  echo "All Core node data deleted."
  exit 0
fi
if [ -d "${BASE_DIR}/node${NODE_ID}" ]; then
  rm -rf "${BASE_DIR}/node${NODE_ID}"
  echo "Core Node ${NODE_ID} data deleted."
else
  echo "No Core data found for Node ${NODE_ID}."
fi
