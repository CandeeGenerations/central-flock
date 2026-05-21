# Schedules Consolidation — Implementation Plan

Consolidate the Nursery feature with a new Special Music schedule and a future-ready Sunday School slot. Establishes the shared `schedules` envelope, extracts cross-type React + server primitives, and ships a manual-entry Special Music schedule whose cells unify with the existing `special_music` table.

Reference: [docs/adr/0006-multi-type-schedule-envelope.md](../docs/adr/0006-multi-type-schedule-envelope.md) and the new Schedules glossary entries in [CONTEXT.md](../CONTEXT.md).

## Goal

- Print, export, send, and edit Schedules of any type through a single shared toolchain.
- Add a Special Music schedule whose cells are `special_music` rows (no duplicate data).
- Move the logo to a global cross-schedule asset.
- Leave room for Sunday School (future) to drop in as a new `schedule_type` without re-implementing list/detail/export/send.

## Out of scope

- Sunday School schedule itself.
- Auto-fill / fairness scoring for Special Music.
- Inbound message parsing of singer responses.
- Per-instance footer/title overrides.
- A public-facing "view my schedule" link.

---

## Phase 1 — Schema + data migration

Stop the launchd service before running migrations (per the project's documented workflow).

### 1.1 New `schedules` table

`server/db/schema-core.ts` (or a new `schema-schedules.ts` — choose based on coupling with other tables):

```ts
export const schedules = sqliteTable('schedules', {
  id: integer('id').primaryKey({autoIncrement: true}),
  scheduleType: text('schedule_type', {enum: ['nursery', 'special_music']}).notNull(),
  scopeKind: text('scope_kind', {enum: ['monthly', 'date_range']}).notNull(),
  // monthly
  month: integer('month'),
  year: integer('year'),
  // date_range
  scopeStart: text('scope_start'),
  scopeEnd: text('scope_end'),
  // both
  scopeLabel: text('scope_label').notNull(),
  status: text('status', {enum: ['draft', 'final']})
    .notNull()
    .default('draft'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
```

Index recommendations: `(scheduleType, status)`, `(scheduleType, year, month)`, `(scheduleType, scopeStart, scopeEnd)`.

### 1.2 Migrate nursery rows into `schedules`

One-shot drizzle migration:

1. Create `schedules` table.
2. `INSERT INTO schedules (id, scheduleType, scopeKind, month, year, scopeLabel, status, createdAt, updatedAt) SELECT id, 'nursery', 'monthly', month, year, printf('%s %d', monthName(month), year), status, createdAt, updatedAt FROM nursery_schedules;` — ids preserved so the FK doesn't need rewriting.
3. Drop the `nursery_schedules` table.
4. `nursery_assignments.scheduleId` FK target switches from `nursery_schedules.id` to `schedules.id` (same numeric values, no row repair needed because of step 2's id preservation).

Drizzle's SQLite migration story for changing FK targets requires recreating `nursery_assignments` — write the migration as a raw SQL block that creates `nursery_assignments_new` with the new FK, copies rows, drops the old, renames. Standard SQLite FK migration pattern.

### 1.3 Relax `special_music.song_title`

`server/db/schema-music.ts`: `songTitle: text('song_title')` (drop `.notNull()`). Drizzle migration recreates the table (SQLite drops NOT NULL via table swap).

Audit existing `song_title` reads:

- `server/routes/specials.ts` — anywhere that types it as `string` becomes `string | null`.
- `src/pages/music/specials-list-page.tsx`, `special-detail-page.tsx`, `special-new-page.tsx` — render `song_title ?? '—'` and skip null in "song stats" rollups.
- `server/services/specials-repeat.ts` — repeat warnings against song title must short-circuit when null.

### 1.4 Move logo to global settings

1. Read current `nursery_settings.logoPath` value.
2. Rename `$UPLOADS_DIR/nursery-logos/` → `$UPLOADS_DIR/schedule-logos/` on disk.
3. Insert/update `settings.schedulesLogoPath` with the rewritten path.
4. Delete the `logoPath` row from `nursery_settings` (table is still used by `nursery_service_config` consumers — keep the table, just drop the key).

This is a server-side migration script (`server/scripts/migrate-schedule-logo.ts`) run once at deploy time, idempotent (no-op if `nursery_settings.logoPath` already absent).

### 1.5 Seed per-type settings keys

On first boot (or in the same migration script), insert defaults if absent:

- `schedules.nursery.titlePrefix` = `"Nursery Schedule"`
- `schedules.nursery.footerBlocks` = `"[]"`
- `schedules.specialMusic.titlePrefix` = `"CBC Special Music Schedule"`
- `schedules.specialMusic.footerBlocks` = the Psalm 9 quote + two reminder bullets from the printed sample, as a JSON array of `{kind, text, bold?}`
- `schedules.specialMusic.singerGroupIds` = `"[]"` (user picks Groups in settings UI)

---

## Phase 2 — Shared primitives extraction

Build these without altering nursery's behavior. Each is a refactor that nursery's existing page is then re-pointed at.

### 2.1 `<SchedulePreviewFrame>` (`src/components/schedule/schedule-preview-frame.tsx`)

Props: `scheduleType`, `scopeLabel`, `status`, `children` (the per-type body), `exporting` (suppresses any edit-affordance chrome during JPG/PDF capture).

Reads `schedules.<type>.titlePrefix`, `schedules.<type>.footerBlocks`, and `schedules.logoPath` from settings via TanStack Query. Renders: logo header → title `${titlePrefix} ${scopeLabel}` → children body → footer blocks. This is the html-to-image capture target.

### 2.2 `useScheduleExport` (`src/hooks/use-schedule-export.ts`)

Extracted verbatim from `nursery-schedule-view-page.tsx` lines 167–286 (the `generateImage`, `inlineImagesAsDataUrls`, `exportAs` functions). Returns `{ exportAsPdf, exportAsJpg, generateImage, exporting }`. Takes the preview ref and a filename.

### 2.3 `<ScheduleActionsToolbar>` (`src/components/schedule/schedule-actions-toolbar.tsx`)

Props: schedule object, preview ref, mutation hooks for finalize/reopen, `onEditToggle`, `editMode`. Renders Edit/Finalize/Reopen/PDF/JPG/Send buttons with the same disabled-when-draft logic that exists today.

### 2.4 `<SendScheduleDialog>` (`src/components/schedule/send-schedule-dialog.tsx`)

Recipient SearchableSelect + caption textarea + send button. Calls a generic `POST /api/schedules/:id/send-image` endpoint. The existing `sendScheduleImage` server function moves from `server/routes/nursery-schedules.ts` to `server/routes/schedules.ts` and becomes type-agnostic.

### 2.5 `<ScheduleListCard>` (`src/components/schedule/schedule-list-card.tsx`)

Props: column config, "New Schedule" dialog component (per-type — different date pickers per `scope_kind`), data query, delete confirm. Nursery's current list page becomes a thin wrapper that passes nursery-specific columns and the existing month/year picker as the dialog.

### 2.6 Server: `/api/schedules` envelope router

New `server/routes/schedules.ts`:

- `GET /api/schedules?type=:type` — list envelopes by type
- `GET /api/schedules/:id` — envelope row
- `POST /api/schedules` — create envelope (type-specific dialog payload)
- `PATCH /api/schedules/:id` — update status, scope_label
- `DELETE /api/schedules/:id`
- `POST /api/schedules/:id/send-image` — generic image send (extracted from nursery)

Per-type routers stay where they are (`/api/nursery/*` for assignments + workers + service config; new `/api/special-music/schedule/*` for date-range body queries — though for Special Music this is mostly a thin facade since the body lives in `/api/specials/*`).

### 2.7 Refactor `<NurserySchedulePreview>`

Remove its internal header (lines 122–131 — the logo/title block). Keep only the table body. The component is now slotted as a child of `<SchedulePreviewFrame>`. Verify pixel-identical export of an existing nursery schedule before merging.

### 2.8 Refactor `nursery-schedule-view-page.tsx`

Delete the local `generateImage`, `inlineImagesAsDataUrls`, `exportAs` functions. Replace with `useScheduleExport`. Delete the in-page send dialog; use `<SendScheduleDialog>`. Wrap the preview in `<SchedulePreviewFrame>`. The page shrinks from ~445 lines to under 150.

---

## Phase 3 — Special Music schedule (new feature)

### 3.1 Routes

- `GET /special-music` — list page
- `GET /special-music/:id` — detail page
- Create dialog (no separate route — modal on the list page)

`server/routes/special-music-schedules.ts`:

- Special-Music schedules use the envelope router for CRUD; this file only provides a `GET /api/special-music/schedule/:id/cells` endpoint that returns the `special_music` rows in scope. The endpoint accepts the scope_start/scope_end from the envelope, joins to `people` for performers, and decorates each cell with `lastSangWeeksAgo` for each performer (for the "last sang 3 weeks ago" hint).

### 3.2 List page (`src/pages/special-music/special-music-schedules-page.tsx`)

`<ScheduleListCard>` with columns: Scope Label · Status · Created · delete icon. "New Schedule" dialog takes `scopeStart` (date picker — first Sunday in range), `scopeEnd` (date picker — last Sunday in range), `scopeLabel` (auto-filled to year or "{startMonth}–{endMonth} {year}", editable).

### 3.3 Detail page (`src/pages/special-music/special-music-schedule-view-page.tsx`)

Modeled on nursery view page after its refactor. Sequence:

1. Fetch envelope + cells.
2. Compute grid rows = Sundays in `scope_start..scope_end` (inclusive), in order.
3. For each row × {AM, PM}, look up the matching cell. Render `<SpecialMusicSchedulePreview>` inside `<SchedulePreviewFrame>`.
4. `<ScheduleActionsToolbar>` provides Edit/Finalize/PDF/JPG/Send.

### 3.4 `<SpecialMusicSchedulePreview>` (`src/components/schedule/special-music-schedule-preview.tsx`)

Table layout matching the printed image:

| DATE | SUNDAY A.M. | SUNDAY P.M. |
| ---- | ----------- | ----------- |

Each cell renders:

- If `serviceLabel` set: `${serviceLabel.toUpperCase()} – ${performers || 'TBA'}`
- Else: `${type.toUpperCase()} – ${performers || 'TBA'}`

Where `performers` is performer names joined with " and " (or commas + "and" for 3+), built from linked people first, then `guest_performers` strings.

Edit mode: clicking a cell opens `<ScheduleCellEditorPopover>`. Empty cells render as "+ Add" pill in edit mode and as blank in preview mode.

### 3.5 `<ScheduleCellEditorPopover>` (`src/components/schedule/schedule-cell-editor-popover.tsx`)

Fields:

- **People multi-select** — searchable, filtered to deduplicated singer pool (members of `schedules.specialMusic.singerGroupIds` Groups). Chip rendering with reorder arrows for `ordering`.
- **Guest performers** — array of strings with typeahead autocomplete from `SELECT DISTINCT guest_performers from special_music ...` flattened. Same UX as existing Specials new page.
- **Override label** — text input with autocomplete from `SELECT DISTINCT service_label from special_music WHERE service_label IS NOT NULL`. Placeholder: "e.g., Men's Group, Hispanic Special".
- **Type** — derived from total performer count (1=solo, 2=duet, 3=trio, 4+=group). Click-to-override to any of the enum values. Hints: "auto: trio".

Below the fields: a small "{firstName} last sang N weeks ago" line per selected person.

Footer: "Open in Specials →" link routes to `/music/specials/${cellId}/edit` for full editing. "Delete" button removes the row (returns the cell to virtual state).

Auto-saves on blur/close via a `PATCH /api/specials/:id` (existing endpoint) or `POST /api/specials` (existing) for new cells. Optimistic UI.

### 3.6 Cell creation flow

When the popover saves an empty cell for the first time, the page calls `POST /api/specials` with `{date, serviceType, status: 'will_perform' if date>today else 'needs_review', type: 'other', guest_performers: [], song_title: null}`, then patches in the fields the user entered. After save, the envelope's `updated_at` bumps via a trivial PATCH (so the list page's "modified" sort works).

---

## Phase 4 — Nav + Settings consolidation

### 4.1 Sidebar (`src/lib/nav-config.ts`)

Replace the existing `nursery` group with:

```ts
{
  id: 'schedules',
  label: 'Schedules',
  icon: Calendar,
  items: [
    {to: '/nursery', label: 'Nursery', icon: Baby, end: true},
    {to: '/nursery/workers', label: 'Nursery Workers', icon: Users},
    {to: '/special-music', label: 'Special Music', icon: Music, end: true},
    {to: '/schedules/settings', label: 'Settings', icon: Settings},
  ],
}
```

Pick a fitting Lucide icon for Nursery (Baby works) so the sidebar reads cleanly.

### 4.2 New unified settings page (`src/pages/schedules-settings-page.tsx`)

Sections, each a `Card`:

- **Global** — logo upload (current Nursery settings page logo UI, generalized).
- **Nursery** — existing nursery service config (today's `nursery-settings-page.tsx` body, minus the logo). Title prefix input. Footer blocks editor.
- **Special Music** — singer Groups multi-select (lists all Groups; checkboxes; dedupes on read). Title prefix input. Footer blocks editor (with a sensible default for the Psalm + reminders, editable as `{kind, text, bold}` rows).

Reuse the same footer-blocks editor component for both types.

Route: `/schedules/settings`. Delete the old `/nursery/settings` route once verified. (Keep a 301 redirect for one release if anyone has it pinned.)

### 4.3 Command palette

`src/components/command-palette.tsx` — add Special Music entries; rename Nursery section heading to "Schedules" if it's a section heading rather than a per-page label.

---

## Phase 5 — Cleanup + ship

- Delete `/nursery/settings` route + `NurserySettingsPage` once the new settings page covers everything. The logo upload, the service config editor — all move into the new page.
- Drop the `nursery_settings.logoPath` row (file already moved in 1.4).
- Update the existing `plans/nursery-schedule-generator.md` and `plans/special-music.md` with cross-links to this plan.
- Run `pnpm lint` and `pnpm prettier --write .` per the saved workflow preference.
- Manual smoke test on iPad of the Special Music edit flow (popover sizing on touch).
- Manual export comparison: nursery PDF/JPG before vs after the refactor must be pixel-identical (or near; minor anti-alias drift acceptable).

---

## Risks + mitigations

- **FK retarget on `nursery_assignments`.** SQLite forces a table recreate. Test the migration on a copy of the production DB before deploying. Back up `central-flock.db` to `central-flock.db.pre-schedules-bak` as a pre-step in the migration script (mirrors the existing `central-flock.db.pre-0014-bak` convention seen in the repo).
- **`special_music.song_title` nullable spreads further than expected.** Grep before changing the type — every TS site that touches the field needs a null guard.
- **Footer text is settings-only.** Re-exporting an old finalized schedule renders the _current_ footer. Document this on the Schedules settings page (a one-line note: "Changes here affect all printed schedules, including past-finalized ones if reprinted.").
- **`<SchedulePreviewFrame>` reading settings inside the capture target.** If the settings query is in flight when html-to-image runs, the footer renders empty. Mitigate by gating the export buttons until both the schedule data and the settings query are settled (similar to today's nursery preview gating on workers + serviceConfig).
- **Special-music popover save race.** Rapid edit/close on multiple cells could race the optimistic update. Use TanStack Query's mutation queue + per-cell mutation keys; tested in the existing Specials new-page flow.

---

## Done = these all work end-to-end

- Existing nursery schedules render, export, and send identically to before.
- Special Music: create new schedule with date range → empty grid → click cell → assign Tyler + Carissa → cell shows "DUET – Tyler and Carissa" → finalize → PDF export looks like the printed image with the configured footer → send to a person via Messages.
- A Special Music override cell ("MEN'S GROUP – TBA") prints exactly that string.
- A special created at `/music/specials/new` with date inside an existing schedule's scope auto-appears on that schedule's grid.
- Logo upload in `/schedules/settings` shows on both the nursery and special music printed pages.
- Footer text edits in `/schedules/settings` reflect on the next preview render.
