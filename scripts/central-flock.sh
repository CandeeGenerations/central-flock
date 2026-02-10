#!/bin/bash
# Central Flock - Start/Stop/Status
# Uses the dev server directly so changes are always live

# Ensure node/pnpm are in PATH (needed when launched from Raycast/launchd)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
FNM_PATH="$HOME/Library/Application Support/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
  eval "$(fnm env)"
fi

PROJECT_DIR="/Users/cgen01/repos/cgen/central-flock"
PID_FILE="$PROJECT_DIR/.central-flock.pid"
LOG_FILE="$PROJECT_DIR/.central-flock.log"
APP_URL="http://localhost:5173"

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Central Flock is already running (PID $(cat "$PID_FILE"))"
    /usr/bin/open "$APP_URL"
    return 0
  fi

  echo "Starting Central Flock..."
  cd "$PROJECT_DIR" || exit 1
  NODE_BIN="$HOME/.local/share/fnm/node-versions/v25.6.0/installation/bin"
  nohup env PATH="$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # Wait for server to be ready, then open in browser
  (
    for i in $(seq 1 30); do
      if curl -s "$APP_URL" > /dev/null 2>&1; then
        /usr/bin/open "$APP_URL"
        exit 0
      fi
      sleep 1
    done
  ) &
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Central Flock is not running (no PID file)"
    return 0
  fi

  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping Central Flock (PID $PID)..."
    # Kill the process group to get all child processes
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null
    # Also clean up any remaining node processes from this project
    pkill -f "central-flock.*vite" 2>/dev/null
    pkill -f "central-flock.*tsx watch" 2>/dev/null
    rm -f "$PID_FILE"
    echo "Central Flock stopped"
  else
    echo "Central Flock process not found, cleaning up"
    rm -f "$PID_FILE"
  fi
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "running"
  else
    rm -f "$PID_FILE" 2>/dev/null
    echo "stopped"
  fi
}

toggle() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    stop
  else
    start
  fi
}

case "${1:-toggle}" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  toggle) toggle ;;
  *)      echo "Usage: central-flock.sh [start|stop|status|toggle]" ;;
esac
