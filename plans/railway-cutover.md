# Switching Central Flock from the Mac mini to Railway

Status: **Phases 0–2 done (2026-11-24): Railway runs in sandbox at `flock-next.cgen.cc` with a
nightly copy of the live data. Phase 3 under way (2026-11-25): bridge, webhooks, restore and the
iCloud pull are proven; the parity checklist and the timed dry run are left. Phase 4 not started.** This moves **today's
Express + Vite app** — the TanStack Start rewrite happens afterwards, on Railway (plan decision 18).
`push-rehearsal-copy.sh` (Phase 2) runs nightly; `backup-dbs-pull.sh`, the iCloud backup for after
the switch (Phase 4 step 9), is built and tested.

After the switch the **Mac mini stays on**: it runs cgen-api, the tunnel for `api.cgen.cc`, and the
iCloud backup pull. Only the `cc.cgen.central-flock` service is retired. Re-read this guide against
the real code before cut-over day.

### Where things stand on the Mac (since 2026-11-24)

- **Central Flock on the Mac already sends through cgen-api** (`MAC_BRIDGE=cgen-api`,
  `CGEN_API_URL=http://localhost:5180`, `CGEN_API_KEY` in `cc.cgen.central-flock.plist`). A real
  text and a nursery schedule image went out and were delivered, and the calendar sync read 131
  events through the bridge. Railway will use the same bridge, only through `https://api.cgen.cc`.
