# Gwendolyn's Devotions — Sub-feature of Devotion Tracker

> **Note:** Per user preference (memory), this plan will be saved to
> `central-flock/plans/gwendolyns-devotions.md` and opened in Typora as the very
> first step of execution.

## Context

Tyler receives a weekly devotional from Gwendolyn in a fixed format — TITLE, date
(M-D-YY), three talking points prefixed with `📚`, one scripture block prefixed
with `📖`, and a closing tagline (`—Passing the truth along`). He then reformats
it into his own social-media style: content-only paragraphs with the scripture
quote inline, his version of the tagline (`— Passing the truth along`), a fixed
`#Faith #God #Prayer` prefix, and 10–15 AI-generated topical hashtags. Today
this is all manual.

This feature adds a new section under the existing **Devotions** nav group
where Tyler can paste Gwendolyn's raw text, review the parsed fields (AI-assisted),
save, and get back his formatted version with multiple copy modes and a
lightweight workflow status so he can track what still needs to be produced.

## Locked-in decisions (confirmed with user)

| Decision             | Choice                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Storage              | Reuse existing `devotions.db` — new table `gwendolynDevotions`                                                                                                                                                                                                     |
| Nav                  | New child under existing **Devotions** group: `/devotions/gwendolyn` with `Smartphone` icon from lucide-react                                                                                                                                                      |
| Input flow           | Paste raw text → click **Parse** → review/tweak parsed blocks → **Save**                                                                                                                                                                                           |
| Parsing              | **Code-based regex parse** (split on `📚` / `📖` markers, preserve order) for structured content + **separate Claude call** for hashtags only. One user-facing Parse action; two focused server operations. Deterministic content parse, AI only where it belongs. |
| Data shape           | **Ordered `blocks` array** of `{type: 'point' \| 'scripture', text, reference?}` — supports any order, any count of points/scriptures, any mix                                                                                                                     |
| Copy modes           | Three modes: **per-block inline copy icons** (next to each point/scripture — "each line separately"), **Copy title**, **Copy full + hashtags**                                                                                                                     |
| Hashtags             | Auto-generated on create (AI call at Parse-time), **Regenerate** button on detail page, freely editable textarea                                                                                                                                                   |
| Fixed hashtag prefix | `#Faith #God #Prayer` always prepended (de-duped if the AI also returns them)                                                                                                                                                                                      |
| Workflow statuses    | `received` → `producing` → `waiting_for_approval` → `ready_to_upload` → `done` (user-settable dropdown + list filter)                                                                                                                                              |
| Display              | `📚` and `📖` emojis shown in the UI near each block, **stripped** from all copy output                                                                                                                                                                            |
| Tagline              | Always `— Passing the truth along` (user's form; Gwendolyn's variant is stripped)                                                                                                                                                                                  |

## Architecture

```
Paste Gwendolyn's raw text
          │
          ▼
  POST /api/gwendolyn-devotions/parse      (no persistence)
          │
          ├──▶ server/services/gwendolyn-parse.ts          (deterministic, regex-based)
          │       • Extract title (line 1)
          │       • Extract date (line 2, M-D-YY → YYYY-MM-DD)
          │       • Walk remaining text, split on 📚 / 📖 markers
          │       • Emit ordered blocks[] preserving source order
          │       • Strip emojis + Gwendolyn's tagline
          │
          └──▶ server/services/gwendolyn-hashtags.ts       (Anthropic SDK)
                  • getConfiguredModel() — shared setting
                  • System prompt: user's verbatim hashtag instructions
                  • Returns 10–15 hashtags, excludes Faith/God/Prayer
          │
          ▼
  Combined response: {title, date, blocks[], hashtags}
          │
          ▼
  Preview in the UI (editable) → Save → POST /api/gwendolyn-devotions
          │
          ▼
  devotions.db / gwendolyn_devotions table
          │
          ▼
  List · detail/edit · status dropdown · per-block copy · copy title · copy full
```

## Database — `server/db-devotions/schema.ts`

Add one table. Use the same style as the existing `devotions` table.

