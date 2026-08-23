# Music Schedule

Adds a fifth Schedule type — **Music Schedule** — covering one week of services
(the Sunday plus the Wednesday that follows it) and printing two documents from
one body of data: the **Sound Booth Sheet** for the sound team (one page, four
services condensed) and the **Music Sheet** for the musicians and song leader
(Sunday and Midweek, the full run of service). Editing is preview-driven, the
way the Workers' Notes are: every service block on the page is clickable and
opens that service's line editor. Pages render into the same fixed
Letter-at-96-DPI box, but unlike the Workers' Notes they flow onto extra pages
when a week is heavy.

Domain context:
[CONTEXT.md → Music Schedule / Service Order / Order Line / Line Role / Music Sheet / Sound Booth Sheet / Episode Number](../CONTEXT.md).

Decisions:
[ADR 0022 — Sound Booth Sheet as a projection](../docs/adr/0022-sound-booth-sheet-projection.md),
[ADR 0023 — service-boundary pagination](../docs/adr/0023-service-boundary-pagination.md),
[ADR 0024 — episode numbers stored and yearly](../docs/adr/0024-episode-numbers-stored-and-yearly.md),
[ADR 0006 amendment — the fifth type](../docs/adr/0006-multi-type-schedule-envelope.md),
[ADR 0021 — fixed page box print](../docs/adr/0021-fixed-page-box-print.md) (amended by 0023),
[ADR 0005 — hit zones in a wrapper](../docs/adr/0005-interactive-calendar-print-editor.md).

## Goals

- New `schedule_type='music_schedule'` envelope row, scoped `date_range` from the
  week's Sunday to its Wednesday.
- Four tables: `music_schedules`, `music_schedule_services`,
  `music_schedule_lines`, `music_schedule_booth_lines`.
- Services seed from the app's active `service_times` — the same four rows
  Attendance uses — carrying `service_time_id`, a derived date, and per-week
  overrides. Any service can be marked as not meeting; one-off services (a
  revival night) can be added without a Service Time.
- **Order Lines are rows of a two-column table.** Split rows fill both cells
  (`B #269 | I Will Sing of the Mercies`, `Motto: | Rejoice That God Allows…`);
  merged rows span the width, left-aligned on a Music Sheet and centred on the
  Sound Booth Sheet. Both the split/merge choice and the left cell's text
  default from the **Line Role** and are overridable.
- Songs are a `hymns` FK, so `B #269` / `S #59` cannot be wrong. One stored
  hymnal title prints verbatim on both sheets — no quotes, no case transform.
  A song in neither hymnal is free text with no reference.
- The Sound Booth Sheet is derived per ADR 0022: linked songs, role-driven
  inclusion and absence-wording, condensed prose lines drafted then hand-edited,
  with a stale flag when the underlying roles change.
- Per-line **B / I / Highlight** toggles plus `_underscore_` inline underlining,
  reusing `src/lib/render-underlines.tsx`.
- **Episode Numbers** stored, auto-assigned in date order, reset each calendar
  year, scoped by the service's own date (ADR 0024).
- Multi-page flow breaking only between service blocks, plus an explicit
  page-break line (ADR 0023).
- Two PDF exports: **Sound Booth** (1 page) and **Musicians** (2 pages). No
  all-in-one — the two go to different people in different quantities.
- A readiness panel of non-blocking warnings.
- Sidebar entry "Music Schedule" under Schedules, beside Special Music.
- Seed the 16 August 2026 week from the paper originals, and build 23 August
  through the real flow as the acceptance test — the 23 August Sound Booth sheet
  exists on paper, so the test has a known-correct answer.

## Non-goals (deferred)

- **Send by text.** Export only, like the Workers' Notes. Dropping Send is what
  keeps draft export safe (ADR 0006 amendment).
- **An all-in-one three-page PDF.** Explicitly rejected — the sheets are printed
  in different quantities and a combined file wastes paper.
