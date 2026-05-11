#!/bin/sh
set -eu

DATE=$(date +%Y-%m-%d)
SRC="/Users/cgen01/repos/cgen/central-flock"
DEST="/Users/cgen01/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock"
TMP="$DEST/.tmp-$DATE"

rm -rf "$TMP"
mkdir -p "$TMP"

for DB_PATH in "$SRC"/*.db; do
  [ -f "$DB_PATH" ] || continue
  DB_NAME=$(basename "$DB_PATH")
  cp -p "$DB_PATH" "$TMP/$DB_NAME"
  [ -f "${DB_PATH}-wal" ] && cp -p "${DB_PATH}-wal" "$TMP/${DB_NAME}-wal"
  [ -f "${DB_PATH}-shm" ] && cp -p "${DB_PATH}-shm" "$TMP/${DB_NAME}-shm"
done

rm -rf "$DEST/$DATE"
mv "$TMP" "$DEST/$DATE"

# Retain 5 newest dated folders. Use `find` with absolute paths rather than
# `cd $DEST && ls 20*/`: under launchd at 03:00 the relative glob was returning
# nothing for this iCloud Drive path, so prunes silently no-op'd and 20+
# folders accumulated.
ALL=$(find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort -r)
COUNT=$(printf '%s\n' "$ALL" | grep -c . || true)
echo "Found $COUNT dated backup folder(s)."

if [ "$COUNT" -gt 5 ]; then
  printf '%s\n' "$ALL" | tail -n +6 | while IFS= read -r OLD; do
    [ -n "$OLD" ] || continue
    echo "Pruning old backup: $OLD"
    rm -rf -- "$OLD"
  done
fi

echo "Retained backups:"
printf '%s\n' "$ALL" | head -n 5 | sed 's|^|  |'

# Re-count after the prune attempt; if we still have >=10 dated folders the
# prune didn't fire (or didn't succeed), so alert n8n.
FINAL=$(find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort -r)
FINAL_COUNT=$(printf '%s\n' "$FINAL" | grep -c . || true)

if [ "$FINAL_COUNT" -ge 10 ]; then
  NEWEST=$(printf '%s\n' "$FINAL" | head -n 1)
  OLDEST=$(printf '%s\n' "$FINAL" | tail -n 1)
  NEWEST=$(basename "$NEWEST" 2>/dev/null || echo "")
  OLDEST=$(basename "$OLDEST" 2>/dev/null || echo "")
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  HOSTNAME_SHORT=$(hostname -s)
  echo "Alerting n8n: $FINAL_COUNT folders >= threshold 10."
  curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    --max-time 15 \
    -d "{
  \"source\": \"central-flock-backup\",
  \"host\": \"$HOSTNAME_SHORT\",
  \"timestamp\": \"$TIMESTAMP\",
  \"event\": \"backup_folder_count_exceeded\",
  \"threshold\": 10,
  \"count\": $FINAL_COUNT,
  \"dest\": \"$DEST\",
  \"newest\": \"$NEWEST\",
  \"oldest\": \"$OLDEST\",
  \"message\": \"central-flock daily prune appears to be failing — $FINAL_COUNT dated backup folders found.\"
}" \
    https://workflows.cgen.cc/webhook/3a5d87df-b435-4ac8-831c-e729a3632af0 \
    || echo "Alert webhook failed (non-fatal)."
fi
