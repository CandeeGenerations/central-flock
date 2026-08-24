# Sunday School: Four-Month Workers' Notes

Adds a fourth Schedule type — **Workers' Notes** — a two-page printed document
covering one four-month **Term** of Sunday School. Page 1 carries the year's
theme song, chorus and verse plus a list of standing bullet paragraphs; page 2
carries the four months' songs/mottos/verses and the Betty Lukens lesson table.
Lesson numbers are derived from position rather than stored. Pages render into a
fixed Letter-at-96-DPI box so the type size is constant regardless of content
length. PDF export only, allowed while Draft. Editing is preview-driven: every
region on the page is clickable and navigates to its own edit sub-page.

Domain context:
[CONTEXT.md → Workers' Notes Edition / Yearly Theme / Term / Lesson Row / Story / Points to Emphasize / Motto / Notes Block](../CONTEXT.md).

Decisions:
[ADR 0020 — derived lesson numbering](../docs/adr/0020-derived-lesson-numbering.md),
[ADR 0021 — fixed page box print](../docs/adr/0021-fixed-page-box-print.md),
[ADR 0006 amendment — the fourth type](../docs/adr/0006-multi-type-schedule-envelope.md).

## Goals

- New `schedule_type='workers_notes'` envelope row, scoped by `(year, term)`
  where term is one of three fixed thirds (Jan-Apr, May-Aug, Sep-Dec).
  `scope_start`/`scope_end` derived from that pair for the envelope.
- Five new tables: `workers_notes_editions`, `workers_notes_themes`,
  `workers_notes_blocks`, `workers_notes_months`, `workers_notes_lesson_rows`,
  plus the `betty_lukens_stories` catalogue.
- Transcribe the Betty Lukens table of contents (182 stories) into a seed
  migration, with an in-app management pane for corrections.
- Yearly Theme stored once per year and shared by all three editions of that
  year, so an old edition re-exports with the theme it was printed with.
- Lesson numbers derived from `startingLessonNumber` + position; `special`,
  `combined` and `note` rows consume nothing (ADR 0020).
- Monthly Song is a `hymns` FK with a free-text title override, so the
  `(B-###)` reference cannot be wrong.
- One **Motto** field printed verbatim on both pages — no capitalisation
  transform.
- Two page components rendering into a fixed 816x1056 px box with a declared
  point scale; overflow warns rather than rescaling (ADR 0021).
- Interactive preview: the real page node scaled with `transform`, hit zones per
  ADR 0005, zoom stepper, each region navigating to its own edit sub-page.
- PDF export (two pages, one file), available in Draft. No JPG, no Send.
- Schedules Settings restructured into a left rail; Sunday School section
  carries horizontal tabs for Defaults, Yearly Themes, and Lessons.
- Sidebar entry "Sunday School" under the existing Schedules group.
- Seed the two completed 2026 editions from the paper originals, so Sep-Dec 2026
  can be created through the real flow as the acceptance test.

## Non-goals (deferred)

- **Logo on page 1.** Wanted, and explicitly deferred until the basics land.
  The page-1 header takes an optional logo slot so it is a small change later,
  not a re-layout.
- **JPG export and Send.** PDF only. Dropping Send is what makes draft export
  safe (ADR 0006 amendment); revisit together if either is wanted.
- **Auto-continuation onto a third page.** Overflow warns and clips.
- **Wrapping the lesson sequence past 182.** The editor warns and stops; the
  "start over vs skip last cycle" decision is the director's.
- **Migrating the other exports to the fixed-page-box method.** Wanted-if-liked,
  but out of scope here. See ADR 0021 consequences for what must change with it.
- **Auto-fetching verse text.** No scripture-text service exists in the app; the
  page-2 Verse is one free-text line.
- **Auto-deriving page-1 month themes from the Mottos.** One field, printed
  verbatim on both pages, typed in the casing the author wants.
- **Drag-and-drop reorder** anywhere. Up/down buttons, per ADR 0005.

---

## Phase 1 — Schema + migration

New file `server/db/schema-workers-notes.ts`, exported from `schema.ts`.

Extend `scheduleTypes` in `schema-schedules.ts` to
`['nursery', 'special_music', 'fair_booth', 'workers_notes']`.

```ts
export const workersNotesTerms = [1, 2, 3] as const // Jan-Apr, May-Aug, Sep-Dec

// Body table for the envelope. Holds the type's identity and the one stored
// lesson number (ADR 0020).
workers_notes_editions
  id, schedule_id FK -> schedules.id (cascade, unique)
  year integer notNull
  term integer notNull                 // 1 | 2 | 3
  starting_lesson_number integer notNull
  created_at, updated_at
  unique(year, term)

// One row per calendar year, shared by all three editions of that year.
workers_notes_themes
  id, year integer notNull unique
  song_title, song_credit
  chorus_lyrics text notNull default ''   // newline-separated
  tag_lyrics    text notNull default ''
  verse_text, verse_ref
  growth_plan   text notNull default ''
  created_at, updated_at

// Page-1 bullet list. Copies forward from the previous edition on create.
workers_notes_blocks
  id, edition_id FK (cascade)
  kind text enum('note','spacer','next_term_forms','growth_plan','month_themes')
  text text notNull default ''         // only meaningful for kind='note'
  bold integer bool notNull default 0
  sort_order integer notNull default 0

// Four rows per edition.
workers_notes_months
  id, edition_id FK (cascade)
  month integer notNull                // 1-12
  hymn_id FK -> hymns.id (set null), nullable
  song_title_override text             // nullable; falls back to hymn.title
  motto text notNull default ''        // printed verbatim on BOTH pages
  verse text notNull default ''
  unique(edition_id, month)

// One row per Sunday, plus floating note rows. NO lesson number column
// for regular rows -- see ADR 0020.
workers_notes_lesson_rows
  id, edition_id FK (cascade)
  kind text enum('regular','special','combined','note')
  date text                            // 'YYYY-MM-DD'; null for kind='note'
  special_lesson text notNull default '' // '142' or '151-153'; kind='special'
  text text notNull default ''         // Points (regular/special), label
                                       // (combined), italic line (note)
  sort_order integer notNull default 0 // anchors note rows after their neighbour
  index(edition_id, sort_order)

// The catalogue. `last_points` is where "remember what I wrote" lives, so no
// lesson number has to be stored on a row (ADR 0020).
betty_lukens_stories
  number integer primaryKey            // 1-182
  title text notNull
  page integer
  last_points text                     // nullable
  updated_at
```

Settings keys (via the existing `settings` KV table, read in
`server/routes/schedules.ts`):

- `schedules.workersNotes.churchName` — default `'Central Baptist Church'`
- `schedules.workersNotes.defaultBlocks` — JSON block list, used only when
  there is no previous edition to copy forward from

Run `pnpm db:generate`, review the SQL, then `pnpm db:migrate` per RUNBOOK
(service stopped first).

**Check:** `pnpm lint` clean; tables present in `pnpm db:studio`; existing
schedule types unaffected.

---

## Phase 2 — Betty Lukens catalogue seed

- Transcribe the four TOC columns into a data migration inserting all 182 rows
  (`number`, `title`, `page`).
- Idempotent: `insert ... on conflict(number) do nothing`, so re-running never
  clobbers a correction made in the UI.
- Build the Lessons management pane early (Phase 4) specifically so the
  verification pass can happen before any edition depends on it.

**Check:** row count is 182; spot-check the anchors that were verified against
the paper originals — 142 _Mary Shows Her Love for Jesus_, 143 _Jesus Rides
Into Jerusalem_, 151-153 _Crucifixion / In the Tomb / Resurrection_, 23/24 in
the Jacob sequence.

**Requires the user:** one read-through of the rendered list against the book.
This is the only manual verification in the plan and it happens once.

---

## Phase 3 — Term arithmetic + numbering (pure functions)

New `server/services/workers-notes.ts`, plus a mirrored client copy or a shared
module — these are needed on both sides (server seeds rows, client previews
renumbering live).

- `termMonths(term)` -> `[1,2,3,4] | [5,6,7,8] | [9,10,11,12]`
- `termLabel(year, term)` -> `'January, February, March, and April 2026'`
- `termRangeLabel(year, term)` -> `'January - April 2026'` (page-2 box header)
- `nextTerm(year, term)` -> `{year, term}` — rolls 3 -> next year's 1
- `sundaysInTerm(year, term)` -> `string[]` of `YYYY-MM-DD`
- `scopeBounds(year, term)` -> `{scopeStart, scopeEnd}` for the envelope
- `resolveLessonNumbers(rows, startingLessonNumber)` -> per-row resolved label:
  walk in `sort_order`; `regular` takes and increments the counter; every other
  kind passes through. Flags `overflow: true` once the counter passes 182.
- `nextStartingLessonNumber(previousEditionRows, previousStart)` -> last regular
  number + 1.

**Check:** feed the three known editions and assert the printed numbers come
back — Jan-Apr 2026 gives 9..19 then 142/143/151-153 then 20..22; May-Aug gives
23..40; Sep-Dec starting at 41 gives 41..57 across 17 Sundays. Also assert
February 2026's Sundays are 1/8/15/22 (the paper original's "February 14" is a
Saturday and is one of the errors this replaces).

