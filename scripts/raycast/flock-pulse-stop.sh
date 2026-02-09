#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Stop Flock Pulse
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 💬
# @raycast.packageName Flock Pulse

PROJECT_DIR="/Users/cgen01/repos/cgen/flock-pulse"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

"$PROJECT_DIR/scripts/flock-pulse.sh" stop
