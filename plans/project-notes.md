# Project Notes — Implementation Plan

## Context

You want a Notion-style notes system inside Central Flock for ministry work: hierarchical folders, a rich block editor, an expandable-row tree table with drilldown, preview + edit modes, and eventually PDF export. Today's ministry prep (sermons, meetings, scripture study) lives outside the app — pulling it in keeps context in one place, matches the existing sub-app pattern (Devotions/People/Messages), and sets up the PDF pipeline for print-ready output later.

## Decisions Locked

- **Editor:** BlockNote (`@blocknote/react` + try `@blocknote/shadcn`, fall back to `@blocknote/mantine`)
- **Data model:** unified `notes_items` table with `type: 'folder' | 'note'` discriminator + self-referential `parent_id`
- **Images/attachments:** in v1 scope — stored under `data/notes-attachments/`
- **Nav:** new top-level "Notes" group in `src/lib/nav-config.ts` (icon: `NotebookText`)
- **Drilldown UX:** **expandable-row tree table** ([@tanstack/react-table](https://tanstack.com/table) with `getExpandedRowModel`) — chevron per folder row, nested sub-folders expand inline recursively. Matches the snippet you shared and the screenshot.
- **Title:** separate large Notion-style `<input>` above the BlockNote editor body (not an in-doc H1)
- **Root:** implicit — user lands on root children, no "root" row rendered
- **Global search:** out of scope for v1 — you'll implement KBar separately
- **Consistency:** reuse templates-page layout/primitives verbatim (`Card size="sm"`, `SearchInput`, `Pagination`, `Button`, `Checkbox`, `ConfirmDialog`, `formatDateTime`, `useDebouncedValue`, `useSetToggle`, `PageSpinner`, `Tooltip`, page wrapper `p-4 md:p-6 space-y-4`, heading `text-2xl font-bold`)

## New Dependencies

- `@tanstack/react-table` — tree table with expand state (peer-compatible with existing `@tanstack/react-query`)
- `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn` (spike) / `@blocknote/mantine` (fallback)
- `uuid` (for attachment filenames) — or use `crypto.randomUUID()` directly (already available in Node ≥14.17)
- `multer` — multipart file upload for attachments; alternative: hand-rolled busboy. Recommend `multer` — widely used, simple, disk storage engine handles files under `data/notes-attachments/` directly.

## Database

New file `server/db/schema-notes.ts`:

```ts
import {sql} from 'drizzle-orm'
import {type AnySQLiteColumn, index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const notesItems = sqliteTable(
  'notes_items',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    type: text('type', {enum: ['folder', 'note']}).notNull(),
    parentId: integer('parent_id').references((): AnySQLiteColumn => notesItems.id, {onDelete: 'cascade'}),
    title: text('title').notNull().default('Untitled'),
    contentJson: text('content_json'), // BlockNote Block[] as JSON; null for folders
    excerpt: text('excerpt'), // plain-text derived, for table rows
    icon: text('icon'), // optional emoji (future polish — nullable now)
    position: integer('position').notNull().default(0),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('notes_items_parent_idx').on(t.parentId), index('notes_items_type_idx').on(t.type)],
)

export const notesAttachments = sqliteTable('notes_attachments', {
  id: integer('id').primaryKey({autoIncrement: true}),
  noteId: integer('note_id')
    .notNull()
    .references(() => notesItems.id, {onDelete: 'cascade'}),
  fileName: text('file_name').notNull(), // original filename
  storagePath: text('storage_path').notNull(), // relative path under data/notes-attachments/
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
```

Re-export both from `server/db/schema.ts`. Follow your documented workflow: stop the launchd service → `pnpm db:generate` → `pnpm db:migrate` → restart.

## Backend

New file `server/routes/notes.ts`, mounted in `server/index.ts` after line 68: `app.use('/api/notes', notesRouter)`.

Endpoints:

- `GET /api/notes/tree` — flat list of all items sans `content_json` (just `id, type, parentId, title, excerpt, icon, position, updatedAt`). Client assembles tree for `@tanstack/react-table`. One query, small payload.
- `GET /api/notes/breadcrumb/:id` — ancestor chain (walked iteratively).
- `GET /api/notes/:id` — single item; includes `content_json` for notes.
- `POST /api/notes` — `{type, parentId, title}`.
- `PUT /api/notes/:id` — `{title?, contentJson?, icon?}`; server derives and stores `excerpt` from `contentJson`.
- `PATCH /api/notes/:id/move` — `{parentId, position}`.
- `POST /api/notes/delete` — bulk `{ids: number[]}` — with descendant-count preview (see Risks).
- `POST /api/notes/:id/attachments` — multipart upload (multer, 10MB limit per file), returns `{id, url}` for BlockNote to embed.
- `DELETE /api/notes/attachments/:id` — remove row + file.
- `POST /api/notes/attachments/sweep` — remove attachments whose URLs no longer appear in any `content_json`. Manual endpoint for v1.

Static-serve `data/notes-attachments/` via `express.static` in `server/index.ts` (match any existing `data/scan-images` pattern).

## Frontend

### Routes (added to `src/App.tsx`)

```
/notes                         → NotesPage             (single expandable tree table)
/notes/note/:noteId            → NoteDetailPage        (preview, read-only)
/notes/note/:noteId/edit       → NoteEditPage          (BlockNote editor)
```

No per-folder route. Drilldown is entirely in-table via row expansion — matches the snippet you shared. Sub-folders expand recursively. Clicking a note row navigates to `/notes/note/:id`.

### Sidebar entry (`src/lib/nav-config.ts`)

New top-level group "Notes" (icon: `NotebookText` from lucide) with a single child route `/notes`.

### NotesPage — the tree table

File: `src/pages/notes/notes-page.tsx`

Layout mirrors [templates-page.tsx](src/pages/templates-page.tsx) exactly:

- Page wrapper: `<div className="p-4 md:p-6 space-y-4">`
- Header: `<h2 className="text-2xl font-bold">Notes</h2>`
- Container: `<Card size="sm">` with `CardContent` for the toolbar (search + buttons)
- Toolbar: `SearchInput` (`useDebouncedValue` 250ms) + `Delete (N)` (when selection) + `New Folder` / `New Note` buttons
- Table wrapper: `<div className="overflow-x-auto border-t">`
- Footer: `CardContent` with `<Pagination>` — **paginates top-level rows only**. Expanded descendants render inline under their parent regardless of page.
- `ConfirmDialog` for bulk delete (shows descendant count).

Table structure (from the snippet you shared, adapted):

- Column 1: **expander** — chevron only on folder rows (`row.original.type === 'folder'`). Uses `row.toggleExpanded()`.
- Column 2: **Select** — `<Checkbox>` (bulk select).
- Column 3: **Name** — folder or note icon (lucide `Folder` / `FileText`) + title. Indentation applied via `row.depth * 20px` padding-left for visual hierarchy. Row click (away from buttons/expander/checkbox) navigates to preview for notes, or toggles expand for folders.
- Column 4: **Preview** — for note rows only, excerpt truncated (120 chars) with `Tooltip` showing more.
- Column 5: **Updated** — `formatDateTime(updatedAt)`.
- Column 6: **Actions** — `DropdownMenu` with Rename / Move… / Duplicate / Delete (+ Open for notes).

Tree build: fetch `/api/notes/tree`, build in-memory `Item[] with children: Item[]`, pass to `useReactTable` with `getSubRows: (row) => row.children`, `getCoreRowModel`, `getExpandedRowModel`. Expansion state persisted in `sessionStorage` keyed by `notes:expanded` so nav-away/back doesn't collapse the tree.

Search: filters in-memory — for each matching item, include its ancestor chain so the path remains visible (this is the standard tree-filter pattern). Debounced 250ms like templates.

Selection: uses `useSetToggle` + `useState<Set<number>>` exactly like templates. Bulk delete uses `ConfirmDialog` and shows descendant count.

### NoteDetailPage (preview)

File: `src/pages/notes/note-detail-page.tsx`

- Page wrapper same as above.
- Header row: `Breadcrumbs` (from `/breadcrumb/:id`) on the left; `Edit` / `Export PDF` (future, stub) / `Delete` buttons on the right.
- Body: large title (`text-3xl font-bold`) + `NotePreview` (read-only `BlockNoteView`, lazy-loaded).
- Full route (not panel/modal) — matches `DevotionDetailPage` pattern.

### NoteEditPage (editor)

File: `src/pages/notes/note-edit-page.tsx`

- Breadcrumbs + save-indicator (`Saving… / Saved 3s ago`).
- **Separate title `<input>`** — large, bold, unstyled-ish, Notion feel. Autosaves on blur + 1.5s debounce.
- `NoteEditor` (BlockNote, lazy-loaded) below the title. Autosaves `contentJson` + server-derived `excerpt` at 1.5s debounce.
- Flush pending save on route change / unmount.

### Components

- `src/components/notes/note-editor.tsx` — BlockNote instance, lazy-loaded. Wires the image upload handler to `POST /api/notes/:id/attachments`. Emits `{contentJson}` on change.
- `src/components/notes/note-preview.tsx` — read-only `BlockNoteView` (`editable={false}`), same lazy chunk.
- `src/components/notes/breadcrumbs.tsx` — simple chain, reads from `/breadcrumb/:id`.
- `src/components/notes/new-item-dialog.tsx` — Dialog with type picker (folder/note), title input, and a `parentId` SearchableSelect (defaults to currently-focused folder in the tree, or root).
- `src/components/notes/move-item-dialog.tsx` — Dialog for PATCH `/move`. Same folder picker.

### API + query keys

- `src/lib/notes-api.ts` — mirrors `gwendolyn-devotion-api.ts` shape (keeps notes types out of `src/lib/api.ts`).
- Additions to `src/lib/query-keys.ts`: `notesTree()`, `note(id)`, `notesBreadcrumb(id)`.
- Mutations invalidate `notesTree()` + relevant `note(id)`.

## UX Flow

1. `/notes` opens the expandable tree table — root children visible; folders show chevron.
2. Click chevron → expand folder inline; sub-folders show with their own chevrons, recursively.
3. Click a note row → navigate `/notes/note/:id` (preview).
4. Click **Edit** in preview → `/notes/note/:id/edit`.
5. Title edit (separate input) + body edit (BlockNote) → autosaves 1.5s.
6. Paste/drop image → uploads immediately → URL embedded in BlockNote JSON.
7. Bulk select via row checkboxes → `Delete (N)` → ConfirmDialog (with descendant count if folders in selection) → delete.

## Keyboard Shortcuts

Verified against `src/hooks/use-keyboard-shortcuts.ts` — existing: `⌘D` (toggle dark), `⌘,` (settings). Proposed additions (no collisions):

- `⌘⇧N` — New note (in current expanded/focused folder, else root). _Avoid bare `⌘N` — OS convention for "new window"._
- `⌘⇧F` — New folder.
- `⌘E` — Toggle edit/preview (on `/notes/note/:id(/edit)`).
- `Enter` — open focused row (note → preview; folder → toggle expand).
- `Space` — toggle expand on focused folder row.
- `Esc` — leave editor back to preview.

Register globally in `useKeyboardShortcuts` or a new notes-scoped hook (`useNotesShortcuts`) mounted in `NotesPage` / edit page. If you later add KBar (⌘K), these stay orthogonal.

## Image Handling (v1)

- BlockNote's built-in image block supports a custom upload handler.
- On paste/drop inside editor → `POST /api/notes/:id/attachments` → server writes `data/notes-attachments/<uuid>.<ext>`, inserts row, returns `{id, url}` → BlockNote embeds the URL.
- Cascade: deleting a note cascades the `notes_attachments` rows; a small after-hook in the DELETE route removes the files on disk (cheap since IDs are returned from the cascade).
- Max size: 10MB per file (current body limit is 20MB — headroom preserved). Reject non-image MIME on the server.
- Orphaned images (removed from the doc but file still on disk): `POST /api/notes/attachments/sweep` for manual cleanup. Run on demand; cron-ify later if needed.

## Delivery Milestones

- **M1 — Skeleton (no rich editor, no images).** Schema + migration, backend endpoints (minus attachments), `@tanstack/react-table` tree with expand/select/search/pagination, `NotesPage`, `NoteDetailPage` + `NoteEditPage` with plain `<Textarea>` placeholder. Proves data model + tree UX end-to-end.
- **M2 — BlockNote + images.** Swap editor + preview components (lazy-loaded), wire attachment upload, autosave, excerpt derivation. Also the `@blocknote/shadcn` theming spike — fall back to `@blocknote/mantine` if it fights Tailwind 4.
- **M3 — Polish.** Move-to-folder dialog, duplicate (folder-recursive), keyboard shortcuts, empty states, folder child counts in rows, icon picker.
- **M4 — PDF export.** `POST /api/notes/:id/export-pdf` → BlockNote's `blocksToHTMLLossy()` → Puppeteer headless render → download. Print stylesheet.

## Key Risks

1. **BlockNote × React 19 × Tailwind 4** — pin BlockNote version; run the `@blocknote/shadcn` spike first thing in M2 (≈30 min). Fall back path: `@blocknote/mantine` + themed container.
2. **Bundle size (~400KB gz)** — isolate via `React.lazy()` on `NoteEditor` + `NotePreview`; tree table view stays lean.
3. **Cascade-delete irrecoverability** — mitigate by showing descendant count in ConfirmDialog: recursive walk of the in-memory tree is O(N) on a small dataset. Soft-delete/trash deferred.
4. **Attachment orphans** — files on disk linger if the user deletes an image block. Mitigated by the sweep endpoint; acceptable cruft for v1.
5. **Tree filter UX during search** — ancestors-included filter can produce wide matches; debounce + visual indentation keeps it readable.
6. **Expansion persistence** — session-scope via `sessionStorage` (not local) so stale expansion doesn't haunt you across days; user can re-expand quickly.

## Critical Files

- **New:** `server/db/schema-notes.ts`, `server/routes/notes.ts`, `server/db/migrations/<next>_notes.sql` (generated)
- **New:** `src/pages/notes/notes-page.tsx`, `note-detail-page.tsx`, `note-edit-page.tsx`
- **New:** `src/components/notes/note-editor.tsx`, `note-preview.tsx`, `breadcrumbs.tsx`, `new-item-dialog.tsx`, `move-item-dialog.tsx`
- **New:** `src/lib/notes-api.ts`, `src/hooks/use-notes-shortcuts.ts`
- **Modified:** `server/db/schema.ts` (re-export), `server/index.ts` (route mount + static serve `data/notes-attachments` + multer), `src/App.tsx` (3 routes), `src/lib/nav-config.ts` (sidebar group), `src/lib/query-keys.ts` (3 keys)

## Verification Plan

- **DB:** stop launchd service → `pnpm db:generate && pnpm db:migrate` → restart → `pnpm db:studio` to confirm tables + FKs.
- **Routes:** `curl` each endpoint after restart — create folder, nested folder, note in nested folder, fetch tree, breadcrumb, update content, upload image, delete folder, sweep attachments.
- **Frontend (M1):** Sidebar "Notes" entry routes to `/notes`. Create folder → create sub-folder → create note inside → chevron expands correctly, sub-folders nest, row click on note navigates to preview. Bulk select parent folder → descendant count in dialog → delete → all rows gone. Search finds deeply-nested items and keeps ancestors visible. Pagination only affects root rows.
- **Frontend (M2):** Type in editor → wait 1.5s → refresh → content persists. Paste an image → uploads, URL resolves, renders in preview and editor. Delete note → image file removed from disk.
- **Lint:** `pnpm eslint && pnpm prettier --write .` per your workflow rule.
- **Bundle:** `pnpm build`, verify notes chunk is code-split (check `dist/assets/` for a `note-editor-*.js` chunk distinct from main).

Per your workflow rules: don't run `pnpm dev` manually; launchd owns the service. Stop service before DB migration, restart after. Save this plan under `central-flock/plans/project-notes.md` for Typora review after approval (plan mode initially wrote it to `~/.claude/plans/` — will move on exit).
