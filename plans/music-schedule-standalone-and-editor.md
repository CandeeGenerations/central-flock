# Music Schedule — Standalone Services, Occasions, the editor redesign, and Schedule Scan

Four pieces, built in this order because each one's controls land in the next one's screens:

1. **Standalone Service.** A service whose order belongs to its own week, so creating the next week
   never copies it forward.
2. **Occasion.** A per-week note on a service ("Thanksgiving Eve Candlelight") printed on the
   heading row without adding height.
3. **Service editor redesign.** Drag-and-drop, fewer visible options, autosave, typed song entry,
   a live preview beside the order, and touch support for the iPad.
4. **Schedule Scan.** Photograph the pastor's three weekly pages on the phone, then review and
   create the week on the iPad or laptop.

Domain terms are in [CONTEXT.md](../CONTEXT.md) → Music Schedule: **Standalone Service**,
**Occasion**, **Candlelight Service**, **Schedule Scan**.

## Decisions (design interview, 2026-11-08)

### Standalone Service and Occasion

| # | Decision |
|---|---|
| 1 | A Candlelight Service (Thanksgiving Eve, Christmas, New Year's) is the regular Wednesday or Sunday Evening service, never a one-off. Its Service Time, Service Record, Sermon, Episode Number and nursery all stay as normal. No "film it all". |
| 2 | Standalone is set **per service**. Creating the next week never copies from a Standalone service: it reaches back to the most recent service of that Service Time that isn't Standalone. |
| 3 | A Standalone order is reused only on purpose: **Copy order from…** for one service, or **Copy week** (unchanged) for a whole week. |
| 4 | Copy order from… replaces Order Lines (songs, suffixes, left cells, booth notes, sticky), condensed booth lines and heading overrides. It never copies Title, Text, their notes, highlights or the Occasion. |
| 5 | Copying from a Standalone source makes the target Standalone. The picker lists Standalone services first, newest first, labelled by Occasion/heading and date. |
| 6 | Save as default order is refused on a Standalone service. |
| 7 | Marking a service Standalone after the next week exists rewrites nothing. The editor shows a note instead. |
| 8 | **Occasion** is its own per-service field, separate from the heading. It prints on the heading row: right-aligned italic on the Music Sheet, after the date on the Sound Booth Sheet (`NOVEMBER 25, 2026 · Thanksgiving Eve Candlelight`). It never wraps: it shrinks to a minimum size, then gets cut off with "…" and is reported in the week's "things to fix" list. It clears on copy-forward, like Title. |
| 9 | Page budget that nothing may break: the **Sound Booth Sheet is one page**, the **Music Sheets are one page for SS + AM + PM and one page for Midweek**. |

### Editor

| # | Decision |
|---|---|
| 10 | Layout follows the calendar page: the editor is flexible on the left and a sticky ~460px live preview sits on the right (`lg:grid-cols-[1fr_460px]`), with a **Musicians \| Sound Booth \| Photos** switch. Below `lg` (iPad portrait) it's a single column, and the preview opens as a **right-side sheet** that can stay open over part of the order. iPad landscape is the main tablet case; both orientations are supported. |
| 11 | Rows drag to reorder (no arrows). Collapsed rows show the content, the suffix and a quiet role tag. Opening a row shows the rarer settings. Align, booth include/exclude and booth label are removed from the editor (0 uses in 14 weeks). |
| 12 | Touch: highlight/delete show on **hover with a mouse, or on the selected row with touch** (`pointer: coarse`). Drag uses a touch sensor with press-and-hold on the grip. Tap targets are at least 40px on coarse pointers. |
| 13 | Everything autosaves. "Saved" is shown only once the server has confirmed it. One save at a time, newest wins. Failure shows a persistent red **Not saved — Retry**. Leaving the page saves immediately. Delete offers Undo. Server line replaces run in a transaction. |
| 14 | Songs are typed: `219`/`b219` = Burgundy (212 of 244 songs), `s27` = Silver, words = title search. Enter goes to the next song, Shift+Enter to the previous one. There is also a week-wide **Songs** view. |

### Schedule Scan

| # | Decision |
|---|---|
| 15 | Input is the pastor's three weekly pages, as 1–3 photos in any order: the **Sunday sheet** and **Midweek sheet** (his typed template, which is not this app's print, with songs written on) and the **handwritten form** (Title, Text and the songs again for each service). The scan works out which page is which. |
| 16 | Scanning **creates** the week. It reads the Sunday from the sheets, creates the week by normal copy-forward (Standalone skipped), then fills it in. If the week already exists, the same review runs against it. |
| 17 | Songs are taken by **book + number only**. The hymnal supplies the title; the written title is ignored. An unreadable or unknown number is left blank and flagged. Different numbers for the same slot on two pages are flagged with both. |
| 18 | A service whose scanned order matches the copied order just gets its songs filled in. One that differs takes the **scanned order** (lines that still match keep their settings), is labelled "Order differs from usual", and can be switched back to "keep usual order, fill songs only". |
| 19 | A note beside a service heading ("Thanksgiving Eve Candlelight", "Thanksgiving Testimonies") becomes the **Occasion** and pre-ticks **Standalone**. Notes the scan can't place ("FILM IT ALL", an ambiguous parenthetical) are listed as **Notes from the sheet**, never placed automatically. Handwritten `INV.` sets the invitation role, and `Op.` sets the `(Optional)` suffix. |
| 20 | Title: every word capitalised, no quote marks, matching the stored titles ("What Is Your Foundation?"). Text: full book names joined by ` & ` ("Psalm 139:17-18 & Psalm 40:5"), each reference checked against the Bible Text, with nonexistent ones flagged. |
| 21 | Phone, then iPad/laptop: the phone uses the camera and **Scan** stores an **unfinished review** with a short summary. The review is finished on a wider screen (on the phone too if you need to). Nothing is created until **Create week**. |
| 22 | Photos stay with the week (the **Photos** tab in the editor's preview column) and with unfinished reviews, then are deleted **30 days after the week's Wednesday** by a daily job. The week itself is never touched by the clean-up. |

### Usage data behind the decisions (14 weeks, 573 lines)

Suffix 94 · sticky 56 · layout override 56 (all seeded) · booth note 18 · left cell 14 · highlight 4 ·
booth highlight 6 · **align 0 · booth include/exclude 0 · booth label 0 · page break 0**.
Burgundy 212 vs Silver 32 songs. All 16 songs on the Nov 22 sheets resolve by book + number.

---

## Steps

### 1. Schema and migration

- `music_schedule_services`: `standalone integer not null default 0`, `occasion text not null default ''`.
- New `music_schedule_scans`: `id`, `week_start` (nullable until read), `music_schedule_id` (nullable,
  set on Create week, `on delete set null`), `status` (`unfinished` | `applied` | `discarded`),
  `photos` (JSON array of upload URLs, ordered), `result` (JSON: the parsed pages plus the computed
  proposal), `photos_expire_on` (week's Wednesday + 30 days), `created_at`, `updated_at`.
- `pnpm db:generate` → **0056** (0054/0055 are the uncommitted calendar-print migrations in the
  working tree; commit that work separately first). Additive only. Follow RUNBOOK: stop the service,
  then migrate.
- Expose `standalone`, `occasion` and `photos` (when present) in the week/service payloads and
  `src/lib/music-schedule-api.ts`. Add `standalone` and `occasion` to the service PATCH whitelist
  (`music-schedules.ts:743`).

### 2. Server: Standalone, Occasion, copying

- **Copy-forward reach-back** (`POST /`, `music-schedules.ts:297-394`): the source for each Service
  Time is the most recent earlier service with that `serviceTimeId` and `standalone = 0`, from any
  earlier week. New services start with `standalone = 0` and `occasion = ''`. Extract this into a
  `createWeek(weekStart)` service function so the scan can call it.
- **Copy week** (`POST /:id/copy`): also copies `standalone` and `occasion` (it's verbatim).
- **`POST /:id/services/:serviceId/copy-order`** `{fromServiceId}`: in one transaction, replace
  lines (highlights cleared), booth lines (highlight cleared) and heading overrides, and set
  `standalone = 1` if the source is Standalone. Refuse self-copy.
- **`GET /copy-sources?exclude=<serviceId>`**: Standalone first, newest first, with
  occasion/heading and date.
- **Save as default** (`:932`): 400 when `standalone`.
- **Transactions** around the lines PUT (`:814`) and the booth-lines PUT.
- Service payload: `laterWeekExists` for the decision-7 note.
- Add one paragraph to ADR 0022's copy-forward section about the reach-back.

### 3. Print: Occasion on the heading row (`service-block.tsx`)

- **Music Sheet:** the heading becomes a flex row: the existing `NOVEMBER 22, EVENING SERVICE` on
  the left, and the Occasion in italic on the right with `white-space: nowrap`.
- **Sound Booth Sheet:** append ` · Occasion` to the date cell, also nowrap.
- **Fit without wrapping:** measure the occasion span. If it's wider than the space left, step its
  font down to a floor (about 75% of the heading size), then truncate with "…". Report it through
  the existing `onOverflow` → "things to fix" path as "Occasion cut short on …".
- **Print-fit test:** render the Nov 22 week with both Occasions and assert one Sound Booth page, a
  Music Sunday page with SS + AM + PM, and a Midweek page, at the same heights as with the Occasions
  blank.

### 4. Autosave queue (`src/hooks/use-autosave.ts`, new)

- Debounce typing about 800ms. Drag, delete, role change and song commit save immediately.
- One request in flight per resource, coalescing edits made meanwhile. The server's stored result is
  adopted on success.
- Status `saving` / `saved` / `error`, with 3 retries with backoff, then a persistent **Not saved —
  Retry**.
- Flush on route change, `visibilitychange` hidden, and `pagehide` (iPad Safari backgrounding).
  `beforeunload` and `UnsavedChangesDialog` fire only while something is unsaved.
- Vitest with fake timers: coalescing, a slow first request, retry → success, retry exhaustion,
  flush on hide. Server test: a failed insert leaves the previous lines intact.

### 5. Editor layout (`service-editor-page.tsx`)

- **Header:** back, name, date · time · #episode, Standalone badge, Occasion (if set), save status,
  **Service settings** menu. Remove Save service, Save lines, the Preview dialog and the help
  paragraphs (a single `?` tooltip keeps the markup hint).
- **Left:** a compact details strip (Title, Text with notes and highlights, **Occasion**, Episode
  −/+, Meeting, Uploaded), then Service Order, then condensed Sound Booth lines (autosaved, Rewrite
  kept).
- **Right (`lg`+):** sticky, with a **Musicians | Sound Booth | Photos** switch over the existing
  `FitWidth` print nodes. **Photos** appears only when the week has scan photos; it pages between
  photos and supports pinch/scroll zoom. Clicking a preview line selects its row.
- **Below `lg`:** a **Preview** button opens the same panel as a right-side sheet (about 90% wide on
  iPad portrait) that doesn't block scrolling the order behind it.
- **Service settings:** Name, Time, the two heading overrides, **Standalone** with a one-line
  explanation, **Copy order from…**, and **Save as default order** (disabled with a reason when
  Standalone or one-off).
- The decision-7 note when `standalone && laterWeekExists`.

### 6. Order rows, drag-and-drop, touch

- `@dnd-kit/core` + `@dnd-kit/sortable`, using pointer, touch (press-and-hold about 200ms on the
  grip) and keyboard sensors. A drop saves immediately.
- **Collapsed row:** grip · content (`B #43 Nothing but the Blood` + faint suffix, or the prose
  text) · muted role tag. Highlight/delete appear on hover (fine pointer) or on the selected row
  (coarse pointer). Delete gives an Undo toast.
- **Opened row** (one at a time, labelled rows like the fair booth signup card): Role · Song/Text ·
  Suffix · Keep song next week · Highlight on Musicians / Sound Booth · Booth note · Left cell. Under
  **More**: Layout, Printed as, Not in either book.
- Remove align, booth include/exclude and booth label from the editor. Data and print are unchanged.
- One **+ Add** menu (Song, Line, Page break) that inserts after the selected row, with the role
  guessed from position.
- 40px minimum tap targets under `@media (pointer: coarse)`.

### 7. Typed song entry

- The song cell is an input parsing `^\s*([bs])?\s*#?\s*(\d+)\s*$` (no book = Burgundy). Anything
  else is a title search with an arrow-key dropdown. The resolved title shows while typing, and an
  unknown number shows "no B #999".
- Enter commits and moves to the next song (skipping prose), Shift+Enter to the previous one, Tab to
  the suffix, Esc reverts. Each commit saves immediately. Use `inputmode="text"` so the iPad keyboard
  still offers `b`/`s`.
- Parsing and next/previous logic go in `src/lib/music-schedule-core.ts`, with unit tests.

### 8. Week **Songs** view (`music-week-view-page.tsx`)

- Every song line of all meeting services, grouped by service, each with role tag, song input and
  suffix. Enter-to-next crosses service boundaries. One save-status indicator.
- Standalone and Occasion badges on the week list and the week view.

### 9. Copy order from… dialog

- Searchable list from `/copy-sources`, with a read-only preview of the chosen order. The
  confirmation names any songs that will be replaced, and says "This service will also be marked
  Standalone" when it applies.

### 10. Schedule Scan — server

- **`server/services/music-schedule-scan.ts`**, calling Claude through `createMessage('music-schedule-scan', …)`
  with `AI_MODELS.sonnet`, `effortConfig(…, 'low')`, and all photos in one request (images
  downscaled client-side to about 1600px on the long edge, JPEG). The prompt describes the three
  page kinds and asks for **transcription only**, returning JSON:
  - `pages[]`: `kind` (`sunday_sheet` | `midweek_sheet` | `form`).
  - `services[]`: `{which: sunday_school|sunday_morning|sunday_evening|midweek, date, occasion|null,
    title|null, text|null, lines: [{kind: song|prose, book: B|S|null, number|null, writtenSuffix,
    marker: INV|Op|null, text, struckOut: bool}], notes: string[]}`.
  - The model never resolves titles, never reorders, and never invents lines.
- **Deterministic post-processing, unit-tested without the model:**
  - `which` → Service Time: match by day of week and time among the active Service Times.
  - Songs: book + number → `hymns` row. Missing/unknown → flag `song_unresolved`. Form vs sheet
    number mismatch for the same slot → flag `song_conflict` with both.
  - Title → capitalise every word, strip quote marks. Text → `parseReference` + full book names,
    joined ` & `, each verse checked with `bible-text.ts` → flag `text_invalid`.
  - Markers: `INV` → role `invitation`; `Op` → suffix `(Optional)`; a written `(x2)`/`(2x & tag)` →
    suffix.
  - **Order alignment** per service: an LCS over keys (prose → normalised text, song → `song`) between
    the copied-forward lines and the scanned lines. Full alignment → "songs filled". Otherwise
    → "Order differs from usual", with the scanned order and the matched copied lines' settings
    carried over. Both versions are stored so the review toggle needs no second AI call.
  - Occasion → `occasion` + pre-ticked Standalone. Unplaced notes → `notes[]`.
- **Endpoints** (under `/api/music-schedules/scans`):
  - `POST /` (photos, multipart): store the photos under `uploads/music-scans/`, run the scan,
    save `unfinished`, return the id and summary.
  - `GET /` (unfinished list) and `GET /:id` (the full proposal).
  - `PATCH /:id` (review choices: per-service order mode, Standalone/Occasion edits, song fixes).
  - `POST /:id/apply`: one transaction that creates the week via `createWeek` (or targets the
    existing week), writes lines/Title/Text/Occasion/Standalone, sets `music_schedule_id`, status
    `applied`. A 409 if the week was created meanwhile and the review was against "new week" (it
    re-runs against the existing week).
  - `DELETE /:id`: discard.
- **Clean-up:** a daily job in `server/services/scheduler.ts` deletes the photo files and clears
  `photos` where `photos_expire_on < today`, and deletes `discarded` rows. Also run it once on
  start-up, like the devotion scan's orphan clean-up.
- `server/test/ai-smoke.ai.test.ts`: a **music schedule scan** case using a small fixture photo
  (one of the Nov 22 pages, committed under `server/test/fixtures/`), asserting it returns parseable
  JSON with at least one resolved song.
- Usage-entity resolver: not needed (the scan review is not a `/section/:id` entity route). Add a
  command-palette action "New week from photos".

### 11. Schedule Scan — UI

- **Music Schedules list:** a **New week from photos** button (`<input type="file" accept="image/*"
  capture="environment" multiple>`, plus "add another photo" so three can be taken in a row on the
  phone). Thumbnails, then **Scan** with the existing `AIProgress` component. The result is a
  summary card ("Week of Nov 22 · 16 songs · 3 to check · Open review"). Unfinished reviews are
  listed at the top of the page.
- **Review page** `/schedules/music/scans/:id`, using the editor's grid: the proposal on the left,
  photos on the right (or a side sheet below `lg`), zoomable, one tab per page.
  - Per service: Title, Text, Occasion and Standalone (editable), the order with each line marked
    *filled / added / removed / unchanged*, and an **Order: scanned | usual** toggle when they
    differ. Flags sit inline on their line, with the counts summed in the header ("16 of 16 songs
    found · 1 to check").
  - Song fixes use the typed song input from step 7.
  - **Notes from the sheet** box per service.
  - **Create week** (or **Apply to week** when it exists) and **Discard**.
- After apply, go to the week view. The photos are now on the editor's Photos tab.

### 12. Verify

- `pnpm lint`, `pnpm test`, `pnpm prettier`, and `pnpm test:ai` (a new AI feature was added).
- In the running app (launchd service, not `pnpm dev`):
  1. **Scan:** on the phone, photograph the three Nov 22 pages, then Scan. Open the review on the
     iPad (landscape and portrait) and the laptop. Expect 16 songs resolved, Title/Text for AM, PM
     and Wed normalised, Occasions on Sunday Evening and Wednesday with Standalone ticked, and the
     Wednesday order "differs from usual". Create the week.
  2. **Standalone:** create the week of Nov 29 and check Sunday Evening and Wednesday reached back
     to Nov 15/18's orders with no Occasion.
  3. **Print:** export Nov 22. The Sound Booth Sheet is one page, Musicians Sunday is one page and
     Midweek is one page, with the Occasions on the heading rows.
  4. **Editor on iPad:** drag by touch, tap to select then delete and Undo, type songs with Enter to
     next, open the Photos tab, and use the side sheet in portrait.
  5. **Autosave:** stop the service mid-edit to see Not saved, restart and Retry. Background Safari
     mid-typing and reopen to find the edit saved.
  6. **Copy order from…** from the Nov 25 service onto a test service.
- Compare a PDF export of an ordinary week before and after: no print difference.

## Out of scope

- A Settings "Candlelight order" template (replaced by Copy order from…).
- "Film it all" / booth-include behaviour.
- Using the written song title to correct a number (numbers only; titles are fixed by hand).
- A per-week Standalone switch.
- Scanning anything other than the pastor's three weekly pages (e.g. a text or email schedule).
