# Special Music — Post-merge Operations

Run-once steps after [PR #10](https://github.com/CandeeGenerations/central-flock/pull/10) lands on `main`. Follow top-to-bottom.

Status legend: ☐ pending · ☑ done.

---

## Part A — Apply the schema migration (required, do first)

The PR adds `0018_third_morph.sql` (creates `special_music` and `special_music_performers`). Until applied, the API will 500 on every `/api/specials/*` call.

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.candeegenerations.flock.plist  # stop service
cd ~/repos/cgen/central-flock && git pull origin main
pnpm install                                                                              # in case deps drifted
pnpm db:migrate                                                                           # applies 0018_third_morph.sql
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.candeegenerations.flock.plist # restart service
```

Sanity check (any one):

- Open `/music/specials` — page renders without errors.
- `curl -s http://localhost:5172/api/specials -b "$(cat ~/.flock-cookie)" | head -c 100` returns `[]`.
- Server log on boot includes `Specials scheduler: next roll at <date>` and `Specials scheduler: rolled 0 will_perform → needs_review`.

The boot also runs the **idempotent path-rewrite SQL** (rewrites `/data/scan-images/...` and `/data/nursery-logos/...` rows to `/uploads/...`). Verify on `/devotions/scan` and `/nursery/settings` that existing scans / logos still render.

---

## Part B — Move uploads to iCloud Drive (Phase 8 of the plan)

Until this runs, `UPLOADS_DIR` defaults to `./data/` and everything works as before. Do this when ready for backed-up storage.

### Steps

1. **Stop the service** (same `launchctl bootout` as above).

2. **Create the iCloud root + subfolders**:

   ```bash
   ICLOUD_ROOT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock"
   mkdir -p "$ICLOUD_ROOT/scan-images" "$ICLOUD_ROOT/nursery-logos" "$ICLOUD_ROOT/special-music"
   ```

3. **Copy existing files** (preserves timestamps; use `rsync -av` for verbose):

   ```bash
   cd ~/repos/cgen/central-flock
   rsync -a server/data/scan-images/  "$ICLOUD_ROOT/scan-images/"
   rsync -a server/data/nursery-logos/ "$ICLOUD_ROOT/nursery-logos/"
   ```

   Expect iCloud to start uploading immediately. Wait until the cloud icons in Finder go solid before proceeding.

4. **Update the launchd plist** to set `UPLOADS_DIR`. Edit `~/Library/LaunchAgents/com.candeegenerations.flock.plist` and add (or update) the env var inside `<key>EnvironmentVariables</key>`:

   ```xml
   <key>UPLOADS_DIR</key>
   <string>/Users/cgen01/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock</string>
   ```

   (Use the absolute, expanded path — launchd does not expand `$HOME` or `~`.)

5. **Restart the service**:

   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.candeegenerations.flock.plist
   ```

6. **Verify** — open the app:
   - `/devotions/scan` — saved scans still render (proves `/uploads/scan-images/...` is served from iCloud).
   - `/nursery/settings` — logo still renders.
   - Upload a fresh sheet music PDF on a Special — file lands at `$ICLOUD_ROOT/special-music/<id>-<ts>-<name>.pdf` and the inline preview renders.

7. **After 24-48 hours of normal use** (giving iCloud time to fully sync and yourself time to spot regressions), delete the in-repo originals:

   ```bash
   cd ~/repos/cgen/central-flock
   rm -rf server/data/scan-images server/data/nursery-logos
   git add -A && git commit -m "chore(uploads): remove migrated data/ subdirs (now in iCloud)"
   git push
   ```

### Rollback

If anything breaks, drop the `UPLOADS_DIR` env var from the plist (or set it back to the absolute repo `data/` path) and `launchctl bootout`/`bootstrap`. The path-rewrite SQL is already idempotent, so stored URLs (`/uploads/...`) keep working as long as the mount points at a directory containing the same `<sub>/<file>` layout.

---

## Part C — Smoke test the new feature

1. **Create with future date** — `/music/specials/new`, pick a date next Sunday. Status badge should read `Will Perform`.
2. **Create with past date** — pick last Sunday. Status `Needs Review`. Open it; click `Mark Reviewed`. Status `Performed`.
3. **YouTube auto-fill** — paste a known special's YouTube URL on `/music/specials/new`. Form pre-fills date / song / type. Hymn match populates if captions hit a hymnal first line.
4. **Sheet music** — upload a PDF. Inline iframe preview renders. Replace with a different file. Old file is gone from disk (`ls $UPLOADS_DIR/special-music/`).
5. **Type derivation** — add 2 performers, type auto-suggests `Duet`. Add a 3rd, suggests `Trio`. Override to `Instrumental`. Add a 4th — type stays `Instrumental` (manual override sticks).
6. **Repeat warning** — create a Special for last week with Sarah on it. Then create a new Special this week with Sarah — yellow warning panel appears above Save.
7. **Cross-link** — open Sarah's `/people/<id>` page — "Specials performed" card lists both records.
8. **Sidebar** — `Music → Specials` is highlighted on `/music/specials*`.
9. **kbar** — press ⌘⇧K, type "specials" → "Go to Specials" + "New Special" + every existing Special by song / performer.

---

## Part D — Daily rollover sanity check

Tomorrow ~3:00 AM, the scheduler should run. To check:

```bash
log show --predicate 'eventMessage contains "Specials scheduler"' --last 24h
```

Expected line: `Specials scheduler: rolled N will_perform → needs_review` (where `N` may be 0).

To force a manual run before tomorrow, hit any `/api/specials` endpoint after editing a Will-Perform's date to yesterday — the daily job is idempotent and runs again at 03:00 regardless.
