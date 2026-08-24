# Attendance live sync — implementation plan

Two changes, shipped in order. Decisions and rationale live in
`docs/adr/0028-attendance-live-sync-by-polling.md` (change 1) and
`docs/adr/0027-attendance-tally-adjustment-vs-correction.md` (change 2); the vocabulary
(**Tally**, **Correction**, **Record Edit**) is in `CONTEXT.md` under Service Stats.

Touches three repos: `central-flock` (owns the data), `cgen-api` (thin proxy at `api.cgen.cc`),
`attendance-public` (the Netlify entry app).

## Change 1 — propagation

The ask: a count entered on the phone shows up on the laptop without a reload, whether or not the
laptop is being used.

**central-flock**

- `GET /webhooks/attendance/:token/week/:weekStart` in `server/routes/attendance-webhook.ts` —
  validates the token the same way the existing routes do, resolves the four active **Service
  Times** against the week's dates, returns every **Service Record** for them in one response.
  Include `latestEnteredAt` per record so the client can tell a genuinely newer value from an echo
  of its own write.
- Guard `weekStart` the way the client does: a real calendar date that lands on a Sunday.

**cgen-api**

- Proxy the new path in `src/routes/attendance-public.ts` (one more `proxyGet`).
- Re-key `rateLimitGet` by token rather than IP, or raise it. Two devices polling at 3s is ~40
  req/min; the current 60/min IP limit means a third usher on the church wifi takes 429s
  mid-service.

**attendance-public**

- One query key for the week, filled by the new endpoint. `PickScreen` drops its `useQueries`
  fan-out (4 requests → 1); `EntryScreen` reads its record out of the same cache instead of
  fetching its own.
- `refetchInterval: 3000` gated on `document.visibilityState === 'visible'`, plus refetch on focus,
  on wake, and on `online`. Nothing long-lived is opened, and react-query clears the timer on
  unmount — the no-leak constraint is why this is a timer and not a stream.
- Entry Screen: when a poll brings a value that differs from what was displayed and the change did
  not come from this device, show a brief "updated elsewhere" line under the number, fading after
  ~4s. Never swap digits silently mid-count.
- Service worker: the new GET matches the existing `NetworkFirst` rule for `/attendance-public/`,
  which is correct — a cached week is a better cold open than a blank screen.

## Change 2 — Tally / Correction

Removes the last case where one device can overwrite another: an offline queue draining over a
newer count.

**central-flock**

- Migration: `service_record_edits` grows `kind` (`tally` | `correction`) and `adjustment`
  (nullable int). Existing rows are corrections.
- `POST /webhooks/attendance/:token/record` accepts a Tally (`{field, adjustment, tappedAt}`)
  alongside today's Correction shape. Tally applies inside the existing transaction:
  clamp at zero, write the resulting value, append the edit with both numbers.
- Correction wins over any Tally whose `tappedAt` precedes it — compare against the record's
  latest correction timestamp and drop the Tally rather than applying it.

**attendance-public**

- `outbox.ts` queues adjustments per (record, field) and accumulates them, instead of snapshots.
  Stamp each with its tap time. The Type box still queues a Correction.
- `resolveRecord` becomes: latest known server value + this device's un-drained adjustments.
- Drop the "queued snapshot beats server value" rule — it is what makes a stale screen authoritative
  today.

**central-flock admin**

- Record history dialog renders the ledger form: `+1 → 42` for a Tally, `137` for a Correction.

## Open, deliberately deferred

- SSE if 3s feels slow with both screens side by side. The endpoint and the display rule stay the
  same; only the transport changes.
- Two ushers counting _one_ service simultaneously and having their counts combine. Tallies make it
  safe, but nothing in the UI shows who contributed what, and no one has asked for it.
