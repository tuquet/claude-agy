#!/usr/bin/env bash
# ==============================================================================
# Automated setup script for Claude-Agy on Linux and macOS
# ==============================================================================
set -e

CPA_VERSION="7.3.17"
INSTALL_DIR="${TARGET_DIR:-$HOME/claude-agy}"
INSTALL_DIR="$(mkdir -p "$INSTALL_DIR" && cd "$INSTALL_DIR" && pwd)"
BIN_DIR="$INSTALL_DIR/bin"
CONFIG_DIR="$INSTALL_DIR/config"
DATA_DIR="$INSTALL_DIR/data"
LOGS_DIR="$INSTALL_DIR/logs"
SCRIPTS_DIR="$INSTALL_DIR/scripts"

GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN} [SETUP] Claude-Agy for Linux & macOS (Automated Setup)${NC}"
echo -e "${CYAN}============================================================${NC}"
echo "Target directory: $INSTALL_DIR"

# 1. Check Node.js
echo -e "\n${CYAN}[1/6] Checking Node.js runtime...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Node.js is required but not installed.${NC}"
    echo -e "${YELLOW}Please install Node.js 18+ (e.g. via nvm, fnm, or system package manager).${NC}"
    exit 1
fi
echo -e "${GREEN}  -> Node.js OK: $(node -v)${NC}"

# 2. Check Claude Code CLI
echo -e "\n${CYAN}[2/6] Checking Anthropic Claude Code CLI...${NC}"
if ! command -v claude >/dev/null 2>&1; then
    echo "  -> Installing @anthropic-ai/claude-code via npm..."
    npm install -g @anthropic-ai/claude-code
else
    echo -e "${GREEN}  -> Claude Code CLI already available.${NC}"
fi

# 3. Check Python 3
if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Python 3 is required for token synchronization.${NC}"
    exit 1
fi

# 4. Create directory structure
mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOGS_DIR" "$SCRIPTS_DIR"

# 5. Resolve and Deploy Claude-Agy components (bin, scripts, config)
echo -e "\n${CYAN}[3/6] Deploying Claude-Agy components...${NC}"
SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
LOCAL_ROOT=""
if [ -n "$SCRIPT_SOURCE" ] && [ -f "$SCRIPT_SOURCE" ]; then
    DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" >/dev/null 2>&1 && pwd)"
    if [ -f "$DIR/../bin/claude-agy" ]; then
        LOCAL_ROOT="$(cd "$DIR/.." && pwd)"
    elif [ -f "$DIR/bin/claude-agy" ]; then
        LOCAL_ROOT="$DIR"
    fi
fi

if [ -n "$LOCAL_ROOT" ]; then
    cp -rf "$LOCAL_ROOT/bin/"* "$BIN_DIR/"
    cp -rf "$LOCAL_ROOT/scripts/"* "$SCRIPTS_DIR/"
    [ ! -f "$CONFIG_DIR/settings.env" ] && cp -rf "$LOCAL_ROOT/config/"* "$CONFIG_DIR/"
    echo -e "${GREEN}  -> Deployed components from local source ($LOCAL_ROOT).${NC}"
else
    echo "  -> Fetching latest components from GitHub repository..."
    TMP_DIR="$(mktemp -d)"
    curl -fsSL https://github.com/tuquet/claude-agy/archive/refs/heads/main.tar.gz | tar -xz -C "$TMP_DIR"
    EXTRACTED_DIR="$TMP_DIR/claude-agy-main"
    cp -rf "$EXTRACTED_DIR/bin/"* "$BIN_DIR/"
    cp -rf "$EXTRACTED_DIR/scripts/"* "$SCRIPTS_DIR/"
    [ ! -f "$CONFIG_DIR/settings.env" ] && cp -rf "$EXTRACTED_DIR/config/"* "$CONFIG_DIR/"
    rm -rf "$TMP_DIR"
    echo -e "${GREEN}  -> Successfully fetched and extracted components.${NC}"
fi

