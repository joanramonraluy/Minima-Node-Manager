#!/bin/bash

# generic build_android_clean.sh
# Usage: ./build_android_clean.sh <PROJECT_DIR> <ADB_PATH> [DEVICE_ID]

PROJECT_DIR="$1"
ADB_PATH="$2"
DEVICE_ID="$3"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}[Build Script] Starting Clean Android Build Pipeline...${NC}"
echo "Project Dir: $PROJECT_DIR"
echo "ADB Path:    $ADB_PATH"
if [ -n "$DEVICE_ID" ]; then
    echo "Device ID:   $DEVICE_ID"
fi

if [ -z "$PROJECT_DIR" ] || [ -z "$ADB_PATH" ]; then
    echo -e "${RED}Error: PROJECT_DIR and ADB_PATH are required.${NC}"
    echo "Usage: $0 <PROJECT_DIR> <ADB_PATH> [DEVICE_ID]"
    exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}Error: Project directory does not exist: $PROJECT_DIR${NC}"
    exit 1
fi

# 1. Navigate to Project Directory
cd "$PROJECT_DIR" || exit 1

# 2. Build Web Assets
echo -e "\n${GREEN}[1/5] Building Web Assets (npm run build)...${NC}"
if npm run build; then
    echo "Web assets built successfully."
else
    echo -e "${RED}Failed to build web assets.${NC}"
    exit 1
fi

# 3. Sync Capacitor
echo -e "\n${GREEN}[2/5] Syncing Capacitor (npx cap sync android)...${NC}"
if npx cap sync android; then
    echo "Capacitor synced successfully."
else
    echo -e "${RED}Failed to sync capacitor.${NC}"
    exit 1
fi

# 4. Clean Android Build
echo -e "\n${GREEN}[3/5] Cleaning Android Project (gradlew clean)...${NC}"
cd android || exit 1
if ./gradlew clean; then
    echo "Android project cleaned."
else
    echo -e "${RED}Failed to clean android project.${NC}"
    exit 1
fi

# 5. Build Debug APK
echo -e "\n${GREEN}[4/5] Building Debug APK (gradlew assembleDebug)...${NC}"
if ./gradlew assembleDebug; then
    echo "APK built successfully."
else
    echo -e "${RED}Failed to build APK.${NC}"
    exit 1
fi

# 6. Install APK
if [ "$DEVICE_ID" == "--no-install" ] || [ "$DEVICE_ID" == "-n" ]; then
    echo -e "\n${GREEN}[5/5] Skipping installation as requested.${NC}"
    echo -e "${GREEN}✅ Success! APK built but not installed.${NC}"
    exit 0
fi

echo -e "\n${GREEN}[5/5] Installing APK...${NC}"
APK_PATH="app/build/outputs/apk/debug/app-debug.apk"

if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}Error: APK not found at $APK_PATH${NC}"
    exit 1
fi

# Construct ADB command
ADB_CMD="$ADB_PATH"
if [ -n "$DEVICE_ID" ]; then
    ADB_CMD="$ADB_PATH -s $DEVICE_ID"
fi

echo "Installing to device..."
if $ADB_CMD install -r -t "$APK_PATH"; then
    echo -e "${GREEN}✅ Success! App installed.${NC}"
else
    echo -e "${RED}Failed to install APK.${NC}"
    exit 1
fi

exit 0