- **Special Music integration.** The `special` role prints the plain word
  "Special", exactly as the originals do. No link to the `special_music` table,
  in the page or in the editor.
- **Pulling Title/Text from the `sermons` table.** Sermons are created from a
  transcript after the fact; these are planned beforehand. Two separate fields
  for now.
- **A logo header.** The originals have none.
- **Breaking a page mid-service.** ADR 0023 — a page turn inside a song set is
  the failure being designed out.
- **Per-week footer overrides.** The Ephesians 5:19 quote and music-note graphic
  live in Schedule Settings and nowhere else.
- **Drag-and-drop reorder.** Up/down buttons, per ADR 0005.
- **Highlight colours beyond yellow.** One highlight, matching the originals.

---

## Phase 1 — Schema + migration

New file `server/db/schema-music-schedule.ts`, exported from `schema.ts`.

Extend `scheduleTypes` in `schema-schedules.ts` to
`['nursery', 'special_music', 'fair_booth', 'workers_notes', 'music_schedule']`.

```ts
export const lineRoles = [
  'plain', 'opening', 'choir', 'congregational', 'motto', 'verse', 'theme',
  'pastor_selection', 'message', 'invitation', 'special', 'offering',
] as const

export const lineKinds = ['song', 'prose', 'page_break'] as const
export const boothModes = ['auto', 'include', 'exclude'] as const
export const boothSlots = ['motto_verse_theme', 'prayer_announcements'] as const

// Body table for the envelope. One row per week, keyed on the Sunday.
music_schedules
  id, schedule_id FK -> schedules.id (cascade, unique)
  week_start text notNull unique        // the Sunday, 'YYYY-MM-DD'
  created_at, updated_at

// One per service that week. Seeded from active service_times; one-off
// services carry service_time_id = null and their own name.
music_schedule_services
  id, music_schedule_id FK (cascade)
  service_time_id FK -> service_times.id (set null), nullable
  name text notNull default ''          // one-off label; else the Service Time's
  music_heading text notNull default '' // per-week override; blank = settings
  booth_heading text notNull default ''
  date text notNull                     // derived: week_start + day_of_week
  time text                             // 'HH:MM' override; null = Service Time's
  meeting integer bool notNull default 1
  uploaded integer bool notNull default 1   // consumes an Episode Number
  episode_number integer                    // null when not uploaded (ADR 0024)
  title text notNull default ''             // sermon title, free text
  title_note text notNull default ''        // '(Pastor Candee)'; blank = not printed
  title_highlight integer bool notNull default 0
  scripture text notNull default ''         // the 'Text:' line
  scripture_note text notNull default ''
  scripture_highlight integer bool notNull default 0
  sort_order integer notNull default 0
  index(music_schedule_id, sort_order)

// One printed row of a Service Order. See CONTEXT.md → Order Line.
music_schedule_lines
  id, service_id FK (cascade)
  kind text enum(lineKinds) notNull
  role text enum(lineRoles) notNull default 'plain'
  hymn_id FK -> hymns.id (set null), nullable
  free_song_title text                  // song in neither hymnal
  suffix text notNull default ''        // '(x2) (Invitation)' — prints unbolded
  left_text text notNull default ''     // blank = derive from role/song/time
  text text notNull default ''          // right cell, or the merged content
  merged integer bool                   // null = default from role
  align text enum('left','center')      // merged rows only; null = default
  bold integer bool                     // null = default (song yes, prose no)
  italic integer bool notNull default 0
  highlight integer bool notNull default 0
  sticky integer bool notNull default 0 // keep the song on copy-forward
  booth text enum(boothModes) notNull default 'auto'
  booth_label text notNull default ''   // 'Opening Song:' override
  booth_note text notNull default ''    // '(Choir & Cong.)'; blank = not printed
  sort_order integer notNull default 0
  index(service_id, sort_order)

// The condensed prose lines the Sound Booth Sheet prints (ADR 0022). Drafted
// from the roles present, then stored and hand-edited. `drafted_from` holds the
// draft that was current when saved: when a fresh draft differs from it, the
// line is stale.
music_schedule_booth_lines
  id, service_id FK (cascade)
  slot text enum(boothSlots) notNull
  text text notNull default ''
  highlight integer bool notNull default 0
  drafted_from text notNull default ''
  sort_order integer notNull default 0
  unique(service_id, slot)
```

