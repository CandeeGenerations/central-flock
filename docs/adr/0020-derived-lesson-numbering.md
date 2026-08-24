# Betty Lukens lesson numbers are derived from position, not stored per row

## Context

Page 2 of a **Workers' Notes Edition** ([CONTEXT.md → Workers' Notes](../../CONTEXT.md)) prints a
table of one row per Sunday in the four-month **Term**, each carrying a Betty Lukens lesson number
and a **Points to Emphasize** line. The numbers run consecutively and continue across editions:
May–Aug 2026 ended at 40, and Sep–Dec 2026 starts at 41.

Two kinds of Sunday break the run, and the paper originals show both:

- **Seasonal specials.** In Jan–Apr 2026 the regular sequence reached 19 on March 15, then
  March 22 / March 29 / April 5 used lessons **142, 143, 151-153** for the Death, Burial and
  Resurrection, and April 12 resumed at **20**. The special weeks did not consume 20, 21, 22.
- **Combined services.** The director's note on the Sep–Dec draft reads "you may want to have
  combined in auditorium Oct 11 for Missions and Oct 25 for Anniversary — that would change
  lesson #'s by 2." A Sunday with no Sunday School consumes no number either, so every row after
  it slides down by two.

Both are the same rule seen twice: a row either consumes the next number in the running sequence,
or it does not. Doing that arithmetic by hand across seventeen rows is what the annotation is
asking someone to do, and it is exactly the step that goes wrong — the same document also prints
"February 14" for a Saturday and cites hymn B-448 for a song that is B-488.

## Decision

A **Lesson Row** stores its `kind` and never stores a regular lesson number. The edition stores a
single `startingLessonNumber`; regular numbers are computed at read time by walking the rows in
order and incrementing only on `regular`.

```
regular   -> consumes the next number in the sequence
special   -> prints an explicit number or range typed by the user ('151-153'); consumes nothing
combined  -> prints the date and a label, no lesson; consumes nothing
note      -> the italic parenthetical line, no date and no number; consumes nothing
```

Dated rows sort by date. A `note` row has no date and anchors to the row above it via `sortOrder`,
which is why "(We return to our regular sequence of lessons.)" stays under April 5 rather than
floating.

The next edition's `startingLessonNumber` is derived the same way — the previous edition's last
regular number plus one — so continuity across editions needs no bookkeeping either.

The catalogue holds 182 stories and roughly fifty are used a year, so the sequence wraps about
every three and a half years. **At 182 the editor warns and stops rather than wrapping to 1**, because the
real decision at that boundary ("start over" vs "skip what we did last cycle") is the director's,
not the app's.

## Why

- **Hard to reverse.** Once rows exist without numbers, going back to stored numbers means
  backfilling every historical row from a recomputation — possible, but it also means every
  editor affordance that currently renumbers implicitly has to grow an explicit renumber action.
- **Surprising without context.** A contributor opens the schema, finds a lesson table with no
  `lesson_number` column, and reasonably concludes it was an oversight. Adding one is a small,
  natural-looking change that quietly reintroduces the ability for stored numbers to disagree
  with the sequence — a disagreement that is invisible until it prints.
- **Real trade-off.** Storing an explicit number per row plus a "renumber from here" button was
  the alternative. It is more direct and lets a single number be nudged in isolation. It was
  rejected because the drift it permits has no detector: nothing in the app would notice that
  row 12 says 51 while its neighbours say 45 and 46, and the first reader to notice is a teacher
  holding the printed sheet. Under the derived model a one-off number is expressible as exactly
  what it is — a `special` row.

## Consequences

- **Editing a row's kind renumbers everything below it, live in the preview.** Flipping Oct 11 to
  `combined` visibly moves 45–57 to 45–56. This immediate feedback is most of the value of the
  decision and the editor must not defer it to save.
- **There is no way to renumber a single regular row.** That is intentional; use `special`.
- **`startingLessonNumber` is the one stored number and is load-bearing.** It is seeded from the
  prior edition on creation and prompted for when no prior edition exists. An edition with the
  wrong starting number is wrong in every row, so the editor surfaces it prominently rather than
  burying it in a settings pane.
- **Points to Emphasize is independent of numbering.** It is stored per row and prefilled from the
  last Points written for that story in any edition, falling back to the story title. Renumbering
  never rewrites Points — the two are edited separately and a renumber must not silently repoint
  a hand-written line at a different story.
