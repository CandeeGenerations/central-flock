# Roll Classes and rosters are per-Roll, propagated only by copy-forward

Every other schedule type in the app keeps its stable vocabulary in settings — **Service Times**,
**Nursery Workers**, title prefixes, footer blocks, Workers' Notes themes and lessons — so the
obvious shape for the **Sunday School Roll** was an admin-managed **Class** list on the
`Service Time` model (retire, never delete) with **Scholars** hanging off it. We deliberately did
not. A Class is a free-text label on a **Roll Sheet** and a Scholar is a line in that sheet's
newline-separated roster; the only thing that carries either into the next quarter is
copy-forward, which clones the previous Roll wholesale.

## Considered options

- **Configured Classes, per-sheet Scholars.** Rejected: it buys correct labels across quarters at
  the cost of a settings pane, a retire/reactivate lifecycle and a foreign key, for a list of five
  strings that changes roughly never. The Roll would be the only feature whose settings you have
  to visit before you can create one.
- **Configured Classes with a living roster on the Class.** Rejected twice over: reprinting last
  quarter's Roll would show this quarter's children, so the printed artifact stops being a record
  of what was printed — and it makes "copy the last sheet and change the dates" a no-op for names,
  which is the entire gesture the feature exists for.

## Consequences

- There is no Sunday School Roll settings pane, and no `Class` or `Scholar` table. The whole
  feature is `sunday_school_rolls` and `sunday_school_roll_sheets` (see ADR 0029).
- Renaming a class fixes it on that Roll and every Roll copied from it afterwards; earlier Rolls
  keep the old label, which is correct — they were printed that way.
- A typo propagates silently forever once copied. Accepted: five labels, edited in place on the
  sheet, and the next quarter's Roll is a clone you look at before printing.
- Creating the very first Roll has nothing to copy, so it seeds five sheets from a one-time
  constant of the five current class labels. That constant is a convenience string, not
  configuration — nothing reads it again.
- Sheets are add/remove/reorder-able on the Roll, and `sort_order` is also the PDF page order.
  Splitting a class that outgrows 18 rows is therefore a Roll-level edit, not a settings change.
