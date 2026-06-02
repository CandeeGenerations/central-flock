# Fair Booth Schedule: dense per-hour signup grid

Adds a third Schedule type — **Fair Booth** — covering the 9-day county-fair
ministry. Renders a per-hour timeline grid (page 1) of who's in the booth
across slot-structured days, plus a roster legend (page 2) mapping initials
to names. Edits flow through a per-day sub-page editor. Live roster against a
Group; per-schedule sparse attribute overrides; new `people.is_hispanic`
column driving day-header coverage colors. No draft/final lifecycle for this
type — always editable, always exportable. Includes a blank-PDF export for
hand-signup before the planning surface kicks in.

Domain context:
[CONTEXT.md → Fair Booth Schedule / Fair day / Fair slot / Fair Booth signup / Shift role / Fair role / Fair roster / Hispanic coverage / Headcount coloring / Fair day editor / Roster row modal / Italic & bold markers / Blank PDF export](../CONTEXT.md).
Decision: [docs/adr/0009-fair-booth-schedule.md](../docs/adr/0009-fair-booth-schedule.md).

## Goals

- New `schedule_type='fair_booth'` envelope with date-range scope; create flow
  picks a starting Friday, scope_end auto-set to +8 days.
- Two new body tables: `fair_booth_roster_attrs` (sparse per-schedule attrs)
  and `fair_booth_signups` (the timeline data).
- One new `people` column: `is_hispanic` boolean (default false).
- Schedule detail view: side-by-side page 1 (grid) + page 2 (roster) on
  desktop, stacked on mobile. Both clickable.
- Per-day sub-page editor at `/schedules/fair-booth/:scheduleId/day/:date`.
- Render algorithms: initials with collision, headcount/dotted lines,
  Hispanic coverage, row distribution within stable count regions.
- Settings page additions: `rosterGroupIds`, `titlePrefix`, `minSignupsForBold`,
  per-page footer blocks. Logo via the existing global setting.
- Exports: live two-page PDF, JPG (page 1), and a separate **blank PDF** for
  hand-signup. No draft/final gate for fair_booth.
- Sidebar entry under the existing Schedules group, between Special Music and
  Settings.

## Non-goals (deferred)

- A fairness scorer / auto-generator for fair signups. The data entry is
  manual; the Fair Booth team handles assignment by hand.
- Public sign-up via a hosted form. The current flow remains: people text
  signups to the operator who enters them.
