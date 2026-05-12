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
# Required for source map upload (set in shell profile, e.g. ~/.zshrc):
#   SENTRY_AUTH_TOKEN, SENTRY_ORG, VITE_SENTRY_DSN
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

# 3. Build
echo "==> Build"
if [[ -n "${SENTRY_AUTH_TOKEN:-}" && -n "${SENTRY_ORG:-}" ]]; then
  if [[ -z "${VITE_SENTRY_DSN:-}" ]]; then
    echo "    ERROR: SENTRY_AUTH_TOKEN is set but VITE_SENTRY_DSN is not — bundle won't have a frontend DSN"
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
echo "==> Restart $SERVICE"
launchctl kickstart -k "gui/$(id -u)/$SERVICE"

echo "==> Done. $BRANCH @ $SHA is live."