Settings keys (existing `settings` KV, read in `server/routes/schedules.ts`
beside `schedules.nursery.*` and `schedules.specialMusic.*`):

- `schedules.musicSchedule.titlePrefix`
- `schedules.musicSchedule.serviceHeadings` — JSON `{[serviceTimeId]: {music, booth}}`
- `schedules.musicSchedule.defaultOrders` — JSON `{[serviceTimeId]: LineTemplate[]}`,
  used only when there is no previous week to copy forward from
- `schedules.musicSchedule.footerBlocks` — JSON, same shape as the nursery and
  special-music footers, plus an uploaded graphic path
- `schedules.musicSchedule.footerPlacement` — `'last' | 'every' | 'never'`, default `'last'`

Run `pnpm db:generate`, review the SQL, then `pnpm db:migrate` per RUNBOOK
(service stopped first).

**Check:** `pnpm lint` clean; tables present in `pnpm db:studio`; the four
existing schedule types unaffected.

---

## Phase 2 — Pure functions

New `server/services/music-schedule.ts` with a mirrored client module
`src/lib/music-schedule-core.ts` — both sides need these (the server seeds and
validates, the client previews live).

- `weekStartFor(date)` → the Sunday of that date's week
- `serviceDateFor(weekStart, dayOfWeek)` → `'YYYY-MM-DD'`; Wednesday resolves to
  the Wednesday **after** the Sunday
- `weekBounds(weekStart)` → `{scopeStart, scopeEnd}` for the envelope
- `formatServiceTime('09:45')` → `'9:45 am'`; `'11:00'` → `'11 am'` — the `:00`
  drops, as on the originals; `'18:30'` → `'6:30 pm'`
- `musicHeading(date, heading)` → `'AUGUST 16, MORNING SERVICE'`
- `boothHeading(date)` → `'AUGUST 16, 2026'`
- `hymnRef(hymn)` → `'B #269'` | `'S #59'`
- `lineDefaults(role)` → `{merged, align, leftText, bold, booth}` — the table in
  Phase 3 below; every field overridable per line
- `resolveLine(line, service, index)` → the two rendered cells, applying
  overrides over defaults, the hymn reference, and the suffix as a separate
  unbolded run
- `assignEpisodeNumbers(services, highestUsedInYear)` → walks meeting +
  uploaded services in date order, scoping by each service's own date year
  (ADR 0024)
- `draftBoothLine(slot, rolesPresent)` → the drafted sentence, including the
  absence wording (`'…, NO Pastor's Selection TODAY'`)
- `resolveBoothRows(service, lines, boothLines)` → the ordered rows the Sound
  Booth Sheet prints, with `stale: boolean` per drafted line
- `weekWarnings(week)` → the readiness list (Phase 8)

**Check:** unit-level assertions against the 16 August seed — `formatServiceTime`
returns all four printed times; `assignEpisodeNumbers` returns 97/98/99 with
Sunday School skipped; `draftBoothLine('prayer_announcements', [])` produces the
highlighted NO-Pastor's-Selection wording; a New Year's week (Sunday 31 Dec 2028)
numbers its Sunday services from 2028 and its Wednesday from 2029 at #1.

---

## Phase 3 — Role defaults

The table that makes a normal week require almost no per-line decisions. Every
value is a default; every one is overridable on the line.

