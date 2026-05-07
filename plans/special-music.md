# Special Music

A database of special music performed (or scheduled to be performed) at services. Tracks date, service slot, performers, song, type, status, YouTube link, and a sheet music attachment. Supports YouTube-URL-based AI extraction (mirroring the devotion verse-extraction pattern), repeat warnings, and cross-links from Person and Hymn detail pages.

Domain context lives in [/CONTEXT.md](../CONTEXT.md). Storage decision is captured in [docs/adr/0001-uploads-directory.md](../docs/adr/0001-uploads-directory.md). This plan is the implementation playbook.

## Goals

- Track every Special: date, service, song (free text + optional `hymn_id`), performers (linked + guests), type, status, YouTube, sheet music.
- Three-state status with auto `will_perform` → `needs_review` rollover via the existing scheduler.
- Paste-a-YouTube-URL flow that auto-fills new entries and assists review.
- Soft warnings for song / performer repeats.
- Person and Hymn detail pages list specials cross-referenced.
- Replace `server/data/<subdir>/` with `$UPLOADS_DIR` storage; migrate existing scans + nursery logos in the same release.

## Non-goals (deferred)

- Multiple sheet-music attachments per Special (one for now).
- Multiple YouTube links per Special.
- Public-facing setlist/print view.
- Advanced reporting beyond cross-links and repeat warnings.

---

## Phase 1 — `UPLOADS_DIR` env var + relative-path migration

This phase ships the storage change _without_ moving any files yet. Mount points read `UPLOADS_DIR`, defaulting to the existing `server/data/` so behavior is unchanged for dev. Existing DB rows get their `/data/` path prefixes stripped. After this phase, flipping the launchd plist and physically copying files is just config + filesystem work.

**Files:**

- `server/lib/uploads.ts` (new):

  ```ts
  import path from 'node:path'
  import {fileURLToPath} from 'node:url'

  const __here = path.dirname(fileURLToPath(import.meta.url))
  const DEFAULT_DIR = path.join(__here, '..', '..', 'data')

  export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? DEFAULT_DIR
  export const uploadPath = (...parts: string[]) => path.join(UPLOADS_DIR, ...parts)
  export const uploadUrl = (...parts: string[]) => '/' + ['uploads', ...parts].join('/')
  ```

- `server/index.ts`: replace
  ```ts
  app.use('/data/scan-images', express.static(path.join(__dirname, '..', 'data', 'scan-images')))
  app.use('/data/nursery-logos', express.static(path.join(__dirname, '..', 'data', 'nursery-logos')))
  ```
  with
  ```ts
  app.use('/uploads', express.static(UPLOADS_DIR))
  ```
- `server/routes/devotions.ts`, `server/routes/nursery.ts` (and any other writers): replace hardcoded `data/scan-images` / `data/nursery-logos` with `uploadPath('scan-images', ...)` / `uploadPath('nursery-logos', ...)` and write `uploadUrl(...)` style relative paths into the DB.
- DB migration (raw SQL via `pnpm db:generate` after schema edit, or a hand-rolled migration): rewrite existing path values from `/data/scan-images/<f>` → `/uploads/scan-images/<f>`, same for nursery-logos.

**Steps (workflow memory: stop service first):**

1. Stop launchd service.
2. Create `server/lib/uploads.ts`. Update `server/index.ts` mounts and route writers.
3. Generate the path-rewrite migration (data migration only; no schema change yet).
4. `pnpm db:migrate`.
5. Restart launchd service. Verify nursery + scan images still load.
6. `pnpm lint` then `pnpm prettier`.

---

## Phase 2 — Schema for Special Music

**File:** `server/db/schema-music.ts` (new).

```ts
import {sql} from 'drizzle-orm'
import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'

import {people} from './schema-core'
import {hymns} from './schema-hymns'

export const specialMusic = sqliteTable('special_music', {
  id: integer('id').primaryKey({autoIncrement: true}),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  serviceType: text('service_type', {
    enum: ['sunday_am', 'sunday_pm', 'wednesday_pm', 'other'],
  }).notNull(),
  serviceLabel: text('service_label'),
  songTitle: text('song_title').notNull(),
  hymnId: integer('hymn_id').references(() => hymns.id, {onDelete: 'set null'}),
  songArranger: text('song_arranger'),
  songWriter: text('song_writer'),
  type: text('type', {
    enum: ['solo', 'duet', 'trio', 'group', 'instrumental', 'other'],
  }).notNull(),
  status: text('status', {
    enum: ['will_perform', 'needs_review', 'performed'],
  }).notNull(),
  occasion: text('occasion'),
  guestPerformers: text('guest_performers').notNull().default('[]'), // JSON array of strings
  youtubeUrl: text('youtube_url'),
  sheetMusicPath: text('sheet_music_path'), // relative to UPLOADS_DIR, e.g. 'special-music/abc.pdf'
  notes: text('notes'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const specialMusicPerformers = sqliteTable(
  'special_music_performers',
  {
    specialMusicId: integer('special_music_id')
      .notNull()
      .references(() => specialMusic.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    ordering: integer('ordering').notNull().default(0),
  },
  (t) => [primaryKey({columns: [t.specialMusicId, t.personId]})],
)
```