chmod +x "$BIN_DIR/claude-agy" 2>/dev/null || true
chmod +x "$SCRIPTS_DIR/sync-token.py" 2>/dev/null || true
chmod +x "$SCRIPTS_DIR/uninstall.sh" 2>/dev/null || true
cp -f "$SCRIPTS_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"
chmod +x "$INSTALL_DIR/uninstall.sh" 2>/dev/null || true

# 6. Check and Download CLIProxyAPI binary
echo -e "\n${CYAN}[4/6] Checking CLIProxyAPI native binary...${NC}"
PROXY_BIN="$BIN_DIR/cli-proxy-api"
if [ ! -f "$PROXY_BIN" ]; then
    OS_TYPE="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH_TYPE="$(uname -m)"
    case "$ARCH_TYPE" in
        x86_64|amd64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) echo -e "${RED}[ERROR] Unsupported CPU architecture: $ARCH_TYPE${NC}"; exit 1 ;;
    esac

    case "$OS_TYPE" in
        linux) OS="linux" ;;
        darwin) OS="darwin" ;;
        *) echo -e "${RED}[ERROR] Unsupported OS: $OS_TYPE${NC}"; exit 1 ;;
    esac

    DOWNLOAD_URL="https://github.com/router-for-me/CLIProxyAPI/releases/download/v${CPA_VERSION}/CLIProxyAPI_${CPA_VERSION}_${OS}_${ARCH}.tar.gz"
    echo "  -> Downloading CLIProxyAPI v$CPA_VERSION for $OS-$ARCH..."
    TMP_ARCHIVE="$(mktemp)"
    curl -fsSL -o "$TMP_ARCHIVE" "$DOWNLOAD_URL"
    tar -xzf "$TMP_ARCHIVE" -C "$BIN_DIR" cli-proxy-api 2>/dev/null || tar -xzf "$TMP_ARCHIVE" -C "$BIN_DIR"
    rm -f "$TMP_ARCHIVE"
    chmod +x "$PROXY_BIN"
    echo -e "${GREEN}  -> Installed binary: $PROXY_BIN${NC}"
else
    echo -e "${GREEN}  -> Binary cli-proxy-api already available.${NC}"
fi

# Configure auth-dir in config.yaml
if [ -f "$CONFIG_DIR/config.yaml" ]; then
    sed -i.bak "s|auth-dir: \"\"|auth-dir: \"$DATA_DIR\"|g" "$CONFIG_DIR/config.yaml" 2>/dev/null || sed -i "" "s|auth-dir: \"\"|auth-dir: \"$DATA_DIR\"|g" "$CONFIG_DIR/config.yaml"
    rm -f "$CONFIG_DIR/config.yaml.bak" 2>/dev/null || true
fi

# 7. Configure symlink in /usr/local/bin or ~/.local/bin
echo -e "\n${CYAN}[5/6] Configuring system PATH / symlink...${NC}"
SYMLINK_PATH="/usr/local/bin/claude-agy"
if [ -w "/usr/local/bin" ]; then
    ln -sf "$BIN_DIR/claude-agy" "$SYMLINK_PATH"
    echo -e "${GREEN}  -> Created symlink at $SYMLINK_PATH.${NC}"
else
    sudo ln -sf "$BIN_DIR/claude-agy" "$SYMLINK_PATH" 2>/dev/null || {
        USER_BIN="$HOME/.local/bin"
        mkdir -p "$USER_BIN"
        ln -sf "$BIN_DIR/claude-agy" "$USER_BIN/claude-agy"
        echo -e "${GREEN}  -> Created symlink at $USER_BIN/claude-agy.${NC}"
        echo -e "${YELLOW}  -> Ensure $USER_BIN is in your PATH.${NC}"
    }
fi

# 8. Initial token synchronization
echo -e "\n${CYAN}[6/6] Synchronizing Antigravity OAuth token...${NC}"
python3 "$SCRIPTS_DIR/sync-token.py" "$INSTALL_DIR" "${ANTIGRAVITY_TOKEN_PATH:-}"

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN} [SUCCESS] Claude-Agy installation completed!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo -e " Command:   ${GREEN}claude-agy${NC}"
echo -e " Update:    ${CYAN}claude-agy update${NC}"
echo -e " Uninstall: ${YELLOW}$INSTALL_DIR/uninstall.sh${NC}"
