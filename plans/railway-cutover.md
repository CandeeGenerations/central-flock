# Switching Central Flock from the Mac mini to Railway

Status: **draft guide, written 2026-11-24, before any of it exists.** This moves **today's Express +
Vite app** — the TanStack Start rewrite happens afterwards, on Railway (plan decision 18). Commands
that depend on code not written yet (the sandbox hard stop, the cgen-api bridge, the snapshot job)
are marked _(once built)_.

After the switch the **Mac mini stays on**: it runs cgen-api, the tunnel for `api.cgen.cc`, and the
iCloud backup pull. Only the `cc.cgen.central-flock` service is retired. Re-read this guide against the real code before cut-over day, and update
it as each piece lands.

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

## Phase 0 — Gates (all must be true before Phase 1 starts on real data)

- [ ] The app runs as a production build locally — `pnpm build`, then
      `CENTRAL_FLOCK_SANDBOX=1 tsx --import ./server/lib/sentry.ts server/index.ts` against a seeded
      database — with Express serving `dist/` and every section of the parity checklist (Phase 3) passing.
- [ ] Seed script _(once built)_ fills an empty database with fake data (555-0100–0199 numbers).
- [ ] `vite:preloadError` reloads the page once, so a deploy doesn't strand open tabs.
- [ ] **Sandbox hard stop** implemented and tested: with `CENTRAL_FLOCK_SANDBOX=1`, a unit test per
      outbound client (cgen-api bridge, `createMessage`, MCP, Notion, webhook sender) proves nothing
      leaves the process, and the send flow still records a fake success.
- [ ] **cgen-api Mac bridge** endpoints exist and are tested from the Mac: send text, send image,
      read contacts, create contact, list calendars, fetch calendar events.
- [ ] **Send allow-list** implemented: `SEND_ALLOWLIST` (comma-separated E.164 numbers). When set,
      the bridge client refuses any recipient not on it, even with sandbox off. Used once in Phase 3
      to prove a real send through cgen-api to your own phone.
- [ ] `/webhooks/*` hardened: constant-time secret compare and rate limiting.
- [ ] Nightly snapshot job _(once built)_ writes `/data/backups/nightly.db` (via `db.backup()`) and
      `/data/backups/uploads.tar.gz`.
- [ ] Boot-time import _(once built)_: **only when `CENTRAL_FLOCK_SANDBOX=1`**, if
      `/data/incoming/central-flock.db` exists, the server moves it over `/data/central-flock.db`
      (and unpacks `/data/incoming/uploads.tar.gz` into `/data/uploads`) before opening the
      database, then deletes the incoming files. With sandbox off it refuses and logs loudly, so a
      stray upload can never overwrite live data.

## Phase 1 — Set up Railway (no real data yet)

1. Create the project and connect the GitHub repo `CandeeGenerations/central-flock`, deploying from
   `main`. Pushes to `main` now deploy to both the Mac (post-commit hook) and Railway — fine while
   Railway is in sandbox.
2. Add a volume mounted at `/data`.
3. Build command `pnpm build`; pre-deploy command `pnpm db:migrate`; start command
   `pnpm exec tsx --import ./server/lib/sentry.ts server/index.ts` (no `watch`). Replicas: **1**.
   (These change again when the Start rewrite lands.) `tsx` is a devDependency today, so either
   move it to `dependencies` or make sure Railway's build keeps dev dependencies installed.
4. Variables:

   | Variable                                                                                             | Value now                                                      | At the switch                                 |
   | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
   | `CENTRAL_FLOCK_SANDBOX`                                                                              | `1`                                                            | removed                                       |
   | `CENTRAL_FLOCK_DB_PATH`                                                                              | `/data/central-flock.db`                                       | same                                          |
   | `UPLOADS_DIR`                                                                                        | `/data/uploads`                                                | same                                          |
   | `AUTH_PASSWORD_HASH`, `JWT_SECRET`, `JWT_EXPIRY`                                                     | **set from day one** — this environment will hold real data    | same                                          |
   | `SENTRY_*`, `VITE_SENTRY_DSN`                                                                        | set, `SENTRY_ENVIRONMENT=railway-rehearsal`                    | `production`                                  |
   | `FLOCK_PUBLIC_URL`, `CENTRAL_FLOCK_PUBLIC_URL`, `RSVP_PUBLIC_URL_BASE`, `ATTENDANCE_PUBLIC_URL_BASE` | production values                                              | same                                          |
   | `CGEN_API_URL`, `CGEN_API_KEY` _(bridge)_                                                            | **not set**                                                    | set, **sealed**                               |
   | `ANTHROPIC_API_KEY`                                                                                  | **not set**                                                    | set, **sealed**                               |
   | `CENTRAL_FLOCK_INTERNAL_SECRET`                                                                      | a new random value, **sealed**                                 | rotated again, **sealed**                     |
   | `CONNECTIONS_KEY`                                                                                    | same as the Mac (so saved Canva/Metricool connections decrypt) | same                                          |
   | `SEND_ALLOWLIST`                                                                                     | not set                                                        | not set (only during the Phase 3 bridge test) |

5. Backups: on the volume's **Backups** tab, turn on daily, weekly and monthly. **Confirm the tab
   exists on Hobby** — if it doesn't, stop and revisit decision 10.
