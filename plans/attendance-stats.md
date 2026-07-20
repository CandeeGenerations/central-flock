# Attendance Stats

A service-attendance tracking feature: a public mobile app for ushers to record counts, and an
admin area in Central Flock for managing service times and viewing attendance trends. Mirrors the
Church Metrics app currently in use, scoped down to two metrics.

See [ADR-0014](../docs/adr/0014-attendance-public-app-via-cgen-api.md) for the public-app architecture,
and [ADR-0015](../docs/adr/0015-per-recorder-attendance-tokens.md) for per-recorder token attribution.

> **Extension (planned, not yet built): per-recorder attribution.** See the
> [Recorder attribution](#recorder-attribution-planned) section at the bottom. This supersedes the
> single shared-token access model described below (`ATTENDANCE_PUBLIC_TOKEN` → per-recorder tokens).

## Scope (v1)

- **Metrics:** Attendance (in-person) and Streaming only. Total Attendance = computed sum.
  Kids, Salvations, Volunteers, Contributions, fair-booth, and extravaganza stats are **out** (may return later).
- **Single campus** (Central Baptist Church) — not modeled; implicit.

## Domain model

- **Service Time** — admin-managed recurring slot: `name`, `dayOfWeek`, `time`, `active`, `sortOrder`.
  - Seed 4: Sun 9:45am, Sun 11:00am, Sun 6:30pm, Wed 7:30pm.
  - Soft-retire via `active`; hard-delete only when it has zero records. Inactive → hidden from
    public entry, history stays in reports.
  - Manual `sortOrder` drives the public list order.
- **Service Record** — one row per `(serviceTimeId, serviceDate)`, **unique-constrained**.
  - `attendance` (nullable int), `streaming` (nullable int). Blank ≠ 0: null is excluded from
    averages/trends; stored 0 is a real value. At least one field required to save.
  - **Upsert** on save (load existing values into the form, overwrite). No append/history table.
- Week runs **Sunday→Saturday**; `(week + service time's dayOfWeek)` resolves the concrete `serviceDate`.

### Schema (new file `server/db/schema-attendance.ts`, re-exported from `schema.ts`)

- `service_times`: id, name, dayOfWeek (0–6), time (HH:MM), active (bool, default true), sortOrder (int), createdAt
- `service_records`: id, serviceTimeId (FK), serviceDate (YYYY-MM-DD), attendance (int null), streaming (int null),
  createdAt, updatedAt. Unique index on (serviceTimeId, serviceDate).
- Migration via `pnpm db:generate` + `pnpm db:migrate` (per RUNBOOK; stop service first).

## Public app — `attendance-public`

New standalone repo, cloned from `rsvp-public` conventions (Vite + React 19 + Tailwind v4, no router,
Netlify, Sentry). Hosted at `attendance.cgen.cc`. Single **tokenized** entry URL, no login.

- **Flow:** Week-of picker (defaults to current week, can step back) → choose Service Time (grouped by
  day-of-week, in sortOrder) → entry screen → Saved confirmation.
- **Entry screen:** for the two metrics, a **mode toggle**:
  - **Tally mode** — select which metric you're counting, big +/- stepper buttons for live counting on the go.
  - **Type mode** — plain numeric inputs.
- On open, existing record values (if any) are loaded (upsert edit).
- `VITE_CGEN_API_BASE` env → posts to cgen-api.

## cgen-api proxy

- New route file `src/routes/attendance-public.ts`, mounted `/attendance-public/*`.
- Holds `X-Internal-Secret`, proxies to Central Flock `/webhooks/attendance`.
- Endpoints: list active service times (with week resolution), GET existing record for
  (serviceTime, date), POST upsert record.

## Central Flock — backend

- `server/routes/attendance-webhook.ts` — unauthenticated, gated by `requireInternalSecret`,
  mounted under `webhooksRouter` as `/webhooks/attendance`. Public read (active service times,
  existing record) + upsert write.
- `server/routes/attendance.ts` — auth-gated `/api/attendance`: service-time CRUD, records list/edit,
  chart/report data endpoints (aggregations for trend + year-over-year + tiles).
- One-time import script `server/scripts/import-attendance-history.ts`: create the 4 service times,
  load every Attendance / Attendance-Streaming row for service_time_ids 353121/122/123/124 from
  `data/cbc-attendence-backup.csv` as records; skip all other categories and event rows.

## Central Flock — admin UI (`/attendance`)

New top-level sidebar section **"Attendance"**.

- **`/attendance`** — dashboard/report:
  - Filters: metric (Attendance / Streaming / Total), **Service Time** (specific or "all combined"),
    date range.
  - **Flagship view:** single service time over time — raw line + **fitted trendline** + **moving average**
    - **delta headline** (e.g. "▲ +8% over this range"). Built with recharts.
  - The **metric picker (Attendance / Streaming / Total) drives the whole chart**: the raw line,
    trendline, moving average, and delta all recompute against the selected metric. For "Total",
    the series is Attendance + Streaming summed per service (a derived series).
  - **Year-over-year** overlay (this year vs last year).
  - **Big-number tiles:** this-month / this-year totals + averages.
  - **Records table:** recent services with inline admin edit/correction.
- **`/attendance/times`** — manage service times (list + create/edit **dialog**, active toggle,
  reorder). No separate detail page.

## kbar / command palette (required — "everything in the kbar")

Per CLAUDE.md palette-sync rules:

- Add `/attendance` and `/attendance/times` routes in `src/App.tsx` and nav entries in
  `src/lib/nav-config.ts` (sidebar actions derive automatically).
- Add a pretty-label entry for the `attendance` section in
  `server/services/usage-entity-resolver.ts` (for Recents).
- Add a search **provider** in `src/lib/search/providers/` (registered in `providers/index.ts`) so
  **Service Times** are searchable entities; wire `GROUP_ORDER` + `PREFIX_TO_GROUP` in
  `src/components/command-palette.tsx` if a new group is introduced. Set `navPath` on provider items.
- Explicit palette action for "Manage Service Times" / "Record Attendance".

## Open / deferred

- Notifications on submit (RSVP sends a notify-me text) — **not** included; add if wanted.
- Re-adding Kids/Salvations/Contributions → new columns + admin toggle later.
- Event service times (special one-off services) — deferred.

## Build order

1. Schema + migration + history import script (verify charts have real data).
2. Central Flock backend: `/webhooks/attendance` + `/api/attendance` + aggregation endpoints.
3. Admin UI: service-time management, then dashboard/report + charts.
4. kbar wiring.
5. cgen-api proxy route.
6. `attendance-public` SPA (clone rsvp-public), tally/type entry, deploy to Netlify + DNS.

_Steps 1–6 are **built** (central-flock lint/typecheck clean, migration `0033` applied, history
imported; cgen-api + attendance-public compile). Deploy + env/DNS are the remaining manual steps._

## Recorder attribution (planned)

Adds named per-recorder tokens so every entered number is attributable. See
[ADR-0015](../docs/adr/0015-per-recorder-attendance-tokens.md). **Not yet built.**

### Domain

- **Recorder** — a named entrant: `{id, name, token (unique), active, createdAt}`. Independent of
  `people`. The token is the access gate (RSVP-style) and the basis for attribution.
- **Record Edit** — full change log. Every save appends
  `{id, serviceRecordId, recorderId (null=admin), recorderName (snapshot), attendance, streaming, createdAt}`.
  `service_records` gains denormalized `latestRecorderId` + `latestEnteredAt` for fast display.
- Recorders **soft-retire** via `active` (link stops working, history kept). Hard-delete only when
  they have zero edits. `recorderName` is snapshotted on each edit so history survives deletion.

### Access model change (supersedes shared token)

- Remove the static `ATTENDANCE_PUBLIC_TOKEN` gate in cgen-api.
- Token becomes path-based and per-recorder; Central Flock resolves it (like RSVP). Webhook shape:
  - `GET /webhooks/attendance/:token` → `{recorderName, serviceTimes}` (session bootstrap; 404 on
    unknown/retired token)
  - `GET /webhooks/attendance/:token/record/:serviceTimeId/:date` → existing values
  - `POST /webhooks/attendance/:token/record` → upsert + append Record Edit attributed to the token's recorder
- cgen-api proxies the tokenized paths; keeps CORS + rate limits, drops the shared-secret middleware.
- New env `ATTENDANCE_PUBLIC_URL_BASE` (e.g. `https://attendance.cgen.cc`) for admin copy-link.

### Admin

- New page `/attendance/recorders` (nav child + kbar): create/retire recorders, **copy link**
  (`${ATTENDANCE_PUBLIC_URL_BASE}/r/<token>`), **regenerate token** (mints new, invalidates old link,
  keeps history).
- Records table: add **Entered by** column (latest recorder / "Admin" / "Imported"); clicking a
  record opens a **history view** dialog listing every Record Edit (who, when, values), newest first.
- Admin's own in-app record edits log as **"Admin"** (`recorderId` null). Imported historical
  records (no edits) display as **"Imported"**.

### Public app (`attendance-public`)

- Switch link form `?t=<token>` → **path `/r/<token>`** (add Netlify `/r/*` redirect).
- Bootstrap via `GET /:token`; show persistent "**Recording as {name}**" header on pick + entry
  screens. Unknown/retired token → error card, no entry.
- Any recorder may enter for any week/service time (no per-recorder restriction).
