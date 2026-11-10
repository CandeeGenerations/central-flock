#!/bin/sh
# Nightly restart of Messages + imagent. Long-running Messages on this Mac has
# silently stopped relaying SMS/RCS (2026-11-03) while iMessage kept working;
# Central Flock still marks those sends "sent", so a fresh process each night
# keeps blasts from quietly missing texters.

echo "$(date '+%Y-%m-%d %H:%M:%S') restarting Messages"

pkill -x Messages
sleep 5
pkill -9 -x Messages 2>/dev/null
killall imagent 2>/dev/null
sleep 5

open -g -a Messages
sleep 10

if pgrep -x Messages >/dev/null && pgrep -x imagent >/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ok: Messages $(pgrep -x Messages), imagent $(pgrep -x imagent)"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') FAILED: Messages or imagent not running"
  exit 1
fi