---

## Phase 3b — Seed the two paper editions

`scripts/seed-workers-notes-2026.ts` seeds the 2026 Yearly Theme and the two
completed editions (Jan-Apr 2026 and May-Aug 2026) from the photographs, so that Sep-Dec 2026 can be created through
the real "New Edition" flow as the acceptance test. Idempotent, keyed on
`(year, term)` — re-running never duplicates or overwrites edits.

**2026 Yearly Theme** — "Rejoice In The Lord", Words & Music by Dr. Brad
Weniger; the four chorus lines and two tag lines; verse "Rejoice in the Lord
alway: and again I say, Rejoice." Philippians 4:4; the growth-plan sentence.

**Notes Blocks** — the two standing paragraphs as `note` blocks (visitation,
with `_baptize_` underlined; preaching), then the three placeholders
`next_term_forms`, `growth_plan` (with `_you_` underlined in the stored theme
text), `month_themes`.

**Months** — Song seeded as a `hymns` FK with the house wording as the title
override:

| Month | Hymn             | Override                |
| ----- | ---------------- | ----------------------- |
| Jan   | burgundy **488** | A New Name In Glory     |
| Feb   | silver 34        | If That Isn't Love      |
| Mar   | silver 36        | It's My Desire          |
| Apr   | burgundy 150     | He Lives                |
| May   | burgundy 23      | The Family of God       |
| Jun   | burgundy 272     | The Winning Side        |
| Jul   | burgundy 126     | My Country 'Tis of Thee |
| Aug   | burgundy 525     | A Soulwinner for Jesus  |

