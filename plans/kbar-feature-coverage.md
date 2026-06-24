# kbar Feature Coverage

Make every feature reachable from the command palette (Cmd+K). Audit found 10
reachable routes with no Navigation action and 2 entities with no search
provider.

## Background

- Static actions: `src/lib/search/actions.ts` — `buildNavigationActions()` (the
  `nav(path, label, Icon, keywords?)` helper), `buildCreateActions()`,
  `buildCommandActions()`.
- Dynamic entity providers: `src/lib/search/providers/*.ts`, registered in
  `src/lib/search/providers/index.ts`. Palette auto-discovers them.
- Group display order + prefix filters: `src/components/command-palette.tsx`.

## Keeping kbar in sync (anti-drift)

Documentation alone won't hold — the current gaps exist precisely because
`buildNavigationActions()` hand-duplicates the sidebar list in
`src/lib/nav-config.ts` (`navGroups`). Two layers:

### Structural (preferred) — single source of truth

Derive kbar Navigation actions from `navGroups` instead of re-listing them.
Map each `NavChild` (`{to, label, icon}`) → `nav(to, label, icon)`. Then adding
or removing a sidebar item updates kbar automatically; only routes that are NOT
in the sidebar (e.g. `/devotions/scan`, `/devotions/missing`) need an explicit
extra list. This shrinks the manual surface to just the handful of non-nav
routes and makes sidebar drift impossible.

### Documented rule (where to write it)

- **Primary: `CLAUDE.md` → "Key Patterns".** It's loaded into every session, so
  the agent actually applies it, and it's the project's operating manual for a
  human too. Add one line, e.g.:
  > When adding/removing/renaming a route in `src/App.tsx` or a nav entry in
  > `src/lib/nav-config.ts`, update the command palette
  > (`src/lib/search/actions.ts` + `src/lib/search/providers/`). Sidebar nav
  > actions derive from `navGroups`; non-nav routes need an explicit entry.
- **Reinforce at the code site:** a short pointer comment above the `<Route>`
  block in `src/App.tsx` and above `buildNavigationActions()` — a dev editing
  routes reads the router, not `CLAUDE.md`.

Do the structural fix and the docs in the same change so the rule describes
reality.

## Phase 1 — Missing Navigation actions (primary, low-risk)

Add to `buildNavigationActions()` in `src/lib/search/actions.ts`. All routes
confirmed in `src/App.tsx`. Import the needed lucide icons at top of the file.

| Label                   | Path                    | Suggested icon    | Keywords                    |
| ----------------------- | ----------------------- | ----------------- | --------------------------- |
| Devotion Scan           | `/devotions/scan`       | ScanLine / Camera | scan, ocr, sheet, import    |
| Devotion Scriptures     | `/devotions/scriptures` | BookMarked        | scripture, verse, reference |
| Devotion Auditing       | `/devotions/audit`      | ClipboardCheck    | audit, qa, chain            |
| Devotion Missing        | `/devotions/missing`    | SearchX           | missing, gaps, incomplete   |
| Special Music Schedules | `/special-music`        | Music             | special music, schedule     |
| Fair Booth              | `/schedules/fair-booth` | Tent              | fair, booth, schedule       |
| Schedules Settings      | `/schedules/settings`   | SlidersHorizontal | schedule settings, config   |
| Calendar Print          | `/calendar/print`       | Printer           | print, calendar, pdf        |
| Quote Searches          | `/sermons/searches`     | Search            | quote search, history       |
| Verse Strips            | `/sermons/verse-strips` | Rows3             | verse strip, print          |

Note: "Special Music Schedules" (`/special-music`) is distinct from the existing
"Specials" (`/music/specials`) — keep both, differentiate labels/keywords so
they don't read as duplicates.

## Phase 2 — Missing entity providers (searchable records)

Each provider is a `SearchProvider` (see existing files for the shape) added to
`providers/index.ts`. Follow the closest existing analog.

- **Fair Booth schedules** — model on `special-music-schedules.ts`. Source:
  `GET /api/schedules?type=fair_booth` (verify the type slug). Group:
  `Schedules`. Route: `/schedules/fair-booth/{id}`. Keywords: scope range,
  status, 'fair booth'.
- **Devotion Passages (pool)** — model on `devotions.ts`. Source:
  `GET /api/devotions/pool` (verify list shape/limit). Group: `Devotions` (or a
  new `Passages` group — decide). Route: `/devotions/passages/{id}`. Keywords:
  title, bibleReference, notes/topic, subcode.

If a new group is introduced, add it to the group order + prefix map in
`command-palette.tsx`.

## Phase 3 — Create actions (verify first, then add)

Only add when the target page supports a create entry point (query param or
`/new` route). Verify each before implementing:

- New Fair Booth schedule — check `FairBoothSchedulesPage` for a create param.
- New Special Music schedule — check `SpecialMusicSchedulesPage`.
- New Verse Strip — check `VerseStripsPage`.

Skip any that have no create affordance rather than inventing routes.

## Out of scope

- Quote/Hymn search-history detail providers (low value).
- Reworking prefix aliases for already-covered features.

## Verification

- `pnpm eslint` + `pnpm prettier`.
- Manual: Cmd+K → each new label navigates to the right page; new providers
  return records that open the correct detail route.
- Confirm no duplicate-looking entries (Specials vs Special Music Schedules).
