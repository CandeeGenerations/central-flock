# Nursery Schedule Generator — Implementation Plan

## Context

The church currently creates nursery worker schedules manually in a document editor, assigning workers to four services across Sundays and Wednesdays each month. This feature automates schedule generation with configurable workers, service requirements, and constraints — then exports the result as PDF/JPG matching the existing format. It becomes a new top-level section in Central Flock alongside Messaging and Devotions.

---

## Database: Separate `nursery.db`

Following the Devotions pattern (`server/db-devotions/`), nursery gets its own SQLite database.

### New files

- `server/db-nursery/schema.ts` — Drizzle schema (6 tables below)
- `server/db-nursery/index.ts` — Connection setup (WAL mode, foreign keys, export `nurseryDb`)
- `drizzle-nursery.config.ts` — Drizzle Kit config pointing to `nursery.db`

### Schema

**`nursery_workers`** — People who can work nursery
| Column | Type | Notes |
|---|---|---|
| id | integer PK auto | |
| name | text NOT NULL | |
| maxPerMonth | integer NOT NULL default 4 | Overall monthly cap |
| allowMultiplePerDay | boolean NOT NULL default false | Can work >1 service same day |
| isActive | boolean NOT NULL default true | |
| createdAt, updatedAt | text (datetime) | |

**`nursery_worker_services`** — Which services each worker is eligible for
| Column | Type | Notes |
|---|---|---|
| id | integer PK auto | |
| workerId | integer FK → nursery*workers (cascade) | |
| serviceType | text enum | `sunday_school`, `morning`, `evening`, `wednesday_evening` |
| maxPerMonth | integer nullable | Per-service cap; null = no per-service limit |
| \_unique* | (workerId, serviceType) | |

**`nursery_service_config`** — How many workers each service needs
| Column | Type | Notes |
|---|---|---|
| serviceType | text PK | `sunday_school`, `morning`, `evening`, `wednesday_evening` |
| label | text NOT NULL | Display name (e.g., "Sunday School Service") |
| workerCount | integer NOT NULL default 2 | 1 or 2 |
| sortOrder | integer NOT NULL | Display order |

Seeded at startup via INSERT OR IGNORE in `db-nursery/index.ts` with defaults from the PDF:

- Sunday School Service → 1 worker, sort 1
- Morning Service → 2 workers, sort 2
- Evening Service → 1 worker, sort 3
- Wednesday Evening Service → 2 workers, sort 4

**`nursery_schedules`** — Generated schedules (historical record)
| Column | Type | Notes |
|---|---|---|
| id | integer PK auto | |
| month | integer NOT NULL | 1-12 |
| year | integer NOT NULL | |
| status | text enum `draft` / `final` | draft = editable, final = locked |
| createdAt, updatedAt | text (datetime) | |

**`nursery_assignments`** — Individual worker slot assignments
| Column | Type | Notes |
|---|---|---|
| id | integer PK auto | |
| scheduleId | integer FK → nursery*schedules (cascade) | |
| date | text NOT NULL | YYYY-MM-DD (actual date, may cross month boundary) |
| serviceType | text enum | |
| slot | integer NOT NULL | 1 or 2 |
| workerId | integer FK → nursery_workers (set null on delete) | nullable for unassigned slots |
| \_unique* | (scheduleId, date, serviceType, slot) | |

**`nursery_settings`** — Key-value store for logo path, etc.
| Column | Type | Notes |
|---|---|---|
| key | text PK | |
| value | text NOT NULL | |
| updatedAt | text (datetime) | |

---

## Seed Data (from April PDF)

Seeded at startup via INSERT OR IGNORE alongside the service config.

### Service Config Defaults

| serviceType       | label                     | workerCount | sortOrder |
| ----------------- | ------------------------- | ----------- | --------- |
| sunday_school     | Sunday School Service     | 1           | 1         |
| morning           | Morning Service           | 2           | 2         |
| evening           | Evening Service           | 1           | 3         |
| wednesday_evening | Wednesday Evening Service | 2           | 4         |