| Role               | Layout       | Left cell | Bold | Sound Booth | Booth label                              |
| ------------------ | ------------ | --------- | ---- | ----------- | ---------------------------------------- |
| `plain`            | merged, left | —         | no   | no          | —                                        |
| `opening`          | split        | hymn ref  | yes  | yes         | `Opening Song:`                          |
| `choir`            | split        | `Choir:`  | yes  | yes         | `Opening Song:` + note `(Choir & Cong.)` |
| `congregational`   | split        | hymn ref  | yes  | yes         | `Congregational:`                        |
| `motto`            | split        | `Motto:`  | yes  | merged line | — (folds into `motto_verse_theme`)       |
| `verse`            | split        | `Verse:`  | yes  | merged line | —                                        |
| `theme`            | split        | `Theme:`  | yes  | merged line | —                                        |
| `pastor_selection` | merged, left | —         | yes  | merged line | — (folds into `prayer_announcements`)    |
| `message`          | merged, left | —         | no   | no          | —                                        |
| `invitation`       | split        | hymn ref  | yes  | no          | —                                        |
| `special`          | merged, left | —         | no   | no          | —                                        |
| `offering`         | merged, left | —         | no   | no          | —                                        |

Absence wording, per ADR 0022:

- no `choir` line in a service → the `opening`/`congregational` line that opens
  it prints `Cong. Opener:` with note `(No Choir)`, highlighted
- no `pastor_selection` line → the `prayer_announcements` booth line drafts as
  `Prayer, Announcements, NO Pastor's Selection TODAY`, highlighted

The first line of a service defaults its left cell to the service's formatted
time, whatever its role.

**Check:** seeding the 16 August week with roles only — no left-cell text, no
booth toggles, no labels — reproduces both paper sheets apart from the two
deliberate hand-edits (the `NO CHOIR` left cell and the trimmed
`Motto, Verse, Theme Song`).

---

## Phase 4 — Pagination (ADR 0023)

New `src/components/music-schedule/use-pagination.ts`.

- Render every service block into an offscreen container at `PAGE_WIDTH_PX`,
  measure each block's `offsetHeight`, then pack blocks onto pages against
  `CONTENT_HEIGHT_PX`, allowing for the page header on page 1 and the footer on
  the last Musicians page.
- A `page_break` line ends the current page.
- A block taller than a page gets a page to itself and reports the measured
  overflow, which is ADR 0021's warn-and-clip behaviour retained as the floor.
- Returns `{pages: Block[][], overflow: {blockId, mm}[]}`, consumed by the
  preview, the export loop and the readiness panel — one result, three readers.

Measurement runs against the real page node, per ADR 0021's rule that the
preview must be the print node scaled, never a fluid re-render.

**Check:** the seeded week gives one Sunday page and one Midweek page; adding
two revival services pushes Wednesday to a second Midweek page whole, not split;
a service with 60 lines reports overflow rather than silently clipping.

---

## Phase 5 — Backend routes

New `server/routes/music-schedules.ts`, mounted at `/api/music-schedules`.

- `GET /` — list weeks, `?year=`, newest first, with episode range and service count
- `POST /` — create from `{weekStart}`; seeds per Phase 6
- `GET /:id` — envelope + week + services + lines + booth lines + resolved booth
  rows + warnings
- `PATCH /:id` — status (draft/final)
- `DELETE /:id`
- `POST /:id/services` — add a one-off service
- `PATCH /:id/services/:serviceId` — headings, time, meeting, uploaded,
  episode number, title/text and their notes and highlights
- `DELETE /:id/services/:serviceId`
- `PUT /:id/services/:serviceId/lines` — replace the line list wholesale
- `PUT /:id/services/:serviceId/booth-lines` — replace the condensed lines
- `POST /:id/services/:serviceId/booth-lines/:slot/rewrite` — redraft from the
  master, discarding the stored edit (never automatic — ADR 0022)
- `GET /episodes/next?year=` — highest used in that year

Client helpers in `src/lib/music-schedule-api.ts`, following
`workers-notes-api.ts`.

**Check:** create/read/update/delete round-trips; deleting a week cascades to
services, lines and booth lines; deleting a Service Time leaves its services
intact with `service_time_id` null.

