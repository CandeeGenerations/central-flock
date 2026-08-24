# Nursery / Special Music Double Booking

Warn when the same person is scheduled in the nursery and in special music at the same service.

Two ADRs govern this work — read them first:

- [0025 — Service Time is the single service vocabulary](../docs/adr/0025-service-time-as-single-service-vocabulary.md)
- [0026 — Double Booking is advisory and asymmetric](../docs/adr/0026-double-booking-advisory-and-asymmetric.md)

Terms (**Nursery Worker**, **Double Booking**, **Service Time**) are defined in [CONTEXT.md](../CONTEXT.md).

## The problem

`nursery_assignments.worker_id` points at `nursery_workers`, a standalone table whose only identity
is a free-typed name. `special_music_performers.person_id` points at `people`. Nothing links them,
so nursery worker "Kim Stewart" and contact `people.id=383` Kim Stewart are unrelated rows.

Live example, currently undetectable:

| Side          | Row                                           |
| ------------- | --------------------------------------------- |
| Nursery       | `2026-08-23` `evening` slot 1 → worker id 4   |
| Special Music | `2026-08-23` `sunday_pm` solo → person id 383 |

The two sides also name their service differently (`evening` vs `sunday_pm`), so even with a shared
identity they could not be compared.

## Phase 1 — Link Nursery Workers to People

`nursery_workers` gains `person_id INTEGER NOT NULL REFERENCES people(id)`. `name` becomes a
nullable **override** for what the roster prints, not the worker's identity. With no override the
contact's own name prints; display preferences (`display_first_name_only`) are ignored, because the
nursery sheet is a work roster, not a program.

Back-fill (nine exact matches, one manual):

| Worker id | Worker name    | person_id |
| --------- | -------------- | --------- |
| 1         | Carissa Candee | 62        |
| 2         | Grace Ortiz    | 297       |
| 3         | Angie Cobb     | 77        |
| 4         | Kim Stewart    | 383       |
| 5         | Yuny Mejia     | **363**   |
| 6         | Debbie Scott   | 359       |
| 7         | Grace Ngong    | 287       |
| 8         | Evie Ross      | 345       |
| 9         | Carla Mendez   | 260       |
| 10        | Kim Mussomele  | 284       |

Worker 5 is the one that matters: contact 363 is **Juni Salgado**, not "Yuny Mejia". Different
surname. Her `name` override is kept as `Yuny Mejia`; the other nine have their override set to
`NULL` since it would duplicate the contact name. This row is also why name-string matching was
rejected — and why the override column exists at all.

Migration must assert all ten resolve before adding the NOT NULL constraint. If any row fails,
abort rather than defaulting.

Then:

- `NurseryWorkerForm` (`src/components/nursery/nursery-worker-form.tsx`) swaps its free-text name
  input for a person picker, with an optional "prints as" override field beneath it. Reuse the
  performer picker pattern from `src/components/specials/special-form.tsx`.
- `server/routes/nursery.ts` create/update take `personId` + optional `name`.
- `loadWorkers()` (`server/routes/nursery-schedules.ts:31`) resolves the display name as
  `worker.name ?? person.firstName + ' ' + person.lastName`.

## Phase 2 — Migrate to Service Time

Four columns move off frozen enums (see ADR 0025):

| Table                     | Column         | Becomes                        |
| ------------------------- | -------------- | ------------------------------ |
| `nursery_assignments`     | `service_type` | `service_time_id` NOT NULL     |
| `nursery_worker_services` | `service_type` | `service_time_id` NOT NULL     |
| `nursery_service_config`  | `service_type` | `service_time_id` PK           |
| `special_music`           | `service_type` | `service_time_id` **nullable** |

Mapping — verify these four `service_times` ids on the live DB before writing the migration, they
are read from current data and are not guaranteed stable:

| Old nursery enum    | Old special music enum | Service Time                |
| ------------------- | ---------------------- | --------------------------- |
| `sunday_school`     | —                      | 1 · Sunday School 09:45     |
| `morning`           | `sunday_am`            | 2 · Sunday Morning 11:00    |
| `evening`           | `sunday_pm`            | 3 · Sunday Evening 18:30    |
| `wednesday_evening` | `wednesday_pm`         | 4 · Wednesday Evening 19:30 |
| —                   | `other`                | `NULL` + `service_label`    |

All 44 existing special music rows are `sunday_am`/`sunday_pm`, so no row migrates to NULL today.

`nursery_service_config` drops `label` and `sort_order` (now duplicates of `service_times.name` and
`.sort_order`), keeping only `worker_count` — `sunday_school`=1, `morning`=2, `evening`=1,
`wednesday_evening`=1 carry over unchanged.

Code to update:

