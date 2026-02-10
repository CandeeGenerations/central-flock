#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Stop Central Flock
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 💬
# @raycast.packageName Central Flock

PROJECT_DIR="/Users/cgen01/repos/cgen/central-flock"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

"$PROJECT_DIR/scripts/central-flock.sh" stop
