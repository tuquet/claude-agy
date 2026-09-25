#!/usr/bin/env bash
# ==============================================================================
# Claude-Agy Uninstaller Script
# ==============================================================================
set -e

INSTALL_DIR="${TARGET_DIR:-$HOME/claude-agy}"
SYMLINK_PATH="/usr/local/bin/claude-agy"

RED="\033[0;31m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
NC="\033[0m"

echo -e "${BLUE}==>${NC} Starting Claude-Agy uninstallation..."

# 1. Stop proxy process on port 8318 if running
echo -e "${BLUE}==>${NC} Stopping proxy process (if running)..."
pkill -f "cli-proxy-api.*8318" 2>/dev/null || true

# 2. Remove system-wide symlink
if [ -L "$SYMLINK_PATH" ] || [ -f "$SYMLINK_PATH" ]; then
    echo -e "${BLUE}==>${NC} Removing symlink ${GREEN}$SYMLINK_PATH${NC}..."
    sudo rm -f "$SYMLINK_PATH" 2>/dev/null || rm -f "$SYMLINK_PATH"
fi

# 3. Remove installation directory if exists
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}==>${NC} Removing application directory ${GREEN}$INSTALL_DIR${NC}..."
    rm -rf "$INSTALL_DIR"
fi

echo -e "\n${GREEN}[SUCCESS] Claude-Agy has been completely removed from the system!${NC}"
