#!/usr/bin/env bash
# ==============================================================================
# One-Click Setup Script for Claude Code + Antigravity (claude-agy)
# Supports Linux / Ubuntu / Debian / WSL
# ==============================================================================
set -e

INSTALL_DIR="${TARGET_DIR:-$HOME/claude-agy}"
CPA_VERSION="7.3.17"
SYMLINK_PATH="/usr/local/bin/claude-agy"
BASHRC="$HOME/.bashrc"

GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${BLUE}==>${NC} Installing Claude-Agy into: ${GREEN}$INSTALL_DIR${NC}"

# 1. Create directories
mkdir -p "$INSTALL_DIR"/{bin,config,data,logs,scripts}

# 2. Install basic dependencies
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq curl tar netcat-openbsd python3
fi

# 3. Install Claude Code CLI if missing
if ! command -v claude >/dev/null 2>&1; then
    echo -e "${BLUE}==>${NC} Installing @anthropic-ai/claude-code..."
    npm install -g @anthropic-ai/claude-code
fi

# 4. Download cli-proxy-api binary
PROXY_BIN="$INSTALL_DIR/bin/cli-proxy-api"
if [ ! -f "$PROXY_BIN" ]; then
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64)  CPA_ARCH="linux_amd64" ;;
        aarch64) CPA_ARCH="linux_aarch64" ;;
        arm64)   CPA_ARCH="linux_aarch64" ;;
        *) echo -e "${RED}[ERROR] Architecture $ARCH is not supported.${NC}"; exit 1 ;;
    esac
    echo -e "${BLUE}==>${NC} Downloading CLIProxyAPI v${CPA_VERSION}..."
    curl -sSL "https://github.com/router-for-me/CLIProxyAPI/releases/download/v${CPA_VERSION}/CLIProxyAPI_${CPA_VERSION}_${CPA_ARCH}.tar.gz" | tar -xz -C /tmp
    mv /tmp/cli-proxy-api "$PROXY_BIN"
    chmod +x "$PROXY_BIN"
fi

# 5. Initialize config/config.yaml
cat << EOF > "$INSTALL_DIR/config/config.yaml"
host: "127.0.0.1"
port: 8318
auth-dir: "$INSTALL_DIR/data"
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
EOF

# 6. Initialize config/settings.env
cat << 'EOF' > "$INSTALL_DIR/config/settings.env"
PORT=8318
AUTO_BYPASS_PERMISSIONS=true
DEFAULT_MODEL="claude-sonnet-4-6"
EOF

# 7. Initialize scripts/sync-token.py
cat << 'EOF' > "$INSTALL_DIR/scripts/sync-token.py"
#!/usr/bin/env python3
import json, os, sys, time, base64

def sync_antigravity_token(app_dir):
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
        os.path.join(home, ".gemini", "jetski-standalone-oauth-token"),
        os.path.join(home, ".gemini", "oauth_creds.json")
    ]
    auth_file = os.path.join(app_dir, "data", "antigravity-auth.json")
    gemini_data = None
    source_path = None
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    gemini_data = json.load(f)
                source_path = p
                break
            except Exception:
                continue
    if not gemini_data:
        return False, "No Antigravity token found at ~/.gemini"
    try:
        tok = gemini_data.get("token", gemini_data)
        id_tok = gemini_data.get("id_token", "")
        access_tok = tok.get("access_token", gemini_data.get("access_token", ""))
        refresh_tok = tok.get("refresh_token", gemini_data.get("refresh_token", ""))
        expiry_val = tok.get("expiry", gemini_data.get("expiry_date", ""))
        email = "user@antigravity"
        if id_tok and "." in id_tok:
            try:
                p = json.loads(base64.urlsafe_b64decode(id_tok.split(".")[1] + "==").decode("utf-8"))
                email = p.get("email", email)
            except Exception:
                pass
        auth_payload = {
            "type": "antigravity",
            "email": email,
            "access_token": access_tok,
            "refresh_token": refresh_tok,
            "expires_in": 3600,
            "timestamp": int(time.time() * 1000),
            "expired": expiry_val
        }
        with open(auth_file, "w", encoding="utf-8") as f:
            json.dump(auth_payload, f, indent=2)
        return True, f"{email} (from {source_path})"
    except Exception as e:
        return False, str(e)

def setup_trust():
    p = os.path.expanduser("~/.claude.json")
    try:
        data = {}
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
        data["bypassPermissionsModeAccepted"] = True
        data["hasCompletedOnboarding"] = True
        for proj in data.get("projects", {}).values():
            if isinstance(proj, dict): proj["hasTrustDialogAccepted"] = True
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

if __name__ == "__main__":
    setup_trust()
    app = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ok, msg = sync_antigravity_token(app)
    if ok: print(f"[OK] Token synced: {msg}")
    else: print(f"[INFO] {msg}")