- Cross-year history rollups (e.g., "show me everyone who served last 3
  years"). Possible later from the data model but no UI in v1.
- Fairness across years — no carryover from prior year.
- Configurable day-of-week → slot pattern. Hardcoded for v1.
- Drag-and-drop reorder. Up/down buttons only.
- Half-hour row granularity in the grid. Hour rows only; partial times
  rendered as parenthesized text.
- A "send blank PDF" affordance. Operators screenshot/print themselves.

---

## Phase 1 — Schema + migration

This phase introduces the tables and the `people` column, with no UI yet.
After this phase, the DB is ready and seed settings are written; the app
still doesn't expose Fair Booth in the sidebar.

**Schema changes:**

`server/db/schema-core.ts` — add to `people`:

```ts
isHispanic: integer('is_hispanic', {mode: 'boolean'}).notNull().default(false),
```

New file `server/db/schema-fair-booth.ts`:

```ts
import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {people} from './schema-core.js'
import {schedules} from './schema-schedules.js'

export const fairBoothFairRoles = ['worker', 'asst_unit', 'unit_leader', 'asst_fair_mgr', 'fair_mgr'] as const
export type FairBoothFairRole = (typeof fairBoothFairRoles)[number]

export const fairBoothShiftRoles = ['worker', 'asst_unit', 'unit_leader'] as const
export type FairBoothShiftRole = (typeof fairBoothShiftRoles)[number]

export const fairBoothRosterAttrs = sqliteTable(
  'fair_booth_roster_attrs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    fairRole: text('fair_role', {enum: fairBoothFairRoles}).notNull().default('worker'),
    initialsOverride: text('initials_override'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => ({
    uniqSchedulePerson: uniqueIndex('fair_booth_roster_attrs_schedule_person_uniq').on(t.scheduleId, t.personId),
  }),
)

export const fairBoothSignups = sqliteTable('fair_booth_signups', {
  id: integer('id').primaryKey({autoIncrement: true}),
  scheduleId: integer('schedule_id')
    .notNull()
    .references(() => schedules.id, {onDelete: 'cascade'}),
  personId: integer('person_id')
    .notNull()
    .references(() => people.id, {onDelete: 'cascade'}),
  dayDate: text('day_date').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  shiftRole: text('shift_role', {enum: fairBoothShiftRoles}).notNull().default('worker'),
  sortOrder: integer('sort_order').notNull().default(0),
  displayRowOverride: integer('display_row_override'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
```

Re-export from `server/db/schema.ts`:

```ts
export * from './schema-fair-booth.js'
```

**Extend the schedule type enum** in `server/db/schema-schedules.ts`:

```ts
export const scheduleTypes = ['nursery', 'special_music', 'fair_booth'] as const
```

**Generate and apply migration:**

- `pnpm db:generate` produces the new migration file.
- `pnpm db:migrate` applies it (idempotent).
- Confirm `people.is_hispanic` defaults `false` on all existing rows.

**Seed settings** in the same migration or as a one-shot script
(`scripts/seed-fair-booth-settings.ts`):

```ts
settings.upsert('schedules.fairBooth.titlePrefix', 'Fair Booth Schedule')
settings.upsert('schedules.fairBooth.rosterGroupIds', '[]')
settings.upsert('schedules.fairBooth.minSignupsForBold', '3')
settings.upsert(
  'schedules.fairBooth.gridPageFooterBlocks',
  JSON.stringify([
    {
      kind: 'quote',
      text: 'The fruit of the righteous is a tree of life; and he that winneth souls is wise.',
      bold: true,
    },
    {kind: 'note', text: '— Proverbs 11:30'},
    {kind: 'spacer'},
    {
      kind: 'note',
      text: 'If you are going to work in the Fair Booth this year, please put your initials in a time slot above so we know that we can count on you to be there at that time.',
    },
  ]),
)
settings.upsert(
  'schedules.fairBooth.rosterPageFooterBlocks',
  JSON.stringify([
    {
      kind: 'note',
      text: 'Please put your name and your initials above so we know who you are and which slot you signed up to serve.',
    },
  ]),
)
```

**Phase-exit checks:**

- `pnpm lint` passes (server tsconfig sees the new schema files).
- A scratch script inserts a `schedules` row with `schedule_type='fair_booth'`
  and `scope_kind='date_range'`, then a `fair_booth_signups` row referencing
  it; both round-trip.
- `pnpm db:studio` shows the new tables empty.

---

## Phase 2 — Core render algorithms (pure functions, unit-testable)

Build the rendering logic as pure functions before wiring any UI. These are
the load-bearing computations: get them right and tested before the
React layer.

New file `server/services/fair-booth-render.ts` (or `src/lib/fair-booth-render.ts`
if used client-side — likely client-side since render happens in the browser
for both interactive and print views).

**Day shape:**

```ts
type FairDay = {date: string; dayOfWeek: 'fri' | 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu'; slots: FairSlot[]}
type FairSlot = {startMinute: number; endMinute: number; label: string}

function deriveFairDays(scopeStart: string): FairDay[]
```

Hardcoded map: `sat | sun | tue` → two slots (`2:00 PM–6:00 PM`, `6:00 PM–10:00 PM`);
`fri | mon | wed | thu` → one slot (`5:00 PM–10:00 PM`). Validate
`scopeStart` is a Friday before calling.

**Headcount and stable regions:**

```ts
function headcountAtMinute(signups: Signup[], dayDate: string, minute: number): number
function stableRegionsForSlot(
  signups: Signup[],
  dayDate: string,
  slot: FairSlot,
): {startHour: number; endHour: number; headcount: number}[]
```

A "stable region" is a contiguous range of hour rows within a slot where the
headcount doesn't change. Region boundaries fall on the hour. Drives the
dotted-line placement and the row-distribution algorithm.

**Day-header counts:**

```ts
function headerCountsForDay(signups, day): string // '(8)' or '(7-6 // 8-7)' or '(4 // 6)'
```

For each slot: `open = headcount at slot.startMinute`,
`close = headcount at (slot.endMinute - 1)`. Render as
`open === close ? `${open}` : `${open}-${close}``. Join slots with ` // `.

**Hispanic coverage:**

```ts
function hispanicCoverageForDay(signups, hispanicPersonIds: Set<number>, day): 'full' | 'partial' | 'none'
```

Union of `is_hispanic = true` signups' `[startMinute, endMinute)` intervals on
the day, intersected with the day's full window (`min(slot.startMinute)` to
`max(slot.endMinute)`). Full coverage → `'full'`; any gap → `'partial'`;
empty → `'none'`. Map to CSS color tokens in the render component.