---

## Phase 6 — Create flow and copy-forward

`POST /` builds the week:

1. Envelope row (`schedule_type='music_schedule'`, `scope_kind='date_range'`,
   bounds from `weekBounds`).
2. Services from active `service_times`, sorted by `sort_order`, each with its
   derived date. Sunday School defaults `uploaded = 0`.
3. Lines from the **previous week** if one exists, else from
   `schedules.musicSchedule.defaultOrders`.
4. Episode numbers assigned per ADR 0024.

What carries and what clears, per ADR 0022:

| Carries forward                          | Clears                          |
| ---------------------------------------- | ------------------------------- |
| line order, kinds and roles              | song choices, unless `sticky`   |
| prose text and `_underscore_` markup     | highlights                      |
| B / I toggles, merge and align overrides | titles, texts                   |
| left-cell overrides                      | title/text notes (the speakers) |
| Sound Booth mode, labels and notes       | episode numbers → reassigned    |
| condensed-line edits (+ `drafted_from`)  |                                 |
| songs on lines marked `sticky`           |                                 |

`sticky` defaults on for the `theme` role — it is the year's theme song and does
not change week to week.

A carried condensed line whose fresh draft differs from its stored
`drafted_from` is flagged stale in the editor with a rewrite action. It is never
rewritten silently.

**Check:** creating 23 August from the seeded 16 August week yields four
services, episodes 100/101/102, every prose line and booth toggle intact, no
highlights, no songs except `B #546`, and no titles or texts.

---

## Phase 7 — Page components

New `src/components/music-schedule/`, reusing `page-frame.tsx` and
`scaled-page.tsx` from `src/components/workers-notes/` — move both to
`src/components/print/` and update the Workers' Notes imports, since they are no
longer one feature's.

- `service-block.tsx` — one **Service Order** as a two-column table, shared by
  both sheets with a `variant` prop. Split rows fill both cells, merged rows
  span. Pure render, no handlers, no cursor styles — ADR 0005.
- `music-sheet-page.tsx` — heading `MUSIC SCHEDULE` / `Sunday` or `Midweek`,
  then service blocks left-aligned, then the footer on the last page per
  `footerPlacement`.
- `sound-booth-page.tsx` — heading `SERVICE SCHEDULE` / `Sound Booth`, then
  service blocks separated by full-width rules. **One shared column width across
  all four blocks, the whole grid centred on the page** — measure the widest
  label and the widest value once, apply to every block. Booth song rows print
  the reference on one line and the title beneath it, unquoted.
- Type scale read off the paper originals, declared in points per ADR 0021, and
  recorded in a table in this file once measured against the seeded week.

Each service block carries `data-ms-service="<id>"` for the hit zones.

**Check:** the seeded week's three pages match the photographs side by side at
100% zoom.

---

## Phase 8 — Preview page, hit zones, readiness panel

`src/pages/music-schedule/`:

- `music-schedule-list-page.tsx` at `/schedules/music` — flat reverse-
  chronological table with a year filter and a New Week button. Columns: week
  of, episodes, services, status. Per-row Sound Booth and Musicians exports.
- `music-schedule-view-page.tsx` at `/schedules/music/:id` — all pages
  previewed, zoom stepper (Fit / 100% / 150%), Edit toggle, Finalize/Reopen,
  Delete, two export buttons, and the readiness panel.
- `service-editor-page.tsx` at `/schedules/music/:id/service/:serviceId` — the
  service header fields (headings, time, meeting, uploaded, episode stepper,
  title, text, and their notes and highlights), then the line table: reorder
  buttons, role select, song picker, suffix, left-cell override, text, B / I /
  Highlight, split/merge and align, Sound Booth mode and label, sticky. Below
  it, the condensed booth lines with their stale flags and rewrite actions.
  Deep-linkable to `#line-<id>`.

