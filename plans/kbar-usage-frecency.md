# kbar Usage Frecency & Recents

Reprioritize the command palette by actual usage, backed by a reusable
server-side route-visit log.

## Goal

- Reorder the **Navigation** group by how much each section is used (frecency).
- Add a **Recent** group: deep links to specific entities you revisit ("2026
  Fair Booth · Schedule"), with metadata, ranked by frecency.
- Restore full entity search, but only when typing, capped to ~25 results.
- Store visits server-side as a general-purpose log reusable by future features.

## Resolved decisions (from grilling)

- **Signal:** app-wide route visits (every navigation), not just palette picks.
- **Model:** frecency (count + recency decay, ~30-day half-life) for both the
  section reorder and Recents.
- **Storage:** server, **append-only event log** in `central-flock.db` — chosen
  over an aggregate so future consumers can derive trends/history (you can always
  aggregate a log, never the reverse).
- **Capture:** client logs **only the pathname** via one shell hook; the server
  interprets paths at read time. No per-page code (avoids drift), no captured
  labels (avoids staleness).
- **Labels:** resolved **server-side at read time** from each entity's own table,
  so a renamed entity shows its new name immediately. Entity detection is generic
  (`/<section>/<id>` → section + id, zero config). Unregistered types **degrade
  to a generic label** (section name + id) — never missing/broken. One central
  resolver, guarded by a CLAUDE.md rule **and a dev test** asserting every entity
  section has a pretty resolver.
- **Two-mode palette:**
  - **Empty:** curated — Navigation (reordered), Create, Commands, Recent. No raw
    entity dump (preserves the clean empty state).
  - **Typed:** search **everything** — all providers restored plus
    nav/create/commands/recents — capped at **25** total; de-dupe a recent out of
    its entity group.
- **Create group:** not reordered (stays fixed).
- **Recents:** searchable (loaded into the index), **all** entity types (frecency
  self-curates — no allow-list), ~6 shown on empty / ~50 in the searchable window,
  deep links with a metadata subtitle. Deleted entity → resolver finds nothing →
  dropped from Recents.
- **Section reorder:** one frecency sort across the whole Navigation group,
  current declared order as the stable tiebreaker for zero/equal scores; applies
  to the **empty state** only (typed search stays match-ranked).
- **Visit definition:** log on pathname change only (ignore query-string/hash);
  skip consecutive duplicates; redirect hops settle on the final path.
- **Retention:** prune events older than ~12 months (lazy/periodic).
- **Deferred:** reset/clear-history control; manual pinning/favorites; per-device
  storage; capture-at-visit labels.

## Architecture

### Data (server)

- New `server/db/schema-usage.ts`: `route_visits { id, path, visited_at }`,
  index on `visited_at` (and `path`). Section/type/id are **not** stored — they
  are derived from `path` at read time, keeping the log maximally reinterpretable.
- Migration via `pnpm db:generate` / `db:migrate` (additive). Re-export from the
  `server/db/schema.ts` barrel. Apply through the runbook stop-service procedure.

### Write path

- Client: `useRouteVisitLogger()` mounted once in the app shell (App.tsx, around
  the `<main>`/`<Routes>`). Watches `useLocation().pathname`; on change (deduped
  vs the previous path) fires `POST /api/usage/visit { path }`, fire-and-forget.
- Server: `POST /api/usage/visit` inserts one row.

### Read path

- `GET /api/usage/sections` → frecency score per section. Path→section uses the
  same prefix logic as `nav-config.ts` (`findActiveGroup`/`isChildActive`),
  mirrored server-side. Drives the Navigation reorder.
- `GET /api/usage/recents` → top frecent **entity** paths; for each, the central
  resolver looks up the entity's current label; returns
  `{ path, entityType, typeLabel, label, score }`. Drops unresolved (deleted)
  entities.

### Central resolver (server)

- `server/services/usage-entity-resolver.ts`: maps `section → { entityType,
typeLabel, resolveLabel(id) }` (one small SQL per type). Generic fallback for
  unregistered sections (`"<Section> · #<id>"`). A dev test enumerates entity
  sections from the route table and asserts each has a resolver entry.

### Client integration

- `use-search-index.ts`: add React Query fetches for `usage/sections` and
  `usage/recents`.
  - Recents → a provider emitting group `Recent`.
  - **Restore** all entity providers in `providers/index.ts`.
  - Sort Navigation actions by the section frecency map (declared order tiebreak).
- `command-palette.tsx`:
  - Empty state: restrict visible groups to Navigation / Create / Commands /
    Recent.
  - Typed: include all groups; change `MAX_SEARCH_RESULTS` 60 → **25**.
  - De-dupe: if an item id is in Recent, drop it from its entity group.
  - Add `Recent` to `GROUP_ORDER` (high, e.g. right after Commands) and a
    `recent`/`r` prefix in `PREFIX_TO_GROUP`.

### Frecency util

- Shared `frecency(count, lastVisitedMs, halfLifeDays = 30)`; computed
  server-side for both endpoints.

## Phases

1. **Server:** schema + migration, `POST /usage/visit`, `GET /usage/sections`,
   `GET /usage/recents`, resolver, frecency util, dev test, prune.
2. **Client capture:** shell `useRouteVisitLogger()` hook.
3. **Palette:** restore providers, recents provider, nav reorder, two-mode
   empty/typed, 25 cap, de-dupe, group order + prefix.
4. **Docs:** CLAUDE.md rule (resolver + palette sync); ADR 0012.

## Verification

- `pnpm eslint` + `pnpm prettier`; migration applied via runbook.
- Manual: visit pages → top sections rise into the empty-palette Navigation 6;
  Recents populate with live labels; rename an entity → its Recent label updates;
  type a query → full search across all types, capped at 25; delete an entity →
  it drops out of Recents; new `/foo/:id` route → auto-appears in Recents with a
  generic label, dev test flags the missing pretty resolver.

## Related docs

- ADR: `docs/adr/0012-usage-frecency-route-log.md`