**Headcount color:**

```ts
function colorForHeadcount(n: number): 'red' | 'orange' | 'yellow' | 'cyan' | 'blue' | 'green' | 'purple'
```

Per the locked rules: `n <= 3 → red`, `n === 4 → orange`, `n === 5 → yellow`,
`n === 6 → cyan`, `n === 7 → blue`, `n === 8 → green`, `n > 8 → purple`.

**Initials:**

```ts
function computeInitialsForRoster(
  people: {id: number; firstName: string; lastName: string}[],
  overrides: Map<number, string>,
): Map<number, string>
```

Algorithm:

1. Filter people with overrides into a separate map; their values are used
   as-is and they're excluded from the collision pool.
2. For the remaining pool, compute base `firstInitial + lastInitial` per
   person, uppercased.
3. Group by base. For each group with size 1, that's the final.
4. For groups with size ≥ 2, sort group by `(lastName, firstName)` ascending.
   The first stays at base. For each subsequent person, walk first-name
   characters from position 2 (0-indexed: position 1) until the resulting
   `F + lowercase(slice) + L` is unique in the group. Use the shortest
   distinguishing slice.
5. Return the merged map: overrides + computed.

**Row distribution within a stable region:**

```ts
function distributeSignupsToRows(region: {
  startHour: number
  endHour: number
  signups: Signup[]
}): Map<signupId, rowHour>
```

For full-region signups (entries that cover the entire region):