A `region-overlay.tsx` adapted from the Workers' Notes one, keyed on
`data-ms-service` — same offsetParent-walking measurement so the boxes track
content instead of drifting, same wrapper placement so nothing reaches the PDF
(ADR 0005). Clicking a service block navigates to its editor, focused on the
clicked line.

Readiness panel — warnings only, never blocking:

- a song line with no hymn and no free title
- a meeting service with no title or no text
- an episode number duplicated within its year, or a gap
- a page overflowing its box (from Phase 4)
- a condensed booth line whose source roles have changed since it was drafted

**Check:** hover boxes stay aligned at every zoom and after fonts settle;
clicking the third line of the evening service lands on that row; each warning
fires on a deliberately broken week and clears when fixed.

---

## Phase 9 — Export

Generalise `src/pages/sunday-school/workers-notes-export.ts` into
`src/lib/fixed-page-pdf.ts` exporting `exportFixedPagePdf(nodes, filename)` —
the capture logic is already type-agnostic (fixed box, `pixelRatio: 3`, Letter
edge to edge, `saveExportedFile` for the iOS path in ADR 0017). Point the
Workers' Notes export at it and delete the duplicate.

Two buttons, available in draft:

- **Sound Booth** → `sound-booth-<week-start>.pdf`, the Sound Booth pages
- **Musicians** → `music-schedule-<week-start>.pdf`, the Sunday then Midweek pages

No all-in-one.

**Check:** both PDFs open at Letter with no margin; text is crisp at 288 DPI;
the Workers' Notes export still produces a byte-comparable file after the
refactor.

---

## Phase 10 — Settings pane

