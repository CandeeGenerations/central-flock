# RSVP lists link to calendar events by `event_uid`, not by row id

## Context

`rsvp_lists` linked to a calendar event via `calendar_event_id` → `calendar_events.id` (autoincrement PK, `onDelete: 'set null'`). The hourly calendar sync (`calendar-sync.ts`) rebuilds the table with `DELETE FROM calendar_events` followed by re-inserts, so every event gets a **new id each sync**. The set-null FK then nulled every RSVP list's event link on the next run — a list would show its event selected right after creation, then blank an hour later.

## Decision

Link by the **stable Calendar.app `event_uid`**. `rsvp_lists` stores `calendar_event_uid` (plain TEXT, **no FK** — the value must survive even while no matching row exists, e.g. an event temporarily outside the 180-day sync window); event metadata is resolved by joining `calendar_events ON event_uid` scoped to `recurring = 0`. A partial unique index `UNIQUE(event_uid) WHERE recurring = 0` guarantees the join matches at most one row and guards the sync against double-inserting a non-recurring event. The old `calendar_event_id` column is dropped (backfilled best-effort into `calendar_event_uid` first). The sync is left as-is (still delete-and-reinsert) — the link no longer depends on id stability.

## Considered options

- **Upsert the sync to preserve ids** (match by `event_uid`, update in place). Rejected: cheaper, but the link would still ride a volatile surrogate — any future reinsert, or an event leaving the sync window, re-breaks it. The uid link fixes the root cause instead of the symptom.

## Consequences

- The uid is scoped to non-recurring events only. `event_uid` is _not_ globally unique in `calendar_events` (EventKit shares `eventIdentifier` across recurring occurrences), which is why the join and the unique index are both filtered to `recurring = 0`. The RSVP event picker already only offers non-recurring events.
- No snapshot of title/date is stored on the list, so an RSVP list whose event has scrolled out of the 180-day sync window still shows no event metadata (unchanged from prior behavior). A future improvement could snapshot at attach time.
