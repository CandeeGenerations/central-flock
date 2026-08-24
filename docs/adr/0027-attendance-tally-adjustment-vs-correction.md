# A Tally is an adjustment; a Correction is an absolute value

Attendance entry posts a full snapshot of both **Attendance** and **Streaming**, so the last write
to reach the server wins outright. That is invisible while one usher counts on one device, and
wrong the moment a **Recorder** uses a phone and a laptop in turn: the device that was offline
drains its queue and overwrites whatever the other one counted. We are splitting the write in two —
a **Tally** carries a ±1 adjustment and a **Correction** carries an absolute value — because the two
entries mean genuinely different things. A tap contributes to a count; typing 137 declares it.

## Considered options

- **Version the Service Record and reject stale writes.** Rejected: the offline outbox is the whole
  point of the entry app (there is no signal at the back of the auditorium), and every queued tap
  from a twenty-minute outage would come back a 409. Protecting the count is worth more than
  protecting the ordering.
- **Keep snapshots, rely on live propagation to keep screens fresh.** Rejected: propagation shrinks
  the stale window, it never closes it. A sleeping laptop is unboundedly stale, and a snapshot from
  a stale screen clobbers by construction.

## Consequences

- **Tallies commute.** Order of arrival cannot change the total, so a device may drain whenever it
  reconnects without coordination. A Tally may not take a count below zero.
- **A Correction settles the number as of the moment it was made.** A Tally tapped _before_ a
  Correction is discarded when it arrives late; one tapped after applies on top. This is the only
  reason a Tally must carry its own tap timestamp — the server cannot infer intent from arrival
  order, and the client clock is trusted for this one comparison.
- **`service_record_edits` grows a kind and an adjustment.** A Tally stores both the ±1 and the
  value it produced, so the admin history reads as a ledger and one device's contribution stays
  legible; a Correction stores only the value. The **Service Record** still displays the latest
  edit's values, exactly as before.
- Admin edits on the attendance dashboard are Corrections. Nothing in the admin UI produces a Tally.