Re-export from `server/db/schema.ts`.

**Steps:**

1. Stop launchd service.
2. `pnpm db:generate` — review.
3. `pnpm db:migrate`.
4. Restart launchd service.
5. `pnpm lint` + `pnpm prettier`.

---

## Phase 3 — Backend routes

**File:** `server/routes/specials.ts` (new). Mount at `/api/specials` in `server/index.ts`.

| Method   | Path                              | Purpose                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/specials`                   | All specials. Query params: `status[]`, `serviceType[]`, `type[]`, `q` (song / performer name search). Joins performers + hymn for the list view.                                                                                                                                          |
| `GET`    | `/api/specials/:id`               | Single special with full performer list + hymn + sheet music URL.                                                                                                                                                                                                                          |
| `POST`   | `/api/specials`                   | Create. Body: `{date, serviceType, serviceLabel?, songTitle, hymnId?, songArranger?, songWriter?, type, occasion?, performerIds?: number[], guestPerformers?: string[], youtubeUrl?, notes?}`. Server derives initial `status` from date (future → `will_perform`, else → `needs_review`). |
| `PATCH`  | `/api/specials/:id`               | Update. If `date` moves to a future value, server forces `status='will_perform'` regardless of current status. Other field updates do not touch status.                                                                                                                                    |
| `POST`   | `/api/specials/:id/mark-reviewed` | Status → `performed`. Only valid when current status is `needs_review`.                                                                                                                                                                                                                    |
| `DELETE` | `/api/specials/:id`               | Cascade-delete performer rows.                                                                                                                                                                                                                                                             |
| `POST`   | `/api/specials/:id/sheet-music`   | Upload (base64 in JSON, mirroring devotion-scan). Writes to `$UPLOADS_DIR/special-music/<id>-<filename>`, stores relative path.                                                                                                                                                            |
| `DELETE` | `/api/specials/:id/sheet-music`   | Delete file + clear `sheetMusicPath`.                                                                                                                                                                                                                                                      |
| `POST`   | `/api/specials/from-youtube`      | Body: `{url}`. Returns `{date?, songTitle?, type?, performerSuggestions: {name, candidatePersonIds: number[]}[], hymnSuggestion?: {hymnId, confidence}}`. Pure extraction; doesn't write to DB.                                                                                            |
| `GET`    | `/api/specials/repeat-warnings`   | Query: `{songTitle?, hymnId?, performerIds?: number[], excludeSpecialId?}`. Returns `{songRepeat?: {specialId, date}, performerRepeats: {personId, specialId, date}[]}` based on the 8wk / 4wk windows.                                                                                    |

**Sub-services:**

- `server/services/youtube-extract.ts` (new) — wraps oEmbed (or YouTube Data API if a key is set) for metadata, plus `youtube-transcript` for captions. Calls Claude with two prompts: one for metadata→fields, one for transcript→hymn match. Returns the combined extraction.
- `server/services/specials-repeat.ts` (new) — pure SQL helpers for the 8wk song window and 4wk performer window.

---

## Phase 4 — Daily auto-rollover

**File:** `server/services/scheduler.ts` (existing).

Add a daily job:

```ts
// Every day at 03:00 local
db.update(schema.specialMusic)
  .set({status: 'needs_review', updatedAt: sql`(datetime('now'))`})
  .where(
    and(eq(schema.specialMusic.status, 'will_perform'), sql`${schema.specialMusic.date} < date('now', 'localtime')`),
  )
  .run()