```ts
export const gwendolynDevotions = sqliteTable('gwendolyn_devotions', {
  id: integer('id').primaryKey({autoIncrement: true}),
  date: text('date').notNull(), // ISO YYYY-MM-DD
  title: text('title').notNull(),
  blocks: text('blocks').notNull(), // JSON: Block[] — see shape below
  hashtags: text('hashtags').notNull().default(''), // space-separated single string
  rawInput: text('raw_input'), // original paste, kept for re-parse
  status: text('status', {
    enum: ['received', 'producing', 'waiting_for_approval', 'ready_to_upload', 'done'],
  })
    .notNull()
    .default('received'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
```

**Block shape** (serialized as JSON in `blocks`):

```ts
type Block = {type: 'point'; text: string} | {type: 'scripture'; text: string; reference: string}
```

Order is preserved as sent by Gwendolyn. No fixed count — could be 3 points + 1 scripture,
2 points + 2 scriptures, scripture-first, etc. Editing UI allows add / remove / reorder.

**Migration**: `pnpm db:devotions:generate` then `pnpm db:devotions:migrate`
(commands confirmed present in `package.json`).

## Backend

### New service — `server/services/gwendolyn-parse.ts` (deterministic, no AI)

```ts
export type Block = {type: 'point'; text: string} | {type: 'scripture'; text: string; reference: string}

export interface ParsedDevotional {
  title: string
  date: string // YYYY-MM-DD
  blocks: Block[]
  rawInput: string
}

export function parseDevotional(rawText: string): ParsedDevotional
```

Algorithm:

1. Split input into lines; trim trailing whitespace on each.
2. Drop leading blank lines. Take the first non-blank line as `title`.
3. Take the next non-blank line as the date. Parse `M-D-YY` (and `MM-DD-YYYY`, `M/D/YY`, etc.) → ISO.
4. For the rest of the text, scan for `📚` and `📖` markers.
   - A `📚` marker starts a **point** block — its text runs until the next marker or end.
   - A `📖` marker starts a **scripture** block — its text (the quote) runs until the next marker or end, then the trailing line of that block is treated as the reference (if the last line matches a Bible-reference pattern `^[A-Za-z0-9 ]+\s+\d+:\d+`). If no reference line is found, `reference = ''` and the UI flags it for user fix.
5. For each block, strip the leading emoji, strip surrounding whitespace, and strip Gwendolyn's tagline line if present at the end (`—?Passing the truth along`, with or without space after the dash).
6. Preserve source order across all blocks (points and scriptures interleave however she sent them).

No Anthropic dependency in this file. Pure text processing — easy to unit test.

### New service — `server/services/gwendolyn-hashtags.ts` (AI, focused)

```ts
export async function generateHashtags(deriveText: string): Promise<string>
```

- Uses the Anthropic SDK + `getConfiguredModel()` (same pattern as
  `server/services/devotion-generation.ts:35`).
- System prompt is the user's verbatim instruction:
  > You are a social media expert. I will give you a post. Generate some social
  > media hashtags to go along with it. Only return the hashtags. Exclude
  > "Faith", "God", and "Prayer". Only return 10-15 hashtags.
- `deriveText` is built from the parsed blocks (all point texts + scripture quotes
  joined with blank lines — the actual devotional content, without the title/date/emojis).
- Returns a space-separated string of hashtags (already `#`-prefixed).
- No prompt-caching needed (short one-off calls).

### New router — `server/routes/gwendolyn-devotions.ts`

Mount in `server/index.ts` alongside `/api/devotions`:

```ts
app.use('/api/gwendolyn-devotions', gwendolynDevotionsRouter)
```

Routes:

- `GET  /` — list (query: `search`, `status`, `page`, `limit`, `sort`, `sortDir`) → `{data, total, page, limit}`
- `GET  /:id` — single
- `POST /parse` — body `{rawText}` → runs `parseDevotional()` **and** `generateHashtags()`
  in parallel (`Promise.all`), returns `{title, date, blocks, hashtags, rawInput}` —
  no DB write. Hashtag failure is non-fatal — returns empty hashtags with a warning
  field the UI can surface.
- `POST /` — body: full structured record (title, date, blocks, hashtags, rawInput, status) → insert → 201
- `PUT  /:id` — update editable fields
- `PATCH /:id/status` — body `{status}`
- `POST /:id/regenerate-hashtags` — re-run `generateHashtags()` using the saved blocks; returns new hashtag string (caller persists via PUT or we auto-persist — tbd, will pick auto-persist for simplicity)
- `DELETE /:id`

