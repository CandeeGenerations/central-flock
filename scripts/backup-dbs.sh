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

# Retain 5 newest dated folders
cd "$DEST"
ls -1d 20*/ 2>/dev/null | sort -r | tail -n +6 | xargs -r rm -rf --
