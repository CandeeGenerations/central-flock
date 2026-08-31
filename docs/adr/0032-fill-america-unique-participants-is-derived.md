# Fill America Unique Participants is derived from the roster, never stored

The source spreadsheet has **Unique Participants** typed by hand for each of a **Campaign**'s three
weeks. We do not store it. It is computed from the roster: a **Campaign**'s figure is the sum of
**Size** over every **Roster Entry** with a **Tract Report** greater than zero in any week, and a
**Campaign Week**'s figure is the same sum restricted to households appearing for the first time
that campaign — so the weekly figures add to the campaign figure without counting a family twice
for going out three times.

We only know the rule because we reverse-engineered it: derived-per-week reproduces the typed
number in 29 of 51 weeks, and derived-per-campaign matches in 10 of 17 campaigns with every miss
±1 or ±2. Three of the seven "mismatched" campaigns (`Mar 28-Apr 11, 26`, `Jun 22-Jul 6, 24`,
`Mar 23-Apr 6, 24`) are simply ones where the whole campaign's total was typed on a single week's
row, and their campaign totals match exactly.

## Considered options

- **Keep typing it.** Rejected: it is the manual step the migration exists to remove, and the
  roster already contains the answer.
- **Derive but allow a per-week override, seeded from the sheet so all 18 campaigns keep their
  published numbers.** Genuinely tempting, and it would preserve the 527 all-time figure exactly.
  Rejected because an override is a second number free to drift from the roster with no rule for
  when to clear it, and the drift it preserves is hand-entry noise, not knowledge.

## Consequences

- Seven historical campaign figures move by ±1 or ±2 (`Aug 30-Sep 13 25` 43→42, `Dec 7-21 24`
  33→34, `Aug 31-Sep 14 24` 31→32, `Dec 9-23 23` 18→19, `Sep 2-16 23` 30→31, `Dec 10-24 22` 22→20,
  `Sep 3-17 22` 47→46) and the all-time total moves 527→525. Anyone comparing the app against an
  archived copy of the spreadsheet will find these and should find this ADR.
- A **Household** that went out but reported no tracts is invisible to the count. The roster is the
  only evidence there is, and **Door Hangers** are recorded per **Campaign Week** rather than per
  household, so there is no second signal to fall back on.
- The three weekly figures in the affected campaigns will now spread across the weeks instead of
  sitting on one row. The campaign totals are unchanged, but a week-by-week comparison against the
  old sheet will not line up.
