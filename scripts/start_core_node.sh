#!/bin/bash
# Start a Minima CORE node (org.minima.Minima, 1.1.x) inside its network namespace.
# Usage: start_core_node.sh <ID> [-clean] [-ram 256m] [-cpus 1]
# Env (set by server.js from config.json):
#   CORE_JAR         path to the Core minima.jar
#   CORE_LIBS        directory containing bcprov/bcpkix/bcutil/h2 jars
#   CORE_DBPASSWORD  value for -dbpassword
# Data lives in nodes-core/ (never mixed with nodes/).
# Node 1 starts with -solo (creates genesis); the rest use -test -nop2p -connect 10.0.0.11:9001.

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

NODE_ID=$1
shift

if [ -z "$CORE_JAR" ] || [ ! -f "$CORE_JAR" ]; then
  echo "CORE_JAR not set or not found: '$CORE_JAR' (configure coreJarPath in config.json)"
  exit 1
fi
if [ -z "$CORE_LIBS" ] || [ ! -d "$CORE_LIBS" ]; then
  echo "CORE_LIBS not set or not a directory: '$CORE_LIBS' (configure coreLibsPath in config.json)"
  exit 1
fi
DBPASS="${CORE_DBPASSWORD:-minima}"

# Classpath: core jar + only the required libs (BouncyCastle + H2)
CP="$CORE_JAR"
for j in "$CORE_LIBS"/bcprov*.jar "$CORE_LIBS"/bcpkix*.jar "$CORE_LIBS"/bcutil*.jar "$CORE_LIBS"/h2*.jar; do
  [ -f "$j" ] && CP="$CP:$j"
done

BRIDGE="minima-br"
NS="node$NODE_ID"
VETH="veth$NODE_ID"
VETH_PEER="vPeer$NODE_ID"
IP="10.0.0.$((10 + NODE_ID))/24"
GW="10.0.0.1"

# --- Networking Setup (same as start_node.sh) ---
if ! ip netns list | grep -q "$NS"; then
    echo "Creating namespace $NS..."
    ip netns add $NS
    ip netns exec $NS ip link set lo up
fi

if ! ip link show $BRIDGE > /dev/null 2>&1; then
    echo "Creating bridge $BRIDGE..."
    ip link add name $BRIDGE type bridge
    ip addr add $GW/24 dev $BRIDGE
    ip link set $BRIDGE up
    sysctl -w net.ipv4.ip_forward=1 > /dev/null
fi

if ! ip link show $VETH > /dev/null 2>&1; then
    echo "Creating veth pair $VETH <-> $VETH_PEER..."
    ip link add $VETH type veth peer name $VETH_PEER
    ip link set $VETH master $BRIDGE
    ip link set $VETH up
    ip link set $VETH_PEER netns $NS
    ip netns exec $NS ip addr add $IP dev $VETH_PEER
    ip netns exec $NS ip link set $VETH_PEER up
    ip netns exec $NS ip route add default via $GW
fi

# --- Core Configuration ---
DATA_NAME="nodes-core/node$NODE_ID"
PORT=9001   # every node has its own IP; RPC will be PORT+4 = 9005
mkdir -p "$DATA_NAME"

clean_flag=""
ram_limit=""
cpu_limit=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -clean) clean_flag="-clean"; shift ;;
    -ram)   ram_limit="$2"; shift 2 ;;
    -cpus)  cpu_limit="$2"; shift 2 ;;
    *)      shift ;;   # MDS/Classic flags are meaningless for Core: ignore
  esac
done

xmx_flag=""; [ -n "$ram_limit" ] && xmx_flag="-Xmx$ram_limit"
cpu_flag=""; [ -n "$cpu_limit" ] && cpu_flag="-XX:ActiveProcessorCount=$cpu_limit"

if [ "$NODE_ID" = "1" ]; then
  role_flags="-solo"
else
  role_flags="-test -nop2p -connect 10.0.0.11:$PORT"
fi

echo "Starting CORE Node $NODE_ID ($DATA_NAME) in namespace $NS on ${IP%/*}:$PORT ($role_flags)..."

exec ip netns exec $NS java $xmx_flag $cpu_flag -cp "$CP" org.minima.Minima \
  -data $DATA_NAME \
  -dbpassword "$DBPASS" \
  -port $PORT \
  -host ${IP%/*} \
  $clean_flag \
  $role_flags | tee "$DATA_NAME/startup.log"
