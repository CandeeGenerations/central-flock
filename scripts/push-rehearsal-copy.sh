#!/bin/bash
# Sends Railway a fresh copy of the live data for the pre-cut-over rehearsal
# (plans/railway-cutover.md, Phase 2). Runs nightly at the end of backup-dbs.sh,
# or by hand:
#
#   bash scripts/push-rehearsal-copy.sh
#
# 1. Refuses unless the Railway service is in sandbox mode, so it can never
#    overwrite live data. (The server refuses the import outside sandbox too.)
# 2. Takes a consistent copy of the live DB and packs the iCloud uploads.
# 3. Uploads both to /data/incoming on the Railway volume.
# 4. Redeploys; the sandbox-only import loads them at boot.
# 5. Waits for the deploy and reports how it went.
#
# Uses the Railway CLI's saved login (railway login, as this user). Set
# RAILWAY_TOKEN to use a project token instead. Retire this script at cut-over
# (Phase 4 step 2): after that Railway is production and nothing pushes to it.

set -euo pipefail

RAILWAY="${RAILWAY_BIN:-/opt/homebrew/bin/railway}"
REPO=/Users/cgen01/repos/cgen/central-flock
SERVICE=central-flock
VOLUME=central-flock-volume
SRC_DB="$REPO/central-flock.db"
UPLOADS="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock"
UPLOAD_DIRS=(events-story music-scans prayer-sheets scan-images schedule-logos special-music)
DEPLOY_WAIT_SECONDS=900

cd "$REPO" # the CLI finds the linked project from this folder
log() { echo "[rehearsal-push $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
rw() { "$RAILWAY" "$@" 2>&1 | grep -v -e 'agent tooling' -e 'Setup: ' -e 'use-railway' -e '^Tip:' || true; }

# --- 1. Railway must be a sandbox -----------------------------------------
if ! "$RAILWAY" variable list --service "$SERVICE" --kv 2>/dev/null | grep -qx 'CENTRAL_FLOCK_SANDBOX=1'; then
  log "REFUSING: Railway's $SERVICE is not in sandbox mode (or the CLI is not logged in). Nothing sent."
  exit 1
fi

# --- 2. Consistent copy + uploads -----------------------------------------
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

/usr/bin/sqlite3 "$SRC_DB" ".backup '$TMP/central-flock.db'"
if [ "$(/usr/bin/sqlite3 "$TMP/central-flock.db" 'pragma integrity_check')" != "ok" ]; then
  log "Copy failed its integrity check. Nothing sent."
  exit 1
fi
PEOPLE=$(/usr/bin/sqlite3 "$TMP/central-flock.db" 'select count(*) from people')

present=()
for d in "${UPLOAD_DIRS[@]}"; do [ -d "$UPLOADS/$d" ] && present+=("$d"); done
/usr/bin/tar -czf "$TMP/uploads.tar.gz" -C "$UPLOADS" "${present[@]}"
log "Copy ready: $(du -h "$TMP/central-flock.db" | cut -f1) DB ($PEOPLE people), $(du -h "$TMP/uploads.tar.gz" | cut -f1) uploads"

# --- 3. Upload to the volume ----------------------------------------------
"$RAILWAY" volume files --volume "$VOLUME" upload "$TMP/central-flock.db" /incoming/central-flock.db --overwrite >/dev/null
"$RAILWAY" volume files --volume "$VOLUME" upload "$TMP/uploads.tar.gz" /incoming/uploads.tar.gz --overwrite >/dev/null
log "Uploaded to /data/incoming"

# --- 4. Redeploy so the import runs ----------------------------------------
before=$("$RAILWAY" deployment list --service "$SERVICE" 2>/dev/null | sed -n 2p | awk '{print $1}')
rw redeploy --service "$SERVICE" --yes >/dev/null

# --- 5. Wait for it ---------------------------------------------------------
deadline=$(( $(date +%s) + DEPLOY_WAIT_SECONDS ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  line=$("$RAILWAY" deployment list --service "$SERVICE" 2>/dev/null | sed -n 2p)
  id=$(echo "$line" | awk '{print $1}')
  status=$(echo "$line" | awk -F'|' '{gsub(/ /, "", $2); print $2}')
  if [ -n "$id" ] && [ "$id" != "$before" ]; then
    case "$status" in
      SUCCESS) log "Deployed $id; Railway imported the copy ($PEOPLE people)."; exit 0 ;;
      FAILED | CRASHED) log "Deploy $id $status. Check: railway logs $id"; exit 1 ;;
    esac
  fi
  sleep 10
done
log "Gave up waiting for the deploy after ${DEPLOY_WAIT_SECONDS}s. Check: railway deployment list"
exit 1
