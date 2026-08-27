# Sunday School Stats

Replace the `Sunday School Stats (2026).xlsx` workbook with a weekly grid and a dashboard, and
rename the **Attendance** nav group to **Ministry Stats** so it can hold this plus Fill America.

Slice 1 of 3. The others are [fill-america-core.md](./fill-america-core.md) and
[fill-america-dashboard.md](./fill-america-dashboard.md).

One ADR governs this work — read it first:

- [0031 — Sunday School Stats shares nothing with Service Records or the Roll](../docs/adr/0031-sunday-school-stats-is-independent-of-service-records-and-the-roll.md)

Terms (**Sunday School Department**, **Department Count**, **Diff**) are defined in
[CONTEXT.md](../CONTEXT.md). It also builds on
[0029 — the Roll is print-only](../docs/adr/0029-sunday-school-roll-is-print-only.md) and
[0030 — Roll Classes propagate by copy-forward](../docs/adr/0030-roll-classes-and-rosters-propagate-by-copy-forward.md),
whose stance this deliberately inverts.

## The problem

Each quarter is a spreadsheet tab: 13 Sunday rows × 3 groups, each group Girls / Boys / Total /
Diff, with an Averages row at the bottom. Total, Diff and Averages are all formulas. The only typed
values are Girls and Boys — 6 numbers per Sunday.

The app already counts Sunday School twice and this is a third capture. Per ADR-0031, it joins
neither:

| Capture                               | Granularity                 | 2026-08-23       |
| ------------------------------------- | --------------------------- | ---------------- |
| `service_records` (id 1)              | whole room, incl. adults    | 44 + 7 streaming |
| `sunday_school_roll_sheets`           | 5 named Classes, print-only | (no numbers)     |
| **`sunday_school_department_counts`** | 3 Departments × gender      | 12               |

The 44 and the 12 are never shown together and never reconciled.

## Phase 1 — Schema

New file `server/db/schema-sunday-school-stats.ts`, exported from `server/db/schema.ts`.

```ts
// Configured age band. Retired like a Service Time (active=false), never deleted
// once counts reference it. Deliberately NOT the Roll's free-text Class — see ADR-0031.
sundaySchoolDepartments
  id, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0, createdAt, updatedAt

// One cell of the grid. girls/boys nullable: blank is not zero — blank means
// nobody recorded it, 0 means the class met and no one came.
sundaySchoolDepartmentCounts
  id,
  weekOf TEXT NOT NULL,            // 'YYYY-MM-DD', always a Sunday
  departmentId -> sundaySchoolDepartments(id) ON DELETE CASCADE,
  girls INTEGER, boys INTEGER,
  createdAt, updatedAt
  UNIQUE(weekOf, departmentId)
  INDEX(weekOf)
```

No `schedules` envelope row, no draft/final, no parent quarter entity — the quarter is a picker,
not a record. Nothing needs creating before a number can be typed.

Seed the three Departments in the migration, matching the workbook's own labels:

| sortOrder | name       |
| --------- | ---------- |
| 0         | `2-5yrs`   |
| 1         | `1st-5th`  |
| 2         | `6th-12th` |

Migration `0047_sunday_school_stats.sql` via `pnpm db:generate`. Per
[RUNBOOK.md](../RUNBOOK.md), production is the only DB — stop the service, back up, migrate.

## Phase 2 — Server

New `server/routes/sunday-school-stats.ts`, mounted at `/api/sunday-school-stats`. Modelled on
`server/routes/attendance.ts`, which already has the `/series` and `/summary` shapes to copy.

