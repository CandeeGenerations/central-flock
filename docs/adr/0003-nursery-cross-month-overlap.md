# Nursery cross-month overlap: live-resolve borrowed assignments

## Context

When generating a nursery schedule for a month with fewer than 5 Sundays, `computeDatePairs` prepends the previous month's last Sunday so every schedule has 5 weekly pairs. The borrowed pair (Sunday + Wednesday) typically already appears on the previous month's schedule — either as that month's own 5th pair (when the prior month had 5 Sundays and its last Sunday-paired Wednesday spilled into the new month), or as ordinary dates inside the prior month.

The naive approach — copy the prior month's assignments into the new schedule as fresh rows — produces two failure modes:

1. **Double-counting against monthly caps.** A worker like Carla (`maxPerMonth = 1`) ends up scheduled twice across two calendar months because the borrowed-day assignment consumes her June quota in addition to her May one.
2. **Silent divergence.** If the prior month's assignment is later edited (Carla → Grace on May 31), the new month's snapshot stays stale and two printed schedules disagree on the same physical date.

## Decision

Borrowed-pair assignments are **live-resolved from the prior month's schedule at view-time**, not stored on the new schedule.

- **Generate-time:** the scheduler reads the prior month's assignments for the borrowed-pair dates and seeds `dayAssignments` only (so same-day double-booking and first-name/sibling constraints stay active for those dates). It does **not** seed `totalAssignments` or `serviceAssignments`, and it does **not** persist `nursery_assignments` rows for the borrowed-pair dates.
- **Load-time:** `loadScheduleWithAssignments` merges the schedule's own rows with the prior month's rows for any borrowed-pair dates, tagging the merged-in rows as `isCarryover: true`.
- **Edit:** `PATCH /api/nursery/assignments/:id` rejects edits to carryover rows. To change a borrowed-pair assignment, the user opens the prior month's schedule and edits it there.

When the prior month has no schedule, generation falls back to a fresh assignment for the borrowed-pair dates and the UI surfaces a non-blocking warning. Prior-month lookup prefers `final` and falls back to `draft`.

## Why

- **Hard to reverse:** the choice not to persist carryover rows shapes storage and the loader. Once schedules exist in production storing only their non-overlap rows, switching to snapshot mode would require a backfill.
- **Surprising without context:** a future reader inspecting `nursery_assignments` for a 4-Sunday month will find only ~16 rows instead of the ~20 the printed PDF shows, and will wonder where the borrowed week's data lives.
- **Real trade-off:** the alternative — snapshot at generate-time — is simpler to query and renders without a join, but reintroduces the divergence problem any time the prior month is edited after the new month is generated. Live-resolve guarantees a single source of truth: each physical date is owned by exactly one schedule.

## Consequences

- The in-app schedule view badges carryover cells ("From May schedule") and disables their editor; the exported PDF/JPG renders them identically to native rows (parishioners shouldn't see editorial state).
- Null carryover slots remain null on the new schedule — backfilling is the prior month's responsibility.
- The scheduler's `prevDateWorkers` / `prevSlotWorker` / `siblingFirstNames` penalties continue to work for the first native pair because carryover slots are present in the in-memory `slots[]` array during generation, even though they aren't persisted.
- Cap bypass applies to monthly fairness counters only (`totalAssignments`, per-service `serviceAssignments`). Physical-reality constraints (`dayAssignments`, double-booking, first-name pairing) still apply to carryover dates.
