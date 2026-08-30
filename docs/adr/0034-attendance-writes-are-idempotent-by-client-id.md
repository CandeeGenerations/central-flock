# Every attendance write carries a client-minted id and is applied once

An usher walking the auditorium hands off between the church wifi and cell data mid-count. A **Tally**
POST that has already committed in SQLite loses its _response_ on that handover, and from the phone
a dropped response is indistinguishable from a dropped request: the outbox keeps the entry queued
and re-sends it, and the same +1 lands twice. Counts came back high, by a few, in exactly the part
of the building where the signal changes hands. Delivery here is at-least-once and cannot be made
anything else, so the fix belongs at the other end: the entry app mints an id per entry, the server
records it on the **Record Edit**, and an id it has already logged is answered rather than counted.

## Considered options

- **Deduplicate by (recorder, field, adjustment, tappedAt).** Rejected: two ushers tapping the same
  second on one recorder link is not a hypothetical, and a natural key that can collide silently
  drops a real count. Losing a tap is worse than the double it prevents.
- **Acknowledge each entry with a server-assigned id on a second round trip.** Rejected: it needs
  the network to be up to _start_ an entry, which is the one thing the outbox exists not to need.

## Consequences

- **An entry is frozen once it has been sent.** A **Tally** bucket accumulates taps only until its
  first send attempt; after that, taps open a new bucket. Growing a bucket behind an id the server
  may already hold would hide the new taps behind an adjustment that gets deduplicated away — an
  undercount traded for the overcount, which is no better.
- **A retried Correction stops clobbering.** Replaying one used to undo every Tally another device
  had landed since; now it is a lookup. The response to a repeat is the record as it now stands,
  not an echo of the request.
- **Requests get a 12-second deadline.** A hung socket used to hold the outbox's single-flight
  guard shut until the OS gave up, so nothing drained. Aborting is only safe because a request that
  did land is deduplicated on the retry — the deadline and the id are one change, not two.
- `service_record_edits.client_edit_id` is unique where present, and null for admin edits and for
  everything written before this. The change log is the dedupe ledger; there is no second table and
  no expiry, which matters because an outbox can drain a week late.