- **cgen-api** serves `/api/mac/*` behind `MAC_BRIDGE_API_KEY` (in `cc.cgen.api.plist`, same value
  as Central Flock's `CGEN_API_KEY`), and keeps each send's idempotency key on disk under
  `~/Library/Application Support/cgen-api/mac-bridge-requests` for 24 hours.
- **To undo the bridge on the Mac:** remove `MAC_BRIDGE` from `cc.cgen.central-flock.plist` and
  reload (below). It falls back to AppleScript on the Mac.

### Reloading a launchd service after a plist change

`launchctl kickstart -k` restarts a service but keeps the environment launchd already loaded, so a
changed plist variable is ignored. After any plist edit, reload it fully:

```bash
launchctl bootout "gui/$(id -u)/<label>"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<label>.plist
```

(Central Flock's `scripts/deploy.sh` already does this; cgen-api's `pnpm deploy` only kickstarts.)

Decisions behind it: [ADR 0043](../docs/adr/0043-railway-hosting-with-mac-work-behind-cgen-api.md) and
[tanstack-migration.md](./tanstack-migration.md) → "Cloud split" (decisions 3–18).

## Ground rules

1. **The Mac stays the live system until the switch.** `cc.cgen.central-flock` keeps running
   `pnpm dev` behind `flock.cgen.cc`, and keeps getting normal fixes, the whole time.
2. **Only one system ever sends.** Before the switch Railway runs with `CENTRAL_FLOCK_SANDBOX=1`:
   schedulers off, and texts, images, calendar writes, AI calls, MCP, Notion and webhooks all blocked.
3. **The `flock.cgen.cc` tunnel route is removed only after Railway is proven.** Until then it's
   commented out, not deleted, so rolling back is a one-line change.
4. **Nothing on the Mac is deleted for at least 14 days after the switch** — not the plist, the
   repo folder, the `.db` file or the iCloud folder.

## Names used below

| Thing                     | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Railway project / service | `central-flock` / `web`                                                                            |
| Railway environment       | `production` (the only one until PR environments are switched on)                                  |
| Volume mount              | `/data` — database at `/data/central-flock.db`, uploads at `/data/uploads`                         |
| Rehearsal hostname        | `flock-next.cgen.cc` (Railway custom domain 1 of the 2 Hobby allows)                               |
| Live hostname             | `flock.cgen.cc` (custom domain 2, moved over at the switch)                                        |
| Mac uploads today         | `~/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock/` subfolders (`UPLOADS_DIR`) |
| Tunnel                    | `cgen-tunnel`, config `~/.cloudflared/config.yml`                                                  |
| cgen-api                  | `cc.cgen.api`, `api.cgen.cc` → `localhost:5180`                                                    |
| Bridge key                | `MAC_BRIDGE_API_KEY` in cgen-api = `CGEN_API_KEY` in Central Flock (one shared value)              |

## Phase 0 — Gates (done 2026-11-24, merged and deployed at `9340358`)

- [x] **Production build runs locally:** `pnpm db:migrate`, `pnpm db:seed`, `pnpm build`, then
      `CENTRAL_FLOCK_SANDBOX=1 pnpm start`, all against a throwaway database. Pages and the API
      served seed data, and a 12-recipient send completed with every send faked.
      **Still to check on Railway:** a deep link such as `/people` returned 500 locally only because
      the test folder path contained `.claude`, and Express won't serve files under a dot-folder.
      Confirm deep links work on `flock-next.cgen.cc`.
- [x] **Migrations build a fresh database.** 0022, 0024, 0042 and 0063 got fresh-database fixes
      (production never re-runs them; migrate on a production copy applied nothing).
      `server/db/migrations.test.ts` keeps it that way.
- [x] **Seed:** `pnpm db:seed` (`server/db/seed.ts`) fills an empty database with fake data
      (555-0100–0199 numbers). It does nothing unless `CENTRAL_FLOCK_SANDBOX=1` and the database
      is empty.
- [x] **`vite:preloadError`** reloads the page once, so a deploy doesn't strand open tabs.
- [x] **Sandbox hard stop** (`server/lib/sandbox.ts`): Claude, MCP connect/sign-in/refresh, the
      notify-me webhook and Mattermost fallback, and the test-webhook button all refuse, with 409s
      that stay out of Sentry. The Mac bridge reports success and returns empty reads. (Notion is
      not used by the server, so there is nothing to block.)
- [x] **Mac bridge** (`server/lib/mac-bridge.ts` + cgen-api `/api/mac/*`): send text, send image,
      read and create contacts, list calendars, fetch events. It retries only when the request
      never got through; cgen-api replays or refuses repeats from its on-disk record; and after an
      outage, calls fail at once for two minutes instead of each waiting through the retries.
      **Tested live on the Mac:** text, image and calendar.
- [x] **Send allow-list:** `SEND_ALLOWLIST` (comma-separated numbers) refuses anyone not listed,
      even with sandbox off.
- [x] **`/webhooks/*` hardened:** constant-time secret compare, and 120 requests a minute.
- [x] **Nightly snapshot:** when `SNAPSHOT_DIR` is set, the server writes `<date>/central-flock.db`
      (via `db.backup()`) and `<date>/uploads.tar.gz` there at 03:00 server time, keeps the newest
      7 nights, and links `nightly.db` / `uploads.tar.gz` to the newest for the Mac's download. It
      takes one at boot if the newest is older than yesterday. `pnpm snapshot:now` takes one on
      demand. **These are the backups on Railway** — Hobby can't create Railway volume backups.
- [x] **Boot-time import, sandbox only:** a copy at `<db dir>/incoming/central-flock.db` (or
      `INCOMING_DIR`), plus an optional `uploads.tar.gz`, is integrity-checked, swapped in, migrated
      and unpacked into `UPLOADS_DIR`. With sandbox off it refuses and logs loudly.
- [x] **`drizzle.config.ts`** migrates `CENTRAL_FLOCK_DB_PATH`, so the migrate at start-up hits the
      volume.

## Phase 1 — Set up Railway (no real data yet)

1. Create the project and connect the GitHub repo `CandeeGenerations/central-flock`, deploying from
   `main`. Pushes to `main` now deploy to both the Mac (post-commit hook) and Railway — fine while
   Railway is in sandbox.
2. Add a volume mounted at `/data`.
3. Build command `pnpm build`; **no pre-deploy command**; start command `pnpm start`. Replicas:
   **1**. `pnpm start` runs `db:migrate`, then `db:seed`, then the server. They can't be a
   pre-deploy command: Railway doesn't mount the volume for pre-deploy, so `/data` doesn't exist
   there (the first deploy failed with "Cannot open database because the directory does not
   exist"). `db:seed` does nothing outside a sandbox or on a database that already has data, so it
   is safe on every start. These commands change again when the Start rewrite lands.
4. Variables:

   | Variable                                                                                             | Value now                                                      | At the switch                                 |
   | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
   | `CENTRAL_FLOCK_SANDBOX`                                                                              | `1`                                                            | removed                                       |
   | `CENTRAL_FLOCK_DB_PATH`                                                                              | `/data/central-flock.db`                                       | same                                          |
   | `UPLOADS_DIR`                                                                                        | `/data/uploads`                                                | same                                          |
   | `AUTH_PASSWORD_HASH`, `JWT_SECRET`, `JWT_EXPIRY`                                                     | **set from day one** — this environment will hold real data    | same                                          |
   | `SENTRY_*`, `VITE_SENTRY_DSN`                                                                        | set, `SENTRY_ENVIRONMENT=railway-rehearsal`                    | `production`                                  |
   | `FLOCK_PUBLIC_URL`, `CENTRAL_FLOCK_PUBLIC_URL`, `RSVP_PUBLIC_URL_BASE`, `ATTENDANCE_PUBLIC_URL_BASE` | production values                                              | same                                          |
   | `TZ`                                                                                                 | `America/New_York` (schedulers and the 03:00 snapshot)         | same                                          |
   | `SNAPSHOT_DIR`                                                                                       | `/data/backups` (ignored while sandbox is on)                  | same                                          |
   | `MAC_BRIDGE`                                                                                         | `cgen-api` (sandbox fakes every call anyway)                   | same                                          |
   | `CGEN_API_URL`                                                                                       | `https://api.cgen.cc`                                          | same                                          |
   | `CGEN_API_KEY`                                                                                       | **not set**                                                    | the Mac's bridge key, **sealed**              |
   | `ANTHROPIC_API_KEY`                                                                                  | **not set**                                                    | set, **sealed**                               |
   | `CENTRAL_FLOCK_INTERNAL_SECRET`                                                                      | a new random value, **sealed**                                 | rotated again, **sealed**                     |
   | `CONNECTIONS_KEY`                                                                                    | same as the Mac (so saved Canva/Metricool connections decrypt) | same                                          |
   | `SEND_ALLOWLIST`                                                                                     | not set                                                        | not set (only during the Phase 3 bridge test) |

5. Backups: nothing to turn on. Railway's Hobby plan can view and restore volume backups but not
   create them (checked 2026-11-24), so backups are our own nightly snapshots (7 nights on the
   volume) plus the Mac's iCloud copy. See "Restoring from a snapshot" below.
6. Custom domain `flock-next.cgen.cc`: add it in Railway, then create the CNAME (and verification
   TXT record) Railway shows in Cloudflare DNS. Leave `flock.cgen.cc` alone.
7. **Leave PR environments off.** Railway's docs don't say whether a PR environment gets a copy of
   the base environment's volume, and this one will hold real data. Turn them on only after
   checking (see "After the switch").
8. Deploy. With an empty volume, start-up builds the schema from migrations and seeds fake data;
   the server starts in sandbox mode and logs `Sandbox: background jobs disabled`. Log in at
   `https://flock-next.cgen.cc` and check a deep link (e.g. `/people`) loads.

## Phase 2 — Nightly sandbox copy of the live data

Each night, the Mac sends Railway a fresh copy of the live data. Railway only accepts it in sandbox mode.
**Set up and first run done 2026-11-24.**

1. **`scripts/push-rehearsal-copy.sh`** (`bash scripts/push-rehearsal-copy.sh` to run by hand):
   - refuses unless Railway's `CENTRAL_FLOCK_SANDBOX` is `1`;
   - takes a `sqlite3 .backup` copy of the live DB, checks its integrity, and packs the iCloud
     upload folders;
   - uploads both to `/data/incoming` with `railway volume files --volume central-flock-volume
upload ... --overwrite`;
   - redeploys, waits for the deploy and reports success or failure.
     It uses the Railway CLI's saved login for this Mac user, so no project token is needed (set
     `RAILWAY_TOKEN` to use one instead). If `railway login` ever lapses, the push refuses and says so.
2. **Nightly:** the last step of `scripts/backup-dbs.sh` (the 03:00 `cc.cgen.central-flock-backup`
   job) runs it, after the iCloud backup. A failure is logged to
   `~/Library/Logs/central-flock-backup.log` and does not affect the backup.
3. **First run (by hand, 22:12):** 14 MB DB with 946 people and 15 MB of uploads, uploaded and
   imported in about 30 seconds. On Railway: 946 people, all six upload folders. That run showed
   the import leaving `-wal`/`-shm` files in `/data/incoming`; fixed in `724c4a4`.
4. **Still to check by eye:** sign in at `flock-next.cgen.cc` and confirm a few uploaded images load.
5. Leave it running nightly through Phases 3 and 4. **Stop it at cut-over** (Phase 4 step 2) by
   removing the last line of `backup-dbs.sh`.

## Phase 3 — Rehearse and prove parity

Work through each section on `flock-next.cgen.cc` with the real (copied) data, side by side with
`flock.cgen.cc`. Tick each line only when it behaves the same.

**Parity checklist** — one line per sidebar section and standalone route in `src/lib/nav-config.ts`
and `src/App.tsx` (expand before starting): Home, People, Groups, Messages (compose, history,
detail, drafts, templates, global variables, scheduled), Prayer Request, Calendar and calendar
print, Events Story, Devotions (incl. Gwendolyn), Sermons, Music and music schedule, Special
music, Nursery, Prayer sheet, Attendance (dashboard and settings), Sunday school, roll and stats,
RSVP, Fill America, Fair booth, Schedules settings, Contacts import, CSV import and export,
Settings, command palette, Recents, login and logout, iPhone and iPad home-screen launch.

Then the rehearsals that prove the parts sandbox mode blocks:

1. [x] **Real send through the bridge from Railway** — done 2026-11-25. With nothing due in the
       copy (no scheduled messages or fair-booth runs, no unfinished sermons, birthday digest at 07:00),
       sandbox was removed with `CGEN_API_KEY` set and `SEND_ALLOWLIST=+14105088057` (Carissa). A
       script run in the container (`railway ssh`, `npx tsx` on a `.mts` file importing
       `server/lib/mac-bridge.ts`) sent one text and one image to Carissa through `https://api.cgen.cc`,
       and both arrived (confirmed by Carissa). Afterwards `CENTRAL_FLOCK_SANDBOX=1` went back, both variables were removed, and the
       redeploy logged `Sandbox: background jobs disabled`. Note: `railway variable delete` ignores
       `--skip-deploys` silently, so drop that flag when deleting.
2. [x] **Contacts and calendar through the bridge** — done in the same window: the boot-time
       calendar sync pulled 131 events, and `fetchContacts()` returned 983 contacts.
3. [x] **Webhooks** — done 2026-11-25. Railway's secret is sealed, so the calls ran inside the
       container (`railway ssh`, reading `CENTRAL_FLOCK_INTERNAL_SECRET` from its env) against the
       public `https://flock-next.cgen.cc/webhooks`. All 11 routes (sermons speaker-keys and POST,
       nursery day, rsvp GET/POST, the four attendance routes, quotes POST) answered with the right
       secret (200, or 400/404 for the fake bodies and tokens) and 401 with a wrong or missing one.
       `/webhooks/nursery/day` was byte-for-byte the same as the Mac's. An unknown `/webhooks/*` path
       with the right secret returns the app's HTML with 200 on both, so that's existing behaviour.
4. [x] **Backups** — done 2026-11-25. `railway ssh -- pnpm snapshot:now` wrote
       `/data/backups/2026-11-25` (15 MB DB, 16 MB uploads). A marker row was then added to the live
       DB, and the restore below brought back the snapshot: marker gone, 946 people, six upload
       folders, integrity `ok`. **22 seconds** from staging the files to the app running.
5. [x] **iCloud pull** — built and tested 2026-11-25: `scripts/backup-dbs-pull.sh` waits up to 30
       minutes for tonight's Railway snapshot (a night counts once both final files are in its folder,
       since snapshots write `.tmp` files and rename them), downloads `central-flock.db` and
       `uploads.tar.gz` with `railway volume files download`, checks the DB's integrity and the
       tarball, then moves them into `<iCloud>/Backups/central-flock/<date>/` and keeps the newest 5.
       It alerts the same n8n webhook as `backup-dbs.sh` when the snapshot is stale, missing or broken,
       and keeps the existing backups. Tested into a scratch folder (`BACKUP_DEST=... WAIT_SECONDS=0`):
       14 seconds, integrity `ok`, 946 people, pruning correct; with the CLI failing it alerted and
       exited 1. **Not run from launchd yet:** running it for real now would put Railway's sandbox
       copy over today's real iCloud backup. The same job already runs the Railway CLI (the nightly
       push) and writes to iCloud, so the first night after the switch is the launchd check (Verify).
