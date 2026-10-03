#!/usr/bin/env bash
# ==============================================================================
# Claude-Agy Application Installer & Setup
# ==============================================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$APP_DIR/bin"
CONFIG_DIR="$APP_DIR/config"
DATA_DIR="$APP_DIR/data"
LOGS_DIR="$APP_DIR/logs"
SCRIPTS_DIR="$APP_DIR/scripts"

SYMLINK_TARGET="/usr/local/bin/claude-agy"
BASHRC="$HOME/.bashrc"
CPA_VERSION="7.3.17"
MARKER_START="# >>> claude-agy begin >>>"
MARKER_END="# <<< claude-agy end <<<"

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BLUE="\033[0;34m"
NC="\033[0m"

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${BLUE}[==>]${NC} $1"; }

# ------------------------------------------------------------------------------
# UNINSTALL LOGIC
# ------------------------------------------------------------------------------
do_uninstall() {
    log_step "Bắt đầu gỡ cài đặt Claude-Agy..."

    # 1. Đóng tiến trình proxy trên cổng 8318 nếu đang chạy
    log_info "1. Dừng các tiến trình proxy trên cổng 8318..."
    if command -v fuser >/dev/null 2>&1; then
        fuser -k 8318/tcp 2>/dev/null || true
    fi
    pkill -f "cli-proxy-api.*8318" 2>/dev/null || true

    # 2. Xóa symlink toàn hệ thống
    if [ -L "$SYMLINK_TARGET" ] || [ -f "$SYMLINK_TARGET" ]; then
        log_info "2. Xóa symlink $SYMLINK_TARGET..."
        rm -f "$SYMLINK_TARGET"
    fi

    # 3. Dọn dẹp cấu hình trong ~/.bashrc
    if [ -f "$BASHRC" ]; then
        log_info "3. Dọn dẹp cấu hình trong $BASHRC..."
        sed -i "/$MARKER_START/,/$MARKER_END/d" "$BASHRC"
    fi

    # 4. Tùy chọn gỡ Claude Code npm package
    if [ "$1" = "--all" ]; then
        if command -v npm >/dev/null 2>&1; then
            log_info "4. Gỡ bỏ npm package @anthropic-ai/claude-code..."
            npm uninstall -g @anthropic-ai/claude-code 2>/dev/null || true
        fi
        log_info "5. Xóa toàn bộ thư mục ứng dụng $APP_DIR..."
        cd /root
        rm -rf "$APP_DIR"
    else
        log_warn "Thư mục ứng dụng được giữ lại tại: $APP_DIR"
        log_warn "(Để xóa sạch hoàn toàn cả package và thư mục, chạy: ./uninstall.sh --all)"
    fi

    echo ""
    log_info "✅ Đã gỡ bỏ claude-agy thành công!"
    exit 0
}

if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ] || [ "$1" = "uninstall" ]; then
    do_uninstall "$2"
fi

# ------------------------------------------------------------------------------
# INSTALL LOGIC
# ------------------------------------------------------------------------------
log_step "=== BẮT ĐẦU CÀI ĐẶT ỨNG DỤNG CLAUDE-AGY ==="

# 1. Tạo đầy đủ cấu trúc thư mục ứng dụng
log_info "1. Khởi tạo cấu trúc thư mục ứng dụng..."
mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOGS_DIR" "$SCRIPTS_DIR"

# 2. Kiểm tra các dependencies hệ thống
log_info "2. Kiểm tra dependencies hệ thống..."
if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1 || ! command -v nc >/dev/null 2>&1; then
    log_info "Cài đặt curl, tar, netcat-openbsd..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq curl tar netcat-openbsd
    else
        log_warn "Không tìm thấy apt-get. Vui lòng đảm bảo hệ thống có 'curl', 'tar', 'nc'."
    fi
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    log_error "Không tìm thấy Node.js hoặc npm! Vui lòng cài Node.js >= 18 trước."
    exit 1
fi

# 3. Cài đặt Claude Code CLI nếu chưa có
log_info "3. Kiểm tra Claude Code CLI (@anthropic-ai/claude-code)..."
if ! command -v claude >/dev/null 2>&1; then
    log_info "Đang cài đặt Claude Code CLI qua npm..."
    npm install -g @anthropic-ai/claude-code
else
    log_info "Claude Code CLI đã được cài đặt: $(claude --version 2>/dev/null || echo 'OK')"
fi

# 4. Tải CLIProxyAPI binary vào bin/ nếu chưa có
PROXY_BIN="$BIN_DIR/cli-proxy-api"
if [ ! -f "$PROXY_BIN" ]; then
    log_info "4. Tải CLIProxyAPI v${CPA_VERSION} vào $BIN_DIR..."
    TMP_DIR=$(mktemp -d)
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64)  CPA_ARCH="linux_amd64" ;;
        aarch64) CPA_ARCH="linux_aarch64" ;;
        arm64)   CPA_ARCH="linux_aarch64" ;;
        *) log_error "Kiến trúc $ARCH chưa được hỗ trợ tự động."; exit 1 ;;
    esac
    DOWNLOAD_URL="https://github.com/router-for-me/CLIProxyAPI/releases/download/v${CPA_VERSION}/CLIProxyAPI_${CPA_VERSION}_${CPA_ARCH}.tar.gz"
    curl -sSL "$DOWNLOAD_URL" -o "$TMP_DIR/cliproxy.tar.gz"
    tar -xzf "$TMP_DIR/cliproxy.tar.gz" -C "$TMP_DIR"
    cp "$TMP_DIR/cli-proxy-api" "$PROXY_BIN"
    chmod +x "$PROXY_BIN"
    rm -rf "$TMP_DIR"