Note January: the paper original prints **B-448**, but _A New Name In Glory_ is
**B-488** in the hymnal (B-448 is "I'll Be True, Precious Jesus"). The seed uses
the correct hymn — reproducing the typo would defeat the reason the Song is an
FK at all. Mottos and verses seed verbatim from the sheets.

**Lesson rows** — Jan-Apr 2026 with `startingLessonNumber = 9`: regular rows
Jan 4 through Mar 15, then a `note` row ("For the next three weeks, we review
lessons on the Death, Burial, and Resurrection of Jesus"), `special` rows for
Mar 22 (142), Mar 29 (143) and Apr 5 (151-153), then a `note` row ("We return to
our regular sequence of lessons.") and regular rows Apr 12 through Apr 26.
May-Aug 2026 with `startingLessonNumber = 23`: eighteen regular rows,
May 3 through Aug 30. All Points to Emphasize seed verbatim, which also
back-fills `betty_lukens_stories.last_points` for stories 9-40, 142, 143 and
151-153.

One deliberate correction: the paper original's "February 14" was a Saturday.
The seed uses **February 15**, the actual Sunday.

**Check:** both editions render against the photographs with matching numbers,
grouping and note rows. Then the acceptance test — create Sep-Dec 2026 through
the UI and confirm it arrives with 17 regular rows numbered 41-57, the bullet
wording carried forward from May-Aug, "Forms for January through April 2027"
in the placeholder, and four empty month blocks awaiting songs and mottos.

---

## Phase 4 — Settings restructure + Sunday School panes

Refactor `src/pages/schedules-settings-page.tsx` (761 lines, one scroll of five
cards) into a left-rail layout at `/schedules/settings/:section`, bare path
redirecting to `general`.

Rail sections: General (both logos) · Nursery · Special Music · Fair Booth ·
Sunday School. The first four move their existing cards over unchanged.

Sunday School's pane carries horizontal tabs, each with its own route:

- `/schedules/settings/sunday-school/defaults` — church name, default Notes
  Blocks for a first edition (reuses the block row editor from Phase 8).
- `/schedules/settings/sunday-school/themes` — Yearly Themes list by year;
  create/edit/delete. Creating a year with no predecessor pre-fills from the
  most recent year's shape.
- `/schedules/settings/sunday-school/lessons` — searchable 182-row catalogue;
  edit title/page inline, add a row. This is the pane the Phase 2 verification
  pass uses.

Bare `/schedules/settings/sunday-school` redirects to `defaults`.

Per CLAUDE.md these are non-sidebar routes: add explicit entries for each
section to `src/lib/search/actions.ts`.

**Check:** every existing setting still round-trips; deep links land on the
right pane; back button walks sections.

---

## Phase 5 — Backend routes

New `server/routes/workers-notes.ts`, mounted at `/api/workers-notes`.

- `GET /` — list editions (join envelope + body), newest first
- `POST /` — create from `{year, term}`; see Phase 6 for what it seeds
- `GET /:id` — envelope + edition + blocks + months + lesson rows + resolved
  numbers + the year's theme
- `PATCH /:id` — status (draft/final), `startingLessonNumber`
- `DELETE /:id`
- `PUT /:id/blocks` — replace the block list wholesale (small list, ordered)
- `PUT /:id/months` — replace all four month rows
- `PUT /:id/lessons` — replace the row list wholesale; on save, write each
  `regular`/`special` row's Points into `betty_lukens_stories.last_points`
  for its resolved story number
- `GET|PUT /api/workers-notes/themes/:year`
- `GET|POST|PUT|DELETE /api/betty-lukens/stories`

Wholesale replace (rather than per-row CRUD) matches the small, ordered,
always-edited-as-a-set nature of these lists and keeps `sort_order` consistent.

**Check:** create → read → edit → delete round-trips; deleting an edition
cascades its body rows and leaves the theme and catalogue intact.

---

## Phase 6 — Create flow

"New Edition" dialog: Year + Term dropdowns. On create:

1. Ensure a `workers_notes_themes` row exists for the year; if not, create one
   pre-filled from the most recent year and route the user to the theme editor
   first, since nothing else on page 1 makes sense without it.
2. Insert the envelope (`schedule_type='workers_notes'`, `scope_kind='date_range'`,
   `scope_start`/`scope_end` from `scopeBounds`, `scope_label` from `termLabel`).
3. Copy Notes Blocks forward from the previous edition; fall back to
   `schedules.workersNotes.defaultBlocks` when there is none. `note` blocks copy
   verbatim; the three placeholder kinds carry no text and cannot go stale.
4. Insert four empty `workers_notes_months` rows.
5. Insert one `regular` lesson row per Sunday from `sundaysInTerm`.
6. `startingLessonNumber` = previous edition's last regular + 1; if there is no
   previous edition, prompt for it in the dialog.

**Check:** creating Sep-Dec 2026 after May-Aug 2026 produces 17 regular rows
numbered 41-57 and a bullet list matching May-Aug's wording.

---

## Phase 7 — Page render components

`src/components/workers-notes/workers-notes-page-1.tsx` and `-page-2.tsx`, both
rendering into a fixed `816 x 1056` px box with the ADR 0021 point scale. Pure
render — no handlers, no hover, no cursor styles (ADR 0005).

Page 1: church name / "FOUR-MONTH WORKERS' NOTES" / "Covering the months of" /
boxed `termLabel` / theme chorus block from the Yearly Theme / the Notes Blocks,
with `next_term_forms`, `growth_plan` and `month_themes` rendering from the
edition's own Term, theme, and Mottos. Header takes an optional `logo` slot,
unused for now.

Page 2: "Songs, Mottos, and Verses of the Month - {year}" box, four month
blocks (Song = `songTitleOverride ?? hymn.title` plus a derived `(B-###)`/
`(S-###)`), then the "Betty Lukens Lessons for {termRangeLabel}" box and the
table. Rows group by month with a gap between groups; `combined` rows print the
date with an italic label spanning the Lesson and Points columns; `note` rows
print the italic parenthetical across the full width.

Extract `renderWithUnderlines` out of `schedule-preview-frame.tsx` into
`src/lib/render-underlines.tsx` and import it from both places.

Overflow measurement: compare `scrollHeight` against the box and surface the
excess in mm to the editor.

**Check:** render each of the three paper editions from seeded data and compare
side by side against the photographs — line breaks, grouping gaps, and the
Easter note rows in the right places.

---

## Phase 8 — Detail view + edit sub-pages

`/schedules/sunday-school/:id` — toolbar (Edit / Finalize / Reopen / Export PDF;
**export enabled in Draft**), both pages previewed.

`WorkersNotesPreviewEditor` wraps the bare page components with absolutely
positioned transparent hit zones (ADR 0005) over: the theme block, each Notes
Block, each month block, and each lesson row. The whole thing is scaled with
`transform: scale()` to fit width, with a zoom stepper (Fit / 100% / 150%)
switching to scroll past fit. The export path mounts the bare components, never
the editor.

Sub-pages, each with a region-sized mini-preview at true print size:

- `…/:id/theme` — the year's theme, with a banner naming the other editions it
  affects
- `…/:id/blocks` — ordered block list; text, bold, underline markers, up/down,
  add, delete; placeholders shown as non-editable chips with their rendered text
- `…/:id/months` — all four months: hymn picker (searchable, book+number),
  title override, motto, verse
- `…/:id/lessons` — the table as an editable list: kind, story dropdown
  (searchable, "142 — Mary Shows Her Love for Jesus"), special lesson text,
  Points (prefilled `last_points ?? title`), combined label, delete, "add note
  row below". **Derived numbers update live as kinds change.** Warns on 182
  overflow and on page overflow.

**Check:** flipping Oct 11 and Oct 25 to `combined` visibly renumbers 45-57 to
45-56 before saving; no editor chrome appears in an exported PDF.

---

## Phase 9 — PDF export

New `src/lib/workers-notes-export.ts`, modelled on `exportFairBoothPdf` but
without the fit-to-page step: capture each page node at its native 816x1056 with
`pixelRatio: 3`, add each as a full-bleed image to a portrait Letter page, save
via `saveExportedFile` (ADR 0017 — never `pdf.save()`).

Filename: `workers-notes-{year}-{termRangeSlug}.pdf`.

**Check:** measure the printed sheet — 11pt body text is 11pt; add three lesson
rows and measure again to confirm it has not changed. Verify on the iOS
home-screen app that the two-step Save toast appears and works.

---

## Phase 10 — Wiring, palette, cleanup

- Sidebar: "Sunday School" entry in the Schedules group in
  `src/lib/nav-config.ts`.
- Command palette: sidebar routes come free from `navGroups`; add explicit
  entries in `src/lib/search/actions.ts` for the four edit sub-pages and the
  settings sections. Add a provider in `src/lib/search/providers/` for editions
  (registered in `providers/index.ts`), with `navPath` set so Recents de-dupes.
- `server/services/usage-entity-resolver.ts`: pretty label for the
  `sunday-school` section so Recents reads "Workers' Notes — Sep-Dec 2026"
  rather than "Section #4".
- `pnpm lint` + `pnpm prettier` (per standing preference), then deploy per
  RUNBOOK with the service stopped for the migration.

---

## Open questions / future work

- **Logo on page 1** — wanted; slot exists. Decide placement relative to the
  typeset church name.
- **Migrating Nursery / Special Music / Fair Booth to the fixed page box.** If
  the pt method is liked, this is the follow-up — and the `CAPTURE_WIDTH`
  comment in `fair-booth-exports.ts` must be updated or deleted with it.
- **182 wrap.** Currently warn-and-stop. Story 182 lands mid-2029 on the current pace.
- **A second Sunday School feature** (teacher roster, class attendance) would
  join the same nav area; that is why the area is named for the ministry and the
  entity is named for the document.
