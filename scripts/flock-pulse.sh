#!/bin/bash
# Flock Pulse - Start/Stop/Status
# Uses the dev server directly so changes are always live

PROJECT_DIR="/Users/cgen01/repos/cgen/flock-pulse"
PID_FILE="$PROJECT_DIR/.flock-pulse.pid"
LOG_FILE="$PROJECT_DIR/.flock-pulse.log"
APP_URL="http://localhost:5173"

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Flock Pulse is already running (PID $(cat "$PID_FILE"))"
    open "$APP_URL"
    return 0
  fi

  echo "Starting Flock Pulse..."
  cd "$PROJECT_DIR" || exit 1
  nohup pnpm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # Wait for server to be ready
  for i in $(seq 1 30); do
    if curl -s "$APP_URL" > /dev/null 2>&1; then
      echo "Flock Pulse is running at $APP_URL (PID $(cat "$PID_FILE"))"
      open "$APP_URL"
      return 0
    fi
    sleep 1
  done

  echo "Flock Pulse started but may still be loading. Check $LOG_FILE"
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Flock Pulse is not running (no PID file)"
    return 0
  fi

  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping Flock Pulse (PID $PID)..."
    # Kill the process group to get all child processes
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null
    # Also clean up any remaining node processes from this project
    pkill -f "flock-pulse.*vite" 2>/dev/null
    pkill -f "flock-pulse.*tsx watch" 2>/dev/null
    rm -f "$PID_FILE"
    echo "Flock Pulse stopped"
  else
    echo "Flock Pulse process not found, cleaning up"
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
  *)      echo "Usage: flock-pulse.sh [start|stop|status|toggle]" ;;
esac
