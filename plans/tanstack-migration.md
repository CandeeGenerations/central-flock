# TanStack Migration

Status: **Decisions settled (2026-11-24); phased plan drafted below. Nothing built yet.** The
numbered decisions further down are the record of why; the "Phased plan" section is what to do.

Researched 2026-11-24. Maturity labels come from [tanstack.com/libraries](https://tanstack.com/libraries)
on that date and move fast — recheck before starting each phase.

Recorded decisions: [ADR 0043 — Railway hosting, Mac work behind cgen-api](../docs/adr/0043-railway-hosting-with-mac-work-behind-cgen-api.md)
and [ADR 0044 — full TanStack Start rewrite in SPA mode](../docs/adr/0044-full-tanstack-start-rewrite-in-spa-mode.md).

## Goal

1. Assess every TanStack library for fit with Central Flock: adopt, pilot or skip.
2. A phased plan to adopt the chosen libraries and convert existing code.
3. Documentation so future features use the shared packages and components by default.

## Phased plan

Each phase ends in something working in production. Nothing in a later phase starts until the
phase before it is done, except where noted.

### Phase 1 — Get ready for Railway (Express, on the Mac, normal PRs)

**Done 2026-11-24** (merged at `9340358`; cgen-api at `3ef05c0`). The Mac already sends through the
cgen-api bridge. Details and what is left to check: [railway-cutover.md](./railway-cutover.md) Phase 0.

Everything [railway-cutover.md](./railway-cutover.md) Phase 0 lists as a gate, built in today's
Express app. Independent pieces, so they can be built in parallel:

- **Sandbox hard stop** in each outbound client (decision 6), with a unit test per client.
- **cgen-api bridge:** new cgen-api endpoints (send text, send image, read/create contacts, list
  calendars, fetch events), and a Central Flock client that replaces direct calls to
  `services/applescript.ts` and `services/calendar.ts`. Queue retries when cgen-api is unreachable.
- **Send allow-list** (`SEND_ALLOWLIST`).
- **Webhook hardening:** constant-time secret compare, rate limit on `/webhooks`.
- **Seed script** with fake data (555-0100–0199 numbers), run on an empty database.
- **Nightly snapshot job** and the **sandbox-only import** at boot.
- **`vite:preloadError` reload-once.**
- **Production start command** works locally (`pnpm build` + `tsx` without watch, sandbox on).

**Done when:** every Phase 0 box in the cut-over guide is ticked.

### Phase 2 — Move to Railway

Follow [railway-cutover.md](./railway-cutover.md) Phases 1–4: set up Railway, nightly sandbox copy,
rehearsal and parity checklist on `flock-next.cgen.cc`, then switch-over day. Mac service stays live
throughout; the `flock.cgen.cc` tunnel route comes out only after Railway is verified.

**Done when:** the guide's "Verify" list passes, the first nightly iCloud pull lands, and 14 days
pass without a rollback. Then the guide's "After the switch" list: retire the Mac service, turn on
PR environments (once confirmed empty), add the `staging` environment (decision 22), update
RUNBOOK.md, CLAUDE.md and the auto-memory.

### Phase 3 — Conventions groundwork (before the rewrite starts)

- Create `docs/conventions/` with the files that already apply (outbound calls and sandbox, seed
  data, schedulers and the one-replica rule, deploy and staging) and link each from CLAUDE.md.
- Install TanStack Intent and the official skills for Query, Router and Start.
- Add the first lint rules (decision 25) for things already true: no raw `fetch` to outside
  services outside the approved clients.

### Phase 4 — The Start rewrite (`feat/tanstack-start`, all at once)

Decisions 11, 12, 15, 16, 20–23 and ADR 0044. `main` takes fixes only from the day the branch is cut.

1. Scaffold Start in SPA mode beside the existing code; one server start-up hook for schedulers,
   queue and recoveries (sandbox-aware, double-start guarded).
2. `query-keys.ts` → `queryOptions` factories per domain.
3. Port endpoints to server functions / server routes, keeping `/webhooks/*` paths byte-identical.
4. Port routes to TanStack Router file routes, section by section on sub-branches (one agent per
   section), with Zod-validated search params and loaders using `ensureQueryData`. Carry over
   ADR 0036's daily-core vs lazy-cluster split.
5. Delete Express, React Router and `manualChunks`.
6. Weekly `main` → branch merge; carry-over list kept in the PR description.
7. CI check that `server/db/schema.ts` and migrations match `main`.
8. Parity checklist on the PR environment (seed data), then on `staging` (live-data copy).
9. Merge day: manual backup, merge, verify; rollback = revert.

**Done when:** merged, verified, carry-over list empty. The freeze on `main` ends. Add the lint
rules that ban `react-router-dom` and Express imports, and write the routes, data-loading and
server-functions conventions files.

### Alongside Phase 5 — Central Flock MCP server

Built Start-first once the rewrite has merged: one general MCP server at `flock.cgen.cc/mcp` with
OAuth via Central Flock's login, starting with devotion Passage tools for the Grok bot and nursery
tools. Design: [central-flock-mcp.md](./central-flock-mcp.md).

### Phases 5–8 — Library phases on `main` (decision 24)

Ordinary PRs, one section per PR where it splits that way. Each phase finishes by writing its
conventions file and adding its lint rule.

| Phase | Library                                                                   | Lint rule added when it's done                                                      |
| ----- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 5     | Devtools (dev only), Pacer, Hotkeys                                       | ban `use-debounced-value`, `use-keyboard-shortcuts` imports                         |
| 6     | Table (shared data-table component)                                       | `react/forbid-elements` on raw `<table>` outside `components/ui`                    |
| 7     | Form + Zod (hooks layer first: autosave, Unsent Message, unsaved changes) | ban ad-hoc form state patterns where detectable; conventions file is the main guard |
| 8     | DB pilot on People and Groups, then go/no-go                              | — (decided after the pilot)                                                         |

### After the migration

- Service worker revisit (decision 19) with its own ADR superseding 0036.
- Charts, Virtual and the skipped libraries: recheck only if a real need appears.

## Where the app stands today

| Area         | Current approach                                                                                                      | Scale                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Routing      | React Router 7 (`createBrowserRouter` wrapping `<Routes>` in `src/App.tsx`)                                           | 103 `<Route>`s, 34 page entries, 20 files call `useSearchParams`                 |
| Server state | TanStack Query 5, hand-written `src/lib/query-keys.ts`, `src/lib/api.ts` fetch helpers                                | 205 `useQuery`, 231 `useMutation`, 251 `invalidateQueries`, 5 optimistic updates |
| Tables       | shadcn `ui/table` + custom `sortable-table-head`, `ui/pagination`                                                     | 51 files with tables, 26 using pagination                                        |
| Forms        | Plain `useState` per field; `use-autosave`, `use-unsent-message`, `use-unsaved-changes` hooks                         | ~72 files with `<Input>`; no validation library                                  |
| Debounce     | `use-debounced-value`, `autosave-queue`                                                                               | 31 files                                                                         |
| Keyboard     | `use-keyboard-shortcuts`, cmdk command palette                                                                        | 5 files                                                                          |
| Client state | 3 React contexts, `use-persisted-state` (localStorage)                                                                | 19 files                                                                         |
| Live data    | `use-sse` (Server-Sent Events)                                                                                        | 7 files                                                                          |
| Charts       | recharts                                                                                                              | 6 files                                                                          |
| AI           | `createMessage` in `server/lib/anthropic-client.ts`, models in `server/lib/ai-models.ts`, `pnpm test:ai`              | 15 server callers, single-shot calls                                             |
| Server       | Express 5, 42 route files, 161 server files (AppleScript, message queue, webhooks, MCP client, public attendance API) | runs under launchd as `pnpm dev` behind the `cgen-tunnel` Cloudflare tunnel      |

## Assessment by library

### Adopt

| Library      | Maturity            | Verdict            | Why                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Query**    | stable              | Keep, deepen       | Already in use. Move `query-keys.ts` to `queryOptions` factories per domain so the router's loaders and components share one definition.                                                                                                                                                           |
| **Router**   | stable              | Adopt              | Biggest gain for the work. It gives typed route params and typed URL query parameters (validated search schemas replace the 20 hand-rolled `useSearchParams` files). Loaders can preload Query data (`ensureQueryData`), and lazy routes would replace the manual chunk setup in `vite.config.ts`. |
| **Table**    | "fresh" (new major) | Adopt              | 51 hand-built tables and 26 pagination sites. One shared table component would standardise sorting, filtering, pagination and column visibility. Pin the version because the major is new.                                                                                                         |
| **Form**     | stable              | Adopt              | Replaces per-field `useState` with typed form state and validation. It needs a Standard Schema validator — Zod would be a new dependency. The existing autosave and unsent-message hooks have to be re-seated on top of it (see ADR 0035).                                                         |
| **Pacer**    | beta                | Adopt (small)      | Replaces `use-debounced-value` and the debounce inside `autosave-queue`. Its non-reactive debouncer fits `use-unsent-message`, which deliberately avoids re-renders.                                                                                                                               |
| **Hotkeys**  | beta                | Adopt (small)      | Replaces `use-keyboard-shortcuts`. Gives the command palette keyboard scopes and shortcut sequences.                                                                                                                                                                                               |
| **Devtools** | alpha               | Adopt (dev-only)   | Panel for Query, Router, Form and Pacer. Today's production runs `pnpm dev`, so `import.meta.env.DEV` is true in prod — but after the Railway move (decision 18) production is a built app, so ordinary dev-only gating works. Adopt it only after cut-over.                                       |
| **Intent**   | alpha               | Adopt (docs phase) | TanStack packages ship agent skills. Wiring it in means future Claude sessions load the official usage guides — directly serves goal 3.                                                                                                                                                            |

### Pilot one area first

| Library | Maturity                   | Verdict            | Why                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DB**  | 1.0 RC (RC1 on 2026-10-29) | Pilot after Router | Keeps whole collections on the client, with live queries and changes shown before the server confirms them. That fits a small church dataset and could retire most of the 251 manual invalidations. But it changes the data layer everywhere and isn't final yet. Pilot on People and Groups using `query-db-collection` against the existing REST API, then decide. |

### Skip

| Library                       | Maturity        | Why skip                                                                                                                                                                                                        |
| ----------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start**                     | v1              | **Moved to Adopt** — decision 11.                                                                                                                                                                               |
| **AI**                        | "fresh"         | Built for agent loops and chat interfaces. The app's 15 AI calls are single calls through `createMessage`, with a pre-commit smoke test and models set in one file. Switching undoes that setup for no benefit. |
| **Store**                     | alpha           | Only 3 React contexts; not worth an alpha dependency.                                                                                                                                                           |
| **Virtual**                   | stable          | Add only if a list proves slow. Church lists are hundreds of rows, not tens of thousands.                                                                                                                       |
| **Charts**                    | unlabelled, new | Too new to judge; recharts covers 6 files fine. Revisit later.                                                                                                                                                  |
| **Markdown**                  | unlabelled      | No use in the app today.                                                                                                                                                                                        |
| **Highlight**                 | unlabelled      | No use in the app today.                                                                                                                                                                                        |
| **Redact**                    | unlabelled      | A replacement React runtime — out of scope.                                                                                                                                                                     |
| **Config**                    | —               | For publishing npm packages.                                                                                                                                                                                    |
| **CLI / Application Starter** | alpha           | For scaffolding new projects.                                                                                                                                                                                   |

## Open decisions

1. **Router only, or full Start?** Recommendation: **Router only, keep Express.** Start would mean
   rebuilding the 161 server files (AppleScript, message queue, webhooks, MCP, the attendance API)
   as Start server functions, and changing how launchd and the Cloudflare tunnel serve the app.
   Server-side rendering does nothing for a single-user app on phone and iPad, and could conflict
   with the iOS relaunch behaviour in ADR 0036. Start is built on Router, so moving later stays
   possible. **Decided: Start** — see decision 11 below.

## Cloud split: separating the Mac-only parts

Added 2026-11-24. This decides where the app runs, so it comes before the TanStack phases — in
particular it reopens the Router-vs-Start question (Start deploys to Netlify and Cloudflare).

### What actually needs the Mac mini

| Capability               | How it works                                                                                                                                     | Called from                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Send text**            | `sendMessageViaUI` — pbcopy, then System Events keystrokes into Messages (select all, paste, Return), then reads the field back to check it sent | `routes/messages.ts` via the message queue, `services/scheduler.ts` (scheduled sends), `birthday-scheduler.ts` (fallback digest), `fair-booth-reminders.ts` |
| **Send image**           | `sendImageViaUI` — image to clipboard, paste, optional caption                                                                                   | `routes/schedules.ts`, `routes/nursery.ts`                                                                                                                  |
| **Read/create contacts** | AppleScript `tell application "Contacts"`                                                                                                        | `routes/contacts.ts` (Contacts import)                                                                                                                      |
| **Read calendars**       | `server/bin/calendar-fetch.swift` (EventKit)                                                                                                     | `routes/calendar.ts`, `calendar-print.ts`, `settings.ts`, `calendar-sync.ts` scheduler                                                                      |
| **Reminders**            | Already in cgen-api (`services/reminders.ts`)                                                                                                    | cgen-api only                                                                                                                                               |
| **Messages watchdog**    | `cc.cgen.messages-restart` launchd job runs `scripts/restart-messages.sh`                                                                        | launchd                                                                                                                                                     |

That's 4 functions in `services/applescript.ts` plus the Swift calendar script. Everything else is
ordinary Node.

### Not Mac-specific, but tied to "one long-running box"

These block serverless hosts (Netlify Functions, Cloudflare Workers), not cloud hosting in general:

- **SQLite file** (`central-flock.db`, 15 MB) via better-sqlite3, a native module.
- **Uploads on local disk**: `UPLOADS_DIR` points at iCloud Drive (`Backups/central-flock/`, ~16 MB across `events-story`, `music-scans`, `prayer-sheets`, `scan-images`, `schedule-logos`, `special-music`), served at `/uploads`. The same folder also holds the 5 dated DB backups. (The repo's `data/` folder is the unused default, not the live uploads.)
- **6 in-process schedulers** started in `server/index.ts` (scheduled messages, birthdays, fair booth
  reminders, calendar sync, specials, music scan cleanup).
- **Server-Sent Events** for live progress (7 client files).
- **Long Claude calls** and the MCP client (Canva/Metricool sign-in), which can outrun function time limits.

### What cgen-api is today

A small Express server **on the same Mac mini** (port 5180, `api.cgen.cc` via the `cgen-tunnel`
Cloudflare tunnel). Its own CLAUDE.md calls it a "standalone Express API server for macOS
automation". It does two jobs:

1. Mac automation: Apple Reminders through AppleScript.
2. Public proxy: holds `X-Internal-Secret` and forwards the RSVP, attendance, nursery, sermons and
   quotes public apps to Central Flock's `/webhooks/*` (ADR 0014).

So it's already the natural home for a "Mac bridge" — but it isn't in the cloud, and its proxy job
only exists because Central Flock sits behind the home tunnel.

### Hosting options for the rest of the app (first look)

| Option                                                                    | Fit                                                | Cost of moving                                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Container host with a disk** (Fly.io, Railway, Render)                  | Runs Express, SQLite, schedulers and SSE unchanged | Low: Dockerfile, volume for DB and uploads, env vars, deploy from GitHub                                        |
| **Netlify / Cloudflare (serverless)**                                     | Static frontend is ideal; the server is not        | High: SQLite → D1/Turso, uploads → R2/blob storage, schedulers → cron triggers, SSE and long AI calls rethought |
| **Split** — frontend on Netlify/Cloudflare Pages, API on a container host | Fast static app, simple server                     | Low–medium: CORS/cookies across domains, or a proxy rule                                                        |

### Open decisions (cloud split)

2. **What does "work with agents in the cloud" mean?** — **Decided: coding agents.** Claude Code
   working on the code from the cloud, without needing a Remote Control session on the Mac mini. So
   the goal is a GitHub-driven deploy and somewhere safe for agents to run the app, not runtime AI
   agents.

### Host costs (checked 2026-11-24)

Assumed size: one always-on Node server, ~1 GB RAM, under 1 GB of disk (DB 15 MB + uploads ~16 MB,
plus room for backups), very little traffic. Prices are list prices from the sources below; several
come from third-party pages, so confirm on each provider's pricing page before signing up.

| Option                          | What you get                                                             | Monthly cost                                                                                                                                        | Moving effort                                                                   | Fits coding agents?                                                   |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Railway (Hobby)**             | Container from GitHub, volume for SQLite + uploads                       | $5 plan, includes $5 of usage; volume $0.15/GB. Likely **$5–11** (see below)                                                                        | Low: Dockerfile or Nixpacks, mount a volume                                     | **Best:** per-PR environments (verify on Hobby)                       |
| **Fly.io**                      | Container ("Machine") + volume                                           | shared-cpu-1x 1 GB ≈ **$6.70** (third-party figure after the Oct RAM increase) + volume $0.15/GB → **~$7**                                          | Low: Dockerfile + `fly.toml`                                                    | Good: deploy from GitHub Actions; previews are DIY                    |
| **Render**                      | Web service + persistent disk                                            | $7 (512 MB, tight) or $25 (2 GB) + disk $0.25/GB → **$7.25 or $25.25** (see below)                                                                  | Low                                                                             | Limited on Hobby: single-service previews, 2 environments per project |
| **AWS Lightsail**               | A plain Linux VM                                                         | **$7** (1 GB, 40 GB SSD, 2 TB transfer) or **$12** (2 GB)                                                                                           | Medium: you run Docker, TLS, OS updates, backups and the deploy script yourself | Weak: no GitHub deploys or previews unless you build them             |
| **AWS Fargate + load balancer** | Managed containers                                                       | ~$9 task + ~$16+ load balancer + public IP → **~$30+**                                                                                              | Medium–high                                                                     | Possible, but heavy for one app                                       |
| **Supabase**                    | Postgres database + file storage — **not** a host for the Express server | If the Lockstep org is already on Pro: about **+$10** for a second project (the $10 compute credit covers one Micro). If not: **$25** Pro + compute | **High** — see below                                                            | Database branching exists, at extra compute per branch                |
| **Netlify / Cloudflare**        | Static frontend (free tier)                                              | **$0** for the frontend                                                                                                                             | Server can't run there without a rewrite                                        | Good for frontend previews only                                       |

### Railway vs Render, from their pricing pages

Read from [railway.com/pricing](https://railway.com/pricing) and [render.com/pricing](https://render.com/pricing) on 2026-11-24.

|                         | Railway Hobby                                                       | Render Hobby workspace                                                                              |
| ----------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Plan fee                | $5/month, includes $5 of usage (resets monthly, doesn't roll over)  | $0 + compute                                                                                        |
| How compute is billed   | By actual use, per second: RAM ~$10/GB-month, CPU ~$20/vCPU-month   | Fixed instance size per month                                                                       |
| Sizes                   | Up to 48 vCPU / 48 GB per service                                   | 512 MB / <1 CPU **$7**; 2 GB / 1 CPU **$25**; nothing in between                                    |
| Disk                    | $0.15/GB-month; **max 5 GB** volume on Hobby                        | $0.25/GB-month                                                                                      |
| Bandwidth               | $0.05/GB egress                                                     | 5 GB included, then $0.15/GB                                                                        |
| Always on?              | Yes (only the Free plan sleeps)                                     | Yes on paid instances; the free instance can't take a disk                                          |
| Previews / environments | Not shown on the pricing page — **verify** PR environments on Hobby | Single-service previews only; 2 environments per project (Pro, $25/month, gets full-stack previews) |
| Logs                    | 7 days                                                              | 7 days                                                                                              |
| Seats                   | 3 members per project                                               | 1 seat                                                                                              |

**This app on each** (one Node server averaging ~0.4 GB RAM and a few percent of a CPU, 1 GB disk):

- **Railway:** about 0.4 GB × $10 + 0.03 vCPU × $20 + $0.15 ≈ **$4.75 of usage, covered by the $5
  credit → $5/month.** If memory sits near 1 GB all month: ≈ $11. A PR environment adds usage only
  while it runs; a short-lived one costs cents, one left up all month adds ~$4–5.
- **Render:** **$7.25/month** on 512 MB, but that's tight for this server (Anthropic SDK, exceljs, MCP
  client, Sentry) and an out-of-memory restart kills in-flight sends. The safe size is 2 GB, **$25.25/month**.
  A full-stack preview per PR needs the Pro workspace (+$25/month).

### Railway PR environments (from docs.railway.com, 2026-11-24)

Source: [Railway environments guide](https://docs.railway.com/guides/environments), plus the
[volumes](https://docs.railway.com/reference/volumes), [backups](https://docs.railway.com/volumes/backups),
[variables](https://docs.railway.com/guides/variables) and [pricing FAQ](https://docs.railway.com/pricing/faqs) pages.

| Question                | What the docs say                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On Hobby?               | Not gated by plan anywhere in the docs; turned on in Project Settings → Environments. No environment-count limit is listed. **Not explicitly confirmed for Hobby.**           |
| Lifecycle               | Created when a PR opens; "deleted as soon as these PRs are merged or closed."                                                                                                 |
| Claude Code PRs         | Yes — an **Enable Bot PR Environments** toggle covers GitHub bots and names Claude Code.                                                                                      |
| Volume data             | **Not documented.** No volume fork or clone feature; backups restore only into the same environment. Expect an empty volume, so a PR copy has no data unless it seeds itself. |
| Variables               | Copied from the base environment, **except sealed variables**, which are never copied.                                                                                        |
| Billing                 | Billed at normal usage rates; by inference, draws from the Hobby $5 credit.                                                                                                   |
| Focused PR environments | Deploys only the services the PR's changed files affect.                                                                                                                      |

**Safety consequence:** a PR copy inherits every unsealed variable from production. If the Mac
bridge's address and secret were plain variables, an agent's test copy could send real texts to real
people. The existing `CENTRAL_FLOCK_SANDBOX=1` flag (`server/index.ts:187`) only stops the background
schedulers — a manual send from the test copy would still go out. So the bridge secret must be
**sealed**, and sandbox mode must also refuse sends, calendar writes and AI calls at the bridge
boundary, not just skip schedulers.

**Data consequence:** with no copy of the volume, a PR environment starts with an empty database. It
needs either a seed script (fake people, groups, messages) or a scrubbed copy of production restored
into it.

**Verdict:** Railway is cheaper at this size (about $5 vs $25 for a safe amount of memory) because it
bills what the app actually uses, and it fits a per-PR test copy for coding agents. Render's
advantage is a fixed bill. Railway's 5 GB volume cap on Hobby is fine (the DB and uploads total ~31 MB).

### Decided (2026-11-24)

3. **Host: Railway (Hobby), SQLite on a Railway volume.** Cheapest at this size (~$5/month), keeps the
   919 synchronous SQLite calls as they are, and gives Claude Code pull requests their own test copy.
   Supabase and Lightsail were rejected (database rewrite, and do-it-yourself deploys, respectively).
4. **Mac-only work goes through cgen-api.** Texts, images, Contacts, Calendar and Reminders stay on
   the Mac mini behind cgen-api, which is already the Mac automation server. Central Flock in the
   cloud calls it; nothing else in the cloud touches the Mac.
5. **Test copies use fake seed data**, never a copy of production.
6. **A test copy never reaches outside itself** — not cgen-api, and not any other outside service (list below).

### Notes: seeding test copies

- **Empty start:** a Railway PR environment starts with an empty volume, so the server runs
  migrations and then a seed script when the database is empty.
- **What the seed creates:** enough fake data to click through every section — people (with
  birthdays), groups, households, sent and scheduled messages, drafts, templates and global variables,
  devotions, sermons, music schedules, nursery and special music, attendance, RSVP events, Fill
  America, fair booth. It grows with the app: **a new table or feature adds seed rows in the same
  change** (goes into the conventions docs, step 3).
- **Phone numbers:** only from the reserved fictional range **555-0100 to 555-0199**, so a leak
  can't reach a real person.
- **Settings left blank:** `webhookUrl`, `mattermostFallbackUrl`, and any saved connection (Canva,
  Metricool, Notion) are never seeded, so outbound features find nothing to call.
- **Uploads:** a few placeholder images for the features that show them; no files copied from `data/`.
- **Rebuildable:** the same script resets a test copy on demand, and it works locally for agents with
  no cloud environment.
- **Open:** the script shape (TypeScript using the Drizzle schema, so it breaks loudly when the
  schema changes and the column it fills is gone) and whether `pnpm test` should also check it runs.

### Notes: test copies stay inside themselves

Today `CENTRAL_FLOCK_SANDBOX=1` (`server/index.ts:187`) only skips the background schedulers. In the
cloud it becomes a **hard stop on everything that leaves the app**, set on every non-production
Railway environment.

| Outbound path                                                                                                          | Where it is today                                                                       | In a test copy                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **cgen-api (Mac bridge)**: texts, images, Contacts, Calendar, Reminders                                                | `services/applescript.ts`, `services/calendar.ts` (to be replaced by a cgen-api client) | **Blocked.** The bridge client returns a fake success and logs what it would have sent, so the send flow, progress and history still work. The cgen-api secret is a **sealed** Railway variable, so it is never copied into a PR environment. |
| **Anthropic** (15+ AI features)                                                                                        | `createMessage` in `server/lib/anthropic-client.ts`                                     | Blocked, returning a canned response per feature (as the offline tests already do). No `ANTHROPIC_API_KEY` in test copies.                                                                                                                    |
| **Canva, Metricool** (MCP)                                                                                             | `server/lib/mcp-client/client.ts`                                                       | Blocked; no saved connections in the seed.                                                                                                                                                                                                    |
| **Notion**                                                                                                             | `routes/gwendolyn-devotions.ts`                                                         | Blocked.                                                                                                                                                                                                                                      |
| **Notify-me webhook + Mattermost fallback**                                                                            | `services/notify-me.ts`, `routes/settings.ts` test button                               | Blocked; settings blank in the seed.                                                                                                                                                                                                          |
| **Background schedulers** (scheduled messages, birthdays, fair booth reminders, calendar sync, specials, scan cleanup) | `server/index.ts`                                                                       | Not started (as today).                                                                                                                                                                                                                       |
| **Public read-only fetches** (YouTube transcripts, ebible.org, the social S3 bucket)                                   | `youtube-extract.ts`, `bible-verses.ts`, `events-story/run.ts`                          | Allowed: they only read public data. Revisit if one ever writes.                                                                                                                                                                              |
| **Sentry**                                                                                                             | `server/lib/sentry.ts`, `src/lib/sentry.ts`                                             | Kept, tagged `environment: preview`, so test-copy errors don't mix with production.                                                                                                                                                           |
| **Inbound public apps** (RSVP, attendance, nursery, sermons, quotes via cgen-api)                                      | `routes/*-webhook.ts`                                                                   | Never reach a test copy: cgen-api only points at production.                                                                                                                                                                                  |

**Make it hard to bypass:** the check lives in one place per path — the cgen-api client,
`createMessage`, the MCP client, the Notion client and the webhook sender — not in each feature. A new
feature that uses those clients is covered automatically. A new kind of outbound call has to add its
own check and a row in this table (goes into the conventions docs, step 3).

**Defence in depth:** even if the sandbox flag were missing, a test copy has no cgen-api secret and no
Anthropic key (both sealed in production), so cgen-api rejects it and Anthropic calls fail.

7. **Cloud → Mac is push.** Central Flock on Railway calls cgen-api at `api.cgen.cc` through the
   existing Cloudflare tunnel, using cgen-api's `X-API-Key`. Contacts and calendar reads get their
   answer straight away. The message queue stays in Central Flock and retries a send when cgen-api
   can't be reached (Mac asleep, tunnel down) instead of marking it failed.

### Notes: calls from cgen-api into Central Flock (must keep working)

cgen-api's `src/services/central-flock.ts` (`postToCentralFlock` / `getFromCentralFlock`) calls
`CENTRAL_FLOCK_BASE_URL` (today `http://localhost:5172`) with `X-Internal-Secret`:

| cgen-api route         | Central Flock endpoint                                         | For                                           |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `attendance-public.ts` | `GET` + `POST /webhooks/attendance/:token/record`              | Usher attendance entry (ADR 0014, 0015, 0034) |
| `rsvp-public.ts`       | `GET` + `POST /webhooks/rsvp/:token`                           | Public RSVP pages                             |
| `nursery.ts`           | `GET /webhooks/nursery/day`                                    | Nursery day lookup                            |
| `sermons.ts`           | `GET /webhooks/sermons/speaker-keys`, `POST /webhooks/sermons` | Sermon pipeline intake                        |
| `quotes.ts`            | `POST /webhooks/quotes`                                        | Quote intake                                  |

All of them are gated by `requireInternalSecret` at the router level (`server/routes/webhooks.ts:13`).

What changes:

- **Base URL:** `CENTRAL_FLOCK_BASE_URL` in cgen-api's launchd plist moves from localhost to the
  Railway production URL. That's the only change on cgen-api's side for this direction.
- **`/webhooks/*` becomes internet-facing.** Today the tunnel sends `flock.cgen.cc` to Vite, which
  only proxies `/api` and `/uploads` (`vite.config.ts:62`), so `/webhooks` is reachable **only from
  the Mac itself**. On Railway one server answers everything, so the secret becomes the only guard.
  Before going live: rotate `CENTRAL_FLOCK_INTERNAL_SECRET` to a long random value (sealed on Railway),
  compare it in constant time (`crypto.timingSafeEqual` instead of `!==`), and rate-limit `/webhooks`.
- **Latency:** these calls now cross the internet twice (phone → cgen-api on the Mac → Railway → back).
  Fine for these low-volume forms; worth a timeout and a clear error in cgen-api.
- **Mac off = public apps down.** Usher attendance and RSVP still depend on the Mac mini, because
  cgen-api is their front door. Unchanged from today, but no longer the only reason the Mac matters.
- **Test copies never receive these calls**; cgen-api only points at production. Agents test the
  `/webhooks` handlers by calling them directly in the test copy with that copy's own secret.

### Other Mac jobs that touch Central Flock

- **Database backup** (`cc.cgen.central-flock-backup` → `scripts/backup-dbs.sh`): copies the `.db`
  files from the repo folder to iCloud Drive nightly, keeping 5. That file won't be on the Mac any
  more, so backups need a new home (Railway volume backups, and/or a nightly export pulled to the
  Mac). **Open.**
- **Messages watchdog** (`cc.cgen.messages-restart`): stays on the Mac; it supports cgen-api sending.
- **n8n backup alert** (`n8n-workflows/central-flock-backup-alert.json`): follows whatever replaces the backup job.

### Decided: cgen-api stays the front door; `flock.cgen.cc` leaves the tunnel

8. **Every outside caller goes through cgen-api.** _(Narrowed by [ADR 0045](../docs/adr/0045-signed-in-agents-connect-to-central-flock-directly.md): public, unauthenticated callers only; signed-in AI assistants connect directly.)_ The public apps (attendance, RSVP, nursery,
   sermons, quotes) keep posting to `api.cgen.cc`, which forwards to Central Flock with the internal
   secret. No public, unauthenticated routes are added to Central Flock; ADR 0014 stands. Accepted
   cost: when the Mac mini is off, the public apps are down, as they are today.
9. **The `flock.cgen.cc` route comes out of the Cloudflare tunnel.** `flock.cgen.cc` becomes a
   Railway custom domain (DNS record in Cloudflare pointing at Railway; Hobby includes 2 custom
   domains). The tunnel itself — named `cgen-tunnel` — **stays**, because it carries `api.cgen.cc`,
   which both directions now depend on, plus `workflows`, `home`, `projects`, `time` and `cassandra`.
   - Keeping the same hostname means the iPhone/iPad home-screen app, saved links and the
     `FLOCK_PUBLIC_URL` / `CENTRAL_FLOCK_PUBLIC_URL` values in links and RSVP emails keep working.
   - Remove the `flock.cgen.cc → localhost:5173` ingress rule from `~/.cloudflared/config.yml` only
     after the Railway domain is live and verified, then retire the Mac's `cc.cgen.central-flock`
     launchd service.

10. **Backups: Railway volume backups _and_ a nightly copy to iCloud Drive.** Revised the same day:
    first Railway-only, then changed so a copy always lives outside Railway (a Railway account or
    volume problem must not be able to lose the data).
    - **Railway:** volume backups for quick restores (details checked below).
    - **iCloud:** `scripts/backup-dbs.sh` keeps its destination
      (`iCloud Drive/Backups/central-flock`, 5 dated folders) but can no longer `cp` the `.db` file;
      it downloads a nightly snapshot from the Railway volume instead (how, below). Each dated folder
      also gets an uploads tar, because after cut-over the uploads live on Railway, not in this
      folder. The launchd job and the n8n backup alert stay, pointed at the new script.
    - Only production is backed up; test copies hold fake data.
    - Before cut-over: one manual Railway backup + test restore, and one iCloud copy opened and checked.

    **Checked 2026-11-24 — Railway backups on Hobby** ([backups docs](https://docs.railway.com/volumes/backups),
    [volumes](https://docs.railway.com/reference/volumes), [SSH](https://docs.railway.com/cli/ssh)):

    | Question    | Answer                                                                                                                                                                      |
    | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | On Hobby?   | No plan restriction anywhere in the docs; the pricing page doesn't mention backups. Very likely yes — confirm on the Backups tab once the service exists.                   |
    | Schedules   | Daily (kept 6 days), weekly (kept 27 days), monthly (kept 89 days); several can be on at once. Manual backups too, capped at 50% of the volume size.                        |
    | Cost        | Incremental, copy-on-write, billed like volume storage ($0.15/GB-month) — cents at ~31 MB.                                                                                  |
    | Restore     | Same project + environment only; creates a new volume and redeploys (brief downtime).                                                                                       |
    | Consistency | **Not documented** whether a backup of a live SQLite database in WAL mode is consistent.                                                                                    |
    | Downloading | Backups can't be downloaded. Files **on** the volume can: `railway volume files download <remote> <local>`, `railway volume browse`, or `scp`/`sftp` via `ssh.railway.com`. |

    **Checked 2026-11-24 — full export works:** an online backup (`better-sqlite3`'s `db.backup()`) of
    the live production database, taken while the service was running in WAL mode, finished in
    **56 ms**, produced a 15 MB file that passed `PRAGMA integrity_check` (`ok`), with all 86 tables
    and 946 people. The live uploads in iCloud Drive total ~16 MB. (Test copies were deleted afterwards.)

    **So the nightly job works like this:**
    1. A scheduled job inside the app writes a consistent snapshot to the volume each night
       (`db.backup('/data/backups/nightly.db')` plus a tar of uploads). This also fixes the WAL
       question for Railway's own backups: they always contain a clean snapshot file.
    2. Railway's daily/weekly/monthly volume backups capture that volume.
    3. The Mac's `backup-dbs.sh` downloads the snapshot with `railway volume files download` (or
       `scp` via Railway SSH) using a Railway token kept in the Mac's keychain/plist, then keeps its
       5 dated folders in iCloud Drive as today. No public export endpoint is needed, so the full
       database is never served over the internet.
    4. The n8n alert fires if the newest iCloud folder is older than ~26 hours.
    - **Still to try:** that `railway volume files download` works unattended from launchd with a
      project token (first thing to test once the Railway service exists).

11. **TanStack Start, not just Router** (resolves decision 1). Chosen over the Router-only
    recommendation; Start runs on Railway as a Node server, so hosting no longer argues against it.
    Start offers SPA mode (no server rendering at all) and per-route selective SSR, and its request
    handler can be mounted inside an Express server — see
    [SPA mode](https://tanstack.com/start/v1/docs/framework/react/guide/spa-mode) and
    [selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr).
    How much of Express it replaces is still open.

12. **Full move to Start; Express goes away.** Chosen over running both in one process. All 42
    Express route files become Start server routes or server functions; `/webhooks/*` keep their
    exact paths, methods and `X-Internal-Secret` check so cgen-api needs only its base URL changed.
    The message queue, the six schedulers, the Events Story run recovery and SSE progress need a home
    in Start's Node server (open — decision 15).

13. **Keep the Mac deployment running until Railway is proven.** The move never breaks what works:
    - The Mac service (`cc.cgen.central-flock`, `pnpm dev`, `flock.cgen.cc` via the tunnel) stays the
      live system through the whole migration, and keeps getting normal fixes.
    - The `flock.cgen.cc` tunnel route is removed **only after** Railway is live and verified.
    - cgen-api's `CENTRAL_FLOCK_BASE_URL` stays on localhost until cut-over.
    - Every existing feature must work the same on Railway before cut-over (a parity checklist per
      section, built from the nav and `src/App.tsx` routes).
    - Rollback = point `flock.cgen.cc` and cgen-api back at the Mac, which is left untouched for a
      while after cut-over.

14. **Before cut-over, Railway runs in sandbox mode on a nightly copy of the live data.** You can
    check every page against real data while the Mac stays the only system that sends anything.
    Schedulers are off and every outbound path is blocked (decision 6). At cut-over the Mac stops,
    a final snapshot moves to Railway and sandbox mode is switched off. Only one system ever sends.
    This Railway environment is production-to-be, so unlike PR test copies it may hold real data —
    which means login is required on it and PR environments stay off until it's confirmed they
    don't copy its volume. Step-by-step: [railway-cutover.md](./railway-cutover.md).

15. **Long-running work runs inside the Start server.** The six schedulers, the message queue, SSE
    progress, Events Story run recovery and sermon recovery start once when the Node server boots,
    as `server/index.ts` does today. One Railway service, one volume, one bill.
    - **Start exactly once:** a single server start-up hook (not a route or request handler), with a
      module-level guard so dev hot reload can't start a second copy of each scheduler.
    - **The sandbox check stays in that one hook:** `CENTRAL_FLOCK_SANDBOX=1` skips all of it.
    - **One replica only.** Two instances would both run schedulers and double-send. Keep Railway
      replicas at 1 and note it in the conventions docs.
    - **SSE** becomes a Start server route returning a streamed response.
    - **Graceful stop:** on redeploy, let an in-progress send finish (or mark it for retry) before the
      process exits, since Railway restarts the server on every deploy, unlike today's long-lived Mac process.
    - Rejected: a separate worker service, because a Railway volume mounts on one service only and the
      queue would lose direct access to the SQLite file.

16. **Rendering: SPA mode.** No server rendering; the browser renders everything, as today. Keeps
    ADR 0036's relaunch behaviour and hybrid code splitting, needs no auth in server loaders, and
    avoids making the browser-only code (jsPDF, html2canvas, html-to-image, localStorage) safe for the
    server. Router's typed routes, loaders and Start's server functions still apply.

### Notes: the "page refreshes periodically" problem

Asked 2026-11-24. There are three separate causes; the move fixes the biggest one, and it's the move
to Railway that fixes it, not SPA mode.

1. **Production runs the Vite dev server** (`pnpm dev`). Every saved edit in the repo — by you or an
   agent — pushes an update to every open phone, iPad and laptop tab. The current service log holds
   **5,130 hot updates, 45 full page reloads and 17 dependency re-optimisations** (which also reload).
   **Fixed by the move:** Railway serves a built bundle; nothing reloads open pages except a deploy.
2. **iOS kills the backgrounded home-screen app** and relaunches it cold (ADR 0036). **Not fixed** by
   SPA mode or Railway. ADR 0036 rejected a service worker mainly because a stale cached app shell
   against the only production database was too risky to debug. With built deploys, test copies and
   a real staging step, that reasoning is weaker — worth revisiting after cut-over (open — decision 19).
3. **A deploy while a page is open.** Each Railway deploy replaces the built files, so an open tab
   that then lazy-loads a page asks for a file that no longer exists and shows "This page didn't
   finish loading" (`page-error-boundary.tsx`). Today's dev server hides this. Fix during the Start
   move: on Vite's `vite:preloadError`, reload once automatically, and deploy at quiet times.

(Not a page refresh, but looks like one: the Home page refetches its data every 5 minutes, and the
message detail and Events Story pages poll while a send or run is in progress. Those update in place.)

18. **Order: Railway first, then Start.** Today's Express + Vite app moves to Railway as a built
    app ([railway-cutover.md](./railway-cutover.md)); the Start rewrite (decisions 11, 12, 15, 16)
    happens afterwards, on Railway, with PR test copies, seed data and sandbox mode in place.
    - **Why:** once the Central Flock service on the Mac is off, several cloud coding agents can work
      in parallel on their own PRs without touching production — which is what the Start rewrite
      and the TanStack phases need.
    - **The Mac mini itself stays on** after cut-over: it still runs cgen-api (Messages, Contacts,
      Calendar, Reminders, the public-app front door), the tunnel for `api.cgen.cc`, and the iCloud
      backup pull. Only the `cc.cgen.central-flock` service is turned off.
    - **Small enough already:** Express already serves the built frontend from `dist/` with an
      `index.html` fallback (`server/index.ts:128`), so Railway runs `pnpm build` then
      `tsx --import ./server/lib/sentry.ts server/index.ts` (no `watch`). No server compile step needed.
    - **Before cut-over, in Express** (not Start): the sandbox hard stop, the cgen-api bridge client,
      the send allow-list, webhook hardening, the nightly snapshot and the sandbox-only import,
      the seed script, and the `vite:preloadError` auto-reload.
    - Accepted cost: two switch-overs in effect (host now, framework later), though the second is an
      ordinary series of deploys on Railway, not a host move.

19. **Service worker: revisit after cut-over.** Once Railway is stable, reconsider a service worker
    so iOS cold relaunches load the app shell from the device. If adopted, it gets a new ADR that
    supersedes ADR 0036's rejection. Not part of the migration itself.

20. **The Start rewrite lands all at once.** One long-lived branch (`feat/tanstack-start`) converts
    every page, endpoint, scheduler and the queue, and Express is deleted on that branch. It merges
    to `main` in one go, once it passes the full parity checklist. Chosen over converting one
    section per PR with Express mounted inside Start in the meantime.
    - **Accepted costs:** one very large merge that's hard to review, conflicts with every fix that
      lands on `main` meanwhile, and no partial progress reaches production until the end.
    - **Parallel agents** work on sub-branches cut from `feat/tanstack-start` (one per section) and
      merge back into it, not into `main`.
    - **One Railway PR environment** for the branch's open PR, with fake seed data, is where the
      whole rewrite is exercised before merge.
    - How the merge is proven safe against real data: open (decision 22).

21. **`main` takes fixes only while the rewrite branch is open.** No new features or sections land
    on `main` from the day `feat/tanstack-start` is cut until it merges.
    - **Allowed on `main`:** bug fixes, urgent changes (a broken send, a security fix, a dependency
      advisory), and content or config tweaks.
    - **Weekly sync:** `main` is merged into `feat/tanstack-start` at least once a week, so conflicts
      stay small and the branch never drifts far.
    - **Every fix carries over:** the PR that fixes something on `main` either includes the same
      fix for the Start code, or adds a line to a running "carry-over" list in the rewrite PR
      description, which must be empty before merge.
    - **Feature requests during the freeze** go into a backlog and are built on the branch only
      if they block the rewrite; otherwise they wait and are built Start-first after the merge.
    - Starts **after** the Railway cut-over (decision 18), so the freeze never overlaps the host move.

22. **The merge is proven on a staging copy of live data, and the rewrite changes no schema.**
    - **Staging environment:** a second, long-lived Railway environment, `staging`, always in
      sandbox mode (no sealed secrets, so it can't reach cgen-api or Anthropic). Each night it
      receives a `db.backup()` snapshot and uploads from Railway production through the same
      sandbox-only import as the cut-over rehearsal. `feat/tanstack-start` is deployed there, and
      the full parity checklist from [railway-cutover.md](./railway-cutover.md) Phase 3 is worked
      through against real data before merge. Staging is login-protected because it holds real data.
    - **Cost:** roughly another $4–5/month while it runs; it can be stopped between rehearsals.
    - **No schema changes in the rewrite:** `server/db/schema.ts` and the migration folder stay
      byte-for-byte the same on `feat/tanstack-start` (a CI check can diff them against `main`).
      Rolling back the merge is then just reverting it and redeploying — no database restore. Any
      schema change waits until after the merge, as an ordinary PR.
    - **Merge day:** take a manual Railway backup, merge, watch the deploy, run the cut-over guide's
      "Verify" list. Rollback: revert the merge commit and redeploy.

23. **The rewrite branch is a like-for-like port.** In scope: TanStack Start (SPA mode), TanStack
    Router file routes with validated search params and loaders, Express routes → Start server
    routes and server functions, the schedulers/queue/SSE in the server start-up hook, and
    `query-keys.ts` → `queryOptions` factories. Every screen, form and table must look and behave
    as it does today.
    - **Out of scope until after the merge:** TanStack Form (and Zod), Table, Pacer, Hotkeys,
      Devtools, Intent and the DB pilot. Each becomes its own phase on `main` once the freeze ends.
    - **Why:** the parity checklist compares like with like, so any difference points at the port,
      and the freeze on `main` ends sooner.
    - **Allowed exception:** a tiny change the port forces (e.g. replacing a React Router hook with
      its TanStack Router equivalent inside a component). Anything that changes what a person sees
      or does is out.

24. **Order of the library phases after the merge** — each is ordinary PRs on `main`, one section
    per PR where it splits that way, so several agents can work at once:
    1. **Devtools, Pacer, Hotkeys.** Devtools gated to dev builds only. Pacer replaces
       `use-debounced-value` (31 files) and the debounce inside `autosave-queue`/`use-unsent-message`.
       Hotkeys replaces `use-keyboard-shortcuts`. Pacer and Hotkeys are beta: pin exact versions.
    2. **Table.** One shared data-table component (sorting, filtering, pagination, column
       visibility) built on TanStack Table, replacing `sortable-table-head` and `ui/pagination`
       across 51 table files and 26 pagination sites. New major: pin the version.
    3. **Form + Zod.** Zod is the validator (Standard Schema, works with Form and with Router's
       search-param validation already used by the port). About 72 form files. The autosave,
       Unsent Message (ADR 0035) and unsaved-changes behaviour must survive unchanged — that hook
       layer is rebuilt on Form first, before any page converts.
    4. **DB pilot on People and Groups**, using `query-db-collection` against the existing server
       functions. Then a go/no-go decision on rolling it out further. Release candidate: pin the version.
    - **Intent and the conventions docs** run alongside every phase: each phase adds its rules to the
      docs as it lands (step 3).

25. **Conventions are documented, enforced by lint, and backed by TanStack Intent** (step 3).
    - **`docs/conventions/`:** one short file per area — routes and search params, data loading
      (`queryOptions`, loaders), server functions and `/webhooks`, outbound calls and sandbox, seed
      data, schedulers and the one-replica rule, deploy and staging, then forms, tables, Pacer,
      Hotkeys and (if adopted) DB as their phases land. Each file says what to use, shows one
      example from the codebase, and lists what not to do. CLAUDE.md gets one line per file under
      "Key Patterns", the way the command palette rule works today.
    - **Lint rules** in `.oxlintrc.json`, so drift fails `pnpm lint` and the pre-commit hook. Checked
      2026-11-24 that oxlint's schema includes the rules needed: `no-restricted-imports` (ban
      `react-router-dom`, `express`, `use-debounced-value`, `use-keyboard-shortcuts` once replaced),
      `no-restricted-globals` (no raw `fetch` in server code outside the approved clients, via a
      file-scoped override), and `react/forbid-elements` (no raw `<table>` outside the shared component).
      Each rule's message points at the conventions file to read.
    - **TanStack Intent:** installs the agent skills that ship with each TanStack package, matched to
      the installed version, so sessions get correct API guidance without hand-written copies.
    - **New libraries or patterns** after the migration follow the same three steps: conventions
      file, CLAUDE.md pointer, lint rule where one is possible.

### Why Supabase (or any hosted database) costs more in effort than in dollars

The server talks to SQLite through better-sqlite3's **synchronous** API: there are **919**
`.run()`/`.all()`/`.get()` calls and 27 transactions across the server, plus raw `prepare`/`exec` in
10 files and 64 SQLite migrations. Postgres (Supabase), Turso and D1 are all asynchronous, so every
one of those calls and every function above it becomes `async`, and the migrations need porting. A
host with a disk keeps SQLite and avoids all of that.

### Costs that don't change

- **The Mac mini stays on.** Messages, Contacts, Calendar and Reminders still run there, so it saves
  no hardware or power. What the cloud buys is a deploy pipeline and safe environments for agents.
- **Cloudflare tunnel stays** so the cloud app can reach the Mac bridge (or the Mac pulls work — still open).
- **Claude, Sentry, Canva, Notion** are billed the same wherever the app runs.

## Sources

- [TanStack Libraries](https://tanstack.com/libraries)
- [TanStack Start](https://tanstack.com/start/latest)
- [TanStack AI](https://tanstack.com/ai/latest)
- [TanStack DB 1.0 RC1 announcement](https://tanstack.com/blog/tanstack-db-1.0-rc1-going-all-in-on-oracles)
- [TanStack DB release coverage](https://tech-insider.org/nl/tanstack-db-1-0-rc1-reactive-client-data-framework-2026/)
- [query-db-collection reference](https://tanstack.com/db/latest/docs/reference/query-db-collection)
- [TanStack GitHub](https://github.com/tanstack)
- [A Field Guide to the TanStack Ecosystem](https://blog.openreplay.com/tanstack-ecosystem-guide/)
- [TanStack in 2026](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026)
- [Fly.io pricing](https://fly.io/docs/pricing/), [Fly.io 2026 pricing update](https://fly.io/pricing-update/), [Beam: Fly.io pricing](https://www.beam.cloud/blog/fly-io-pricing)
- [Railway pricing plans](https://docs.railway.com/pricing/plans)
- [Render pricing](https://render.com/pricing), [Render workspace plan changes](https://render.com/changelog/updated-plans-for-render-workspaces)
- [AWS Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)
- [Supabase pricing](https://supabase.com/pricing), [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