### Workers

| Name           | maxPerMonth | allowMultiplePerDay | Services (maxPerMonth)                             |
| -------------- | ----------- | ------------------- | -------------------------------------------------- |
| Carissa Candee | 10          | true                | sunday_school, morning, evening, wednesday_evening |
| Grace Ortiz    | 3           | false               | morning                                            |
| Angie Cobb     | 2           | false               | morning                                            |
| Kim Stewart    | 2           | false               | evening                                            |
| Yuny Mejia     | 5           | false               | wednesday_evening                                  |
| Debbie Scott   | 4           | false               | wednesday_evening, morning                         |
| Grace Ngong    | 2           | false               | morning                                            |
| Evie Ross      | 2           | false               | evening                                            |
| Carla Mendez   | 1           | false               | morning                                            |

---

## Generation Algorithm

File: `server/services/nursery-scheduler.ts`

### Date Calculation: `computeDatePairs(month, year) → {sunday: string, wednesday: string}[]`

1. Find all Sundays in the target month
2. If >= 5 Sundays, take the first 5
3. If 4 Sundays, prepend the last Sunday of the previous month
4. For each Sunday, the paired Wednesday = Sunday + 3 days
5. Return 5 pairs with dates as `YYYY-MM-DD` strings

### Slot Generation: `buildSlots(pairs, serviceConfig) → ScheduleSlot[]`

For each pair, expand into ordered slots:

- Sunday services (sunday_school, morning, evening) in sort order — each creates 1 or 2 slots based on `workerCount`
- Wednesday service (wednesday_evening) — same logic
- Only create slot 2 if `workerCount === 2`

### Assignment: `assignWorkers(slots, workers) → ScheduleSlot[]`

Sorted greedy approach:

1. Maintain counters: `totalAssignments[workerId]`, `serviceAssignments[workerId][serviceType]`, `dayAssignments[workerId][date]`
2. For each slot, collect eligible workers where:
   - `isActive === true`
   - Has a `nursery_worker_services` row for this `serviceType`
   - `totalAssignments < worker.maxPerMonth`
   - If `worker_services.maxPerMonth` is set: `serviceAssignments < that limit`
   - If `!allowMultiplePerDay`: `dayAssignments[date] === 0`
3. Sort eligible workers by fewest total assignments (distribute evenly)
4. Pick first candidate; if none eligible, leave slot `workerId: null` (flagged in UI)

---

## API Routes

### `server/routes/nursery.ts` — Workers, config, settings

| Method | Path                                | Description                                                        |
| ------ | ----------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/nursery/workers`              | List all workers with their service eligibilities                  |
| POST   | `/api/nursery/workers`              | Create worker + service eligibilities                              |
| PUT    | `/api/nursery/workers/:id`          | Update worker (name, maxPerMonth, allowMultiplePerDay, isActive)   |
| DELETE | `/api/nursery/workers/:id`          | Delete worker                                                      |
| PUT    | `/api/nursery/workers/:id/services` | Bulk-replace service eligibility rows                              |
| GET    | `/api/nursery/service-config`       | Get all 4 service configs                                          |
| PUT    | `/api/nursery/service-config/:type` | Update workerCount for a service type                              |
| GET    | `/api/nursery/settings`             | Get all nursery settings                                           |
| PUT    | `/api/nursery/settings/:key`        | Upsert a setting                                                   |
| POST   | `/api/nursery/settings/logo`        | Upload logo (base64 in JSON body → saved to `data/nursery-logos/`) |

### `server/routes/nursery-schedules.ts` — Schedules + assignments

| Method | Path                                | Description                                                                              |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/nursery/schedules`            | List all schedules (history)                                                             |
| POST   | `/api/nursery/schedules/generate`   | Generate new schedule for `{month, year}`. If draft exists for that month, overwrite it. |
| GET    | `/api/nursery/schedules/:id`        | Get schedule with all assignments + worker names                                         |
| PUT    | `/api/nursery/schedules/:id/status` | Set status to `draft` or `final`                                                         |
| DELETE | `/api/nursery/schedules/:id`        | Delete a schedule                                                                        |
| PATCH  | `/api/nursery/assignments/:id`      | Update single assignment's workerId (manual edit via dropdown)                           |

