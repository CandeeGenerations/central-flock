# Uploads live outside the repo, configurable via `UPLOADS_DIR`

## Context

User-uploaded media (devotion scans, nursery logos, sheet music for specials) was originally written to `server/data/<subdir>/` inside the repo. With the introduction of sheet-music attachments for the Special Music feature, we wanted automatic backup and cross-device access for all uploaded media.

## Decision

All upload subdirectories live under a single root, configurable via the `UPLOADS_DIR` environment variable. Default in dev/CI is `./data/`. The production launchd plist points it at `~/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock/`, which gets free iCloud Drive backup and sync.

The database stores **relative paths only** (e.g., `scan-images/foo.png`), not absolute or `/data/`-prefixed paths. Static mounts and disk writes resolve through `UPLOADS_DIR`. Existing rows are migrated to drop the `/data/` prefix as part of this release.

## Why

- **Hard to reverse:** once paths are stored relative to `UPLOADS_DIR` and files have been copied to iCloud, undoing requires another migration.
- **Surprising without context:** a future reader sees an empty `data/` folder in the repo and wonders where uploads live. This file is the breadcrumb.
- **Real trade-off:** the iCloud path couples the storage layer to macOS — which the app already is via AppleScript Messages/Contacts integration, so we accept the further coupling. The env var preserves dev portability (CI and fresh clones don't need iCloud).

## Consequences

- Every feature that writes uploaded media reads `process.env.UPLOADS_DIR` (with a default fallback) — never hardcodes a path.
- DB migrations and any URL construction must use relative paths so the same row resolves regardless of where `UPLOADS_DIR` points.
- The launchd service must be stopped before re-pointing `UPLOADS_DIR` and copying files — otherwise existing handles break mid-write.