```

Run once on server start as a safety net (covers downtime through a scheduled time).

---

## Phase 5 — Frontend API client + types

**File:** `src/lib/specials-api.ts` (new). Mirror `src/lib/api.ts` style.

Types: `Special`, `SpecialPerformer`, `SpecialServiceType`, `SpecialType`, `SpecialStatus`, `YoutubeExtraction`, `RepeatWarning`. Functions for every endpoint above.

---

## Phase 6 — Frontend pages and components

**Directory:** `src/pages/music/`

Three new pages, plus the existing hymn pages already there.

### `specials-list-page.tsx`

- Filter card: `SearchInput` (song/performer) + `Status` MultiSelect + `Service` MultiSelect + `Type` MultiSelect, persisted via `usePersistedState`.
- Sortable table columns: Date · Service · Song · Performers · Type · Status · YouTube · Sheet music.
- Default sort: `needs_review` pinned to top, then `will_perform`, then `performed` desc by date. Done either client-side (sort comparator that bands by status) or via `ORDER BY CASE status ... END, date DESC`.
- "+ New Special" button top-right → `/music/specials/new`.

### `special-detail-page.tsx`

Cards stacked top-to-bottom:

1. **Header card** — date, service, song, performers chip list, status badge with quick-action button:
   - `needs_review` → "Mark Reviewed" button.
   - Otherwise → "Edit" jumps to the edit form below.
2. **Media card** — YouTube embed when `youtubeUrl` set; otherwise a "Paste YouTube URL" input + "Auto-fill" button (calls `/api/specials/from-youtube`, applies suggestions to the edit form below). Sheet music: PDF/image preview when set; upload widget when not.
3. **Edit fields card** — inline form (no modal): date, service+label, song title, hymn picker, arranger, writer, type, occasion, performers picker, guest-performers chip input, notes. Save → PATCH. Cancel → reload.

### `special-new-page.tsx`

- Top: "Paste YouTube URL" helper card identical to the detail-page Media card behavior, but instead of patching, it pre-populates form state.
- Below: same edit form as the detail page.
- On save, POST then redirect to `/music/specials/:id`.

### Components (`src/components/specials/`)

- `hymn-picker.tsx` — typeahead querying `hymns.title`, `first_line`, `refrain_line`. Selecting a hymn fills `songTitle` (still editable).
- `performer-picker.tsx` — multi-select from `people` (using existing search infrastructure) with reorder + a separate guest-performer chip input.
- `service-select.tsx` — service type select; reveals `serviceLabel` text field when `other`.
- `repeat-warnings.tsx` — fetches `/api/specials/repeat-warnings` reactively as the form changes; renders soft alerts above Save.
- `sheet-music-upload.tsx` — base64 upload + preview (PDF iframe or `<img>` based on mime).
- `youtube-extract-card.tsx` — URL input + "Auto-fill" + result summary; emits an extraction object the parent applies to form state.

**Routing:** `src/App.tsx` — `/music/specials`, `/music/specials/new`, `/music/specials/:id`.

---

## Phase 7 — Cross-links

1. **Sidebar (`src/lib/nav-config.ts`):** add `{to: '/music/specials', label: 'Specials', icon: ...}` under the existing `music` group.
2. **Person detail page (`src/pages/person-detail-page.tsx`):** new "Specials performed" section listing this person's joined-via-junction specials. Each row links to the special's detail page.
3. **Hymn detail page (`src/pages/music/hymn-search-detail-page.tsx` or wherever a hymn's permalink lives — confirm during implementation):** new "Performances" section listing specials with `hymn_id = this.id`.

---

## Phase 8 — File migration (iCloud)

Runs only after Phase 1 + the rest of the feature is verified working under the default `UPLOADS_DIR`.

1. Stop launchd service.
2. Update launchd plist to set `UPLOADS_DIR=/Users/cgen01/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock`.
3. Create the iCloud directory + subfolders.
4. Copy `server/data/scan-images/*` → `$UPLOADS_DIR/scan-images/`.
5. Copy `server/data/nursery-logos/*` → `$UPLOADS_DIR/nursery-logos/`.
6. Restart launchd service. Verify nursery + scan images still load via `/uploads/...`.
7. After verification (a day or two of normal use), delete `server/data/scan-images/` and `server/data/nursery-logos/` from the repo working tree.

---

## Phase 9 — Polish

- Empty state on the list page.
- Toasts for create/update/mark-reviewed/delete (`sonner`).
- Confirm dialog for delete via existing `ConfirmDialog`.
- kbar entries: "Open Specials," "New Special."
- `pnpm lint` + `pnpm prettier`.

---

## Acceptance walkthrough

1. Navigate to **Music → Specials**. Empty list. Click **+ New Special**.
2. Paste a YouTube URL of a past performance. Click **Auto-fill**. The form populates: date (from upload date), song title (from video title), suggested type, performer name suggestions, hymn match if the lyrics matched.
3. Confirm performer matches (or override). Save. The Special is created with status `needs_review` (date is in the past).
4. Back on the list, the new Special is at the top (needs_review band). Click in.
5. On detail page, the YouTube embed renders. Upload a sheet music PDF — it previews inline. Click **Mark Reviewed** → status flips to `performed`.
6. Click **+ New Special** again. Pick a future Sunday AM. Status becomes `will_perform`. The form's repeat-warning panel notes "Sarah performed a special 2 weeks ago" because she's a recently-listed performer.
7. The next morning at 03:00, any `will_perform` records whose date is now past auto-roll to `needs_review`.
8. Open Sarah's Person detail page → "Specials performed" lists both records.
9. Open the matched hymn's detail page → "Performances" lists the linked Special.
10. Edit a `performed` Special and change its date to next month. Status auto-flips back to `will_perform`. Daily job re-rolls when that date passes.