- `server/services/nursery-scheduler.ts` — ~24 references to `ServiceType`/`serviceType`. The
  `ServiceConfig` interface loses `label`/`sortOrder` as stored fields and receives them joined from
  `service_times`. **Algorithm behaviour must not change** — this is a rename of the keying field,
  nothing more.
- `server/routes/nursery.ts`, `server/routes/nursery-schedules.ts`, `server/routes/specials.ts`
- `src/lib/nursery-api.ts`, `src/lib/specials-api.ts` — drop the `ServiceType` union type
- `src/components/nursery/nursery-worker-form.tsx` (its hardcoded `ALL_SERVICES` list becomes a
  fetch of active Service Times), `nursery-schedule-preview.tsx`,
  `src/components/specials/special-form.tsx`, `src/pages/music/specials-list-page.tsx`,
  `src/pages/schedules-settings/nursery-section.tsx`, `src/pages/nursery/nursery-workers-page.tsx`

Extend the hard-delete guard at `server/routes/attendance.ts:128` to count `nursery_assignments`,
`nursery_worker_services`, and `special_music` alongside `service_records` before permitting a
hard delete. Without this a Service Time with no attendance records but hundreds of nursery
assignments deletes cleanly and cascades them away.

Retired Service Times (`active = false`) must still render in existing schedules; only _new_
schedules stop offering them.

## Phase 3 — Detect and surface

A single server-side resolver, given a date range, returns Double Bookings:

```
(person_id, date, service_time_id) present in BOTH
  nursery_assignments (joined to nursery_workers.person_id)
  special_music_performers (joined to special_music)
```

Rules, per ADR 0026:

- Derived at read time, never stored — either side can move at any moment.
- `special_music.status` is ignored. `needs_review` still means someone is penciled in to sing.
- `service_time_id IS NULL` on the special music side never matches.
- `special_music.guest_performers` (a JSON array of loose names) never matches — no `person_id`.
- Computed regardless of date; the **UI** filters to today-forward so finalised history stops nagging.
- Asymmetric. Do not generalise to "any person twice at a service time" — that pulls in `sermons`
  and false-alarms on the preacher who sings.

Surfaces:

| Surface                             | Warning                             |
| ----------------------------------- | ----------------------------------- |
| `/nursery/:id` grid                 | Inline on the conflicting cell      |
| `/music/specials/:id` detail        | Inline on the conflicting performer |
| `/special-music/:id` view           | On screen only                      |
| `/nursery`, `/music/specials` lists | No                                  |
| **Any PDF / JPG export**            | **Never**                           |

The export rule is not negotiable — those sheets go to the nursery wall and to the musicians. A
"DOUBLE BOOKED" badge on a schedule handed to the church is confusing at best.

Each warning names the other side and links to it, so it is actionable from wherever it is seen:
"Also singing this service — Special Music, Aug 23 PM."

`generateSchedule` is **not** modified. See ADR 0026.

## Migration hazard (found during deploy)

`drizzle-kit migrate` wraps a migration in a transaction, and `PRAGMA foreign_keys` is a no-op
inside a transaction. The `PRAGMA foreign_keys=OFF` header copied from migrations 0027/0031 is
therefore inert under `pnpm db:migrate`. Dropping `nursery_workers` fires its children's FK
actions: `nursery_worker_services` cascades to empty and every `nursery_assignments.worker_id`
becomes NULL.

The first production run hit exactly this — 11 eligibility rows deleted, all 153 assignments
unassigned — and was restored from the pre-migration backup. The migration now snapshots
`nursery_worker_services`, `nursery_assignments`, `nursery_service_config`, and `nursery_workers`
into temp tables _before_ any DROP, rebuilds from the snapshots, and asserts via
`migration_guard` that no row was lost.

A `sqlite3` CLI dry run does not reproduce this, because there the PRAGMA takes effect. Verify a
table-rebuild migration by running its statements inside an explicit transaction with
`foreign_keys` ON.

## Deployment

The migration rewrites four columns on the production database, which per
[RUNBOOK.md](../RUNBOOK.md) is the only database:

1. Stop the launchd service.
2. Back up to `central-flock.db.pre-double-booking-bak`.
3. `pnpm db:migrate`.
4. Verify: all 10 workers have a `person_id`; all 44 special music rows and all nursery assignments
   have a `service_time_id`; nursery generation for a fresh month still produces the same shape.
5. Restart the service.

## Verification

The acceptance case is the one that started this: **Kim Stewart, `2026-08-23`** — nursery `evening`
and special music `sunday_pm` — warns on both sides.

Negative cases that must stay silent:

- Carissa Candee, nursery Sunday School every week — Special Music has no Sunday School entries.
- Nursery in the morning and singing in the evening on the same Sunday — different Service Times.
- A preacher who also sings in the service he preaches — not an exclusive commitment.
- A guest performer sharing a name with a nursery worker — no `person_id`.
