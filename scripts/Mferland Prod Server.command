#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/mfergpt/dev/mferland"
SERVICE="$ROOT_DIR/scripts/mferland-prod-server.sh"

cd "$ROOT_DIR"

echo "Mferland prod server"
echo "===================="
echo

if [[ ! -f "$HOME/Library/LaunchAgents/com.mferland.launch.plist" ]]; then
  "$SERVICE" install
else
  "$SERVICE" restart
fi

echo
echo "Close this Terminal window when you are done watching logs."
echo "The prod server keeps running in launchd."
echo

exec "$SERVICE" logs