EOF
chmod +x "$INSTALL_DIR/scripts/sync-token.py"

# 8. Initialize bin/claude-agy
cat << 'EOF' > "$INSTALL_DIR/bin/claude-agy"
#!/usr/bin/env bash
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
APP_DIR="$(cd -P "$(dirname "$SOURCE")/.." >/dev/null 2>&1 && pwd)"

PORT=8318
AUTO_BYPASS_PERMISSIONS=true
DEFAULT_MODEL=""
[ -f "$APP_DIR/config/settings.env" ] && source "$APP_DIR/config/settings.env"

mkdir -p "$APP_DIR/logs"
python3 "$APP_DIR/scripts/sync-token.py" "$APP_DIR" >/dev/null 2>&1 || true

ENABLE_BYPASS=false
[ "$AUTO_BYPASS_PERMISSIONS" = "true" ] && ENABLE_BYPASS=true

MODEL_SPECIFIED=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --bypass|-y) ENABLE_BYPASS=true ;;
    --no-bypass) ENABLE_BYPASS=false ;;
    --dangerously-skip-permissions) ENABLE_BYPASS=true ;;
    --model|-m|--model=*) MODEL_SPECIFIED=true; ARGS+=("$arg") ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [ "$MODEL_SPECIFIED" = false ] && [ -n "$DEFAULT_MODEL" ]; then
  ARGS=("--model" "$DEFAULT_MODEL" "${ARGS[@]}")
fi

if [ "$ENABLE_BYPASS" = true ]; then
  export IS_SANDBOX="1"
  HAS_FLAG=false
  for a in "${ARGS[@]}"; do [ "$a" = "--dangerously-skip-permissions" ] && HAS_FLAG=true && break; done
  [ "$HAS_FLAG" = false ] && ARGS=("--dangerously-skip-permissions" "${ARGS[@]}")
fi

PROXY_PID=""
STARTED_PROXY=false
if ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
  "$APP_DIR/bin/cli-proxy-api" --config "$APP_DIR/config/config.yaml" > "$APP_DIR/logs/proxy.log" 2>&1 &
  PROXY_PID=$!
  STARTED_PROXY=true
  trap 'if [ "$STARTED_PROXY" = true ] && [ -n "$PROXY_PID" ]; then kill "$PROXY_PID" 2>/dev/null; wait "$PROXY_PID" 2>/dev/null || true; fi' EXIT INT TERM
  local_retries=0
  while ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; do
    sleep 0.2
    local_retries=$((local_retries + 1))
    if [ $local_retries -gt 15 ]; then
      echo ">> [ERROR] Failed to start Proxy. Log: $APP_DIR/logs/proxy.log"
      exit 1
    fi
  done
fi

ANTHROPIC_BASE_URL="http://127.0.0.1:$PORT" \
ANTHROPIC_AUTH_TOKEN="sk-personal-claude-token" \
CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="1" \
claude "${ARGS[@]}"
EXIT_CODE=$?

if [ "$STARTED_PROXY" = true ] && [ -n "$PROXY_PID" ]; then
  kill "$PROXY_PID" 2>/dev/null
  wait "$PROXY_PID" 2>/dev/null || true
fi
trap - EXIT INT TERM
exit $EXIT_CODE
EOF
chmod +x "$INSTALL_DIR/bin/claude-agy"

# 9. Create system-wide symlink
sudo ln -sf "$INSTALL_DIR/bin/claude-agy" "$SYMLINK_PATH" 2>/dev/null || ln -sf "$INSTALL_DIR/bin/claude-agy" "$SYMLINK_PATH"

# 10. Create uninstaller script
cat << 'EOF' > "$INSTALL_DIR/uninstall.sh"
#!/usr/bin/env bash
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYMLINK_PATH="/usr/local/bin/claude-agy"

echo ">> Starting Claude-Agy uninstallation..."
pkill -f "cli-proxy-api.*8318" 2>/dev/null || true
if [ -L "$SYMLINK_PATH" ] || [ -f "$SYMLINK_PATH" ]; then
    echo ">> Removing symlink $SYMLINK_PATH..."
    sudo rm -f "$SYMLINK_PATH" 2>/dev/null || rm -f "$SYMLINK_PATH"
fi
echo ">> Uninstallation complete. To delete the application directory, run: rm -rf \"$APP_DIR\""
EOF
chmod +x "$INSTALL_DIR/uninstall.sh"

# 11. Initial token sync
python3 "$INSTALL_DIR/scripts/sync-token.py" "$INSTALL_DIR"

echo -e "\n${GREEN}[SUCCESS] Claude-Agy installation completed!${NC}"
echo -e "Available command: ${GREEN}claude-agy${NC}"
echo -e "Uninstaller:       ${YELLOW}$INSTALL_DIR/uninstall.sh${NC}"
