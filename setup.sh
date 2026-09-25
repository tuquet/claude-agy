#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
if [ -f "$DIR/scripts/setup.sh" ]; then
    exec "$DIR/scripts/setup.sh" "$@"
else
    curl -fsSL https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.sh | bash
fi
