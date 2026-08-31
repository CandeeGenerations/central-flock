# Sunday School Stats shares nothing with Service Records or the Sunday School Roll

The app already counts Sunday School twice over. The **Sunday School** **Service Time** has 335
**Service Records** back to 2020 — for 2026-08-23 it reads 44 — and the **Sunday School Roll**
prints a per-child grid for five named **Classes**. Sunday School Stats now records a third thing:
12 children that same morning, split three ways by age and by gender. A reader will reasonably ask
why we did not join any of these together. We deliberately did not: Stats keys off its own
configured **Sunday School Department** list, stores its own **Department Counts**, and the two
Sunday School numbers are never displayed on the same screen.

## Considered options

- **Reconcile against the Service Record.** Add an "adults" Department so the counts sum to the
  usher's 44, warning when they disagree. Rejected: nobody has ever counted the adult classes, so
  it would demand inventing six years of data or showing a permanent warning on every Sunday
  before 2026 — and it turns a two-second data entry into a validation argument. The precedent is
  **Double Booking** (ADR-0026): where two independently captured facts can disagree, we surface
  nothing rather than block a save.
- **Show them side by side as context** ("Children 12 of 44, 27%"). Rejected as a weaker version of
  the same problem: the ratio looks authoritative, invites the question "why don't these add up?",
  and re-couples two captures we want free to drift.
- **Reuse the Roll's Classes as the stats dimension.** Rejected: the granularities genuinely differ
  — the Roll has five Classes split by grade _and_ gender while Stats has three age bands with
  gender as a column pair, and Stats records `2-5yrs` girls even though the Roll has no such sheet.
  Worse, ADR-0030 makes a Class a free-text label propagated only by copy-forward, so a teacher
  retyping "3 yrs - Kindergarten" in Q3 would fork a chart series that has to hold its identity
  across years.

## Consequences

- **Attendance** keeps the single meaning ADR-0029 fought for: the usher-entered in-person count on
  a **Service Record**. A Department Count is a different noun with a different table.
- A **Sunday School Department** is configured and retired like a **Service Time**, which is the
  opposite of ADR-0030's stance for the Roll's Class. That inconsistency is intentional and is the
  whole point: a printed form wants a snapshot, a four-year chart wants a stable series.
- The two lists will drift — the Roll's "3 yrs - Kindergarten" against the Department "2-5yrs" —
  and nothing reconciles them. Accepted.
- Nobody can ask "what share of Sunday School is children?" inside the app. When someone does, it
  is a new feature that joins two existing tables, not a column added here.