---

## Frontend

### New files

| File                                                  | Purpose                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/nursery-api.ts`                              | Typed API client (mirrors `devotion-api.ts` pattern)                     |
| `src/lib/nursery-query-keys.ts`                       | TanStack Query key factory                                               |
| `src/pages/nursery/nursery-schedules-page.tsx`        | `/nursery` — Schedule history list + "Generate New" button               |
| `src/pages/nursery/nursery-generate-page.tsx`         | `/nursery/generate` — Month picker, generate, preview, edit, export      |
| `src/pages/nursery/nursery-schedule-view-page.tsx`    | `/nursery/:id` — View saved schedule (edit if draft, read-only if final) |
| `src/pages/nursery/nursery-workers-page.tsx`          | `/nursery/workers` — Worker CRUD with per-service config                 |
| `src/pages/nursery/nursery-settings-page.tsx`         | `/nursery/settings` — Service worker counts + logo upload                |
| `src/components/nursery/nursery-schedule-preview.tsx` | Reusable schedule table (preview, edit, export target)                   |
| `src/components/nursery/nursery-worker-form.tsx`      | Worker create/edit dialog                                                |

### Modified files

| File                    | Change                                                               |
| ----------------------- | -------------------------------------------------------------------- |
| `src/lib/nav-config.ts` | Add "Nursery" nav group with `Baby` icon (lucide-react)              |
| `src/App.tsx`           | Add 5 nursery routes                                                 |
| `server/index.ts`       | Mount nursery routers, serve `data/nursery-logos/` statically        |
| `vite.config.ts`        | Add `/data/nursery-logos` proxy                                      |
| `package.json`          | Add `db:nursery:*` scripts, add `html2canvas` + `jspdf` dependencies |

### Navigation (nav-config.ts)

```
Nursery (Baby icon)
  ├── Schedules → /nursery (end: true)
  ├── Workers → /nursery/workers
  └── Settings → /nursery/settings
