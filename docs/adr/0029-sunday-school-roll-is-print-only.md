# The Sunday School Roll is print-only and stores no attendance

The app already has a full attendance-capture stack — **Recorder** identities with per-recorder
tokens (ADR 0015), **Tally** vs **Correction** writes (ADR 0027), live polling sync (ADR 0028) and
a public entry app. A reader will reasonably ask why the **Sunday School Roll** duplicates none of
it and instead produces a blank sheet of paper that nothing reads back. The answer is that the two
are different acts: an usher counts a room and reports one number, while a Sunday School teacher
marks _which named child_ was present, mid-class, with no device in hand. The Roll's entire value
is that it is a blank form, so it stores rosters and labels and nothing else.

## Considered options

- **Point Sunday School teachers at the Recorder app.** Rejected: it captures a room total, not a
  per-child record, and the teacher is teaching three-year-olds — there is no moment to hold a
  phone. The paper grid is the workflow, not a workaround for one.
- **Build the grid as an editable checkbox matrix and treat printing as one of its outputs.**
  Rejected: it needs stored date rows and stable scholar ids, which forces both the derived-dates
  and newline-roster decisions the other way, and it reopens **Attendance** as a word meaning two
  things. Nobody has asked to query "has this child missed three weeks?"; when someone does, that
  is a new feature that reads Roll rosters, not a column added here.

## Consequences

- The whole feature is two tables: `sunday_school_rolls` (the envelope body) and
  `sunday_school_roll_sheets` (`label`, newline-separated `scholars`, `sort_order`). No marks, no
  cells, no per-child rows, and no date rows — columns are derived from (year, **Quarter**).
- **Attendance** keeps exactly one meaning in this codebase: the usher-entered in-person count.
  The printed sheet still says "Attendance" in its title because that is what the teachers read;
  the printed word and the code word are allowed to differ, and deliberately do.
- Because a **Scholar** has no id, per-child history is not merely unbuilt — it is unavailable
  without migrating every past Roll. That is the accepted price of the roster being one text field.
