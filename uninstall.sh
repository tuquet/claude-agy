#!/usr/bin/env bash
# ==============================================================================
# Claude-Agy Uninstaller Shortcut
# ==============================================================================
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$APP_DIR/install.sh" --uninstall "$@"