| Method | Path                                  | Notes                                                                  |
| ------ | ------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/departments`                        | `?includeInactive=1`; adds `countCount` like `ServiceTime.recordCount` |
| POST   | `/departments`                        | name, sortOrder                                                        |
| PATCH  | `/departments/:id`                    | rename, reorder, `active` toggle                                       |
| DELETE | `/departments/:id`                    | 409 unless zero counts; otherwise retire via PATCH                     |
| GET    | `/grid?year&quarter`                  | Sundays × Departments for one quarter, blanks included                 |
| PUT    | `/counts`                             | upsert `{weekOf, departmentId, girls, boys}`; `null` clears            |
| GET    | `/series?metric&departmentId&from&to` | `{points: [{date, value}]}`, mirrors `/api/attendance/series`          |
| GET    | `/summary?departmentId`               | this-quarter + this-year totals/averages/weeks                         |

`metric` is `girls | boys | total`. `departmentId` accepts `all`.

`/grid` derives its Sundays from `sundaysInQuarter(year, quarter)` in
`src/lib/sunday-school-roll-core.ts` — already written to be import-safe from the server (no React,
no `@` alias, no Node API), and already used to derive the Roll's date columns. Do not write a
second copy of this arithmetic.

Reuse `asyncHandler` and the `DATE_RE` guard from the attendance router. Register in
`server/index.ts` beside the other routers.

## Phase 3 — Client

`src/lib/sunday-school-stats-api.ts` — copy the `request()` wrapper and type shapes from
`src/lib/attendance-api.ts` (`Metric`, `SeriesResponse`, `MetricAgg`, `SummaryResponse`). Add keys
to `src/lib/query-keys.ts` alongside the `attendance*` block:

```ts
sundaySchoolDepartments: (includeInactive: boolean) => [...],
sundaySchoolGrid: (year: number, quarter: number) => [...],
sundaySchoolSeries: (metric, departmentId, from, to) => [...],
sundaySchoolSummary: (departmentId) => [...],
```

**`src/pages/sunday-school-stats/stats-page.tsx`** at `/sunday-school/stats` — one page, following
`attendance-dashboard-page.tsx` top to bottom:

1. **Filter card** — Metric (Girls / Boys / Total), Department (All combined / each), `DateRangePicker`
   defaulting to year-start→today, and a `vs Last Year` toggle.
2. **Four tiles** — This Quarter total + avg, This Quarter · weeks, This Year total + avg,
   This Year · weeks.
3. **Chart** — the same `ComposedChart`: `Area` on `var(--primary)` with the `linearGradient` fade,
   red `Line` for the least-squares trend (`linreg` is inline in the attendance page; lift it into
   a shared helper rather than copy it a second time), blue `Line` for last year when toggled.
   Points are already weekly, so `toWeekly()` bucketing is **not** needed — plot `weekOf` directly.
4. **Quarter grid** below the chart, in place of `RecordsTable`. Year + Quarter selects; 13 (or 12
   or 14) Sunday rows × 3 Departments; two number inputs per cell. Derived, never editable: each
   Department's Total, its **Diff** against the previous Sunday _that has data_, the row grand
   total, and an Averages footer. Save on blur, optimistic, invalidating grid + series + summary.
   An empty input writes `null`, not `0`.

**`src/pages/sunday-school-stats/departments-section.tsx`** — a settings pane. Copy
`src/pages/attendance-settings/service-times-section.tsx` wholesale; it already does inline rename,
reorder, active toggle, and the delete-blocked-when-referenced dialog.

## Phase 4 — Nav, routes, palette

`src/lib/nav-config.ts` — the `attendance` group is **renamed**, not replaced:

```ts
{
  id: 'attendance',                  // id unchanged: route_visits history keys off it
  label: 'Ministry Stats',           // was 'Attendance'
  icon: BarChart3,
  children: [
    {to: '/attendance', label: 'Main Services', icon: Church, end: true},
    {to: '/sunday-school/stats', label: 'Sunday School', icon: GraduationCap},
    // Fill America lands here in slice 2
    {to: '/attendance/settings', label: 'Settings', icon: Settings,
     matchPaths: ['/attendance/times', '/attendance/recorders']},
  ],
}
```

`/attendance` keeps its path deliberately. Renaming it would orphan every `route_visits` row behind
the usage-frecency feature ([ADR-0012](../docs/adr/0012-usage-frecency-route-log.md)) and break
bookmarks, for a cosmetic gain.

`src/App.tsx` — add `/sunday-school/stats`, and `departments` inside the existing
`/attendance/settings` `<Route>` block beside `times` and `recorders`.

`src/pages/attendance-settings/attendance-settings-layout.tsx` — add
`{to: 'departments', label: 'Departments', icon: GraduationCap}` to `SECTIONS`, and retitle the
heading from "Attendance Settings" to "Ministry Stats Settings".

Per [CLAUDE.md](../CLAUDE.md): sidebar nav actions derive from `navGroups`, so the palette picks
both new routes up automatically. Neither is an entity detail route (`/section/:id`), so
`server/services/usage-entity-resolver.ts` needs nothing and no search provider is required.

## Phase 5 — Backfill

`scripts/backfill-sunday-school-stats.ts`, run once with `tsx`, following
`scripts/seed-workers-notes-2026.ts`. `xlsx@^0.18.5` is already a dependency
(`server/routes/devotions.ts` uses it).

Reads `~/Desktop/Sunday School Stats (2026).xlsx`. Each `Quarter N` tab: column A is an Excel
serial date, and Girls/Boys sit at columns C/D, I/J, O/P for the three Departments.

The workbook's Sundays match `sundaysInQuarter()` exactly for 2026, so assert that rather than
trusting the sheet's row order.

| Tab       | Sundays | With data | Notes                                         |
| --------- | ------- | --------- | --------------------------------------------- |
| Quarter 1 | 13      | 13        | `2026-01-25` and `2026-03-22` are explicit 0s |
| Quarter 2 | 13      | 13        |                                               |
| Quarter 3 | 13      | 8         | data stops after `2026-08-23`                 |
| Quarter 4 | 13      | 0         | insert nothing                                |

**34 Sundays → 102 rows.** Rules:

- Both Girls and Boys `null` → insert nothing. The five blank Q3 Sundays and all of Q4 stay absent.
- An explicit `0` → insert `0`. The sheet distinguishes these and so must the import; the two
  all-zero Sundays in Q1 are real zeros, not gaps.
- Ignore the Total, Diff and Average columns entirely — all derived.
- Idempotent: upsert on `(weekOf, departmentId)` so a re-run is safe.

Print a per-quarter summary and verify the grand total against the sheet's own Averages row before
committing the transaction.

## Out of scope

Printing or PDF export; CSV export; a public entry app or **Recorder** tokens for teachers; any
per-child data (that is the Roll, and ADR-0029 explains why it stays paper); any link to
`service_records`.

## Done when

- `/sunday-school/stats` charts 2026 and its grid round-trips a number.
- Q1 and Q2 each show 13 Sundays; Q3 shows 8 filled and 5 blank; Q4 is empty.
- `2026-01-25` reads `0`, not blank; `2026-08-30` reads blank, not `0`.
- Departments can be renamed, reordered and retired; deleting one with counts is refused.
- `pnpm eslint` and `pnpm prettier` clean.