Use `asyncHandler` from `server/lib/route-helpers.ts` like existing routes.

## Frontend

### API client — `src/lib/gwendolyn-devotion-api.ts`

Follow `src/lib/devotion-api.ts` shape.

```ts
export type DevotionalBlock = {type: 'point'; text: string} | {type: 'scripture'; text: string; reference: string}

export type GwendolynStatus = 'received' | 'producing' | 'waiting_for_approval' | 'ready_to_upload' | 'done'

export interface GwendolynDevotional {
  id: number
  date: string
  title: string
  blocks: DevotionalBlock[] // parsed from stored JSON on read
  hashtags: string
  rawInput?: string | null
  status: GwendolynStatus
  createdAt: string
  updatedAt: string
}

// CRUD (same request<T>() helper as other api files)
export function fetchGwendolynDevotionals(
  params?,
): Promise<{data: GwendolynDevotional[]; total: number; page: number; limit: number}>
export function fetchGwendolynDevotional(id: number): Promise<GwendolynDevotional>
export function parseGwendolynDevotional(rawText: string): Promise<{
  title: string
  date: string
  blocks: DevotionalBlock[]
  hashtags: string
  rawInput: string
  warning?: string
}>
export function createGwendolynDevotional(
  data: Omit<GwendolynDevotional, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<GwendolynDevotional>
export function updateGwendolynDevotional(id: number, data: Partial<GwendolynDevotional>): Promise<GwendolynDevotional>
export function updateGwendolynStatus(id: number, status: GwendolynStatus): Promise<GwendolynDevotional>
export function regenerateGwendolynHashtags(id: number): Promise<{hashtags: string}>
export function deleteGwendolynDevotional(id: number): Promise<void>

// Copy-text builders — operate on the ordered blocks array, so any shape works
export function buildBlockText(block: DevotionalBlock): string
// • point:     block.text
// • scripture: `"${block.text}" ${block.reference}`.trim()   (drops trailing space if no reference)
// • NEVER includes the 📚 / 📖 emojis

export function buildCopyContent(d: GwendolynDevotional): string
// join each block's buildBlockText() with '\n\n', append '\n\n— Passing the truth along\n\n' + buildCopyHashtags(d)

export function buildCopyTitle(d: GwendolynDevotional): string
// just d.title (trimmed), no extra whitespace

export function buildCopyHashtags(d: GwendolynDevotional): string
// '#Faith #God #Prayer ' prefix + d.hashtags, with de-dup of #Faith/#God/#Prayer if the AI returned them too (case-insensitive)
```

**Copy shape (full = `buildCopyContent`):**

```
<block 1 text>

<block 2 text>

<block 3 text>

…any number of additional blocks in original order…

— Passing the truth along

#Faith #God #Prayer #Honor #Worship …
```

With three scriptures and two points, for example, each sits in its own slot exactly where Gwendolyn placed it. No hard-coded structure.

### Query keys — `src/lib/query-keys.ts`

```ts
gwendolynDevotions: (search?: string) => …
gwendolynDevotional: (id: number) => …
```

### Routes — `src/App.tsx`

```tsx
<Route path="/devotions/gwendolyn" element={<GwendolynListPage />} />
<Route path="/devotions/gwendolyn/new" element={<GwendolynNewPage />} />
<Route path="/devotions/gwendolyn/:id" element={<GwendolynDetailPage />} />
```

### Nav — `src/lib/nav-config.ts`

Add a child to the `devotions` group (feature is part of devotions, not its own top-level tool):

```ts
import {Smartphone} from 'lucide-react'
…
{to: '/devotions/gwendolyn', label: 'Gwendolyn', icon: Smartphone}
```

### Pages (under `src/pages/devotions/`)

1. **`gwendolyn-list-page.tsx`** — modeled on `devotion-list-page.tsx`:
   - Columns: Date · Title · Status (badge, 5 variants) · Created · Actions (copy dropdown + trash)
   - `SearchInput` by title, `Select` for status filter (`all` / each of 5 statuses)
   - `usePersistedState` for search/filter/sort, `useDebouncedValue` for search
   - `Pagination` component
   - Click row → `/devotions/gwendolyn/:id`
   - Header "+ New" button → `/devotions/gwendolyn/new`
   - Row copy dropdown: "Copy title", "Copy full + hashtags" (per-block copy lives on detail page only — too granular for a list row)

