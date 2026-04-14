# n8n Daily Backup of Central Flock SQLite DBs to iCloud Drive

## Context

Central Flock runs four SQLite databases on the host Mac, all in WAL mode:

| DB        | Path on host                                              | Opened in                      |
| --------- | --------------------------------------------------------- | ------------------------------ |
| Main      | `/Users/cgen01/repos/cgen/central-flock/central-flock.db` | `server/db/index.ts`           |
| Devotions | `/Users/cgen01/repos/cgen/central-flock/devotions.db`     | `server/db-devotions/index.ts` |
| Nursery   | `/Users/cgen01/repos/cgen/central-flock/nursery.db`       | `server/db-nursery/index.ts`   |
| Quotes    | `/Users/cgen01/repos/cgen/central-flock/quotes.db`        | `server/db-quotes/index.ts`    |

There is currently no backup — a disk loss would destroy all contacts, devotion pipeline state, nursery schedule, and quotes. The user already has n8n running in Docker on the same Mac and wants to use it as the scheduler + executor. Backups go to iCloud Drive so they sync off-device.

**Retention:** keep the 5 most recent daily backups per DB.

## Approach (user-selected)

**Raw file copy, no app-level checkpoint, no custom Docker image.** Each daily run auto-discovers every `*.db` file at the repo root (`/db-source/*.db` inside the container) and copies it plus its `-wal` / `-shm` sidecars into a date-stamped folder in iCloud. Old folders past 5 are deleted.

- No code change to Central Flock.
- No Dockerfile change to n8n.
- Entire backup logic lives in a single `Execute Command` node shell script.
- **Future-proof:** adding a new sub-app DB is zero-touch for backups — drop the new `.db` file next to the existing ones (same pattern as `central-flock.db`, `devotions.db`, `nursery.db`, `quotes.db`) and the next nightly run picks it up automatically. No plan edit, no workflow change.
- Atomic-ish writes via `.tmp-<date>` staging folder + `mv` so a mid-run failure doesn't rotate a partial backup into the keep-5 window.
- Small risk window: if the app writes to a DB during the exact second of the copy, the snapshot could be inconsistent. Mitigated by scheduling in the middle of the night and copying the WAL sidecars alongside the main file (SQLite can recover from the WAL on restore).

## Backup layout in iCloud

```
~/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock/
  2026-04-14/
    central-flock.db
    central-flock.db-wal
    central-flock.db-shm
    devotions.db
    devotions.db-wal
    devotions.db-shm
    nursery.db
    nursery.db-wal
    nursery.db-shm
    quotes.db
    quotes.db-wal
    quotes.db-shm
  2026-04-13/ ...
  (up to 5 dated folders)
```

New DBs added to the repo root appear inside the next dated folder automatically.

## Implementation steps

### 1. Create the iCloud backup folder (one-time, on host)

```sh
mkdir -p "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock"
```

### 2. Add two bind mounts to the n8n container

Find the existing n8n `docker-compose.yml` (or equivalent `docker run` command) and add:

```yaml
services:
  n8n:
    # ...existing config...
    volumes:
      # existing: - n8n_data:/home/node/.n8n
      - /Users/cgen01/repos/cgen/central-flock:/db-source:ro
      - /Users/cgen01/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock:/backup-dest
```

Notes:

- `:ro` makes the source read-only — n8n cannot damage the live DB.
- The iCloud path contains a literal space ("Mobile Documents") and literal tildes in `com~apple~CloudDocs` — YAML handles both fine unquoted, but quote the whole path if using `docker run`.
- macOS file sharing: `/Users/...` paths are shared by Docker Desktop by default. If a write permission error occurs on the dest mount, add `user: "${UID}:${GID}"` under the n8n service or `chmod 777` the backup folder (the folder itself, not its parent).
- Restart the container: `docker compose up -d` (from wherever the n8n compose file lives).

### 3. Create the n8n workflow

**Node 1 — Schedule Trigger**

- Trigger interval: days, every 1 day, at `03:00`.

**Node 2 — Execute Command**

- Command field (single shell invocation):

```sh
sh -c '
set -eu
DATE=$(date +%Y-%m-%d)
SRC=/db-source
DEST=/backup-dest
TMP="$DEST/.tmp-$DATE"

rm -rf "$TMP"
mkdir -p "$TMP"

# Auto-discover every *.db at the repo root and copy each with its WAL sidecars.
# New DBs dropped into the repo root are picked up automatically on the next run.
for DB_PATH in "$SRC"/*.db; do
  [ -f "$DB_PATH" ] || continue  # no matches → skip
  DB_NAME=$(basename "$DB_PATH")
  cp -p "$DB_PATH" "$TMP/$DB_NAME"
  [ -f "${DB_PATH}-wal" ] && cp -p "${DB_PATH}-wal" "$TMP/${DB_NAME}-wal"
  [ -f "${DB_PATH}-shm" ] && cp -p "${DB_PATH}-shm" "$TMP/${DB_NAME}-shm"
done

# Atomically swap the staging folder into place
rm -rf "$DEST/$DATE"
mv "$TMP" "$DEST/$DATE"

# Retention: keep 5 newest dated folders (ISO dates sort lexicographically)
cd "$DEST"
ls -1d 20*/ 2>/dev/null | sort -r | tail -n +6 | xargs -r rm -rf --
'
```

- Connect Schedule Trigger → Execute Command.
- Save + Activate the workflow.

## Critical files

The plan itself adds no code to the repo. DB discovery relies on a single convention: **every sub-app opens its SQLite file at the repo root as `<name>.db`.** Currently:

- `server/db/index.ts` → `central-flock.db`
- `server/db-devotions/index.ts` → `devotions.db`
- `server/db-nursery/index.ts` → `nursery.db`
- `server/db-quotes/index.ts` → `quotes.db`
- `scripts/central-flock.sh` — sets the working directory that makes the DB paths resolve to the locations above.

Future sub-apps that follow the same pattern (e.g., `server/db-foo/index.ts` → `foo.db` at the repo root) are auto-included in backups with no workflow change. If a future sub-app instead stores its DB in a subdirectory, the glob in the Execute Command script will need to be broadened (e.g., to `"$SRC"/**/*.db` with `shopt -s globstar` or a `find` call).

## Verification

1. **Mount sanity check** — after restarting n8n, in the container:

   ```sh
   docker exec -it <n8n-container> sh -c 'ls /db-source/*.db && ls -la /backup-dest'
   ```

   Should list every `.db` file at the repo root and show `/backup-dest` as writable.

2. **Manual trigger** — in the n8n UI, click "Execute Workflow" on the new workflow. Confirm the Execute Command node finishes green.

3. **Host check** — in Finder or terminal:

   ```sh
   ls -la "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock/$(date +%Y-%m-%d)"
   ```

   Should show one `.db` per sub-app plus any `.db-wal` / `.db-shm` sidecars present at copy time (sidecars may be absent for an idle DB, which is fine).

4. **Restore smoke test** — pick one backup DB, open it:

   ```sh
   sqlite3 "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock/$(date +%Y-%m-%d)/central-flock.db" '.tables'
   ```

   Should list the tables from `server/db/schema.ts` (people, groups, messages, etc.) without errors.

5. **iCloud sync check** — open Finder → iCloud Drive → Backups → central-flock. Confirm the dated folder appears and has a cloud-synced indicator (not a dashed upload arrow after a few minutes).

6. **Retention check** — after 6+ successful daily runs, confirm only 5 dated folders remain.
