# Fill America Households are durable, with Size stored per Campaign

A **Household** is a configured row reused by every **Campaign** — "Candees", "Harrisons",
"Neil Tellier" — and its headcount lives on the per-campaign **Roster Entry** as **Size**, not on
the Household. The spreadsheet instead baked the headcount into the row label ("Candees x 5"), and
this is the decision that reverses it.

Size has to be per campaign because families grow: the Sells were 3 in 2024 and 4 in 2025, the
Candees 4 then 5, the Riveras 4 then 5. A 2024 report must still say 3. Identity has to be durable
because **Unique Participants** (ADR-0032) sums Size across a roster, and because the all-time
leaderboard is worthless if the Candees appear twice.

## Considered options

- **Per-campaign free text, like the Roll's Scholar (ADR-0030).** Rejected: the Roll never needed
  continuity between quarters, and this does. Grouping a four-year leaderboard by label forks a
  family's history on every typo and every headcount change.
- **Size on the Household.** Rejected: renaming "Sells x 3" to "Sells x 4" would retroactively
  restate the 2024 campaign's participant count.
- **Link Households to People.** Rejected on the ministry's own terms — the roster is kept by
  family, half the entries have no single contact behind them ("Unknown", "Evie & Linda"), and a
  contact link would drift from the headcount every time someone is added to Contacts.

## Consequences

- Backfill must decide who is whom across 114 distinct spreadsheet labels, which resolve to 61
  Households. Stripping "x N" mechanically is nowhere near enough: it misses every genuine rename
  — `Kristina Bruss` → `Bruss`, `Ruth Hernandez` → `Hernandez`, `Dequan Harrison` + `Dane Harrison`
  → `Harrisons`, `Terry Sekhon` + `John Sekhon` → `Sekhons`, `Linda Ross` → `Ross`, `Grace Ortiz`
  → `Ortiz`, `Preacher` → `Wenigers` — the `Higgens`/`Higgins` and `Viciy`/`Viki`/`Vicky DeLacy`
  misspellings, and the whole of the oldest campaign. So the mapping is a reviewed, checked-in
  artifact edited by a human before the import runs, not an algorithm.
- The oldest campaign, `Jun 25 - Jul 9, 22`, is doubly irregular: it uses a different column layout
  (Name first, no Goal column) and it records **25 individuals** rather than families —
  `Pastor Brad Weniger`, `Max Weniger`, `Chase Weniger` and `Gwendolyn Weniger` where every later
  campaign has one `Wenigers` row. Rolling those into their households is what lets a family's
  history start in 2022 at all, and per-campaign **Size** is what makes it honest: the Wenigers'
  2022 Roster Entry is size 4.
- Those merges are baked into four years of data once the import runs. Splitting a household later
  means reassigning **Tract Reports** by hand.
- Past campaigns display each household's _current_ name, because the name is the durable identity.
  Only Size is snapshotted. A 2022 campaign therefore reads "Harrisons", a name that did not exist
  until 2024.