2. **`gwendolyn-new-page.tsx`** — paste-preview-save:
   - Stage 1: Big `<Textarea>` + **Parse** button. Click calls `parseGwendolynDevotional()` (server regex parse + AI hashtags in parallel).
   - While loading: `InlineSpinner` on the Parse button, button disabled.
   - Stage 2 (on success): `<GwendolynDevotionalForm>` renders with parsed values as `initial`. User can tweak anything, then **Save** → `createGwendolynDevotional()` → navigate to `/devotions/gwendolyn/:id`. **Cancel** → `/devotions/gwendolyn`.

3. **`gwendolyn-detail-page.tsx`** — view / edit:
   - Header: Title (big) · Date · Status dropdown · action buttons (Edit, Delete)
   - **Read view** renders each block stacked vertically:
     - `📚` or `📖` icon in the gutter/left-margin (decorative only, styled with `text-muted-foreground`)
     - The block's text (for scripture: quote in quotes + reference on the right or below)
     - A small inline **Copy** icon (`Copy` from lucide-react) that copies `buildBlockText(block)` — per-block "each line separately"
     - Tagline `— Passing the truth along` rendered in italic after the last block
     - Hashtags box (muted bg) below
   - **Two prominent buttons at top of detail view:**
     - **Copy title** → `buildCopyTitle(d)`
     - **Copy full + hashtags** → `buildCopyContent(d)` (includes tagline + hashtags)
     - Each calls `navigator.clipboard.writeText(...)` then `toast.success('… copied')`.
     - `📚`/`📖` never appear in any copied string (enforced by `buildBlockText` / `buildCopyContent`).
   - **Regenerate hashtags** button near the hashtags box → calls `regenerateGwendolynHashtags(id)`, auto-persists, shows toast.
   - **Status dropdown** on the right — optimistic update, fires `PATCH /:id/status`, refetches on error.
   - **Edit mode**: same `<GwendolynDevotionalForm>` as the New page (switches in place). Save updates, Cancel discards.
   - **Delete**: `ConfirmDialog` → `DELETE /:id` → navigate to list.

### Shared form component — `src/pages/devotions/gwendolyn-devotional-form.tsx`

Used by the New page (post-Parse) and the Edit mode of the Detail page.
Props: `initial`, `onSubmit`, `submitLabel`, `submitting`.

Form fields:

- **Title** — `Input`
- **Date** — native `<input type="date">` (matches existing simple pattern)
- **Blocks editor** (the core):
  - Renders each block as a row with:
    - A `Select` for block type (`Point 📚` / `Scripture 📖`) — lets user fix parser mistakes
    - A `Textarea` for the block text
    - For scripture blocks only: an extra `Input` for the reference
    - `↑` / `↓` reorder buttons (click-based, no drag-and-drop for v1 — simpler)
    - `Trash` button to remove the block
  - Below the list: `+ Add point`, `+ Add scripture` buttons (append at end)
- **Hashtags** — `Textarea` (freely editable), with a **Regenerate** button (only shown in edit mode — on the New page, hashtags are already generated by Parse)
- **Status** (edit mode only) — `Select` with 5 options

Validation on submit:

- Title non-empty
- Date valid ISO
- At least 1 block
- Each point block has non-empty `text`
- Each scripture block has non-empty `text`; `reference` may be empty but UI shows a muted warning so the user knows the copy output will miss a reference line

## Files to Create

- `server/services/gwendolyn-parse.ts` — deterministic regex parser (no AI)
- `server/services/gwendolyn-hashtags.ts` — Anthropic call, hashtags only
- `server/routes/gwendolyn-devotions.ts`
- `src/lib/gwendolyn-devotion-api.ts`
- `src/pages/devotions/gwendolyn-list-page.tsx`
- `src/pages/devotions/gwendolyn-new-page.tsx`
- `src/pages/devotions/gwendolyn-detail-page.tsx`
- `src/pages/devotions/gwendolyn-devotional-form.tsx`

## Files to Modify

