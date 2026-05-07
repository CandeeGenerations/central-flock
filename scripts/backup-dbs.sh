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
