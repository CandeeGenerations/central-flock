#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Central Flock
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 💬
# @raycast.packageName Central Flock

PROJECT_DIR="/Users/cgen01/repos/cgen/central-flock"
PID_FILE="$PROJECT_DIR/.central-flock.pid"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  "$PROJECT_DIR/scripts/central-flock.sh" stop
  echo "Central Flock stopped"
else
  "$PROJECT_DIR/scripts/central-flock.sh" start &
  echo "Starting Central Flock..."
fi