- `count = signups.length`, `rows = region.endHour - region.startHour`
- Distribute as evenly as possible: `ceil(count / rows)` in the early rows,
  `floor(count / rows)` in the later rows (or vice versa — pick early-loaded
  to match the PDF's top-loaded look).

For partial signups (start mid-region or leave mid-region): pin to their
start row (where they first appear).

Honor `display_row_override`: if set and in range, pin to that row;
otherwise fall back to auto and surface a warning at the route layer.

**Page-2 ordering and split:**

```ts
function orderRoster(roster: RosterRow[]): RosterRow[]
function splitRosterColumns(ordered: RosterRow[]): {left: RosterRow[]; right: RosterRow[]}
```

Order: `fairRole` descending (`fair_mgr` first, `worker` last) → `lastName` asc
→ `firstName` asc. Split: `mid = ceil(len/2)`; left = `[0..mid)`, right =
`[mid..len)`.

**Phase-exit checks:**

Vitest specs in `server/services/__tests__/fair-booth-render.test.ts` (or
`src/lib/__tests__/`):

- `deriveFairDays('2025-09-12' /* Fri */)` returns 9 days with the right
  slot patterns (Sat/Sun/Tue two-slot, others one-slot).
- `deriveFairDays('2025-09-13' /* Sat */)` throws.
- `headerCountsForDay` reproduces every header label from last year's PDF
  when fed reconstructed signup data (within the limits of the hand-edited
  source — note known anomalies in the test).
- `computeInitialsForRoster` reproduces last year's `BC`/`BeC`/`DH`/`DaH`/
  `JM`/`JaM`/`JS`/`JoS` patterns for an alphabetically-first-keeps-base
  rule (note: PDF has manual overrides for some — test the algorithm, not
  the PDF's exact output).
- `hispanicCoverageForDay` returns `'full'` for a day where Hispanic
  signups continuously cover 5–10 PM and `'partial'` if there's a gap.
- `colorForHeadcount` covers all 7 buckets.
- `distributeSignupsToRows` distributes 4 entries across 2 rows as 2+2,
  5 entries across 2 rows as 3+2, 3 entries across 1 row as 3+0.
- `orderRoster` sorts mixed fair-roles correctly; `splitRosterColumns` of
  32 returns 16+16; of 31 returns 16+15.

---

## Phase 3 — Backend routes

New file `server/routes/fair-booth-schedules.ts` mounted on
`/api/schedules/fair-booth`:

- `GET /` — list `schedules` rows where `schedule_type='fair_booth'`,
  ordered by `scope_start desc`. Pagination via `?limit=&offset=`.
- `POST /` — create. Body: `{scopeStart: string}`. Validates Friday;
  computes `scopeEnd = scopeStart + 8 days`; computes default
  `scopeLabel = "${monthName} ${startDay}–${endDay}, ${year}"` (handling
  cross-month spans). Inserts the envelope row.
- `GET /:id` — returns the schedule envelope + derived days + signups +
  roster + roster attrs in one payload (TanStack-friendly snapshot).
- `PUT /:id` — update `scope_start` (revalidate Friday + recompute
  `scope_end`), `scope_label`. Body: `{scopeStart?, scopeLabel?}`.
- `DELETE /:id` — cascade-deletes signups and roster attrs.

New file `server/routes/fair-booth-signups.ts` mounted on
`/api/schedules/fair-booth/:scheduleId/signups`:

- `GET /` — query by `?day=YYYY-MM-DD` or all-days.
- `POST /` — create. Body: `{personId, dayDate, startMinute, endMinute,
shiftRole, sortOrder?, displayRowOverride?}`. Validates: minutes are
  multiples of 30; `endMinute > startMinute`; `personId` in `people`;
  `shiftRole` doesn't exceed the person's fair role cap; if `shiftRole`
  is `unit_leader` or `asst_unit`, no other signup with the same role
  exists on this (schedule, day, overlapping slot).
- `PUT /:id` — same validations.
- `DELETE /:id`.
- `POST /:id/move` — adjust `sort_order`. Body: `{direction: 'up'|'down'}`.
- `POST /:id/row` — adjust `display_row_override`. Body: `{direction: 'up'|'down'|'reset'}`.

New file `server/routes/fair-booth-roster-attrs.ts` mounted on
`/api/schedules/fair-booth/:scheduleId/roster-attrs/:personId`:

- `PUT /` — upsert. Body: `{fairRole?, initialsOverride?}`. Inserts row if
  missing.
- `DELETE /` — delete the row (returns the person to all-defaults).

Roster pool reading: piggyback on the existing `groups` routes. The detail
endpoint resolves `schedules.fairBooth.rosterGroupIds` from settings and
unions the members.

Mount in `server/index.ts` (or `server/routes/index.ts`) alongside other
schedule routes.

**Phase-exit checks:**

- `pnpm lint` passes.
- A scratch `curl` flow creates a schedule, adds a signup, edits it, deletes
  it.
- Friday validation rejects a Saturday `POST /`.
- Asst Unit conflict validation rejects a second `asst_unit` signup in the
  same slot.

---

## Phase 4 — Settings UI + sidebar entry

In `src/pages/schedules-settings-page.tsx` (or equivalent), add a Fair Booth
section:

- **Title prefix** — text input bound to `schedules.fairBooth.titlePrefix`.
- **Roster Groups** — multi-select chip picker against the live `groups`
  list, bound to `schedules.fairBooth.rosterGroupIds`. Live preview of the
  resolved roster size below ("32 people in roster").
- **Bold threshold** — number input bound to `schedules.fairBooth.minSignupsForBold`.
- **Grid-page footer blocks editor** — reuse the existing footer-blocks
  editor component (whatever the Special Music settings uses for its
  `footerBlocks`).
- **Roster-page footer blocks editor** — same component, different settings
  key.

Sidebar (`src/lib/nav-config.ts` or equivalent): add `"Fair Booth"` entry
under the Schedules group between Special Music and Settings, route
`/schedules/fair-booth`.

Person detail page (`src/pages/person-detail-page.tsx`): add an `Is Hispanic`
checkbox bound to `people.is_hispanic`, in a sensible part of the form
(near other person-level attributes).

**Phase-exit checks:**

- Settings page renders all five new fields; saves persist across reload.
- Sidebar shows Fair Booth between Special Music and Settings.
- Person detail toggles `is_hispanic`; the value round-trips through the
  API.

---

## Phase 5 — Schedule list page

New file `src/pages/fair-booth/fair-booth-schedules-page.tsx` at route
`/schedules/fair-booth`. Mirror `src/pages/nursery/nursery-schedules-page.tsx`
shape:

- Filter card: `SearchInput` over scope label.
- Sortable table columns: `Scope label` | `Signups` (computed) | `Updated`.
  No `Status` column (hidden for fair_booth). No `Days` column (always 9).
- **"+ New Schedule" button** opens a dialog with a single date picker
  labeled `Starting Friday` and a validation hint. On save: `POST /` →
  navigate to `/schedules/fair-booth/:id`.
- Empty state: "No fair booth schedules yet. Click + New Schedule to create one."

**Phase-exit checks:**

- List renders existing rows; empty state appears when none.
- Friday-only validation on the create dialog.
- Created schedule navigates to its detail page (which doesn't exist yet —
  expect a 404 placeholder).

---

## Phase 6 — Schedule detail view (read-only render)

New file `src/pages/fair-booth/fair-booth-schedule-page.tsx` at route
`/schedules/fair-booth/:scheduleId`. This phase renders the grid + roster
read-only; editing comes in phase 7+.

**Layout (responsive):**

- Desktop (`md+`): side-by-side `<div className="flex gap-6">` with grid
  taking ~70% width and roster ~30%.
- Mobile: stacked, grid on top.

**Top bar:**

- Title: `${titlePrefix} ${scopeLabel} (${rosterSize})`.
- `<ScheduleActionsToolbar>` with **Export PDF / Export JPG / Export blank
  PDF / Send**. No Edit / Finalize / Reopen (no draft/final lifecycle).
- Settings → roster Groups link.

**Page 1 — grid:**

New component `<FairBoothGrid>` rendering an HTML table:

- Columns: 1 leftmost time-axis column + 9 day columns. For days that don't
  start until 5 PM (1-slot days), the 2–4 PM rows render as grayed-out
  cells (matching the PDF's dark gray blocks).
- Rows: one row per hour from 2 PM to 10 PM (8 rows).
- Day headers carry the count text and the Hispanic coverage color from
  `hispanicCoverageForDay`.
- Within each slot, hour rows are colored by `colorForHeadcount` for that
  slot's headcount at that row.
- Dotted lines between hour rows within a slot where headcount changes.
- Solid line at slot boundary on 2-slot days.
- Signup placement: shift role tier order (UL → AsstUL → Worker), Workers
  sorted by `sort_order`. Within stable regions, distribute via
  `distributeSignupsToRows`. Honor `display_row_override`.
- Initials rendering: `${dashes}${initials}${stars}${partialTime?}` —
  dashes from `shift_role` (1/2/3), stars from `fair_role` (1/2/3/4/5),
  partial time from `(startTime-endTime)` when the signup doesn't cover
  the full slot.
- Cursor: pointer on every day column cell. Clicking anywhere in a day
  column routes to `/schedules/fair-booth/:scheduleId/day/:date`.

**Page 2 — roster:**

New component `<FairBoothRoster>`:

- Two-column table with `Name (N)` + `Initials` headers per column.
- Sorted via `orderRoster`; split via `splitRosterColumns`.
- Italic if signup count = 0; bold if signup count < `minSignupsForBold`.
- Each row is `cursor: pointer`; clicking opens
  `<FairBoothRosterRowModal>` (phase 8).
- People with active signups but no Group membership: render with a small
  warning icon and a tooltip ("No longer on roster Group; X shifts").

Page 1 and page 2 each rendered inside the shared `<SchedulePreviewFrame>`
(title, logo, footer blocks).

**Phase-exit checks:**

- A schedule with no signups and no roster Groups configured renders an
  empty grid + an empty roster pane.
- A schedule with roster Groups configured but no signups renders 9 day
  columns, all rows uncolored, headers `(0)` × 9 in red (zero Hispanic
  coverage), and all roster names in italic.
- A schedule with hand-entered signups renders close to the PDF's look.
  Diff against last year's PDF screenshot for sanity; small visual
  variation is OK.
- Page 1 + page 2 capture cleanly (cursor styles don't bleed into the
  DOM; hover affordances are `:hover`-only, not always-on).

---

## Phase 7 — Day editor sub-page

New file `src/pages/fair-booth/fair-booth-day-page.tsx` at route
`/schedules/fair-booth/:scheduleId/day/:date`.

**Layout:**

- Header: back arrow to `/schedules/fair-booth/:scheduleId`, weekday + full
  date (`Sat, Sept 9, 2025`), `← Prev day / Next day →` chevrons (disabled
  at the ends of the 9-day range).
- Live day preview: a single-column render of this day using the same
  `<FairBoothGrid>` internals, scoped to one day. Updates as the table
  below is edited.
- Signups table: grouped by tier (UL → AsstUL → Workers). Columns:
  - Name (`Select` picker, options = roster pool)
  - Time range (two `Select`s for start and end at 30-min granularity;
    slot boundary times are bolded at the top of the dropdown).
  - Slot indicator (read-only badge: `Slot 1` / `Slot 2` / `Spans both`).
  - Shift role (`Select` capped at the person's fair role).
  - ↑↓ within tier (sort_order).
  - ↑↓ row (`display_row_override`).
  - 🗑 delete.
- Add affordances:
  - 2-slot day: three buttons `+ Add to Slot 1 (2–6)`,
    `+ Add to Slot 2 (6–10)`, `+ Add spanning both (2–10)`.
  - 1-slot day: one button `+ Add to Slot (5–10)`.

**Mutations** (TanStack Query):

- Auto-save on every field change (debounced 300ms per row).
- Show a small "Saving..." → "Saved" indicator next to the row being
  edited.
- Validation errors (e.g., second Unit Leader in a slot) render inline on
  the offending row with a red border + tooltip.

**Phase-exit checks:**

- Add a signup → renders immediately in the preview and in the parent
  schedule grid after navigating back.
- Edit time range from `(5-10)` to `(5-7)` → preview updates;
  dotted-line transition reflows.
- Try to add a second Unit Leader to the same slot → blocked with a
  visible error; row is not persisted.
- Prev/Next day chevrons disable at the edges of the 9-day range.

---

## Phase 8 — Roster row modal

New component `<FairBoothRosterRowModal>` opened from `<FairBoothRoster>`
on row click.

**Fields:**

- Initials override (text; placeholder shows computed initials).
- Fair role (1–5★ picker — radio group with star icons).
- Hispanic checkbox (with a one-line note: "Applies app-wide, not just
  this schedule").
- Read-only signup count, with a link "Filter grid to this person" that
  navigates back to the schedule view with a `?person=:id` query param
  highlighting their shifts.

**Mutations:**

- Initials override and fair role PUT to `/api/schedules/fair-booth/:id/
roster-attrs/:personId` (sparse upsert).
- Hispanic checkbox PUT to the existing person endpoint
  (`/api/people/:personId`) with `{isHispanic}`.

**Phase-exit checks:**

- Set initials override → page 2 displays the override, page 1 grid
  reflects it on all of that person's signups.
- Set fair role to 5★ → star suffix on initials updates throughout.
- Toggle Hispanic → day header colors update for any day this person
  has signups on.
- Clear initials override (empty string) → DELETE the row, computed
  initials return.

---

## Phase 9 — Exports

In `src/lib/use-schedule-export.ts` (or the equivalent hook), add Fair
Booth–specific capture targets:

- **Live PDF:** capture `<FairBoothGrid>` and `<FairBoothRoster>` each
  as a `<SchedulePreviewFrame>` and assemble as a two-page PDF.
- **Live JPG:** capture page 1 only.
- **Blank PDF:** render a `<FairBoothBlankGrid>` (empty cells, uncolored
  headers, no parens, no dotted lines, instructional footer present) for
  page 1, and the live `<FairBoothRoster>` for page 2.
  Assemble as a two-page PDF.

Wire the buttons in `<ScheduleActionsToolbar>` to the new functions when
`scheduleType === 'fair_booth'`.

Send-as-image dialog reuses `<SendScheduleDialog>` with the live JPG.

**Phase-exit checks:**

- Live PDF matches the on-screen preview pixel-near (slight font
  variation across capture is OK).
- Blank PDF has empty cells and uncolored headers but the roster page
  is fully populated.
- Send dialog opens with the JPG attached; recipient picker defaults to
  the roster Group(s) but is editable.

---

## Phase 10 — Cleanup, regression check, and ship

- Run `pnpm eslint` + `pnpm prettier` over all new/changed files.
- Smoke-test other schedule types (Nursery, Special Music) to confirm no
  regression from the `scheduleTypes` enum widening or the new column on
  `people`.
- Verify backups in `central-flock.db.backups/` capture the pre-migration
  state if the migration is destructive in any way (no rows are dropped,
  but `people.is_hispanic` is added — backup is cheap insurance).
- Update `README.md` with a one-line nod to Fair Booth under the
  schedules list (if such a list exists).

**Final sanity checks:**

- Create a schedule for this year's fair start Friday.
- Configure the roster Group(s).
- Enter ~5 signups across 3 days; verify colors, dotted lines, header
  counts, and roster italic/bold all behave.
- Export live PDF and blank PDF; visually compare against last year's PDF.
- Send the live JPG to a small test group.

---

## Open questions / future work

- **Cross-year analytics.** "How many shifts has Pastor Candee done in
  the last 3 years?" The data model supports it (signups are
  per-schedule, addressable by `scope_start`); no UI in v1.
- **Per-shift attendance.** Did the person actually show up? Not
  tracked. Could be a `attended boolean` on `fair_booth_signups`
  later.
- **Reminder messages.** "Reminder: your Fair Booth shift starts in
  2 hours." Could hook into the existing message-queue with a
  scheduled-send pattern. Future.
- **Auto-flag underserved slots.** A daily background job that
  computes which days are under-staffed and surfaces them on the
  dashboard. Today's `(max-min)` header text already conveys this
  visually; automation can come later.
- **Generalize `lifecycle` onto per-type settings.** If another
  Schedule type opts out of draft/final, generalize from the
  hardcoded fair_booth branch to a settings key. Not worth it for
  one type.
