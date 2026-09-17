# Recents counts days worked, not clicks, and forgets anything older than three weeks

ADR 0012 ranks the "Recent" entity deep links (the palette group and Home's
**Jump back in** chips) by frecency: every logged visit contributes
`0.5 ^ (ageDays / 30)`, summed per entity. Two behaviours of that sum turned out
to be wrong in practice, and both have the same cause — **the number of
navigations an entity attracts is a property of its editor, not of how much the
entity matters.**

Editing the 2026 Fair Booth schedule means moving between a grid page and ten
day pages, hundreds of times over the fortnight the fair runs: 329 visits to
`/schedules/fair-booth/22` and its sub-routes in three weeks of August. A
devotion is opened once, read, and closed. Measured against real data on
2026-09-13, that one schedule scored **166.9** — nearly three times the next
entity and more than twenty times any devotion — with its most recent visit 24
days old. It sat at the head of Jump back in for a month after the fair ended,
which is what prompted this change ("I haven't been going to the Fair Booth
schedule recently, yet it's still up there").

## Decision

Two changes, both in the `/api/usage/recents` rollup only. `/api/usage/sections`
(which reorders the palette's Navigation group) keeps summing raw visits — there,
total traffic is exactly the right signal for "which page do I live on".

1. **One visit per entity per calendar day counts toward the score.** The score
   answers "how many days did I work on this", not "how many times did I click".
   Fair Booth 22 goes from 166.9 to 9.2; the leaderboard becomes this month's
   devotions, the live Fill America campaign, and the special music schedule
   being filled in — which is what the last two weeks were actually spent on.
2. **An entity whose most recent visit is older than `RECENTS_MAX_AGE_DAYS` (21)
   is dropped outright**, whatever it scored. A 30-day half-life is a ranking
   rule, not a forgetting rule: it never reaches zero, so a big enough past keeps
   a finished job on the list indefinitely.

Which path a chip links to is still decided by raw traffic — every visit votes,
including the ones that did not add to the score — so the "link to the entity's
own page, not the busiest sub-route" rule from ADR 0012 is unchanged.

## Why not the alternatives

- **Shorten the half-life.** Cheaper, but it only slows the problem down: a burst
  of 329 visits outranks a handful whatever the decay constant, and shortening it
  also makes the ranking twitchier for everything that behaves normally.
- **Cap each entity's score.** A cap is an arbitrary ceiling that discards the
  difference between two days of work and two weeks of it. Per-day dedupe keeps
  that difference and removes only the part that measures the editor's shape.
- **Log fewer visits (don't record sub-routes).** Rejected: `route_visits` is an
  append-only log meant to be reusable (ADR 0012), and the sub-route visits are
  real navigation. Granularity is discarded at read time, not at write time.

## Consequences

- **A seasonal job ages off the list on its own** three weeks after the last
  visit, and comes back the moment it is opened again. Nothing to dismiss.
- **Jump back in can be short or empty** after a quiet spell — correct, and the
  section already renders nothing when there is nothing recent.
- **The cutoff is a product judgement, not a derived number.** Three weeks is
  long enough to cover a holiday and short enough that "recently" stays honest;
  it lives in one constant in `server/routes/usage.ts`.
