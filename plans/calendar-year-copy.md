# Calendar Print — Change History, Repeat Rules & Year Copy

Build next year's printed calendar from this year's, keeping each **Event** on the right weekday and
moving holidays correctly, with an undoable **History** of every change. Terms (**Calendar Page**,
**Event**, **Repeat Rule**, **Anchor**, **Span**, **Day Override**, **Year Copy**, **Change**,
**History**) are defined in [CONTEXT.md → Calendar Print](../CONTEXT.md). Key decisions are recorded
in [ADR 0040](../docs/adr/0040-repeat-rule-is-stored-on-the-event.md) and
[ADR 0041](../docs/adr/0041-calendar-print-history-is-one-linear-timeline.md).

Scope: Calendar Print only. The Apple Calendar viewer (read-only, EventKit) is untouched.

Status: implemented 2026-10-19 (migration 0054 applied to prod; boot backfill ran). Shipped as one feature.

## Decisions

### Repeat Rules & Year Copy

1. **Repeat Rule is stored on the Event**, not re-guessed each year (ADR 0040). It's guessed once,
   corrected by hand if needed, and copied forward with the Event.
2. **Rule kinds:** fixed date · Nth weekday of month · last weekday of month · offset from an
   Anchor · doesn't repeat. Anchor forms: ± N days · weekday before / after / nearest · weekday of
   the Anchor's week (weeks run Sun–Sat).
3. **Anchors are a built-in list** (below) plus any fixed month/day. Never another Event.
4. **Christmas / New Year's Candlelight** = the Wednesday of the holiday's week. No Sunday exception,
   by choice ("simplify, change later"). When that Wednesday falls in the following year (Dec 31 on
   a Sun, Mon or Tue: 2028, 2029, 2030), the copy does not write it and lists it in the post-copy
   summary to place by hand. The same applies to any rule whose result leaves the target year.
5. **Spans** (consecutive days, identical title) are detected at copy time and move as one block
   on the first day's rule; the other days keep their offsets. Multi-day Events stay one Event per
   day (no schema change). A Span may cross months, e.g. the PWC Fair, Jul 31 – Aug 8.
6. **No review screen.** The Event form gets a **Repeats** field: the rule in plain words plus a
   dropdown of alternatives generated from the date. Changing an Event's date re-guesses the rule
   and shows the result in the same dialog.
7. **Titles copy verbatim.** No ordinal counting; "63rd Church Anniversary" is fixed by hand.
8. **Year Copy is one whole-year action, and destructive** for the target year's Events and Day
   Overrides (deleted first, so a re-run gives a clean result). Page details are left alone where
   filled in. Colour, page-scoped schedule lines and hide-footer copy only into blank pages. Theme
   and verse never copy. Missing target pages are created. Events with "doesn't repeat" are skipped.
