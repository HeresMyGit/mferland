#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${MFERLAND_LAUNCHD_LABEL:-com.mferland.launch}"
PORT="${PORT:-2567}"
DOMAIN="gui/$(id -u)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/mferland"
STDOUT_LOG="$LOG_DIR/prod-server.log"
STDERR_LOG="$LOG_DIR/prod-server.err"
PATH_VALUE="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  install    Install and start the macOS LaunchAgent
  uninstall  Stop and remove the LaunchAgent
  start      Start the installed LaunchAgent
  stop       Stop the LaunchAgent for this login session
  restart    Restart the LaunchAgent
  status     Show launchd state and local HTTP health
  logs       Tail prod server logs
  build      Build the prod server and web app
  run        Internal launchd entrypoint

LaunchAgent: $PLIST_PATH
Logs:        $STDOUT_LOG
             $STDERR_LOG
EOF
}

ensure_log_dir() {
  mkdir -p "$LOG_DIR"
}

write_plist() {
  mkdir -p "$PLIST_DIR"
  ensure_log_dir
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT_DIR/scripts/mferland-prod-server.sh</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>$PATH_VALUE</string>
    <key>HOST</key>
    <string>0.0.0.0</string>
    <key>MFERLAND_SERVE_WEB_DIST</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>
</dict>
</plist>
EOF
  plutil -lint "$PLIST_PATH" >/dev/null
}

bootout_label() {
  local label="$1"
  launchctl bootout "$DOMAIN/$label" >/dev/null 2>&1 || true
}

bootstrap_service() {
  local attempt
  for attempt in 1 2 3; do
    if launchctl bootstrap "$DOMAIN" "$PLIST_PATH"; then
      return 0
    fi
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$attempt"
  done

  launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
}

cleanup_conflicting_jobs() {
  # This was an ad hoc submitted job that repeatedly collided with port 2567.
  bootout_label "local.mferland.server"
}

install_service() {
  write_plist
  bootout_label "$LABEL"
  cleanup_conflicting_jobs
  bootstrap_service
  launchctl enable "$DOMAIN/$LABEL"
  launchctl kickstart -k "$DOMAIN/$LABEL"
  echo "Installed and started $LABEL"
  status_service
}

uninstall_service() {
  bootout_label "$LABEL"
  rm -f "$PLIST_PATH"
  echo "Removed $PLIST_PATH"
}

start_service() {
  if [[ ! -f "$PLIST_PATH" ]]; then
    echo "LaunchAgent is not installed yet. Run: $0 install" >&2
    exit 1
  fi

  if ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    bootstrap_service
  fi

  launchctl enable "$DOMAIN/$LABEL"
  launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  status_service
}

stop_service() {
  bootout_label "$LABEL"
  echo "Stopped $LABEL for this login session. It will start again on the next login unless uninstalled."
}

restart_service() {
  if [[ ! -f "$PLIST_PATH" ]]; then
    echo "LaunchAgent is not installed yet. Installing it now."
    install_service
    return
  fi

  if ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    bootstrap_service
  fi

  launchctl enable "$DOMAIN/$LABEL"
  launchctl kickstart -k "$DOMAIN/$LABEL"
  status_service
}

status_service() {
  echo "LaunchAgent: $PLIST_PATH"
  if [[ -f "$PLIST_PATH" ]]; then
    echo "Installed:   yes"
  else
    echo "Installed:   no"
  fi

  local list_line
  list_line="$(launchctl list | awk -v label="$LABEL" '$3 == label {print $0}')"
  if [[ -n "$list_line" ]]; then
    echo "Loaded:      yes"
    echo "launchctl:   $list_line"
  else
    echo "Loaded:      no"
  fi

  if curl -fsSI --max-time 3 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    echo "Health:      OK http://127.0.0.1:$PORT/"
  else
    echo "Health:      FAIL http://127.0.0.1:$PORT/"
    echo "Logs:        $STDOUT_LOG"
    echo "             $STDERR_LOG"
  fi
}

tail_logs() {
  ensure_log_dir
  touch "$STDOUT_LOG" "$STDERR_LOG"
  tail -n "${TAIL_LINES:-120}" -f "$STDOUT_LOG" "$STDERR_LOG"
}

build_prod() {
  cd "$ROOT_DIR"
  export PATH="$PATH_VALUE"
  npm run build
}

run_server() {
  ensure_log_dir
  cd "$ROOT_DIR"
  export PATH="$PATH_VALUE"
  export HOST="${HOST:-0.0.0.0}"
  export MFERLAND_SERVE_WEB_DIST="${MFERLAND_SERVE_WEB_DIST:-1}"

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm was not found on PATH: $PATH" >&2
    exit 127
  fi

  if [[ ! -f "$ROOT_DIR/apps/server/dist/index.js" || ! -f "$ROOT_DIR/apps/web/dist/index.html" ]]; then
    echo "Prod build output is missing. Run: $0 build" >&2
    exit 78
  fi

  exec npm run launch:server
}

case "${1:-}" in
  install) install_service ;;
  uninstall) uninstall_service ;;
  start) start_service ;;
  stop) stop_service ;;
  restart) restart_service ;;
  status) status_service ;;
  logs) tail_logs ;;
  build) build_prod ;;
  run) run_server ;;
  "" | -h | --help | help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
