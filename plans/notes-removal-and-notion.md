# Remove Notes Tool & Add Notion Integration

## Context

You want to:

1. Fully remove the in-app notes tool (BlockNote editor, DB tables, attachments folder, deps).
2. Move ministry notes into Notion with a better structure — suggestions provided below.
3. Add a Notion-backed, read-only notes browser to the app: folder tree, page preview, full-text search, and a deep-link button that opens the page in the native Notion app (macOS/iOS) or web.

Motivation: the in-app editor is hard to maintain and duplicates Notion. Consolidating in Notion reduces app surface area, and a thin in-app browser keeps notes a click away while leaving editing to the tool that does it best.

> **Note on plan location:** Per your saved preference, plans live in `central-flock/plans/`. The harness required me to write to `~/.claude/plans/` for plan mode; once you approve, I'll copy this file to `central-flock/plans/notes-removal-and-notion.md` so you can open it in Typora.

---

## Phase 1 — Remove the notes tool

### Files to delete

- `src/pages/notes/` (4 files: notes-layout, notes-page, note-edit-page, note-detail-page)
- `src/components/notes/` (6 files: note-editor, notes-sidebar, breadcrumbs, new-item-dialog, move-item-dialog, note-preview)
- `src/lib/notes-api.ts`
- `src/lib/note-to-html.ts`
- `src/lib/search/providers/notes.ts`
- `server/routes/notes.ts`
- `server/db/schema-notes.ts`
- `data/notes-attachments/` (after confirming you don't need any uploaded images)

### Files to edit

- `src/App.tsx` — remove notes imports + routes (currently dirty in git)
- `src/lib/nav-config.ts` — remove the Notes NavGroup (currently dirty in git)
- `src/lib/query-keys.ts` — drop `notesTree`, `note(id)`, `notesBreadcrumb(id)`
- `src/lib/search/providers/index.ts` — remove `notesProvider` import and array entry
- `server/db/schema.ts` — remove `export * from './schema-notes.js'`
- `server/index.ts` — remove `notesRouter` import, `app.use('/api/notes', ...)`, and the `/data/notes-attachments` static handler

### Dependencies

Remove from `package.json` (only used by notes — confirmed via grep):

- `@blocknote/core`
- `@blocknote/react`
- `@blocknote/shadcn`
- `multer` (and `@types/multer` if present)

Then `pnpm install` to update the lockfile.

### Database migration

Drizzle generates migrations by diffing the schema files, so the right flow is:

1. Delete `server/db/schema-notes.ts` and remove its export from `schema.ts`.
2. Run `pnpm db:generate` — drizzle-kit emits a new `0006_*.sql` containing `DROP TABLE notes_attachments` and `DROP TABLE notes_items`.
3. Stop the launchd service (per your saved guidance about service-before-migrations).
4. Run `pnpm db:migrate`.
5. Restart the service.

### Verification

- `pnpm lint` (eslint + both tsconfigs) passes
- `grep -ri "\bnote" src/ server/` returns only unrelated user-facing copy (e.g., the word "note" in other features), no imports
- App boots; nav has no Notes entry; `/notes` URL renders the 404 fallback
- `pnpm db:studio` shows no `notes_items` or `notes_attachments` tables

---

## Phase 2 — Notion organization suggestions for ministry notes

I can't create pages in your Notion programmatically (no token yet), so this is a manual setup. Once it exists, share the **root** page with the integration and the descendants come along for free.

### Suggested tree

```
📖 Ministry  ← root page; share this with the integration
├── 🎤 Sermons              (Notion database)
│   • Properties: Date, Series, Passage (text), Status (Draft/Ready/Delivered), Tags (multi-select)
│   • Template "Sermon Prep": Big Idea · Outline · Application · Illustrations · References
├── 📚 Bible Studies        (Notion database)
│   • Properties: Book, Passage, Date, Series, Audience
│   • Template "Study Notes": Context · Key Verses · Discussion Qs · Application
├── 🙏 Devotions            (page → child pages by date)
├── 🤝 Counseling & Prayer  (page → one subpage per person/situation)
├── 🏛️  Admin & Meetings    (page → meeting notes by date)
└── 📓 Journal              (page → daily/weekly reflection pages)
```

### Why this shape

- **Databases** for things with metadata you'll want to filter/sort (sermons by series, studies by book).
- **Plain page trees** for chronological content (devotions, meetings) where date is the only axis.
- **One root page** = one share target — minimal token-permission surface.
- Emojis in titles double as page icons, which the in-app sidebar can render with no extra work.

### Optional bootstrap

Once you have the integration token, I can add a one-time `pnpm notion:bootstrap` script that creates this tree (root + databases + property schemas + templates) for you. Decide after the integration is wired up.

---

## Phase 3 — Notion integration (backend)

### Env vars (launchd plist)

- `NOTION_API_TOKEN` — internal integration token from notion.so/my-integrations
- `NOTION_ROOT_PAGE_ID` — UUID of the "Ministry" root page

Both are read at boot; if either is missing, the route handlers respond 503 with a clear "configure Notion" message and the nav entry hides itself (graceful degrade).

### New files

- **`server/services/notion.ts`** — wraps `@notionhq/client` (`getPage`, `getPageBlocks`, `getChildPages`, `search`). Adds simple rate-limit pacing (Notion caps ~3 req/s).
- **`server/services/notion-sync.ts`** — recursive walker from `NOTION_ROOT_PAGE_ID`, upserts into `notion_pages`, deletes orphans. Skips unchanged subtrees by comparing `last_edited_time`. Triggered on: server start, 5-min interval, explicit POST.
- **`server/routes/notion.ts`** — Express router protected by the existing `requireAuth` middleware:
  - `GET /api/notion/tree` — full cached tree from local DB
  - `GET /api/notion/page/:id` — cached metadata + live-fetched block content
  - `GET /api/notion/search?q=...` — title FTS5 search against local cache
  - `POST /api/notion/sync` — fire-and-forget manual resync; returns the run id
- **`server/db/schema-notion.ts`** — Drizzle table `notion_pages` (id PK as Notion UUID, parentId, title, icon, lastEditedTime, syncedAt, isFolder) + FTS5 virtual table `notion_pages_fts` over title. Index on `parent_id`.

### Server wiring

- `server/index.ts`: register `notionRouter`, schedule the sync interval, kick off an initial sync on boot.

### Dependencies to add

- `@notionhq/client` — official Notion SDK
- (Frontend, listed here for completeness) `react-notion-x` for read-only block rendering

---

## Phase 4 — Notion integration (frontend)

### New files

- `src/lib/notion-api.ts` — typed helpers: `fetchNotionTree`, `fetchNotionPage(id)`, `searchNotion(q)`, `triggerNotionSync()`
- `src/pages/notion/notion-layout.tsx` — sidebar + detail layout (mirrors removed notes-layout)
- `src/pages/notion/notion-page.tsx` — empty state
- `src/pages/notion/notion-detail-page.tsx` — preview using `react-notion-x` (read-only); two action buttons:
  - **Open in Notion** → `notion://www.notion.so/<id>` (opens native app on macOS/iOS, silent no-op in browsers without the protocol — that's why we always render the second button alongside)
  - **Open in browser** → `https://notion.so/<id>`
- `src/components/notion/notion-sidebar.tsx` — tree from cached data, filter input, "Synced X ago" indicator, manual refresh button
- `src/lib/search/providers/notion.ts` — command palette provider hitting `/api/notion/search`

### Edits

- `src/App.tsx` — add `/notion` routes
- `src/lib/nav-config.ts` — add Notion nav group
- `src/lib/query-keys.ts` — add `notionTree`, `notionPage(id)`, `notionSearch(q)`
- `src/lib/search/providers/index.ts` — register `notionProvider`

### Caching behavior (answers your question)

The hybrid approach feels stale only if it doesn't auto-refresh. We make it not feel stale:

- React Query tree query: `staleTime: 60_000`, `refetchOnMount: 'always'`, `refetchOnWindowFocus: true` → cached tree paints instantly, a background fetch hits the local API, and (because the server also kicked off a sync on the request path or on its 5-min interval) the UI updates within ~1–2s if anything changed in Notion.
- Server-side: 5-min interval sync + sync-on-boot. The route handler can also opportunistically trigger a sync if `now - syncedAt > 5min` so navigating to the section guarantees a fresh fetch.
- Sidebar shows "Synced 2m ago · ↻ Refresh" so you can always force it.
- Page content (blocks): `staleTime: 5min`; refetched when you re-open a page after a gap.

Net effect: you won't see stale titles in normal use — the only window for staleness is the 1–2 seconds between opening the section and the background fetch landing, and that only matters if you renamed something in Notion seconds before switching apps.

---

## Critical files (touched across phases)

- `src/App.tsx` · `src/lib/nav-config.ts` · `src/lib/query-keys.ts` · `src/lib/search/providers/index.ts`
- `server/index.ts` · `server/db/schema.ts`
- `package.json` (deps in/out)
- launchd plist (new `NOTION_API_TOKEN`, `NOTION_ROOT_PAGE_ID`)

---

## Verification

**After Phase 1:**

- `pnpm lint` clean
- launchd restart; nav has no Notes; `/notes` 404
- `pnpm db:studio` shows neither notes table

**After Phase 3:**

- `curl -H "X-API-Key: …" localhost:5172/api/notion/tree` → Ministry subtree
- `curl …/api/notion/page/<id>` → blocks JSON
- `curl …/api/notion/search?q=sermon` → matching titles

**After Phase 4:**

- Nav has "Notion"; tree paints instantly from cache, "Synced X ago" indicator visible
- Click a page → blocks render via `react-notion-x`
- "Open in Notion" opens the native macOS app; "Open in browser" opens notion.so in a new tab
- Cmd-K palette finds pages by title
- End-to-end: rename a page in Notion → within ~5 min (or after ↻) the new title appears in the app
