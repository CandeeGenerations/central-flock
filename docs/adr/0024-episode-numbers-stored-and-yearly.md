# Episode Numbers are stored and auto-assigned, and the sequence resets each calendar year

## Context

The Sound Booth Sheet prints a podcast episode number beside each service's title — `Title: (#100)`.
The numbers run in date order across services (morning, evening, midweek) and skip Sunday School,
which is not uploaded. They restart at #1 with the first uploaded service of each calendar year.

[ADR 0020](./0020-derived-lesson-numbering.md) took the opposite approach for the visually similar
lesson numbers on a **Workers' Notes Edition**: they are derived from position and never stored, so
inserting a row renumbers everything after it automatically and no stored number can drift out of
step with the sequence.

## Decision

An **Episode Number** is **stored** on the service. It is auto-assigned when a week is created —
the next number after the highest already used _in the year of that service's own date_ — and can
be adjusted per service with a stepper. The editor warns on a duplicate or a gap; it never
renumbers anything by itself.

Scoping by the service's own date year, rather than the week's, resolves the New Year's boundary
cleanly: a week whose Sunday is 31 December keeps old-year numbers for its Sunday services while
its Wednesday, landing in January, starts the new year at #1.

## Why

- **Hard to reverse.** Numbers become public the moment an episode is uploaded. A stored number can
  be corrected once and stay corrected; switching to derivation later would renumber history.
- **Surprising without context.** The repo already contains a carefully argued ADR saying that this
  exact shape of number should be derived and never stored. Doing the opposite one directory over
  needs a reason on record.
- **Real trade-off.** Derivation cannot drift and needs no validation. But a lesson number lives
  only on a sheet of paper that is reprinted, whereas an episode number is published on a podcast
  feed and is how a listener finds the episode. Inserting a bonus service in March must not
  renumber every episode since. Storage buys immutability at the cost of needing duplicate and gap
  warnings, and that is the right side of the trade for anything already public.

## Consequences

- **Duplicate and gap detection is per year**, and it belongs in the readiness panel rather than as
  a hard block — a genuine gap (a service that was not recorded) is legitimate and must be
  dismissible.
- **A service carries an "uploaded" flag** that decides whether it consumes a number at all.
  Sunday School defaults to off. Turning it on for one week takes the next number and leaves
  earlier numbers alone.
- **Marking a service as not meeting** does not renumber the weeks around it; it only frees the
  number it would have taken, at the moment the week is created.
