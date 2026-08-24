# Service Time is the single service vocabulary

Nursery and Special Music each carried their own frozen service enum — `sunday_school|morning|
evening|wednesday_evening` and `sunday_am|sunday_pm|wednesday_pm|other` — while everything built
later (`service_records`, `sermons`, `music_schedule_services`) already referenced the
`service_times` table. Three vocabularies for one concept meant the two schedules could not be
compared, which is what made a **Double Booking** undetectable: nothing could tell that nursery
`evening` and special music `sunday_pm` on the same Sunday are the same service. We migrated all
four enum columns to `service_time_id` and made `service_times` the only vocabulary.

## Consequences

- `special_music.service_time_id` is **nullable**; `nursery_assignments.service_time_id` is not.
  A null means a one-off service carrying its own `service_label`, which is what the `other` enum
  member became and what `music_schedule_services.service_time_id` already did. A null can never
  participate in a Double Booking, so the "a one-off never conflicts" rule falls out of the schema
  rather than needing a special case. Sunday School likewise needs no carve-out — it is an ordinary
  Service Time that Special Music simply never uses.
- `nursery_service_config` loses `label` and `sort_order`, which were duplicates of
  `service_times.name` and `service_times.sort_order` and would have drifted. It keeps only
  `worker_count`.
- **A Service Time is now mutable where an enum was frozen.** `sunday_pm` meant Sunday Evening
  forever; row 3 can be renamed, retired, or deleted with years of history pointing at it. The
  hard-delete guard in `server/routes/attendance.ts` — which already refused to delete a Service
  Time with attendance records and directed the admin to retire it — was extended to count nursery
  assignments, nursery worker eligibility, and special music. Without that extension a Service Time
  with zero attendance records and hundreds of nursery assignments would have deleted cleanly and
  cascaded them away. Retiring (`active = false`) is the only supported way to take a service out
  of circulation; retired Service Times still render in past schedules.
- The migration rewrites four columns on the production database, which per RUNBOOK.md is the only
  database. It runs with the service stopped and a pre-migration backup taken.
- **The migration snapshots every child of `nursery_workers` into temp tables before dropping the
  parent.** This is not defensive style, it is required: `drizzle-kit migrate` runs a migration
  inside a transaction, and `PRAGMA foreign_keys` is a no-op inside one. The `PRAGMA
foreign_keys=OFF` header that older migrations here carry therefore does nothing under
  drizzle-kit, so `DROP TABLE nursery_workers` fires each child's FK action — cascading the
  eligibility rows away and setting every assignment's `worker_id` to NULL. A dry run through the
  `sqlite3` CLI will _not_ catch this, because there the PRAGMA works. Test a table-rebuild
  migration by executing its statements inside an explicit transaction with foreign_keys ON.
- `nursery_service_config` is seeded at boot in `server/db/index.ts` from `service_times` rather
  than from literal enum values, and must run after the `service_times` seed it derives from.