6. **Time the dry run:** run Phase 4 steps 3–7 against `flock-next.cgen.cc` without stopping the
   Mac, and note the total time. That's the expected outage on the day.

## Phase 4 — Switch-over day

**Pick the time:** a weekday evening. Not Saturday night or Sunday, not right before a scheduled
message, birthday run or fair-booth reminder. In the app, check the scheduled messages list for
anything due in the next 2 hours and move it if needed.

1. **Freeze the Mac's outgoing work.** Wait for any in-progress send to finish (Messages history
   shows nothing in progress).
2. **Stop the nightly push job** so it can never upload over live data again:
   ```bash
   launchctl bootout "gui/$(id -u)/cc.cgen.central-flock-backup"
   ```
3. **Stop the Mac app** (the site shows the tunnel's error page from here on):
   ```bash
   launchctl bootout "gui/$(id -u)/cc.cgen.central-flock"
   launchctl print "gui/$(id -u)/cc.cgen.central-flock" >/dev/null 2>&1 && echo "STILL RUNNING" || echo "STOPPED"
   ```
4. **Take the final snapshot** and keep a copy on the Mac:
   ```bash
   cd /Users/cgen01/repos/cgen/central-flock
   sqlite3 central-flock.db ".backup 'backups/central-flock.db.pre-railway-cutover'"
   sqlite3 backups/central-flock.db.pre-railway-cutover "pragma integrity_check"
   ```
   Then run `scripts/push-rehearsal-copy.sh` once more, by hand, so the final copy lands in
   `/data/incoming/` and Railway imports it (still in sandbox mode).
5. **Check the import** on `flock-next.cgen.cc`: people count, newest message in history, newest
   RSVP and attendance entries match the Mac's last state.
6. **Turn Railway into production.** In Railway variables: remove `CENTRAL_FLOCK_SANDBOX`; set and
   seal `CGEN_API_KEY` (the Mac's bridge key) and `ANTHROPIC_API_KEY`; generate a new
   `CENTRAL_FLOCK_INTERNAL_SECRET` (sealed); set `SENTRY_ENVIRONMENT=production`. Deploy. The log
   should **not** say `Sandbox: background jobs disabled`.
7. **Move the hostname.**
   - In `~/.cloudflared/config.yml`, comment out the `flock.cgen.cc → http://localhost:5173` rule
     (don't delete it), then restart the tunnel:
     ```bash
     launchctl kickstart -k "gui/$(id -u)/cc.cgen.cloudflared"
     ```
   - In Cloudflare, delete the tunnel's DNS record for `flock.cgen.cc`.
   - In Railway, add the custom domain `flock.cgen.cc` and create the CNAME/TXT records it shows.
   - Wait for Railway to show the domain as active and the certificate issued.
8. **Point cgen-api at Railway.** In `~/Library/LaunchAgents/cc.cgen.api.plist`, set
   `CENTRAL_FLOCK_BASE_URL=https://flock.cgen.cc` and `CENTRAL_FLOCK_INTERNAL_SECRET` to the new value
   from step 6, then:
   ```bash
   launchctl bootout "gui/$(id -u)/cc.cgen.api"
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/cc.cgen.api.plist
   ```
9. **Switch the iCloud backup to pull mode.** Point the backup job at `backup-dbs-pull.sh` (it
   pulls Railway's snapshot instead of copying the Mac's DB, so the rehearsal push stops with it)
   and load the job again:
   ```bash
   plutil -replace ProgramArguments -json '["/bin/bash","/Users/cgen01/repos/cgen/central-flock/scripts/backup-dbs-pull.sh"]' ~/Library/LaunchAgents/cc.cgen.central-flock-backup.plist
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/cc.cgen.central-flock-backup.plist
   ```

### Verify (before calling it done)

- [ ] `https://flock.cgen.cc` loads from Railway (check response headers or the Railway logs) and login works.
- [ ] Send one text and one image to yourself from Messages compose; both arrive.
- [ ] Contacts import preview and the calendar page show Mac data.
- [ ] Public apps through cgen-api: open an RSVP link, record a test attendance tally on a test
      service (or check the GET only), load the nursery day page.
- [ ] Sermons and quotes intake: trigger one from the sermon pipeline or wait for the next run, and
      check it lands.
- [ ] Logs show all six schedulers started; the next scheduled send goes out on time.
- [ ] Sentry shows events tagged `production` from Railway.
- [ ] The home-screen app on iPhone and iPad opens and stays logged in (log in again if needed).
- [ ] The next morning: `~/Library/Logs/central-flock-backup.log` shows `[backup-pull ...] Pulled
    <today>` (the first launchd run of the pull script), the new dated iCloud folder's `.db` passes
      `integrity_check`, and `/data/backups/<today>` exists on Railway (`railway ssh -- ls /data/backups`).

## Rollback

**Within 14 days, if Railway misbehaves.** The Mac is untouched, so rolling back means bringing
Railway's newer data home:

1. In Railway, set `CENTRAL_FLOCK_SANDBOX=1` and deploy, so it stops sending.
2. Download the latest data: `railway ssh -- pnpm snapshot:now` (works in sandbox mode too), then
   `railway volume files download /data/backups/nightly.db ./central-flock.db.from-railway`, and the
   same for `/data/backups/uploads.tar.gz`.
3. Check it with `pragma integrity_check`, then replace the Mac's `central-flock.db` (remove any
   leftover `-wal`/`-shm`) and unpack the uploads into the iCloud `UPLOADS_DIR` subfolders.
4. In Railway, remove the `flock.cgen.cc` custom domain. In `~/.cloudflared/config.yml`, uncomment
   the `flock.cgen.cc` rule, recreate the tunnel DNS record, and restart the tunnel.
5. Set cgen-api's `CENTRAL_FLOCK_BASE_URL` back to `http://localhost:5172` with the old secret and restart it.
6. Start the Mac app: `launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/cc.cgen.central-flock.plist`.
7. Point the backup job back at the Mac copy and reload it (the push line in `backup-dbs.sh` refuses
   while Railway isn't in sandbox, so it's harmless):
   ```bash
   launchctl bootout "gui/$(id -u)/cc.cgen.central-flock-backup"
   plutil -replace ProgramArguments -json '["/bin/sh","/Users/cgen01/repos/cgen/central-flock/scripts/backup-dbs.sh"]' ~/Library/LaunchAgents/cc.cgen.central-flock-backup.plist
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/cc.cgen.central-flock-backup.plist
   ```

**If it's the first hour and nothing has changed on Railway yet:** skip steps 2–3 and go straight
to 4–7. The Mac database is exactly as it was at the switch.

## Restoring from a snapshot

Railway's Hobby plan can't create volume backups, so a restore uses our own snapshots and the
sandbox-only import (Phase 0). Sandbox mode is on during the import, so nothing sends meanwhile.

1. **Pick the night:** `railway ssh -- ls /data/backups` lists the dated folders (newest 7). Take a
   fresh one of the current state first, in case you want to go back: `railway ssh -- pnpm snapshot:now`.
2. **Stage it:**
   ```bash
   railway ssh -- sh -c 'mkdir -p /data/incoming && cp /data/backups/<date>/central-flock.db /data/backups/<date>/uploads.tar.gz /data/incoming/'
   ```
   From the iCloud copy instead (if the volume itself is lost): upload the dated folder's two files
   with `railway volume files --volume central-flock-volume upload <file> /incoming/<file> --overwrite`
   (paths are relative to the volume, which is mounted at `/data`).
3. **Import:** set `CENTRAL_FLOCK_SANDBOX=1` and deploy. The log should say
   `Sandbox: imported the production copy`. Check the data in the app.
4. **Back to live:** remove `CENTRAL_FLOCK_SANDBOX` and deploy. Anything scheduled while sandbox was
   on goes out when the schedulers start.

## After the switch (from day 14)

- [ ] Remove the commented `flock.cgen.cc` rule from `~/.cloudflared/config.yml`. The tunnel itself
      stays — it still carries `api.cgen.cc` and the other hostnames.
- [ ] Unload and archive `~/Library/LaunchAgents/cc.cgen.central-flock.plist`. Keep the repo folder
      and `backups/central-flock.db.pre-railway-cutover`.
- [ ] Remove the `flock-next.cgen.cc` domain from Railway and its DNS records.
- [ ] Keep the old iCloud upload subfolders as the pre-migration snapshot; the live uploads are on
      Railway now.
- [ ] Check what a PR environment gets for a volume (open a throwaway PR with PR environments on and
      inspect `/data`). Only if it's empty — or if PR environments can be based on a separate
      seeded environment — turn on PR environments and **Enable Bot PR Environments**.
- [ ] Update `RUNBOOK.md`, `CLAUDE.md` (no more "the service runs `pnpm dev`", "production is the
      only DB", post-commit deploy) and the auto-memory deployment notes.
- [ ] Retire the Mac post-commit deploy hook (`.husky/post-commit`) in favour of Railway's GitHub deploys.
