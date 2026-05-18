# Calendar Print: Inline Schedule Override + Interactive Preview Editor

Adds a per-cell **Inline Schedule Override** to the Calendar Print Page: for less-busy months, Sun/Wed/Sat cells can render a selected subset of the Normal Schedule inline instead of the small "Normal Schedule" label pointing at the footer. Restructures the Normal Schedule from a freeform text blob into a structured `normal_schedule_items` table (carrying `eligibleDays` metadata per line). Rebuilds the Calendar Print editor around an interactive preview — clicking a cell opens a Day editor dialog that bundles event management and inline-schedule selection.

Domain context: [CONTEXT.md → Normal Schedule / Schedule item / Inline schedule override / Day editor / Calendar print editor / Schedule master editor](../CONTEXT.md). Decisions: [docs/adr/0004-structured-normal-schedule.md](../docs/adr/0004-structured-normal-schedule.md) and [docs/adr/0005-interactive-calendar-print-editor.md](../docs/adr/0005-interactive-calendar-print-editor.md). This plan is the implementation playbook.

## Goals

- Per-cell inline schedule override on Sun/Wed/Sat cells (`null` = use today's label; non-empty = render selected items inline).
- Bulk apply: "Apply this selection to all Sundays in May" (or Wednesdays/Saturdays), launched from the per-cell picker.
- Normal Schedule stored as structured `normal_schedule_items` rows with `eligibleDays` metadata.
- Row-based master Schedule editor replaces both the global "default" textarea and the per-month override textarea. Same component for both scopes.
- Calendar Print Page editor becomes preview-driven: click a cell → Day editor dialog (Events + Inline Schedule sections). The editable Events card is removed; a read-only "Events this month" collapsible summary replaces it.
- iPad-friendly: touch-first affordances, no DnD, no hover-only reveals.
- One-time data migration from blob → structured rows with visual-fidelity diff check.

## Non-goals (deferred)

- Cross-month recurring events (Fellowship House every 3rd Wednesday). The existing duplicate icon stays the manual path.
- Event templates.
- Keyboard navigation across calendar cells (Q&A path stays mouse/touch only in v1).
- Auto-shrink-to-fit overflow rendering (we warn at edit time, not at render time).
- A separate top-level "Schedule overrides" entry point (always launched from a cell).
- Public-facing print sharing.

---

## Phase 1 — Schema + migration

This phase introduces structure without touching the editor UI. Reads still flow through the existing API shapes; writes are not yet routed through the row editor. By phase end, the DB carries structured rows AND the legacy blob is removed; the visible page continues to render correctly because the API layer translates rows back into a blob on the way out.

**Schema changes (`server/db/schema-calendar-print.ts`):**

```ts
export const normalScheduleItemTypes = ['line', 'spacer'] as const
export type NormalScheduleItemType = (typeof normalScheduleItemTypes)[number]

export const normalScheduleItemScopes = ['default', 'page'] as const
export type NormalScheduleItemScope = (typeof normalScheduleItemScopes)[number]

export const normalScheduleItems = sqliteTable(
  'normal_schedule_items',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scopeType: text('scope_type', {enum: normalScheduleItemScopes}).notNull(),
    scopeId: integer('scope_id'),
    type: text('type', {enum: normalScheduleItemTypes}).notNull(),
    text: text('text').notNull().default(''),
    bold: integer('bold', {mode: 'boolean'}).notNull().default(false),
    column: integer('column').notNull().default(1),
    eligibleDays: text('eligible_days').notNull().default('sun,wed,sat'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('normal_schedule_items_scope_idx').on(t.scopeType, t.scopeId, t.sortOrder)],
)

export const calendarPrintDayOverrides = sqliteTable(
  'calendar_print_day_overrides',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    pageId: integer('page_id')
      .notNull()
      .references(() => calendarPrintPages.id, {onDelete: 'cascade'}),
    date: text('date').notNull(),
    inlineItemIds: text('inline_item_ids').notNull().default('[]'), // JSON array of ints
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [unique().on(t.pageId, t.date)],
)
```

**Migration files (after `pnpm db:generate`):**

The generated migration creates the two tables. Augment it (hand-written follow-up migration) with the data-migration steps:

- `0015_normal_schedule_items_init.sql` — Drizzle-generated table DDL.
- `0016_normal_schedule_migrate.ts` — TypeScript migration (one-off script invoked via `pnpm tsx scripts/migrate-normal-schedule.ts`):
  1. Read `settings` row for `calendar_print_default_schedule.value` (fall back to `DEFAULT_SCHEDULE_SEED` constant).
  2. Read every `calendar_print_pages` row where `normal_schedule_text IS NOT NULL`.
  3. For each blob, invoke `parseBlobToItems(blob)` (new util in `server/lib/normal-schedule-migrate.ts`):
     - Split lines. Find `/^-{3,}\s*$/` separator → assign `column=1`/`column=2`.
     - Each line → `{type, text, bold, column, sortOrder}`.
       - Blank line → `type='spacer', text=''`.
       - Single full-line bold (`**foo**`) → `type='line', text='foo', bold=true`.
       - Otherwise → `type='line', text=<line with ** preserved>, bold=false`.
     - Apply `eligibleDays` heuristic:
       - `/wed|wednesday|prayer time/i` → `'wed'`.
       - `/sat|saturday|cleaning|visitation/i` → `'sat'`.
       - `/sunday|sunday morning|sunday evening|sunday school|kaya|alive|choir|men's prayer/i` → `'sun'`.
       - No match → `'sun,wed,sat'`.
     - `sortOrder` increments by 10 (room for manual reorder via arrow buttons without renumbering everything).
  4. Insert rows: `scopeType='default' scopeId=null` for the default blob; `scopeType='page' scopeId=<pageId>` for each page override.
  5. **Visual-fidelity diff:** for every blob, render the original through the existing footer code path (`FooterContent` with the blob string) and render the new rows through the _new_ row-aware footer (introduced in phase 2), then compare HTML strings. Any mismatch logs a line to `data/migration-reports/normal-schedule-<timestamp>.txt`. If the report is non-empty, abort unless `--accept-diffs` is set. (For phase 1, defer the diff check until phase 2 ships the row-aware footer — invoke this migration _during_ phase 2.)
  6. Print a summary: every inserted item with its guessed `eligibleDays`, for user review.
- `0017_drop_normal_schedule_text.sql` — `ALTER TABLE calendar_print_pages DROP COLUMN normal_schedule_text;` and `DELETE FROM settings WHERE key = 'calendar_print_default_schedule';`.

**Steps (workflow memory: stop launchd service before running migrations):**

1. Stop launchd service.
2. Edit `server/db/schema-calendar-print.ts` to add the two new tables. Run `pnpm db:generate`.
3. Hand-write `scripts/migrate-normal-schedule.ts` (read DB, call `parseBlobToItems`, write rows). Don't run it yet — phase 2 ships the row-aware footer that the diff check depends on.
4. **Do not** run the `DROP COLUMN normal_schedule_text` migration yet. That's the last migration in phase 2 once everything reads from the new tables.
5. `pnpm lint` to verify schema types check.
6. Restart launchd service. The app continues to read `normalScheduleText` from `calendar_print_pages` (which still exists). New tables are empty.

**Verify:**

- `pnpm db:studio` shows the two new tables, empty.
- Calendar Print Page renders unchanged.
- Existing footer, "Normal Schedule" label, and Events card all work.

---

## Phase 2 — Server reads through the new tables; data migration runs

This phase swaps the read path. The migration script runs as part of the phase, populating the new tables; afterward, the app reads from rows, never from the blob. The blob column drops at the end of the phase. **No UI changes yet** — the editor still has a textarea, but it writes through a new translation layer that converts text→rows on save (kept as a temporary bridge so this phase isn't blocked on Phase 3's row editor).

**Server changes (`server/routes/calendar-print.ts`):**

- New `readScheduleItems(pageId | null)`:
  - If `pageId != null` AND any rows exist with `scopeType='page' scopeId=pageId` → return those rows.
  - Else → return rows with `scopeType='default'`.
  - Sort by `sortOrder, id`.
- `GET /api/calendar-print/default-schedule` returns `{items: NormalScheduleItem[]}` (was `{value: string}`).
- `GET /api/calendar-print/pages/:year/:month` returns `{page, events, scheduleItems}` (replaces `defaultSchedule` resolution on the client). Also returns `dayOverrides: CalendarPrintDayOverride[]`.
- `PUT /api/calendar-print/default-schedule` accepts `{items: NormalScheduleItemInput[]}`. Server transactionally:
  - Deletes all rows with `scopeType='default'`.
  - Re-inserts rows from the payload, regenerating `sortOrder` from array position × 10.
  - Same temporary bridge: the existing textarea-based mutation endpoint accepts the old `{value: string}` payload, runs it through `parseBlobToItems`, and inserts as rows. Marked `@deprecated`.
- `PUT /api/calendar-print/pages/:year/:month` accepts `{page, scheduleItems?}`:
  - If `scheduleItems` array is `null` → delete all `scopeType='page' scopeId=pageId` rows (revert to default).
  - If `scheduleItems` is an array → replace `scopeType='page'` rows for this page transactionally.
  - **Drop inline overrides on scope change:** if the page transitions from "has override rows" to "no override rows" (or vice versa) AND any `calendar_print_day_overrides` rows exist on this page with non-empty `inlineItemIds`, clear those `inlineItemIds` arrays to `[]`. (Phase 4 surfaces a confirm dialog before this happens.)
- New `POST /api/calendar-print/pages/:year/:month/day-overrides` and `PUT /:id`, `DELETE /:id` for `calendar_print_day_overrides` CRUD. Body: `{date, inlineItemIds: number[]}`.

**Client `src/lib/api.ts`:**

- Update types: `NormalScheduleItem`, `CalendarPrintDayOverride`.
- `fetchCalendarPrintDefaultSchedule()` returns `{items}`.
- `fetchCalendarPrintPage` returns `{page, events, scheduleItems, dayOverrides}` (no more `defaultSchedule`).
- New helpers: `createDayOverride`, `updateDayOverride`, `deleteDayOverride`.

**Footer rendering (`src/components/calendar-print/calendar-grid.tsx`):**

- New prop on `CalendarGrid`: `scheduleItems: NormalScheduleItem[]`.
- Remove props `normalScheduleText` and `defaultSchedule`.
- New internal `buildFooterFromItems(items)` constructs `col1`/`col2` string arrays from items, preserving `**bold**` markers in item text (so existing `parseScheduleLine` still works). Spacer items emit a blank-string entry to match today's blank-line handling. Bold-flagged line items wrap their text in `**…**` if not already marked.
- `FooterContent` and `ScheduleColumn` unchanged otherwise — they operate on the same string-array shape they always did. **This is the visual-fidelity guarantee.**
- `shouldShowNormalScheduleLabel` (line 245) still consults events for `no_kaya` / `suppressNormalSchedule` — unchanged.

**Migration run:**

1. Stop launchd service.
2. `pnpm tsx scripts/migrate-normal-schedule.ts` — populates rows. Aborts if visual-fidelity diff fails (re-render through `buildFooterFromItems` must match the original blob's render).
3. Manually review `data/migration-reports/normal-schedule-<timestamp>.txt` — confirm `eligibleDays` guesses look right (especially Saturday: cleaning + visitation only).
4. Run `0017_drop_normal_schedule_text.sql` → `pnpm db:migrate`.
5. Run `pnpm lint`, `pnpm build`. Smoke-test the page (renders correctly; existing textarea still saves, going through the bridge).
6. Restart launchd service.

**Verify:**

- Calendar Print Page renders byte-identically to before. Diff the PDF export before and after migration as a final sanity check.
- `pnpm db:studio`: `normal_schedule_items` populated; `calendar_print_pages.normal_schedule_text` column gone; `settings` no longer has the schedule key.

---

## Phase 3 — Row-based master Schedule editor

Replaces the textareas (one in the "Edit default" modal at `calendar-print-page.tsx:900-927`, one in the per-month override block at `:563-590`) with a single row-based editor component.

**New component `src/components/calendar-print/schedule-items-editor.tsx`:**

Props:

```ts
interface ScheduleItemsEditorProps {
  scopeLabel: string // "Default Normal Schedule" or "May 2026 override"
  items: NormalScheduleItem[] // controlled
  onChange: (items: NormalScheduleItemInput[]) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
}
```

Layout: side-by-side, `lg:grid-cols-[1fr_1fr]`:

- **Left:** rows. Each row:
  - `↑` `↓` arrow buttons (disabled at top/bottom).
  - Type badge: `Line` / `Spacer` (read-only — type set at creation).
  - `text` `<Input>` (hidden for spacers — show "(blank line)" instead).
  - `bold` toggle (`<Checkbox>`).
  - `column` `<Select>` 1/2.
  - `eligibleDays` — three small toggle chips: `Sun` `Wed` `Sat`. Default for new items: all three on.
  - Delete icon.
- Below rows: `+ Add line` `+ Add spacer` buttons.

- **Right:** live `FooterContent` preview, rendering the current items. Uses the same `buildFooterFromItems` translator used by `CalendarGrid`.

Save: parent calls the existing mutation. Cancel: parent discards local state.

**Page integration (`src/pages/calendar-print-page.tsx`):**

- Replace the existing "Edit default" `Dialog` (lines 900-927) with a new `Dialog` mounting `ScheduleItemsEditor` for the default scope. Fetch via `fetchCalendarPrintDefaultSchedule`.
- Replace the per-month override block (lines 535-591) with a "Override for this month" button that opens a `Dialog` mounting `ScheduleItemsEditor` for `scopeType='page'`. Items seeded from current page items if override exists; otherwise from default items so the user starts from something sensible. Save calls `PUT /api/calendar-print/pages/:year/:month` with `scheduleItems` array. Revert-to-default button on the dialog calls the same endpoint with `scheduleItems: null`.
- **Scope-change confirm:** when saving an override that previously had no rows (or removing one that had rows), if `dayOverrides` exist with non-empty `inlineItemIds` on this page, surface a `ConfirmDialog`: "X day(s) have inline schedule selections that will be cleared because the schedule changes. Continue?"
- The "Edit override" / "Use default" inline buttons in Page Details (`:556-577`) go away — replaced by the single "Override for this month" button.

**Server cleanup:**

- Remove the `@deprecated` text-blob bridge endpoint. All writes go through the items array.
- `parseBlobToItems` util stays in the codebase as part of the migration script (which runs once); not exported beyond `scripts/`.

**Steps:**

1. Build `schedule-items-editor.tsx`.
2. Wire into Calendar Print Page.
3. `pnpm lint` + `pnpm build`.
4. Manual test:
   - Open default editor → reorder rows, toggle bold, change `eligibleDays`, save → footer preview updates live, save persists.
   - Open per-month override → seeded from default → make changes → save → page renders with override.
   - Revert per-month override → page renders with default again.
   - Confirm dialog fires when scope change would drop inline selections (set up a fake row to test).
5. Remove `@deprecated` endpoint and the textarea code paths. `pnpm lint` again.

**Verify:**

- Default schedule edits flow through; footer preview matches printed PDF.
- Per-month override edits flow through; reverting clears the override.
- Old textareas no longer mount.
- No regression on PDF/JPG export (visual fidelity unchanged).

---

## Phase 4 — Interactive preview + Day editor + Inline Schedule picker

This phase delivers the user-facing feature: clicking a cell opens the Day editor; Sun/Wed/Sat cells get an Inline Schedule section in the dialog.

**New component `src/components/calendar-print/calendar-grid-editor.tsx`:**

Wraps `CalendarGrid` in a relatively-positioned container. Absolutely positions a grid of transparent click zones — one `<button>` per in-month cell — sharing the same `(weekIndex, colIndex)` math as `buildRenderRows`. Hit zones have `cursor: pointer`, an `:active` flash (`background-color: rgba(0,0,0,0.04)`), and `onClick` handler `onCellClick(date: string)`. No persistent visual chrome.

Out-of-month merged cells are not clickable. Hit zones are skipped for them.

**New component `src/components/calendar-print/day-editor-dialog.tsx`:**

Props:

```ts
interface DayEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  date: string // YYYY-MM-DD
  events: CalendarPrintEvent[] // events on this date
  scheduleItems: NormalScheduleItem[] // active items for this page
  dayOverride: CalendarPrintDayOverride | null
}
```

Sections:

1. **Header:** "Sun, May 17, 2026" (formatted via `Intl.DateTimeFormat`).

2. **Events.** Inline list reusing the existing event-row pattern from the current Events card. Add/edit/duplicate/delete actions per row. "+ Add event" button. Edit/Add open the existing event form (the same `Dialog` content from `calendar-print-page.tsx:795-884`, refactored into its own component `event-form-dialog.tsx` for reuse).

3. **Inline Schedule** (only when `dayOfWeek(date) ∈ {0, 3, 6}` — Sun/Wed/Sat):
   - Title: "Inline schedule (overrides 'Normal Schedule' label)"
   - Filter `scheduleItems` to lines (drop spacers) where `eligibleDays.includes(weekdaySlug(date))` (`'sun'|'wed'|'sat'`).
   - Checkbox list of those items. Each row: checkbox + item text rendered through `parseScheduleLine` (so bold runs visible). Inline badges: `[Bold]` `[Col 2]` for visual cue.
   - Live count summary: `<X> of <N> selected` + a `fits comfortably` / `tight (4 items)` / `may clip on print (5+ items)` indicator. Thresholds: ≤3 comfortable, 4 borderline, ≥5 clip-risk.
   - Footer actions:
     - `[Reset to default]` — clears selection (sets `inlineItemIds = []`, treated as `null` → label behavior).
     - `[Apply to all Sundays in May]` (or Wednesdays/Saturdays, depending on weekday). Click → confirm dialog showing target dates count and how many already have overrides; on confirm, write the same selection to every weekday-matching cell in the page. Skipped if the current cell's selection is empty (nothing to copy).
     - `[Save]`.

**Page changes (`src/pages/calendar-print-page.tsx`):**

- Swap the visible preview to `CalendarGridEditor`. The hidden capture div continues mounting raw `CalendarGrid` — **do not** touch lines 753-793.
- Wire `onCellClick(date)` to open the Day editor.
- Replace the existing "Events" `Card` (lines 598-681) with the new collapsible "Events this month" read-only summary card. List sorted by date; each entry shows `{date · style badge · title}` with no controls.
- Remove the per-event `Dialog` (lines 795-884) from this file — moved into `event-form-dialog.tsx` and now mounted by the Day editor dialog.
- Remove `<ConfirmDialog>` for event delete (line 886-898) — moved into the Day editor.

**Render changes (`src/components/calendar-print/calendar-grid.tsx`):**

- New prop: `dayOverrides: CalendarPrintDayOverride[]`.
- Build `inlineByIso: Map<string, NormalScheduleItem[]>` from `dayOverrides` × `scheduleItems` (resolve each `inlineItemIds` array to its items, in array order).
- `InMonthCell` gets a new prop `inlineItems: NormalScheduleItem[]`. Rendering rules:
  - If `inlineItems.length > 0` and `shouldShowNormalScheduleLabel` is true (i.e. no `no_kaya`, no `suppressNormalSchedule`): render the inline stack **instead of** the "Normal Schedule" label. Pinned to bottom (`marginTop: 'auto'`), 9pt, line-height 1.15, centered text, gray. Each item's `bold` flag renders `font-weight: 700`. Text runs through `parseScheduleLine` so `**inline bold**` segments are honored.
  - If `inlineItems.length === 0` OR the cell has `no_kaya`/`suppressNormalSchedule`: existing behavior (label or hidden).

**API plumbing:**

- `createDayOverride`, `updateDayOverride`, `deleteDayOverride` mutations with TanStack Query invalidation of `queryKeys.calendarPrintPage(year, month)`.
- Bulk apply: client-side helper that fans out N create/update calls in parallel; wrap in a single toast.

**Steps:**

1. Build `event-form-dialog.tsx` by extracting the existing event form. Verify behavior unchanged in isolation.
2. Build `day-editor-dialog.tsx` with both sections.
3. Build `calendar-grid-editor.tsx` wrapper.
4. Update `calendar-grid.tsx` to render inline items on cells.
5. Wire into `calendar-print-page.tsx`; remove the Events card and per-event Dialog.
6. Add "Events this month" read-only summary card.
7. `pnpm lint` + `pnpm build`.
8. Manual test (desktop):
   - Click any cell → Day editor opens with correct date.
   - Add/edit/duplicate/delete event → behaves identically to before.
   - On a Sunday cell, pick 2 items → save → cell renders inline items at the bottom; "Normal Schedule" label gone; footer unchanged.
   - Empty selection → label returns (β semantics).
   - Apply to all Sundays in month → all Sundays show inline items.
   - Set an event with `suppressNormalSchedule` → inline items hidden on that cell, others unchanged.
   - PDF export → matches visible preview byte-for-byte. Capture target (hidden div) renders without editor chrome.
9. Manual test (iPad — direct hit on the dev URL):
   - Cells are tappable; tap flash is visible; Day editor opens.
   - Master Schedule editor reorder via arrow buttons works.
   - Layout doesn't collapse — preview stays the primary surface in landscape.

**Verify:**

- All cells in a populated month are clickable.
- Inline items render at correct position with correct sizing.
- Overflow warnings trigger at the right thresholds.
- Bulk apply confirms when overwriting existing selections.
- Capture path is clean: PDF export contains no hit-zone artifacts.
- `pnpm lint` clean; no console errors.

---

## Phase 5 — Cleanup + docs

1. Delete `parseBlobToItems` from runtime path (it remains only in `scripts/migrate-normal-schedule.ts`).
2. Sanity-check `CONTEXT.md` matches what shipped (terms still accurate).
3. Run `pnpm prettier --write` and `pnpm lint` across the project.
4. Smoke-test a printed PDF for each month with non-trivial content (one busy month, one less-busy month with inline overrides applied) — diff against pre-feature output for the busy month (should match), confirm visual correctness for the less-busy month.
5. Confirm launchd service is running and the app responds at the production URL.

---

## Files touched (summary)

**New:**

- `src/components/calendar-print/calendar-grid-editor.tsx`
- `src/components/calendar-print/day-editor-dialog.tsx`
- `src/components/calendar-print/event-form-dialog.tsx` (extraction)
- `src/components/calendar-print/schedule-items-editor.tsx`
- `server/lib/normal-schedule-migrate.ts` (the `parseBlobToItems` util)
- `scripts/migrate-normal-schedule.ts`
- `docs/adr/0004-structured-normal-schedule.md` (shipped with this plan)
- `docs/adr/0005-interactive-calendar-print-editor.md` (shipped with this plan)

**Modified:**

- `server/db/schema-calendar-print.ts` (new tables, drop column)
- `server/routes/calendar-print.ts` (new endpoints, schedule-items read/write, day-override CRUD)
- `src/lib/api.ts` (new types and helpers)
- `src/components/calendar-print/calendar-grid.tsx` (`scheduleItems` + `dayOverrides` props, inline rendering)
- `src/pages/calendar-print-page.tsx` (swap to editor wrapper, remove Events card, add summary)
- `CONTEXT.md` (already updated as part of this plan's grilling session)

**Removed:**

- Textarea-based schedule editing UI in `calendar-print-page.tsx`.
- `settings.calendar_print_default_schedule` row.
- `calendar_print_pages.normal_schedule_text` column.