else
    log_info "4. Binary proxy đã có sẵn: $PROXY_BIN"
    chmod +x "$PROXY_BIN"
fi

# 5. Khởi tạo config.yaml nếu chưa có
CONFIG_FILE="$CONFIG_DIR/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    log_info "5. Tạo file cấu hình $CONFIG_FILE..."
    cat << EOF > "$CONFIG_FILE"
host: "127.0.0.1"
port: 8318
auth-dir: "$DATA_DIR"
api-keys:
  - "sk-personal-claude-token"
remote-management:
  disable-control-panel: true
quota-exceeded:
  switch-project: true
  antigravity-credits: true
debug: false

antigravity:
  sensitive-words:
    - "system-conventions"
    - "system_conventions"
    - "system-directive"
    - "system_directive"
    - "Claude Agent SDK"
    - "Claude Code"
    - "Anthropic"
    - "claude"
    - "API"
    - "proxy"

oauth-model-alias:
  antigravity:
    - name: "gemini-3.8-flash-high"
      alias: "3.8"
    - name: "gemini-3.8-flash-high"
      alias: "3.8-high"
    - name: "gemini-3.7-flash-high"
      alias: "3.7"
    - name: "claude-opus-4-6-thinking"
      alias: "opus"
    - name: "claude-sonnet-4-6"
      alias: "sonnet"
    - name: "claude-opus-4-6-thinking"
      alias: "claude-opus-4-8"
    - name: "claude-opus-4-6-thinking"
      alias: "claude-opus-4-7"
    - name: "claude-opus-4-6-thinking"
      alias: "claude-opus-4-6"
    - name: "claude-opus-4-6-thinking"
      alias: "claude-opus-4-5"
    - name: "claude-sonnet-4-6"
      alias: "claude-sonnet-5"
    - name: "claude-sonnet-4-6"
      alias: "claude-sonnet-4-5"
    - name: "claude-sonnet-4-6"
      alias: "claude-3-7-sonnet-20250219"
    - name: "claude-sonnet-4-6"
      alias: "claude-3-7-sonnet"
    - name: "claude-sonnet-4-6"
      alias: "claude-3-5-sonnet-20241022"
    - name: "claude-sonnet-4-6"
      alias: "claude-3-5-sonnet"
    - name: "gemini-3.8-flash-high"
      alias: "claude-3-5-haiku-20241022"
    - name: "gemini-3.8-flash-high"
      alias: "claude-3-5-haiku"
    - name: "gemini-3.8-flash-high"
      alias: "claude-haiku-4-5"
EOF
fi

# 6. Khởi tạo settings.env nếu chưa có
SETTINGS_FILE="$CONFIG_DIR/settings.env"
if [ ! -f "$SETTINGS_FILE" ]; then
    log_info "6. Tạo file cấu hình $SETTINGS_FILE..."
    cat << 'EOF' > "$SETTINGS_FILE"
# Claude-Agy Application Settings
PORT=8318
AUTO_BYPASS_PERMISSIONS=true
DEFAULT_MODEL=""
EOF
fi

# 7. Đồng bộ token OAuth
log_info "7. Đồng bộ Antigravity OAuth Token..."
if [ -f "$SCRIPTS_DIR/sync-token.mjs" ]; then
    node "$SCRIPTS_DIR/sync-token.mjs" "$APP_DIR"
fi

# 8. Cấp quyền launcher và tạo Symlink toàn hệ thống
log_info "8. Cài đặt symlink toàn hệ thống: $SYMLINK_TARGET..."
chmod +x "$BIN_DIR/claude-agy"
ln -sf "$BIN_DIR/claude-agy" "$SYMLINK_TARGET"

# 9. Thêm function wrapper vào ~/.bashrc
log_info "9. Cập nhật ~/.bashrc..."
if [ -f "$BASHRC" ]; then
    sed -i "/$MARKER_START/,/$MARKER_END/d" "$BASHRC"
fi

cat << EOF >> "$BASHRC"
$MARKER_START
claude-agy() {
  "$SYMLINK_TARGET" "\$@"
}
$MARKER_END
EOF

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 CÀI ĐẶT THÀNH CÔNG CLAUDE-AGY APPLICATION!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "📂 Thư mục ứng dụng : ${BLUE}$APP_DIR${NC}"
echo -e "🔗 Executable symlink: ${BLUE}$SYMLINK_TARGET${NC}"
echo -e "⚙️  File cấu hình     : ${BLUE}$CONFIG_DIR/settings.env${NC}"
echo ""
echo -e "👉 Sử dụng lệnh:"
echo -e "   ${GREEN}claude-agy${NC}                   # Mở Claude Code (Bypass permission tự động)"
echo -e "   ${GREEN}claude-agy --model 3.8${NC}       # Dùng model Gemini 3.8 Flash"
echo -e "   ${GREEN}claude-agy --model sonnet${NC}    # Dùng model Claude Sonnet 4.6"
echo -e "   ${GREEN}claude-agy --model opus${NC}      # Dùng model Claude Opus Thinking"
echo -e "   ${GREEN}claude-agy --no-bypass${NC}       # Tắt bypass, hỏi quyền bình thường"
echo ""
echo -e "👉 Để gỡ cài đặt bất kỳ lúc nào:"
echo -e "   ${RED}$APP_DIR/uninstall.sh${NC}       # Hoặc: $APP_DIR/install.sh --uninstall"
echo -e "${GREEN}================================================================${NC}"
