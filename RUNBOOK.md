# Central Flock Runbook

Operational procedures for the live Central Flock instance. There is **no dev or test environment** — the production DB at `./central-flock.db` is the only DB. Treat any procedure here that touches the DB or the launchd services as a real production change.

For deployment plumbing (launchd plists, env vars, cloudflared tunnel), see [memory/deployment.md](../../.claude/projects/-Users-cgen01-repos-cgen-central-flock/memory/deployment.md) (auto-memory, not in this repo).

## Deploying

`./scripts/deploy.sh` is the only sanctioned path. It performs, in order:

1. Working-tree clean check (warns + prompts if dirty).
2. Lint + typecheck (`pnpm lint`).
3. **Atomic DB backup** (`sqlite3 .backup`) to `backups/central-flock.db.pre-migrate-<utc-ts>-<sha>`. Bails if the backup file is empty.
4. **Apply pending DB migrations** (`pnpm db:migrate`). Idempotent — no-ops when nothing pending.
5. Build with Sentry release tagging (uploads source maps when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` are set).
6. Update `SENTRY_RELEASE` in the launchd plist.
7. Reload the `cc.cgen.central-flock` service (`bootout` + `bootstrap`).
8. Verify the new SHA is in the running process's env.

The backup ring is pruned to the newest 10 `pre-migrate-*` snapshots automatically.

### Migrations that drop or rebuild tables

`drizzle-kit migrate` will happily run while the service is up, but better-sqlite3 keeps prepared statements bound to the old table identity. Once a `DROP TABLE` / table-rebuild lands, the running process starts throwing `SqliteError: no such table: <name>` until it's restarted.

**For destructive migrations, stop the service before deploying:**

```bash
launchctl bootout "gui/$(id -u)/cc.cgen.central-flock"
./scripts/deploy.sh
# scripts/deploy.sh restarts the service at the end via bootstrap.
```

For purely additive migrations (new columns, new tables with no existing renames), no stop is needed.

## Rolling back a bad migration

If a deploy goes wrong — corrupted data, broken schema, app erroring on every request — restore from the pre-migrate backup the deploy script took before applying migrations.

### 1. Identify the backup

Backups land in `./backups/` with the timestamp + git SHA of the deploy that took them:

```bash
ls -lt backups/central-flock.db.pre-migrate-* | head -5
```

The newest entry is the snapshot taken before the most recent deploy. Pick the one matching the SHA of the deploy you're rolling back from.

### 2. Stop the service

```bash
launchctl bootout "gui/$(id -u)/cc.cgen.central-flock"
```

Wait for the service to fully exit (a couple of seconds). Verify with:

```bash
launchctl print "gui/$(id -u)/cc.cgen.central-flock" >/dev/null 2>&1 \
  && echo "STILL RUNNING" || echo "STOPPED"
```

### 3. Restore the DB

```bash
cp backups/central-flock.db.pre-migrate-<tag> central-flock.db
# Wipe any WAL/SHM that lingered from the broken state — fresh backup is the only truth now.
rm -f central-flock.db-wal central-flock.db-shm
```

### 4. Roll the code back to match the schema

The restored DB matches the schema as it was _before_ the bad deploy. If the running code still expects the new schema, it'll keep throwing — check out the SHA from before the bad deploy:

```bash
git checkout <pre-deploy-sha>
# Or, if the bad SHA is the tip of main and you want to revert:
git revert <bad-sha>
```

### 5. Restart the service

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/cc.cgen.central-flock.plist
```

Verify it came up:

```bash
launchctl print "gui/$(id -u)/cc.cgen.central-flock" | grep -E "state =|pid ="
tail -50 ~/Library/Logs/central-flock.log | grep -iE "error|listening|server running"
```

### 6. Verify the rollback worked

- Hit `/api/messages` (returns 401 = service up + auth-gated; anything else is a problem).
- Open the web UI and confirm message history loads and the most recent rows are present.

### After-action

- Keep the pre-migrate backup until you've verified the rollback is stable. The deploy script's auto-prune may otherwise drop it after 10 more deploys.
- Investigate what went wrong on a copy (`cp central-flock.db central-flock.db.investigate`) before retrying the deploy — don't fix-in-place on prod.

## Upgrading Claude models

Models are configured only in `server/lib/ai-models.ts` (`AI_MODELS`). To upgrade:

1. Point the key (`sonnet` / `opus` / `haiku`) at the new model ID.
2. Add the old ID to `LEGACY_MODEL_TO_KEY` so any exact ID stored in the DB follows the upgrade.
3. Read the new model's migration guide for breaking changes and check our call sites for each: `temperature`/`top_p`/`top_k`, assistant prefill, forced `tool_choice`, disabled thinking, the default effort, and whether `max_tokens` leaves room for adaptive thinking. Revisit the `claude-haiku-4-` special cases in `effortConfig` / `webSearchTool` if a model line changes capabilities.
4. Run the full live suite once by hand, including the expensive features:
   ```bash
   ANTHROPIC_API_KEY=$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:ANTHROPIC_API_KEY' \
     ~/Library/LaunchAgents/cc.cgen.central-flock.plist) AI_TEST_ALL=1 pnpm test:ai
   ```
   `AI_TEST_MODEL=opus` (etc.) runs the settings-driven features on a model other than the configured `defaultAiModel`.
5. Commit. The pre-commit hook re-runs `pnpm test && pnpm test:ai` (default features) whenever `ai-models.ts` or the `@anthropic-ai/sdk` version is staged, and blocks the commit (and therefore the deploy) on failure. `SKIP_AI_TESTS=1` bypasses.

The live suite runs against a temp copy of `central-flock.db` (via `CENTRAL_FLOCK_DB_PATH`), never the real DB. The OCR test needs `server/test/fixtures/devotion-sheet.jpg` and is skipped without it.

## Restoring from the daily backups directory

The `backups/` directory also contains dated full snapshots (subdirectories like `2026-04-21T13-57-58-951Z/`) from some other source. Those are not produced by `deploy.sh`. If a `pre-migrate-*` snapshot is missing or corrupted, fall back to the newest of those:

```bash
ls backups/ | grep -E '^[0-9]{4}-' | sort -r | head -3
```

Same restore procedure — stop service, `cp` over, restart.
