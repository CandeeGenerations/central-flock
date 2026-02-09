#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Flock Pulse
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 💬
# @raycast.packageName Flock Pulse

PROJECT_DIR="/Users/cgen01/repos/cgen/flock-pulse"
PID_FILE="$PROJECT_DIR/.flock-pulse.pid"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  "$PROJECT_DIR/scripts/flock-pulse.sh" stop
  echo "Flock Pulse stopped"
else
  "$PROJECT_DIR/scripts/flock-pulse.sh" start
  echo "Flock Pulse started"
fi
