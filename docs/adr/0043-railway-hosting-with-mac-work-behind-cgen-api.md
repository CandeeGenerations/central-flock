---
status: accepted
---

# Central Flock runs on Railway with SQLite on a volume; Mac-only work goes through cgen-api

Central Flock moves off the Mac mini to a single Railway (Hobby) service. The SQLite database and
uploads live on a Railway volume at `/data`, and the app is served as a built bundle, not
`pnpm dev`. The parts that can only run on a Mac go through **cgen-api**, which stays on the Mac
mini: sending texts and images through Messages, reading and creating Contacts, reading calendars
through EventKit, and Reminders. Railway calls cgen-api at `api.cgen.cc` through the
`cgen-tunnel` Cloudflare tunnel (push). Calls the other way are unchanged: the public apps post to
cgen-api, which forwards to Central Flock's `/webhooks/*` with the internal secret (ADR 0014 still
applies). The move happens before the TanStack Start rewrite (ADR 0044), and the Mac service stays
live until Railway has passed a full rehearsal ([plans/railway-cutover.md](../../plans/railway-cutover.md)).

The reason is coding agents, not hosting cost. While production is `pnpm dev` running in the repo
folder against the only database, every saved edit goes live and nothing can be tested safely, so
Claude Code can't work in parallel or from the cloud. Railway deploys from GitHub and gives each
pull request its own short-lived environment. Moving also ends the dev-server pushes that reloaded
every open tab: the service log showed 5,130 hot updates and 45 full reloads.

## Considered options

- **Supabase (Postgres + Storage).** Rejected for effort, not price (about $10/month on the
  existing org). The server uses better-sqlite3's synchronous API: 919 `.run()`/`.all()`/`.get()`
  calls, 27 transactions and 64 SQLite migrations would all have to become async and be ported.
  Turso and D1 have the same problem. Supabase also only hosts the database, so a server host is
  still needed.
- **Netlify / Cloudflare (serverless).** Fine for a static frontend, but the server needs a disk,
  six in-process schedulers, Server-Sent Events and long Claude calls. Moving would be a rewrite.
- **AWS Lightsail.** Same price ($7–12/month) on an existing account, but deploys, TLS, OS updates
  and backups would all be do-it-yourself, and there are no per-PR environments.
- **Render.** No usage-based billing: the 512 MB size ($7) is too tight for this server and the
  next size up is $25. Full-stack previews need the $25/month Pro workspace.
- **A pull model, where the Mac polls Railway for queued sends.** It would survive the Mac being
  off, but contacts and calendar reads need an immediate answer anyway, and it would add an outbox.
- **Public apps calling Railway directly.** It would keep RSVP and attendance up when the Mac is
  off, but it needs public unauthenticated routes, which ADR 0014 rejected.

## Consequences

- **The Mac mini stays on.** It runs cgen-api, the tunnel for `api.cgen.cc` and the iCloud backup
  pull. If it's off, texts, images, contacts and calendar reads, and the public apps all stop. The
  queue retries sends rather than failing them.
- **Exactly one replica.** The schedulers run in-process, and a second instance would double-send.
- **Test environments must never reach the outside world.** `CENTRAL_FLOCK_SANDBOX=1` becomes a
  hard stop on cgen-api, `createMessage`, MCP, Notion and webhooks, checked inside each client, not
  in each feature. The cgen-api key and the Anthropic key are sealed Railway variables, so PR
  environments never get them. Test environments start from a fake-data seed (phone numbers in
  555-0100–0199), never a copy of production. A new outbound integration has to add its own
  sandbox check.
- **`/webhooks/*` becomes internet-facing.** Today it's reachable only from the Mac. So the
  internal secret is rotated, compared in constant time and rate-limited.
- **Backups happen twice:** Railway volume backups (daily, weekly, monthly), and a nightly
  `db.backup()` snapshot that the Mac downloads into iCloud Drive, so a copy always lives outside
  Railway.
- **What stops being true:** "production is the only DB", "the service runs `pnpm dev`" and
  "saved edits go live" in RUNBOOK.md, CLAUDE.md and the auto-memory notes. Those get rewritten at
  cut-over. The post-commit deploy hook is retired in favour of Railway's GitHub deploys.
- **Still unconfirmed in Railway's docs:** whether PR environments get a copy of the base volume.
  PR environments stay off until a throwaway PR shows the volume is empty.