```

### Key Page: Generate Page (`/nursery/generate`)

Single-page workflow with local state:

1. **Select month/year** — month picker, defaults to next month
2. **Click "Generate"** — calls `POST /api/nursery/schedules/generate`, receives full schedule
3. **Preview** — renders `NurserySchedulePreview` with the assignment data
4. **Edit** — click any worker cell → `SearchableSelect` popover to swap workers. Calls `PATCH /api/nursery/assignments/:id` per edit.
5. **Export** — PDF or JPG buttons. Captures the preview component via `html2canvas`.
6. **Finalize** — sets status to `final`, locks edits

### `NurserySchedulePreview` Component

Renders the schedule matching the PDF format exactly:

- Logo image centered at top (from nursery settings)
- HTML table: Date | Service | Worker #1 | Worker #2
- Date cell uses `rowSpan` to span the service rows for that day (3 for Sundays, 1 for Wednesdays)
- Worker #2 shows "-" when service only has 1 worker
- Unassigned slots highlighted with a warning color
- `editMode` prop: when true, worker cells are clickable with searchable dropdown
- Fixed white background + inline styles for reliable html2canvas capture

---

## Export: Client-Side `html2canvas` + `jsPDF`

New dependencies: `html2canvas`, `jspdf`

### Approach

1. Render `NurserySchedulePreview` in a ref'd container with print-optimized styles
2. `await document.fonts.ready` (ensure webfonts loaded)
3. `html2canvas(container, {scale: 2, useCORS: true})` → canvas
4. **JPG**: `canvas.toBlob('image/jpeg')` → download as `Nursery Schedule - April 2026.jpg`
5. **PDF**: Create jsPDF doc, add canvas image fitted to page → save as `Nursery Schedule - April 2026.pdf`

---

## Implementation Order

### Phase 1: Database foundation

1. Create `server/db-nursery/schema.ts` with all 6 tables
2. Create `server/db-nursery/index.ts` (connection + seed service config defaults + seed 9 workers from PDF with their service eligibilities)
3. Create `drizzle-nursery.config.ts`
4. Add `db:nursery:generate`, `db:nursery:migrate`, `db:nursery:studio` to `package.json`
5. Run `pnpm db:nursery:migrate`

### Phase 2: Generation algorithm

6. Create `server/services/nursery-scheduler.ts` with `computeDatePairs`, `buildSlots`, `assignWorkers`

### Phase 3: API routes

7. Create `server/routes/nursery.ts` (workers, service config, settings, logo upload)
8. Create `server/routes/nursery-schedules.ts` (schedule CRUD, generate, assignment update)
9. Mount routers in `server/index.ts`, add static serving for logos
10. Add proxy path in `vite.config.ts`

### Phase 4: Frontend API + navigation

11. Create `src/lib/nursery-api.ts` and `src/lib/nursery-query-keys.ts`
12. Add nursery nav group to `src/lib/nav-config.ts`
13. Add routes to `src/App.tsx`

### Phase 5: Pages (in dependency order)

14. `nursery-settings-page.tsx` — service config + logo upload (no deps on other nursery pages)
15. `nursery-worker-form.tsx` + `nursery-workers-page.tsx` — worker management
16. `nursery-schedule-preview.tsx` — the core reusable table component
17. `nursery-schedules-page.tsx` — schedule list (history)
18. `nursery-generate-page.tsx` — the main generate + preview + edit + export flow
19. `nursery-schedule-view-page.tsx` — view/edit saved schedules

### Phase 6: Export

20. Install `html2canvas` + `jspdf`
21. Add export functions to generate page and view page

---

## Cross-Month Overlap

When a target month has fewer than 5 Sundays, `computeDatePairs` borrows the last Sunday of the previous month. That borrowed Sunday — and its paired Wednesday (`Sunday + 3`) — typically already appears on the prior month's schedule. The new schedule must reconcile with the prior month's assignments rather than re-generating those slots from scratch. See `docs/adr/0003-nursery-cross-month-overlap.md`.

### Overlap dates

For each borrowed pair, **both** the Sunday and the paired Wednesday are overlap dates. (Example: generating June 2026 borrows May 31; the paired Wednesday is June 3, which was on May's schedule as the 5th-pair Wednesday.)

### Lookup rules

1. Look up the prior month's schedule. **Prefer `final`; fall back to `draft`.**
2. If neither exists, generate the borrowed pair from scratch and surface a non-blocking UI warning on the generate page: _"No prior month schedule found — borrowed-pair dates were generated fresh."_
3. For each overlap date, read all `nursery_assignments` rows belonging to the prior month's schedule.

### Cap accounting

For workers carried over from the prior month:

- **Bypass** `totalAssignments` (overall `maxPerMonth`).
- **Bypass** `serviceAssignments` (per-service `maxPerMonth`).
- **Keep** `dayAssignments` active for the overlap dates — physical-reality constraints (same-day work limits, double-booking, first-name pairing) still apply for that date regardless of which month "owns" it.

The `prevDateWorkers` / `prevSlotWorker` / `siblingFirstNames` penalties continue to work because carryover slots are present in the in-memory `slots[]` array during generation, even though they aren't persisted (see Storage below).

### Null pre-fills

If a prior-month overlap slot has `workerId = null`, it carries over as null on the new schedule. Do **not** try to backfill via the new month's generator — fixing it is the prior month's responsibility. The UI flags it with the usual unassigned-slot warning plus a tooltip: _"Carried over from {Month} — fix that schedule to update."_

### Storage (live-resolve)

- **Generate-time:** the scheduler does **not** persist `nursery_assignments` rows for overlap dates. It does seed `dayAssignments` (only) with the prior month's workers so the rest of the schedule respects same-day constraints.
- **Load-time:** `loadScheduleWithAssignments` queries the schedule's own rows **plus** the prior month's rows for any overlap dates. Merged-in rows are tagged `isCarryover: true` and include `sourceScheduleId` for the badge link.

### Edit behavior

- Carryover cells are **read-only** in the in-app view. They render with a "From {Month}" badge and a link to the prior month's schedule.
- `PATCH /api/nursery/assignments/:id` rejects edits to carryover rows. (The carryover row doesn't have its own id in the new schedule — the frontend resolves the click to the prior month's assignment id and navigates rather than editing in place.)

### Export

The exported PDF/JPG renders carryover cells **identically** to native rows. No badge, no marker, no visual distinction. Editorial state belongs in the editor; parishioners see a clean lobby copy.

### Algorithm changes (`server/services/nursery-scheduler.ts`)

`generateSchedule` gains a new parameter: `priorMonthAssignments: ScheduleSlot[]` (loaded from the prior month's schedule by the route handler). Inside `assignWorkers`:

- Compute the overlap-date set from `computeDatePairs` (first pair's Sunday + Wednesday, when fewer than 5 Sundays were native to the target month).
- For slots whose date is in the overlap set: set `workerId` from `priorMonthAssignments`, mark `isCarryover: true`, and update `dayAssignments` only (skip `totalAssignments` / `serviceAssignments` updates).
- For all other slots: run the existing eligibility + scoring loop unchanged. The carryover slots are present in `slots[]` so the `prevDate` / `siblingFirstName` logic naturally sees them.

After generation, the route handler filters `slots` to drop carryover entries before bulk-inserting `nursery_assignments`.

### Verification additions

- Generate a month with 4 Sundays where the prior month was finalized → confirm the borrowed pair renders the prior month's workers, marked with a badge, and not persisted in `nursery_assignments`.
- Same scenario, then edit the prior month's overlap-date assignment → reload the new month → confirm the change appears (live-resolve working).
- Generate a month with 4 Sundays where the prior month doesn't exist → confirm the warning shows and the borrowed pair is generated fresh.
- Carla (maxPerMonth = 1, morning-only) was scheduled May 31 morning in May's schedule → generate June → confirm Carla appears on May 31 (carryover, not counted) **and** can still be assigned once more in June proper.
- Click a carryover cell in the in-app view → confirm it navigates to the prior month's schedule rather than opening an editor.
- Export the PDF → confirm the borrowed-pair row looks identical to native rows (no badge, no marker).

## Verification

1. **Database**: Run `pnpm db:nursery:migrate` → confirm `nursery.db` created with all tables
2. **Workers**: Add 3-4 workers with different service configs → verify CRUD works
3. **Service config**: Change a service from 2 workers to 1 → verify it saves
4. **Logo**: Upload a logo image → verify it displays in preview
5. **Generate**: Generate a schedule for a month with 4 Sundays → confirm 5 pairs with previous month's Sunday borrowed
6. **Generate**: Generate for a month with 5 Sundays → confirm 5 pairs, no borrowing
7. **Constraints**: Verify workers aren't over-assigned (monthly cap, per-service cap, same-day restriction)
8. **Manual edit**: Click a worker cell → swap via dropdown → confirm assignment saved
9. **Unassigned**: Remove all eligible workers for a service → generate → confirm slot shows as unassigned/flagged
10. **Export PDF**: Download → open → verify matches the reference PDF layout
11. **Export JPG**: Download → open → verify image is clean and readable
12. **History**: Generate multiple months → verify schedule list shows all with correct status
13. **Finalize**: Finalize a schedule → confirm edits are blocked
14. **Run `pnpm eslint`** — confirm no type errors or lint violations
