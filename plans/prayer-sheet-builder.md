# Prayer Sheet Builder

Half-sheet printed document (5.5×8.5") handed out weekly at CBC. Front: rolling window of prayer
requests grouped by Sunday. Back: static ministry list. Two half-sheets print side-by-side on one
landscape letter page (two-page PDF: page 1 = two fronts, page 2 = two backs).

## Decisions

| #   | Decision          | Choice                                                                                                                                                   |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Versioning        | Weekly **Editions** (versioned artifacts, like calendar pages)                                                                                           |
| 2   | Carry-forward     | Auto-populate: new edition copies all previous edition's Sundays + 1 new empty Sunday                                                                    |
| 3   | Rolling window    | Flexible; user removes oldest Sunday manually; default lands at 4                                                                                        |
| 4   | Edition creation  | Explicit "New Edition" button, instant — no dialog                                                                                                       |
| 5   | Color             | Per-edition; auto-assigned from Sunday-of-month position (1st–5th); configurable rotation                                                                |
| 6   | Color palette     | ~10 preset colors (blue, green, red, gold, dark blue, orange, brown, burgundy, black…); rotation slots pick from palette with mutual-exclusion dropdowns |
| 7   | Ministry list     | Global singleton shared across all editions                                                                                                              |
| 8   | Settings route    | `/prayer-sheet/settings` — title, scripture, color rotation, ministry list                                                                               |
| 9   | Entry format      | Single free-text string per entry (`Linda H – lung cancer surgery`)                                                                                      |
| 10  | Column split      | Auto-split at midpoint; `column_split` integer override per edition                                                                                      |
| 11  | PDF export        | html-to-image + jsPDF (same as calendar); 2-page landscape: front × 2, back × 2                                                                          |
| 12  | Photo OCR         | Claude vision; uploads photo, selects target Sunday, populates entries for that slot only                                                                |
| 13  | Navigation        | Paginated table (like music schedules); year filter + search                                                                                             |
| 14  | Editor layout     | Split pane — editor left, live preview right (front/back toggle)                                                                                         |
| 15  | Entry editing     | Inline: click to edit, Tab next, Enter to add, Backspace on empty to delete                                                                              |
| 16  | Past editions     | Always editable                                                                                                                                          |
| 17  | Scripture + title | Settings singleton (not hardcoded)                                                                                                                       |

## Nav Refactor (scope this PR)

Rename **Schedules** nav group → **Documents**. Items added to Documents:

- Calendar Print (move from Calendar group)
- Verse Strips (move from Sermons group)
- Prayer Sheet (new)

Fair Booth stays in Documents (user confirmed it is printed).  
Calendar group keeps: Upcoming only.  
Sermons group loses: Verse Strips.

## Data Model

### New tables

```sql
-- prayer_sheet_editions
id              INTEGER PK autoincrement
theme_color     TEXT NOT NULL         -- hex, e.g. '#8B3A2A'
column_split    INTEGER               -- split after Sunday N; NULL = auto midpoint
created_at      TEXT NOT NULL default datetime('now')
updated_at      TEXT NOT NULL default datetime('now')

-- prayer_sheet_sundays
id              INTEGER PK autoincrement
edition_id      INTEGER NOT NULL FK→prayer_sheet_editions(onDelete: cascade)
sunday_date     TEXT NOT NULL         -- YYYY-MM-DD
sort_order      INTEGER NOT NULL default 0
created_at      TEXT NOT NULL default datetime('now')

-- prayer_sheet_entries
id              INTEGER PK autoincrement
sunday_id       INTEGER NOT NULL FK→prayer_sheet_sundays(onDelete: cascade)
text            TEXT NOT NULL default ''
sort_order      INTEGER NOT NULL default 0
created_at      TEXT NOT NULL default datetime('now')

-- prayer_sheet_settings  (singleton: id always 1)
id              INTEGER PK
title           TEXT NOT NULL default 'CBC PRAYER SHEET'
scripture_text  TEXT NOT NULL default '"And it shall come to pass...'
scripture_reference TEXT NOT NULL default 'Isaiah 65:24'
color_sunday_1  TEXT NOT NULL default '#1E40AF'   -- blue
color_sunday_2  TEXT NOT NULL default '#166534'   -- green
color_sunday_3  TEXT NOT NULL default '#991B1B'   -- red
color_sunday_4  TEXT NOT NULL default '#B45309'   -- gold
color_sunday_5  TEXT NOT NULL default '#581C87'   -- dark blue/purple
updated_at      TEXT NOT NULL default datetime('now')

-- prayer_sheet_ministry_items
id              INTEGER PK autoincrement
text            TEXT NOT NULL default ''
bold            INTEGER NOT NULL default 0  -- boolean
sort_order      INTEGER NOT NULL default 0
```

### Auto-assign color logic (server-side on edition create)

```ts
// Which occurrence of a Sunday within its month? (1st, 2nd, 3rd, 4th, or 5th)
function sundayOrdinal(date: string): 1 | 2 | 3 | 4 | 5 {
  const d = new Date(date + 'T12:00:00')
  return Math.ceil(d.getDate() / 7) as 1 | 2 | 3 | 4 | 5
}
// Map to settings.color_sunday_{1..5}
```

## API Routes (`/api/prayer-sheet/…`)

| Method | Path                    | Action                                                            |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| GET    | `/editions`             | Paginated list (year filter, search)                              |
| POST   | `/editions`             | Create: auto-carry-forward from latest edition + new empty Sunday |
| GET    | `/editions/:id`         | Full edition with sundays[] and entries[]                         |
| PATCH  | `/editions/:id`         | Update theme_color, column_split                                  |
| DELETE | `/editions/:id`         | Delete edition                                                    |
| POST   | `/editions/:id/sundays` | Add a Sunday (body: `{ sunday_date }`)                            |
| DELETE | `/sundays/:id`          | Remove a Sunday (cascades entries)                                |
| POST   | `/sundays/:id/entries`  | Add entry                                                         |
| PATCH  | `/entries/:id`          | Update text or sort_order                                         |
| DELETE | `/entries/:id`          | Delete entry                                                      |
| POST   | `/ocr`                  | Photo → Claude vision → `{ entries: string[] }` for a Sunday      |
| GET    | `/settings`             | Get singleton settings                                            |
| PATCH  | `/settings`             | Update title, scripture, color rotation                           |
| GET    | `/ministry-items`       | Get ordered ministry list                                         |
| PUT    | `/ministry-items`       | Replace entire list (bulk upsert)                                 |

## Frontend

### Routes

- `/prayer-sheet` → `PrayerSheetListPage`
- `/prayer-sheet/:id` → `PrayerSheetEditorPage`
- `/prayer-sheet/settings` → `PrayerSheetSettingsPage`

### Components (`src/components/prayer-sheet/`)

- `prayer-sheet-preview.tsx` — the half-sheet render (used in editor + PDF capture)
  - Props: `edition`, `sundays`, `entries`, `settings`, `ministryItems`, `side: 'front'|'back'`
  - Handles auto-split and column_split override
- `prayer-sheet-editor.tsx` — left pane: Sunday list, entry inline edit, add/remove Sunday, color picker
- `sunday-entry-list.tsx` — inline editable entry list (Tab/Enter/Backspace keyboard nav)
- `ministry-list-editor.tsx` — settings page, drag-to-reorder bullet list
- `color-rotation-editor.tsx` — 5 dropdowns with mutual exclusion + color chip previews

### Pages

**PrayerSheetListPage**

- Year filter dropdown + search
- Table: Date | Color chip | Sunday count | Entry count | Actions
- "New Edition" button → POST `/editions` → navigate to editor
- Row click → navigate to `/prayer-sheet/:id`

**PrayerSheetEditorPage**

- Split pane: left = editor, right = preview
- Preview has Front / Back toggle
- Editor: Sunday sections with inline entry lists, "Add Sunday" button, "Remove" on each Sunday header
- Color picker swatch row (preset palette)
- Column split nudge (← →) when >2 Sundays
- "Export PDF" button → capture front preview, capture back preview, stitch into 2-page PDF
- "Import from Photo" button on empty Sunday → OCR flow (file input → POST `/ocr` → populate entries)

**PrayerSheetSettingsPage**

- Title field, scripture text + reference fields
- Color rotation: 5 rows (1st–5th Sunday), each a dropdown of preset colors (mutual exclusion)
- Ministry list: drag-to-reorder inline editor, bold toggle per item, add/remove rows

## Migrations

Two new migration files:

1. `0056_prayer_sheet_core.sql` — editions, sundays, entries, settings, ministry_items tables
2. Seed the settings singleton (INSERT OR IGNORE id=1 with defaults)
3. Seed ministry items from the photos (the ~35 items on the back of every sheet)

## AI smoke test

New case in `server/test/ai-smoke.ai.test.ts`:

- `prayer sheet OCR` — sends one of the HEIC-converted JPEGs, expects `entries` array with ≥3 items for a named Sunday

## Implementation order

1. Schema + migration + ministry item seed
2. Backend routes (CRUD + create-with-carry-forward logic + OCR endpoint)
3. `prayer-sheet-preview.tsx` (front + back; drives both editor and PDF)
4. `PrayerSheetListPage` + `PrayerSheetEditorPage` (editor left pane + preview right pane)
5. PDF export (two-page landscape)
6. `PrayerSheetSettingsPage`
7. Nav refactor (Schedules → Documents, move Calendar Print + Verse Strips)
8. AI smoke test case
