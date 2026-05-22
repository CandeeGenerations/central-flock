#!/usr/bin/env bash
# Build + deploy Central Flock with Sentry release tagging.
#
# What it does:
#   1. Verify working tree is clean (or warn).
#   2. Lint + typecheck.
#   3. Build with the current git short-SHA tagged as the Sentry release;
#      uploads source maps to Sentry when SENTRY_AUTH_TOKEN + SENTRY_ORG are set.
#   4. Update SENTRY_RELEASE in the launchd plist so the running server tags
#      runtime errors with the same SHA.
#   5. Restart the launchd service.
#
# Required for source map upload (set in ~/.zshrc — org-wide):
#   SENTRY_AUTH_TOKEN, SENTRY_ORG
# Per-project (read from the installed plist below):
#   VITE_SENTRY_DSN
# Optional:
#   SENTRY_PROJECT_WEB (defaults to central-flock-web)
#
# If SENTRY_AUTH_TOKEN/SENTRY_ORG are unset, the build still runs — source
# maps just don't upload. Useful for emergency deploys.

set -euo pipefail

cd "$(dirname "$0")/.."

PLIST="$HOME/Library/LaunchAgents/cc.cgen.central-flock.plist"
SERVICE="cc.cgen.central-flock"
SHA=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "==> Deploying $BRANCH @ $SHA"

# 1. Working-tree check (warn but don't block — operator may want to ship a hotfix WIP)
if ! git diff --quiet HEAD; then
  echo "    WARN: working tree has uncommitted changes; the SHA tag won't reflect what runs"
  read -r -p "    Continue anyway? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
  fi
fi

# 2. Lint + typecheck
echo "==> Lint + typecheck"
pnpm eslint

# 2b. Apply any pending DB migrations.
#
# Idempotent — drizzle-kit migrate consults __drizzle_migrations and skips
# already-applied tags, so this no-ops on a clean DB. For migrations that
# DROP/rebuild tables, stop the service before running deploy: the running
# process will keep prepared statements bound to old table OIDs and start
# throwing "no such table" until restarted.
#
# Production DB is the only DB — there is no dev/test environment. Always
# take an atomic backup before migrating so we can roll back if a migration
# corrupts data. The sqlite3 `.backup` command is WAL-safe (online backup)
# and finishes in well under a second on this DB size.
DB_PATH="./central-flock.db"
BACKUP_DIR="./backups"
BACKUP_TAG="pre-migrate-$(date -u +%Y%m%dT%H%M%SZ)-$SHA"
BACKUP_PATH="$BACKUP_DIR/central-flock.db.$BACKUP_TAG"

if [[ -f "$DB_PATH" ]]; then
  echo "==> Backup DB → $BACKUP_PATH"
  mkdir -p "$BACKUP_DIR"
  sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"
  if [[ ! -s "$BACKUP_PATH" ]]; then
    echo "    ERROR: backup file is empty or missing — refusing to migrate"
    exit 1
  fi
  # Prune: keep the newest 10 pre-migrate snapshots, drop the rest.
  ls -1t "$BACKUP_DIR"/central-flock.db.pre-migrate-* 2>/dev/null | tail -n +11 | xargs -I{} rm -f "{}"
fi

echo "==> Apply pending DB migrations"
pnpm db:migrate

# 3. Build
#
# Read per-project DSN from the installed plist so the bundle bakes in the
# same VITE_SENTRY_DSN the runtime uses. Keeps the plist as the single source
# of truth and avoids per-project DSNs sprawling into ~/.zshrc.
if [[ -f "$PLIST" ]] && [[ -z "${VITE_SENTRY_DSN:-}" ]]; then
  VITE_SENTRY_DSN=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:VITE_SENTRY_DSN" "$PLIST" 2>/dev/null || true)
  export VITE_SENTRY_DSN
fi

echo "==> Build"
if [[ -n "${SENTRY_AUTH_TOKEN:-}" && -n "${SENTRY_ORG:-}" ]]; then
  if [[ -z "${VITE_SENTRY_DSN:-}" ]]; then
    echo "    ERROR: SENTRY_AUTH_TOKEN is set but VITE_SENTRY_DSN is not — add it to the plist's EnvironmentVariables"
    exit 1
  fi
  echo "    Sentry source maps will upload to org=$SENTRY_ORG"
else
  echo "    Sentry env vars not set — skipping source map upload"
fi

SENTRY_RELEASE="$SHA" VITE_SENTRY_RELEASE="$SHA" pnpm build

# 4. Update plist SENTRY_RELEASE so runtime errors tag with the new SHA
if [[ -f "$PLIST" ]]; then
  echo "==> Update $PLIST :EnvironmentVariables:SENTRY_RELEASE → $SHA"
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:SENTRY_RELEASE $SHA" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:SENTRY_RELEASE string $SHA" "$PLIST"
else
  echo "    WARN: $PLIST not found — skipping plist + restart"
  echo "    Build artifacts are in dist/. Restart manually when ready."
  exit 0
fi

# 5. Restart service
#
# We bootout + bootstrap rather than `kickstart -k` because we just edited
# the plist's EnvironmentVariables. `kickstart -k` only restarts the program
# with the env launchd already cached — the new SENTRY_RELEASE (or any other
# var changes) would not actually take effect. Bootout fully unloads the
# service so bootstrap re-reads the plist from disk.
echo "==> Reload $SERVICE (bootout + bootstrap to pick up plist env changes)"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$SERVICE" 2>/dev/null || true

# `bootout` is async — wait until the service is fully gone from the domain
# before bootstrapping, otherwise bootstrap fails and `set -e` leaves the
# service unloaded.
for _ in {1..30}; do
  launchctl print "$DOMAIN/$SERVICE" >/dev/null 2>&1 || break
  sleep 0.5
done

launchctl bootstrap "$DOMAIN" "$PLIST"

# Verify the new SENTRY_RELEASE is in the running process's environment
sleep 1
PID=$(launchctl print "$DOMAIN/$SERVICE" 2>/dev/null | awk '/pid =/ {print $3; exit}')
if [[ -n "${PID:-}" ]] && ps eww -p "$PID" 2>/dev/null | grep -q "SENTRY_RELEASE=$SHA"; then
  echo "    Verified: pid $PID has SENTRY_RELEASE=$SHA"
else
  echo "    WARN: could not verify SENTRY_RELEASE=$SHA in pid ${PID:-?} — check 'ps eww -p <pid>' manually"
fi

echo "==> Done. $BRANCH @ $SHA is live."
