#!/bin/bash
# The iCloud backup after cut-over (plans/railway-cutover.md, Phase 4 step 9).
# Railway is production then, so instead of copying the Mac's DB (backup-dbs.sh)
# this downloads Railway's own nightly snapshot into iCloud:
#
#   <iCloud>/Backups/central-flock/<date>/central-flock.db
#   <iCloud>/Backups/central-flock/<date>/uploads.tar.gz
#
# Run by launchd (cc.cgen.central-flock-backup) at 03:00, or by hand:
#
#   bash scripts/backup-dbs-pull.sh
#
# 1. Waits (up to WAIT_SECONDS) for tonight's snapshot: Railway takes it at
#    03:00 New York time, writing .tmp files and renaming them when complete,
#    so a night counts once both final files are in its folder.
# 2. Downloads both files with the Railway CLI (no ssh needed).
# 3. Checks the DB's integrity before it replaces anything in iCloud.
# 4. Keeps the newest KEEP dated folders, like backup-dbs.sh, without listing
#    the iCloud folder (see the note at step 4).
# Alerts n8n when the snapshot is stale, missing or broken.
#
# Uses the Railway CLI's saved login, as push-rehearsal-copy.sh does.
# BACKUP_DEST overrides the iCloud folder (for testing).

set -euo pipefail

RAILWAY="${RAILWAY_BIN:-/opt/homebrew/bin/railway}"
REPO=/Users/cgen01/repos/cgen/central-flock
VOLUME=central-flock-volume
DEST="${BACKUP_DEST:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock}"
KEEP=5
WAIT_SECONDS="${WAIT_SECONDS:-1800}"
ALERT_URL=https://workflows.cgen.cc/webhook/3a5d87df-b435-4ac8-831c-e729a3632af0

cd "$REPO" # the CLI finds the linked project from this folder
log() { echo "[backup-pull $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

alert() {
  local event=$1 message=$2
  log "ALERT: $message"
  curl -fsS -X POST -H 'Content-Type: application/json' --max-time 15 \
    -d "{\"source\": \"central-flock-backup\", \"host\": \"$(hostname -s)\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"event\": \"$event\", \"message\": \"$message\"}" \
    "$ALERT_URL" >/dev/null || log "Alert webhook failed (non-fatal)."
}

vol() { "$RAILWAY" volume files --volume "$VOLUME" "$@" 2>/dev/null; }

# Newest dated folder whose snapshot is complete (both final files present).
newest_complete() {
  local days day
  days=$(vol list /backups --json | grep -o '"name": "20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]"' | grep -o '20[0-9-]*' | sort -r) || return 0
  for day in $days; do
    local files
    files=$(vol list "/backups/$day" --json) || continue
    if echo "$files" | grep -q '"name": "central-flock.db"' && echo "$files" | grep -q '"name": "uploads.tar.gz"'; then
      echo "$day"
      return 0
    fi
  done
}

# --- 1. Wait for tonight's snapshot ---------------------------------------
TODAY=$(TZ=America/New_York date +%Y-%m-%d)
deadline=$(($(date +%s) + WAIT_SECONDS))
while :; do
  DAY=$(newest_complete)
  [ "$DAY" = "$TODAY" ] && break
  [ "$(date +%s)" -ge "$deadline" ] && break
  sleep 60
done

if [ -z "$DAY" ]; then
  alert backup_pull_failed "No complete snapshot on Railway (or the CLI is not logged in). Nothing pulled."
  exit 1
fi
[ "$DAY" != "$TODAY" ] && alert backup_pull_stale "Tonight's Railway snapshot is missing; pulling the newest, $DAY."

# --- 2. Download ------------------------------------------------------------
mkdir -p "$DEST"
# Not a dot name: iCloud Drive marks dot-named items hidden while they sync, and
# the flag stayed on the dated folder after the rename, hiding it in Finder.
TMP="$DEST/$DAY.partial"
rm -rf "$TMP"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

vol download "/backups/$DAY/central-flock.db" "$TMP/central-flock.db" --overwrite >/dev/null
vol download "/backups/$DAY/uploads.tar.gz" "$TMP/uploads.tar.gz" --overwrite >/dev/null

# --- 3. Check before replacing anything -------------------------------------
if [ "$(/usr/bin/sqlite3 "$TMP/central-flock.db" 'pragma integrity_check' 2>&1)" != "ok" ]; then
  alert backup_pull_failed "Railway snapshot $DAY failed its integrity check. Previous iCloud backups kept."
  exit 1
fi
if ! /usr/bin/tar -tzf "$TMP/uploads.tar.gz" >/dev/null 2>&1; then
  alert backup_pull_failed "Railway snapshot $DAY has an unreadable uploads.tar.gz. Previous iCloud backups kept."
  exit 1
fi
PEOPLE=$(/usr/bin/sqlite3 "$TMP/central-flock.db" 'select count(*) from people')
# Opening the WAL-mode copy above leaves empty -wal/-shm files beside it; the .db alone is complete.
rm -f "$TMP/central-flock.db-wal" "$TMP/central-flock.db-shm"

rm -rf "$DEST/$DAY"
mv "$TMP" "$DEST/$DAY"
trap - EXIT
log "Pulled $DAY: $(du -h "$DEST/$DAY/central-flock.db" | cut -f1) DB ($PEOPLE people), $(du -h "$DEST/$DAY/uploads.tar.gz" | cut -f1) uploads"

# --- 4. Keep the newest KEEP ------------------------------------------------
# Under launchd, macOS's iCloud Drive privacy rules let /bin/bash look up a
# path and change folders this job created, but not list $DEST (find and globs
# fail with "Operation not permitted") or change folders another app created.
# So probe each dated name in the last WINDOW days instead of listing.
WINDOW=60
dated_folders() {
  local i day
  for ((i = 0; i <= WINDOW; i++)); do
    day=$(date -j -v-"${i}"d -f %Y-%m-%d "$TODAY" +%Y-%m-%d)
    [ -d "$DEST/$day" ] && echo "$DEST/$day"
  done
  return 0
}

ALL=$(dated_folders)
PRUNE_FAILED=0
while IFS= read -r OLD; do
  [ -n "$OLD" ] || continue
  log "Pruning old backup: $OLD"
  rm -rf -- "$OLD" || PRUNE_FAILED=1
done < <(printf '%s\n' "$ALL" | tail -n +$((KEEP + 1)))
[ "$PRUNE_FAILED" = 1 ] &&
  alert backup_prune_failed "central-flock prune could not remove an old iCloud backup. Folders another app made must be deleted by hand in Finder."

FINAL_COUNT=$(dated_folders | grep -c . || true)
[ "$FINAL_COUNT" -ge 10 ] && alert backup_folder_count_exceeded "central-flock prune appears to be failing: $FINAL_COUNT dated backup folders found."
log "Done. $FINAL_COUNT dated folder(s) kept."