9. **Day Overrides carry**:
   - A day holding a copied Event takes the override its source day had — but only if the Event
     kept its weekday. (Veterans Day Wed → Thu would otherwise carry Wednesday's lines onto a
     Thursday; a weekday-changing Event's day is treated as an ordinary day instead.)
   - An ordinary Sun/Wed/Sat (no copied Event) takes the most common override for that weekday on
     ordinary days in the same source month. If that month had none, it gets no override, i.e. the
     "Normal Schedule" label, as in Jan–Apr 2026.
   - Two copied Events with different *real* overrides on one day: the post-copy summary lists the
     day. A real choice beats "no override" silently (Thursday Bible Study + Veterans Day).
   - One-off choices on ordinary days (No Kaya on Sep 6, Dec 20 and Dec 27, 2026) don't carry.
10. **First rules are guessed deterministically**: title match first, then the date fallback (see
    "Guesser" below). Nothing is guessed from closeness to Easter, and Claude is not used.

### Change History (ADR 0041)

11. **Covers Calendar Print only**: Events (including Repeat Rules), Day Overrides, page details,
    and the Normal Schedule lines (default and page-scoped).
12. **One History for all of Calendar Print**, like a document. It is not per year. Accepted cost:
    restoring to before a Year Copy also rolls back later edits to other years.
13. **Undo latest · redo last undo · Restore to here.** No reverting a single Change out of the
    middle. A Restore is itself a Change and can be undone.
14. **One save = one Change.** Every Calendar Print edit already saves through an explicit button
    (Event form, page details, schedule editor, day editor), so no keystroke grouping is needed.
    A Year Copy is one Change. Each Change has a plain-words description, e.g. "Moved Kids &
    Youth Extravaganza from Sat Jan 16 to Sat Jan 9", "Year Copy 2026 → 2027 (87 Events)".
15. **Stored on the server and kept forever**: the same on Mac and iPad, with no pruning.
16. **UI:** Undo / Redo buttons in the Calendar Print header, ⌘Z / ⇧⌘Z when focus is outside a text
    field, and a History sheet listing Changes newest-first (time + description) with Restore to
    here on each.
17. **The one-time Repeat Rule backfill is a Change**, so it can be undone like anything else.
    Every Calendar Print write goes through History; a write that bypasses it breaks undo.

## Anchor list

Computed for any year. Weekday rules are US-standard.

| Anchor | Rule | Synonyms matched in titles |
|---|---|---|
| Easter | Computus (Gregorian) | Easter, Resurrection Sunday |
| Palm Sunday | Easter − 7 | Palm Sunday |
| Good Friday | Easter − 2 | Good Friday |
| New Year's Day | Jan 1 | New Year's Day |
| MLK Day | 3rd Mon Jan | MLK, Martin Luther King |
| Presidents' Day | 3rd Mon Feb | Presidents |
| DST start | 2nd Sun Mar | Time Change (Mar), Daylight Saving (Mar) |
| National Day of Prayer | 1st Thu May | National Day of Prayer |
| Mother's Day | 2nd Sun May | Mother's Day |
| Armed Forces Day | 3rd Sat May | Armed Forces |
| Memorial Day | last Mon May | Memorial Day |
| Father's Day | 3rd Sun Jun | Father's Day |
| Independence Day | Jul 4 | Independence Day, July 4th, God & Country |
| Labor Day | 1st Mon Sep | Labor Day |
| Grandparents Day | Sun after Labor Day | Grandparents |
| Columbus Day | 2nd Mon Oct | Columbus, Indigenous Peoples |
| DST end | 1st Sun Nov | Time Change (Nov), Daylight Saving (Nov) |
| Veterans Day | Nov 11 | Veterans |
| Thanksgiving | 4th Thu Nov | Thanksgiving |
| Christmas Eve | Dec 24 | Christmas Eve |
| Christmas Day | Dec 25 | Christmas Day |
| New Year's Eve | Dec 31 | New Year's Eve, New Years |

## Guesser

Applied in order; the first match wins.

1. **Holiday by date:** an Event titled exactly "Holiday" on a date where an Anchor falls → that
   Anchor (Jan 19 → MLK Day, Feb 16 → Presidents' Day, Oct 12 → Columbus Day).
2. **"Candlelight" in the title** → the Wednesday of the week of the Anchor whose name is in the
   title, or else the nearest Thanksgiving / Christmas Day / New Year's Eve.
3. **"<Anchor> Sunday"** (Memorial Day Sunday, Veterans Sunday, Armed Forces Sunday, God & Country
   Sunday) → the Sunday nearest that Anchor.
4. **Title names an Anchor and the date is that Anchor** → the Anchor itself (Thanksgiving Day,
   Mother's Day, Palm Sunday, Christmas Day…). Only full Anchor names count, so "Christmas
   Musicale" and "Hispanic Christmas Dinner" don't match Christmas Day.
5. **Title names an Anchor but the date is not that Anchor** → the weekday before/after the
   Anchor that gives this date (Church Family Thanksgiving Dinner → Saturday before
   Thanksgiving).
6. **One-off keywords** (Funeral, Wedding, Shower, Sprinkle) → doesn't repeat.
7. **Fallback:** Nth weekday of month, or "last weekday" when the date is in the month's 5th
   week (day ≥ 29).
8. **Spans:** only the first day is guessed. The other days are recognised as part of the Span
   when the copy runs.

## Expected results for the 2026 data (test fixture)

Computed with the rules above. "Fix" rows are guesses to correct by hand before the first copy.

| 2026 Event | Guessed rule | 2026 | 2027 |
|---|---|---|---|
| Fellowship House Bible Study (Jan 8; each 2nd/4th Thu likewise) | 2nd Thu of Jan | Thu Jan 8 | Thu Jan 14 |
| Holiday (Jan 19) | MLK Day | Mon Jan 19 | Mon Jan 18 |
| Holiday (Feb 16) | Presidents' Day | Mon Feb 16 | Mon Feb 15 |
| AGM National Conference (Span ×3) | 1st Mon of Feb | Mon Feb 2 | Mon Feb 1 – Wed Feb 3 |
| Time Change Sunday | DST start | Sun Mar 8 | Sun Mar 14 |
| Palm Sunday | Easter − 7 | Sun Mar 29 | Sun Mar 21 |
| The Lord's Supper ⚠️ **fix** → Easter − 5 | guessed last Tue of Mar | Tue Mar 31 | Mar 30 → **Tue Mar 23** |
| Resurrection Sunday | Easter | Sun Apr 5 | Sun Mar 28 |
| National Day of Prayer | 1st Thu May | Thu May 7 | Thu May 6 |
| Mother's Day | 2nd Sun May | Sun May 10 | Sun May 9 |
| Armed Forces Sunday | Sunday nearest Armed Forces Day | Sun May 17 | Sun May 16 |
| Memorial Day Sunday | Sunday nearest Memorial Day | Sun May 24 | Sun May 30 |
| Memorial Day | last Mon of May | Mon May 25 | Mon May 31 |
| Father's Day | 3rd Sun Jun | Sun Jun 21 | Sun Jun 20 |
| Fran Fraley's Funeral | doesn't repeat (keyword) | Sat Jun 13 | — |
| Baby Sprinkle for Carissa Candee | doesn't repeat (keyword) | Tue Jun 9 | — |
| Church Picnic ⚠️ **fix** → Saturday nearest Jul 4 | guessed 1st Sat of Jul | Sat Jul 4 | Sat Jul 3 (same in 2027; differs in later years) |
| God & Country Sunday | Sunday nearest Jul 4 | Sun Jul 5 | Sun Jul 4 |
| PWC Fair (Span ×9) | last Fri of Jul | Fri Jul 31 | Fri Jul 30 – Sat Aug 7 |
| Labor Day | 1st Mon Sep | Mon Sep 7 | Mon Sep 6 |
| Grandparents Sunday | Grandparents Day | Sun Sep 13 | Sun Sep 12 |
| Holiday (Oct 12) | Columbus Day | Mon Oct 12 | Mon Oct 11 |
| Visiting Missionary ⚠️ **fix** → doesn't repeat | guessed 2nd Sun of Oct | Sun Oct 11 | — |
| 63rd Church Anniversary (title fixed by hand) | 4th Sun of Oct | Sun Oct 25 | Sun Oct 24 |
| Daylight Saving Sunday | DST end | Sun Nov 1 | Sun Nov 7 |
| Veterans Sunday ⚠️ check: maybe "Sunday before Veterans Day" | Sunday nearest Veterans Day | Sun Nov 8 | Sun Nov 14 |
| Veterans Day | Nov 11 | Wed Nov 11 | Thu Nov 11 |
| Church Family Thanksgiving Dinner | Saturday before Thanksgiving | Sat Nov 21 | Sat Nov 20 |
| Praise & Testimony Service ⚠️ **fix** → Sunday before Thanksgiving | guessed 4th Sun of Nov | Sun Nov 22 | Nov 28 (after Thanksgiving) → **Sun Nov 21** |
| All Church Candlelight Service | Wed of Thanksgiving's week | Wed Nov 25 | Wed Nov 24 |
| Thanksgiving Day | Thanksgiving | Thu Nov 26 | Thu Nov 25 |
| Christmas Musicale | 2nd Sun of Dec | Sun Dec 13 | Sun Dec 12 |
| Christmas Candlelight Service | Wed of Dec 25's week | Wed Dec 23 | Wed Dec 22 |
| Christmas Day | Dec 25 | Fri Dec 25 | Sat Dec 25 |
| New Years Candlelight Service | Wed of Dec 31's week | Wed Dec 30 | Wed Dec 29 |

The other Events (Bible Institute, Youth Saturation, Loyal Ladies, Faithful Men's Meeting, Kids &
Youth Extravaganza, etc.) fall back to Nth weekday, which keeps them in the same week of the month.

Spill-over check for the New Year's Candlelight rule: 2028 → Wed Jan 3 2029, 2029 → Wed Jan 2 2030,
2030 → Wed Jan 1 2031. Each lands in the post-copy summary instead of being written.

## Delivery order

History lands before the destructive copy, so the Year Copy is just one more undoable Change.

1. **Change History**: decisions 11–17. Route every existing Calendar Print write (events, page
   details, default + page schedule lines, day overrides) through it.
2. **Repeat Rules**: rule storage on Events, the Anchor list and date engine, the guesser, the
   one-time backfill (as a Change), and the Repeats field in the Event form. Then the user tidies
   the 2026 rules (the "fix" rows above).
3. **Year Copy (Events)**: whole-year destructive copy with Span handling, a confirm dialog that
   states what will be deleted and copied, and the post-copy summary (spill-overs, skipped
   Events).
4. **Year Copy (Day Overrides)**: the carry rules from decision 9, and conflicts added to the
   post-copy summary.

## Implementation

- `server/lib/repeat-rules.ts`: pure engine (Anchors, evaluate, describe, guess, alternatives,
  Spans, `planYearCopy`, `planDayOverrides`), re-exported to the client by `src/lib/repeat-rules.ts`.
  Tests: `server/lib/repeat-rules.test.ts` (the fixture table above).
- `server/services/calendar-print-history.ts`: `recordChange` wraps every write; each Change
  stores a gzipped full snapshot (~6–9 KB). Undo / redo / Restore put a snapshot back.
- `server/services/calendar-print-year-copy.ts`: preview, run, and the boot backfill
  (`server/index.ts`).
- Schedule-line ids in carried Day Overrides are remapped by line content, because a page with
  its own schedule override has its own line rows.
- "Apply to all Sundays in May" is now one request (`/day-overrides/apply`), so it's one Change.
- Moving an Event to another month's date now moves it to that month's page (it used to stay
  on the old page and disappear from view).

## Critical files

- `server/db/schema-calendar-print.ts`: `calendar_print_events` gets the Repeat Rule; new History
  storage. Generate a migration (`pnpm db:generate`).
- `server/routes/calendar-print.ts`: all writes go through History; new endpoints for undo /
  redo / restore / list History, Year Copy, and rule alternatives for a date.
- `server/lib/`: new date engine (Anchors, rule evaluation, guesser), pure and unit-tested.
- `src/pages/calendar-print-page.tsx`: header Undo/Redo, History sheet, ⌘Z, "Copy year from
  <year − 1>…" action with the confirm dialog and post-copy summary.
- `src/components/calendar-print/day-editor-dialog.tsx`: Repeats field in the Event form.
- `src/lib/api.ts`: typed helpers.
- Command palette: add actions for Year Copy and History if they become routes or commands
  (see CLAUDE.md → Command palette).

## Verification

1. `pnpm lint`, `pnpm test` and `pnpm build` are clean.
2. Unit tests for the date engine: Easter 2026–2035; every Anchor for 2026–2030; each rule kind;
   the "Expected results" table above as a fixture, including Span expansion and the spill-over
   years.
3. History: make a few edits → Undo / Redo → Restore to here → undo the Restore; reload, and check
   History is the same on a second device (iPad).
4. Backfill: run on a copy of the production DB (no dev DB exists; see RUNBOOK.md) and check the
   guessed rules against the table.
5. Year Copy 2026 → 2027 on a DB copy: the dates match the table, the Fair is 9 days in a row,
   themes and verses typed into Jan/Feb 2027 survive, re-running gives the same result, and one
   Restore to here gets back the pre-copy state.
6. Day Overrides: Youth Saturation 2027 shows the Saturday times; Mother's Day has the short list
   plus No Kaya; Aug 2027 Sundays have no KAYA or Choir; Jan 2027 Sundays show the "Normal
   Schedule" label.

## Follow-ups (separate from this feature)

- "Repeat through: [date]" in the Event form to create a multi-day run without Duplicate ×N.
- If History works well, consider the same pattern for other printed schedules, one feature at
  a time.
