# Global Command Palette (kbar) for Central Flock

## Context

Central Flock is growing fast — 5 sub-apps now (messaging, devotions, sermon prep, nursery, **notes**) with ~21 user-visible entities including the new `notes_items` tree (folders + notes, unified table at [server/db/schema-notes.ts](server/db/schema-notes.ts)). Jumping to a specific person, devotion, quote, hymn, or note currently requires navigating to the right page and using its local search. A global command palette, invoked from anywhere via keyboard, will make navigation and fuzzy finding across all entities one keystroke away, and give a single home for navigation + action commands as new features land.

**Outcome:** `⌘K` opens a global palette that fuzzy-searches all entities, jumps to navigation targets, and runs actions. `⌘⇧K` focuses the current page's table search (replacing today's decorative `⌘K` hint, which is a real liability since it lies to users). A pluggable provider registry lets future features drop in their own entities in ~30 lines.

## Architecture Summary

- **UI:** [`cmdk`](https://cmdk.paco.me/) (Vercel, Radix-compatible, ~5kb) inside our existing Radix [Dialog](src/components/ui/dialog.tsx). Full-screen sheet on mobile (`<md`), centered modal on desktop — matches today's Dialog responsive behavior.
- **Fuzzy scoring:** [`fuse.js`](https://fusejs.io/) client-side across all providers. No Docker, no new services. Scale is well within Fuse's sweet spot (<10k items combined, fields are short strings).
- **No OpenSearch.** Overkill for this dataset and adds ops burden that contradicts the project's single-binary macOS desktop focus.
- **Provider registry:** Each entity type is a `SearchProvider` with a React Query fetcher + field mapper. Registered once; palette discovers them automatically. New sub-apps drop in a new provider file — no palette changes.

## Critical Files

### New files
- `src/lib/search/registry.ts` — `SearchProvider`/`SearchItem` types, `registerProvider`, `getProviders`
- `src/lib/search/fuzzy.ts` — Fuse config + ranking helpers (title-weight > keywords > subtitle)
- `src/lib/search/providers/people.ts` — and one file per entity (see list below). `notes.ts` provider emits **both** Notes and Folders sections from a single `fetchNotesTree()` call.
- `src/lib/search/actions.ts` — static navigation + command actions
- `src/lib/search/use-search-index.ts` — React Query hook aggregating all providers + building Fuse index
- `src/components/command-palette.tsx` — `cmdk` UI inside Dialog with sections per provider
- `src/components/command-palette-provider.tsx` — Context + global `⌘K` listener, mounted in `AppLayout`
- `src/hooks/use-command-palette.ts` — `useCommandPalette()` returning `{open, setOpen}`

### Modified files
- [src/App.tsx:281](src/App.tsx:281) — wrap `AppLayout` body with `<CommandPaletteProvider>` + mount `<CommandPalette />`
- [src/hooks/use-keyboard-shortcuts.ts](src/hooks/use-keyboard-shortcuts.ts) — add `⌘K` (open palette) and `⌘⇧K` (focus nearest `[data-search-input] input` — the attribute already exists at [search-input.tsx:25](src/components/ui/search-input.tsx:25))
- [src/components/ui/search-input.tsx:47](src/components/ui/search-input.tsx:47) — change `kbd` hint from `⌘K` to `⌘⇧K` (and `Ctrl+Shift+K` on non-Mac). No per-page changes needed since all 17 consumers (16 prior + [notes-page.tsx](src/pages/notes/notes-page.tsx)) share this component.
- [src/pages/notes/notes-page.tsx](src/pages/notes/notes-page.tsx) — read `?expand=<id>` URL param on mount to support jumping to a folder from the palette (see "Folder Navigation" below).

### Package additions
- `cmdk` (~5kb)
- `fuse.js` (~12kb gzipped)

## Entity Providers (14 ship at launch)

Every provider maps to a React Query `queryKey` (reuse existing keys from [src/lib/query-keys.ts](src/lib/query-keys.ts)) and an existing list endpoint. Fields listed are what Fuse indexes.

| Provider | Source endpoint | Route | Fuse fields |
|---|---|---|---|
| People | `GET /api/people?limit=5000` | `/people/:id` | `firstName`, `lastName`, `phoneNumber` |
| Groups | `GET /api/groups` | `/groups/:id` | `name`, `description` |
| Messages | `GET /api/messages?limit=500` | `/messages/:id` | `renderedPreview` (skip full `content` — too large) |
| Templates | `GET /api/templates` | `/templates/:id/edit` | `name` |
| Drafts | `GET /api/drafts` | (compose flow) | `name` |
| Devotions | `GET /api/devotions` | `/devotions/:id` | `title`, `bibleReference`, `guestSpeaker`, `songName` |
| Gwendolyn Devotions | `GET /api/devotions/gwendolyn` | `/devotions/gwendolyn/:id` | `title`, `date` |
| Generated Passages | `GET /api/devotions/passages` | `/devotions/passages/:id` | `title`, `bibleReference` |
| Quotes | `GET /api/quotes` | `/sermons/quotes/:id` | `title`, `author`, `tags`, `summary` (skip full `quoteText`) |
| Hymns | `GET /api/hymns` | hymn browser | `title`, `firstLine`, `author`, `composer`, `topics` |
| Nursery Schedules | `GET /api/nursery/schedules` | `/nursery/:id` | `month`, `year`, `status` |
| Calendar Events | `GET /api/calendar` | `/calendar` | `title`, `location` |
| **Notes** | `GET /api/notes/tree` (filtered `type==='note'`) | `/notes/note/:id` | `title`, `excerpt` |
| **Folders** | `GET /api/notes/tree` (filtered `type==='folder'`) | `/notes?expand=:id` (see note below) | `title` |

**Notes + Folders unified source:** A single `fetchNotesTree()` call ([src/lib/notes-api.ts:114](src/lib/notes-api.ts:114)) returns both folders and notes from `notes_items`. The provider emits two sections so results are grouped visually, but shares one query (`queryKeys.notesTree` at [src/lib/query-keys.ts:40](src/lib/query-keys.ts:40)) and one network round-trip. Subtitle for both = breadcrumb path (e.g. `Sermons / 2025 / Easter`) built client-side by walking `parentId` — gives the user unambiguous context in results, which matters because note titles repeat (many "Untitled" / "Sermon notes"). The tree-walk is O(depth) per item and runs once at index-build time.

**Secondary providers** (lower priority, still registered): Global Variables, Quote Searches, Hymn Searches, Nursery Workers, Scan Drafts.

**Skipped:** Message recipients, nursery assignments, pinned items — derived/child records, not useful on their own.

## Actions (static)

- **Navigation:** "Go to People / Groups / Messages / Templates / Drafts / Devotions / Quotes / Hymns / Nursery / Calendar / **Notes** / Settings / Dashboard / Import"
- **Create:** "New Person", "New Group", "New Message", "New Template", "New Devotion", "New Quote", "New Hymn Search", "New Nursery Schedule", **"New Note"**, **"New Folder"** (both call `createNoteItem({type, parentId: null})` from [src/lib/notes-api.ts:126](src/lib/notes-api.ts:126), then navigate to `/notes` or `/notes/note/:id/edit` for notes)
- **Commands:** "Toggle Dark Mode" (reuse `toggleDark` already wired in [src/App.tsx:281](src/App.tsx:281)), "Import CSV", "Export People", "Open Settings"

## Extensibility Plan

**Contract for new features:** Create `src/lib/search/providers/<feature>.ts` exporting a `SearchProvider`. Add one line to the barrel `src/lib/search/providers/index.ts`. Done.

```ts
// Template for future providers
export const myProvider: SearchProvider<Row> = {
  id: 'my-feature',
  label: 'My Feature',
  icon: MyIcon,
  priority: 50,
  queryKey: queryKeys.myFeature,
  fetch: () => fetchMyFeature({limit: 5000}),
  toItem: (row) => ({
    id: String(row.id),
    label: row.name,
    subtitle: row.description,
    group: 'My Feature',
    keywords: [row.name, row.description ?? ''],
    action: () => navigate(`/my-feature/${row.id}`),
  }),
}
```

A short contributor note will go at the top of [src/lib/search/registry.ts](src/lib/search/registry.ts) pointing at this contract. No separate docs file.

## Folder Navigation (small enhancement)

Folders don't have a dedicated detail page — they expand inline on [notes-page.tsx](src/pages/notes/notes-page.tsx). To make folder results navigable from the palette, add a tiny reader to `NotesPage`: on mount, parse `?expand=<id>` from the URL, seed `ExpandedState` to expand the ancestor chain up to that folder, and scroll its row into view. ~10 lines. This is the only non-palette file touched to support the new providers.

## Data Fetching Strategy

- **Lazy:** Provider queries fire on first palette open, then React Query caches for 5 min `staleTime`. Subsequent opens are instant.
- **Prefetch on hover:** When user hovers the sidebar (desktop) or app boots (optional follow-up), we can warm the cache — deferred to polish phase.
- **Bounded:** Each provider passes `?limit=5000` (People) / `?limit=500` (Messages). If a list exceeds the bound, Fuse falls back to prefix match on the server (future enhancement). Current scale doesn't hit this.
- **Empty state:** Palette shows "Recent" section (last 5 picks, stored in `localStorage`) + "Jump to…" nav actions when query is empty.

## Mobile UX

- **Trigger:** Add a `Search` icon button to the mobile top header at [src/App.tsx:326](src/App.tsx:326) (between the logo and the right edge). Tap opens palette.
- **Layout:** `cmdk` renders inside Dialog — our Dialog already goes full-screen on `<md` ([dialog.tsx](src/components/ui/dialog.tsx)). No extra responsive work required.
- **Keyboard:** Hidden on mobile (no physical keyboard) — the kbd hint in `SearchInput` is already `hidden md:inline-flex` ([search-input.tsx:46](src/components/ui/search-input.tsx:46)) so it stays invisible on mobile.
- **iOS virtual keyboard:** Dialog inner scroll handles overflow; cmdk's input auto-focuses.

## Shortcut Migration

- **Global:** `⌘K` → open palette (replaces today's _decorative-only_ kbd hint — zero real bindings exist, confirmed by grep).
- **Table search:** `⌘⇧K` → focus nearest `[data-search-input] input`. The `data-search-input` attribute already exists on every `SearchInput` ([search-input.tsx:25](src/components/ui/search-input.tsx:25)), so a single selector `document.querySelector('[data-search-input] input')` finds it.
- **kbd hint update:** One change in [search-input.tsx:47](src/components/ui/search-input.tsx:47) propagates to all 16 consumer pages automatically (PeoplePage, GroupsPage, MessageHistoryPage, TemplatesPage, QuotesPage, etc.).
- **Existing shortcuts preserved:** `⌘D` (dark) and `⌘,` (settings) remain in `use-keyboard-shortcuts.ts`.

## Verification

1. **Install deps**: `pnpm add cmdk fuse.js`. Run `pnpm eslint && pnpm prettier` (per memory).
2. **No manual dev server** — launchd restart per [feedback_no_manual_dev.md](feedback_no_manual_dev.md). Verify at http://localhost:5173 after launchd picks up the Vite change.
3. **Functional:**
   - Press `⌘K` anywhere → palette opens, input auto-focused.
   - Type "john" → matches people across firstName/lastName/phone; press Enter → navigates to `/people/:id`.
   - Type "new group" → "New Group" action appears; Enter → `/groups` (or create flow).
   - Type "dark" → "Toggle Dark Mode" action works.
   - Type a note title → matches in Notes section; Enter → opens `/notes/note/:id`.
   - Type a folder name → matches in Folders section with breadcrumb subtitle; Enter → opens `/notes?expand=:id` with that folder auto-expanded and scrolled.
   - Run "New Note" action → creates untitled note and lands on edit page; "New Folder" → creates folder at root and shows in tree.
   - Press `Esc` → palette closes.
   - Press `⌘⇧K` on `/people` → focuses its search box; typing filters the table.
4. **Regression:**
   - `⌘K` no longer focuses any input (it used to be a lie anyway — this is the fix).
   - `⌘D` and `⌘,` still work.
   - All 16 pages using `SearchInput` now show `⌘⇧K` hint.
5. **Mobile:** Resize to `<768px` → sidebar hidden, header search icon visible, tap opens palette full-screen.
6. **Type check:** `pnpm eslint` (runs `tsc -b` + server tsc) passes.

## Phased Implementation

1. **Foundation** (half day) — deps, registry types, Fuse config, CommandPalette + Provider shell, `⌘K` binding, mount in App.tsx. Ship with just People + Groups + Notes + core nav actions. Proves the pipeline end-to-end across a flat entity, a small entity, and the tree-shaped one.
2. **All providers** (half day) — fill in the remaining 11 entity providers against existing endpoints (including the Folders half of the notes provider).
3. **Actions + shortcut migration** (1–2 hours) — static nav/create/command actions (including "New Note" / "New Folder"); update `SearchInput` kbd hint; add `⌘⇧K` focus binding.
4. **Folder deep-link + mobile trigger** (<1 hour) — `?expand=<id>` reader in `notes-page.tsx`; mobile header search icon.
5. **Polish** (follow-up, optional) — recent items in `localStorage`, palette footer with kbd hints (`↑↓` navigate, `↵` open, `esc` close), prefetch on app boot.

## Notes

- **Memory preference:** Plans normally live in `central-flock/plans/kbar-global-search.md` per [feedback_plans_location.md](~/.claude/projects/-Users-cgen01-repos-cgen-central-flock/memory/feedback_plans_location.md). Plan mode restricted me to `~/.claude/plans/` — please copy this file into the repo after approval.
- **Post-ship:** After merge, delete the now-incorrect "CMD+K focuses table search" mental model from any README/user-facing copy (grep didn't find any, but worth one last pass).