Add a **Music Schedule** section to the Schedule Settings left rail (built in
the Workers' Notes Phase 4), at `/schedules/settings/music`:

- title prefix
- service headings — one row per active Service Time, two columns (Music Sheet,
  Sound Booth), seeded with the values from the originals
- default Service Orders — one collapsible line editor per Service Time, reusing
  the Phase 8 line table, used only for a first week with no predecessor
- footer blocks — quote lines, reference, uploaded graphic, and placement
  (last page / every page / never)

Per CLAUDE.md these are non-sidebar routes: add an explicit entry to
`src/lib/search/actions.ts`.

**Check:** every field round-trips; a first week with no predecessor builds from
the default orders.

---

## Phase 11 — Seed the 16 August 2026 week

`scripts/seed-music-schedule-2026-08-16.ts`, idempotent on `week_start`.
Transcribed from the paper originals (images 2, 3 and 4).

**Sunday School** — 9:45 am, not uploaded, no title or text.
`Live Stream - Welcome` · B #269 · `Prayer, Announcements` · B #35 ·
`_Message_, Offline, Prayer, Invitation` · B #110 `(Invitation)` · B #254 ·
`Offering, Praises, Prayer Requests, Dismiss`.
Booth: opening B #269 with note `(Pastor Candee)` highlighted; congregational B #35.

**Sunday Morning** — 11 am, #97, title `Jesus Saith, ... I Am The Truth...`,
text `John 14:6` with note `(Pastor Candee)` highlighted.
`Live Stream - Welcome` · congregational opener B #324, left cell overridden to
`NO CHOIR`, text prefixed `Cong.`, highlighted · `Motto:` Rejoice That God
Allows... `_Soulwinners_` · `Verse:` Proverbs 11:30 · `Theme:` B #546 `(x2 w/tag)`,
sticky · `Prayer, Announcements` · `NO Pastor's Selection TODAY` highlighted ·
B #99 `(x2)` · `_Message_, Offline, Prayer, Invitation` · B #167 `(Invitation)` ·
`Announcements, Offering, Special` · B #341.
Booth: `Cong. Opener:` / `(No Choir)` highlighted; the `motto_verse_theme` line
hand-edited to `Motto, Verse, Theme Song`; the `prayer_announcements` line
drafted with the NO-Pastor's-Selection wording, highlighted; congregational B #99.

**Sunday Evening** — 6:30 pm, #98, title `What the Word Will Do`, text
`Psalm 19:7-8` with note `(Pastor Candee)` highlighted.
`Live Stream - Welcome` · B #472 · `Prayer, Announcements, _Message_, Offline,
Prayer, Invitation` · B #467 `(x2) (Invitation)` · B #244 ·
`Announcements, Offering, Special` · `Birthdays, Anniversaries` · S #59 ·
B #341 `(Optional)` italic · `Prayer, Dismiss`.

**Wednesday Evening** (19 August) — 7:30 pm, #99, title
`Don't Neglect To Teach - Part 3`, text `Titus 2:11-15` with note `(Preacher)`.
`Live Stream - Welcome` · B #241 · `Prayer, Announcements, _Message_, Invitation` ·
B #526 `(Invitation)` · S #44 · `Announcements, Offering` · B #469 `(x2)` ·
`Praise, Prayer Requests` · `Prayer, Dismiss`.

The same line structures, with songs and highlights stripped, seed
`schedules.musicSchedule.defaultOrders`.

**Requires the user:** confirm each hymn number resolves to the expected title
before the seed is trusted — the same one-time verification the Betty Lukens
catalogue needed.

**Check:** the three rendered pages match the photographs.

---

## Phase 12 — Registration

Per CLAUDE.md:

- `src/lib/nav-config.ts` — `{to: '/schedules/music', label: 'Music Schedule', icon: ListMusic}`
  in the Schedules group. Sidebar actions derive from `navGroups` automatically;
  the settings and service-editor routes are not sidebar routes and need explicit
  entries in `src/lib/search/actions.ts`.
- `src/lib/search/providers/music-schedules.ts`, registered in `providers/index.ts`,
  searchable by week date and episode number. Set `navPath` on its items so
  Recents de-dupes against it.
- `GROUP_ORDER` + `PREFIX_TO_GROUP` in `src/components/command-palette.tsx` if a
  new group is warranted; otherwise fold into the existing Schedules group.
- `server/services/usage-entity-resolver.ts` — a pretty-label entry for the
  `music` section, so a visited week reads "Week of August 16, 2026" rather than
  "Music #12".

**Check:** Cmd+K finds a week by date and by episode number; visiting one shows
up in Recents with its real label; the sidebar entry highlights on every
`/schedules/music/*` route.

---

## Implementation notes (built)

Three things landed differently from the plan above, all discovered against the
real data:

- **Hymn titles are stored in capitals** (`HOLD THE FORT`), so "print the stored
  title verbatim" would have printed shouting. `songTitle()` title-cases the
  catalogue title when a line has no wording of its own, and the line's `text`
  field carries the paper's wording wherever it differs (the paper's "I Will
  Sing Of The Mercies" is shorter than the catalogue's "I WILL SING OF THE
  MERCIES OF THE LORD"). The reference always comes from the FK.
- **No full default-order editor in Settings.** A "Save as default order" button
  on the service editor writes that service's structure — songs and highlights
  stripped — into `schedules.musicSchedule.defaultOrders`. The seed writes them
  too. Much less surface than a second line editor for the same job.
- **The footer graphic is its own setting** (`footerImagePath`) rather than a
  footer-block kind, so the footer blocks reuse the app's existing `FooterBlock`
  shape unchanged.

Two defaults that the paper forced and that are worth knowing about: a song row
is always split (its reference needs a column, whatever its role), and a song
row always prints bold.

The type scale in `src/components/music-schedule/type-scale.ts` is still an
estimate — it needs one pass against the printed sheet.

## Acceptance test

Create **23 August 2026** through the New Week flow. It should arrive with four
services, episodes 100/101/102, Sunday School unnumbered, every prose line and
Sound Booth toggle carried from 16 August, B #546 still on the Theme line, and
nothing else filled. Enter the songs, titles and texts from the paper original,
export the Sound Booth PDF, and compare it against the 23 August sheet — which
was written by hand before this feature existed.