6. Custom domain `flock-next.cgen.cc`: add it in Railway, then create the CNAME (and verification
   TXT record) Railway shows in Cloudflare DNS. Leave `flock.cgen.cc` alone.
7. **Leave PR environments off.** Railway's docs don't say whether a PR environment gets a copy of
   the base environment's volume, and this one will hold real data. Turn them on only after
   checking (see "After the switch").
8. Deploy. With an empty volume the server should migrate, seed nothing, start in sandbox mode and
   log `Sandbox: background jobs disabled`. Log in at `https://flock-next.cgen.cc`.

## Phase 2 — Nightly sandbox copy of the live data

Each night, the Mac sends Railway a fresh copy of the live data. Railway only accepts it in sandbox mode.

1. On the Mac, install the Railway CLI and create a **project token** for `central-flock`
   (`production`). Store it in the `cc.cgen.central-flock-backup` plist's environment, the same way
   other secrets live in plists today.
2. Add a `scripts/push-rehearsal-copy.sh` _(once built)_, run nightly after the existing backup:

   ```bash
   SRC=/Users/cgen01/repos/cgen/central-flock/central-flock.db
   UP="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock"
   TMP=$(mktemp -d)
   sqlite3 "$SRC" ".backup '$TMP/central-flock.db'"
   sqlite3 "$TMP/central-flock.db" "pragma integrity_check" | grep -qx ok
   tar -czf "$TMP/uploads.tar.gz" -C "$UP" events-story music-scans prayer-sheets scan-images schedule-logos special-music
   railway volume files upload "$TMP/central-flock.db" /data/incoming/central-flock.db
   railway volume files upload "$TMP/uploads.tar.gz" /data/incoming/uploads.tar.gz
   railway redeploy --yes
   rm -rf "$TMP"
   ```

   (Check the exact `railway` flags against the CLI version you install.)

3. Run it once by hand. After the redeploy, check on `flock-next.cgen.cc` that the people count
   matches the Mac (946 at the time of writing) and that a few uploaded images load.
4. Leave it running nightly through Phases 3 and 4.

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

1. **Real send through the bridge, to yourself only.** Set `SEND_ALLOWLIST` to your own number,
   `CGEN_API_URL` and `CGEN_API_KEY` (sealed), and remove `CENTRAL_FLOCK_SANDBOX` for this test only.
   Before removing it, **pause the nightly push job and confirm no scheduled message, birthday or
   fair-booth reminder is due in the next hour** — schedulers start when sandbox is off. Send one
   text and one image to yourself. Then put `CENTRAL_FLOCK_SANDBOX=1` back, remove `SEND_ALLOWLIST`
   and the bridge variables, redeploy, and resume the nightly push.
2. **Contacts and calendar through the bridge:** in the same window, open the Contacts import
   preview and the calendar page; both should show Mac data.
3. **Webhooks:** from the Mac, call each `/webhooks/*` endpoint on `flock-next.cgen.cc` with the
   Railway secret (GET endpoints only, or POST against fake tokens), confirming the paths and the
   401 for a wrong secret.
4. **Backups:** take a manual Railway backup, restore it, check the data, and note how long the
   restore took.
5. **iCloud pull:** run the new pull version of `backup-dbs.sh` _(once built)_ from launchd (not a
   terminal), confirm a dated folder appears with `central-flock.db` and `uploads.tar.gz`, and open
   the `.db` with `sqlite3 ... "pragma integrity_check"`.
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
   seal `CGEN_API_URL`, `CGEN_API_KEY` and `ANTHROPIC_API_KEY`; generate a new
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
9. **Switch the iCloud backup to pull mode.** Replace `backup-dbs.sh` with the pull version
   _(once built)_ and load the job again:
   ```bash
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
- [ ] The next morning: a new dated iCloud folder exists and its `.db` passes `integrity_check`;
      Railway's daily backup ran.

## Rollback

**Within 14 days, if Railway misbehaves.** The Mac is untouched, so rolling back means bringing
Railway's newer data home:

1. In Railway, set `CENTRAL_FLOCK_SANDBOX=1` and deploy, so it stops sending.
2. Download the latest data: let the snapshot job write `/data/backups/nightly.db` (or trigger it),
   then `railway volume files download /data/backups/nightly.db ./central-flock.db.from-railway`,
   and the same for `uploads.tar.gz`.
3. Check it with `pragma integrity_check`, then replace the Mac's `central-flock.db` (remove any
   leftover `-wal`/`-shm`) and unpack the uploads into the iCloud `UPLOADS_DIR` subfolders.
4. In Railway, remove the `flock.cgen.cc` custom domain. In `~/.cloudflared/config.yml`, uncomment
   the `flock.cgen.cc` rule, recreate the tunnel DNS record, and restart the tunnel.
5. Set cgen-api's `CENTRAL_FLOCK_BASE_URL` back to `http://localhost:5172` with the old secret and restart it.
6. Start the Mac app: `launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/cc.cgen.central-flock.plist`.
7. Put the old `backup-dbs.sh` back and reload the backup job.

**If it's the first hour and nothing has changed on Railway yet:** skip steps 2–3 and go straight
to 4–7. The Mac database is exactly as it was at the switch.

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