- `server/db-devotions/schema.ts` — add `gwendolynDevotions` table
- `server/index.ts` — import and mount `gwendolynDevotionsRouter`
- `src/App.tsx` — add 3 routes + imports
- `src/lib/nav-config.ts` — add child to `devotions` group
- `src/lib/query-keys.ts` — add 2 keys

## Existing utilities / patterns being reused

- `request<T>()` + `buildQueryString()` — `src/lib/api.ts`
- `asyncHandler` + error shape — `server/lib/route-helpers.ts`
- `getConfiguredModel()` + Anthropic client pattern — `server/services/devotion-generation.ts:35`, `:139`
- `formatDate()` — `src/lib/date.ts`
- `usePersistedState`, `useDebouncedValue` — `src/hooks/`
- UI primitives — `Table`, `SearchInput`, `Pagination`, `Select`, `Button`, `Input`, `Textarea`, `Card`, `Badge`, `ConfirmDialog`, `Dialog`, `DropdownMenu`, `InlineSpinner`, `PageSpinner`
- `toast` from `sonner`
- Clipboard pattern: `navigator.clipboard.writeText(…).then(() => toast.success(…))` — `src/pages/devotions/devotion-list-page.tsx:76`

## Verification

1. **Schema migration**
   - `pnpm db:devotions:generate` → inspect generated SQL diff
   - `pnpm db:devotions:migrate` → table appears in `devotions.db`

2. **Parse service — standalone sanity**
   - Paste the `HONORED BY GOD` sample verbatim; confirm:
     - `title = "HONORED BY GOD"` (case preserved; user can edit in the form)
     - `date = "2026-04-19"` (parsed from `4-19-26`)
     - `blocks.length === 4`, in order:
       1. `{type: 'point', text: 'One great Biblical truth is that if we honor God, He will honor us. (hb)'}`
       2. `{type: 'point', text: 'God is not pleased if we praise Him only at church but not at home or at our workplace.'}`
       3. `{type: 'point', text: 'He expects us to honor Him everywhere with our words and with our actions.'}`
       4. `{type: 'scripture', text: '…the LORD saith… for them that honour me I will honour…', reference: '1 Samuel 2:30'}`
     - No `📚` / `📖` in any block's text
     - Gwendolyn's tagline is not in any block
   - Paste a **variant** with 2 points + 2 scriptures interleaved (scripture, point, scripture, point) → confirm order preserved and both scriptures land as `type: 'scripture'` with their references.
   - Paste a variant with scripture-first (no initial point) → confirm no crash, first block is `scripture`.

3. **Hashtag service**
   - Call with the parsed content; confirm ~10–15 hashtags returned, none being `#Faith`/`#God`/`#Prayer` (case-insensitive exclusion).

4. **UI end-to-end**
   - New page: paste → Parse → review (all 4 blocks appear) → Save → redirects to detail
   - Detail page:
     - **Copy title** — clipboard has just the title
     - **Copy full + hashtags** — clipboard matches expected layout (blocks in original order, tagline, hashtags with `#Faith #God #Prayer` prefix), no emojis
     - **Per-block copy icon** on a point — clipboard has just that point's text, no emoji
     - **Per-block copy icon** on a scripture — clipboard has `"quote" Reference`, no emoji
   - Edit mode: change block order, change a block's type (point ↔ scripture), add a new block, remove a block, save — all round-trip correctly
   - Change status through all 5 values — badge colors differ, list filter picks each up
   - Regenerate hashtags → new set, prefix still present, still editable
   - Delete → confirmation → row gone from list

5. **Quality gates**
   - `pnpm eslint` clean
   - `pnpm prettier` clean
   - `pnpm build` (TS strict, both `tsconfig.app.json` and `tsconfig.server.json`) passes

6. **Service check**
   - Visit `/devotions/gwendolyn` in the running launchd-served app and sanity-check the whole flow (do not start `pnpm dev` — per memory).

## Out of scope (flagged for future, not doing now)

- Auto-import from email / iMessage (manual paste only for v1)
- Scheduled social posting
- OCR from handwritten copies (already a separate TODO on the Devotion Tracker)
- Drag-and-drop reorder of blocks (click-based `↑`/`↓` for v1)

## First execution step

Before any code changes: copy this plan to `central-flock/plans/gwendolyns-devotions.md` and open it in Typora for reference during implementation (per user's saved preference).
