# Normal Schedule moves from freeform text to a structured table

## Context

The calendar-print Normal Schedule (rendered in the footer of every printed page; pointed at by an italic "Normal Schedule" label on Sun/Wed/Sat cells) was stored as a single freeform text blob with two parsing conventions:

- `**inline bold runs**` for emphasis (`parseScheduleLine` in `src/components/calendar-print/calendar-grid.tsx`).
- A `---` line separator splitting the blob into two footer columns (`splitScheduleColumns`).

The default lived in the `settings` key-value table under `calendar_print_default_schedule`; per-month overrides lived in `calendar_print_pages.normal_schedule_text`.

The Inline Schedule Override feature ([CONTEXT.md → Inline schedule override](../../CONTEXT.md)) requires that each line be **selectable individually** as a picker option for a per-cell render, and that each line carry **`eligibleDays`** metadata (which of `sun`/`wed`/`sat` cells the picker may offer the line in). A text blob with parse-on-render conventions cannot carry that metadata without either inline tagging (ugly, brittle) or a sidecar map keyed by line text (drift-prone).

## Decision

The Normal Schedule is stored as structured items in a new `normal_schedule_items` table. The freeform-text representation and its parser are removed; the textarea editor is replaced by a row-based form.

Schema (Drizzle / SQLite):

```ts
export const normalScheduleItemTypes = ['line', 'spacer'] as const
export const normalScheduleItemScopes = ['default', 'page'] as const

export const normalScheduleItems = sqliteTable('normal_schedule_items', {
  id: integer('id').primaryKey({autoIncrement: true}),
  scopeType: text('scope_type', {enum: normalScheduleItemScopes}).notNull(),
  scopeId: integer('scope_id'), // null when scopeType='default'; calendar_print_pages.id otherwise
  type: text('type', {enum: normalScheduleItemTypes}).notNull(),
  text: text('text').notNull().default(''), // empty for spacers
  bold: integer('bold', {mode: 'boolean'}).notNull().default(false),
  column: integer('column').notNull().default(1), // 1 or 2 (footer two-column layout)
  eligibleDays: text('eligible_days').notNull().default('sun,wed,sat'), // CSV: 'sun', 'wed', 'sat'
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
```

Key rules:

- **Active items for a page = items whose scope matches.** If `calendar_print_pages.id = P` has _any_ items with `scopeType='page' scopeId=P`, those replace the default entirely for that page. If none, the default's items (`scopeType='default'`) are used. Mirrors today's semantics where setting `normalScheduleText` overrides the default whole-cloth.
- **`eligibleDays`** is a CSV of `{sun,wed,sat}` — these are the only weekdays that have inline-override slots, so any other day is meaningless. Default for a new item is `'sun,wed,sat'` (all three).
- **`spacer` items** preserve blank-line spacing in the footer. They are never offered in the inline picker.
- **Inline cell selections reference item ids by `inlineItemIds: number[]` on the per-cell `calendar_print_day_overrides` row.** Snapshot semantics — text edits flow through (same id), but adds/deletes do not retroactively change selections. Switching a page from "use default" to "has override" (or vice versa) drops inline selections on that page (id space changes); the UI confirms before doing so.

## Migration

A one-time migration converts the existing blob into rows for both the default and any per-month overrides:

1. Read `settings.calendar_print_default_schedule.value` (or the `DEFAULT_SCHEDULE_SEED` constant if absent) and every non-null `calendar_print_pages.normal_schedule_text`.
2. For each blob:
   1. Split on newlines.
   2. Find the first line matching `/^-{3,}\s*$/` — lines before it get `column=1`, lines after get `column=2`.
   3. For each line: if blank, emit a `spacer` row; otherwise parse `**bold**` runs. If the entire line is a single bold run, set `bold=true text=<run>`; otherwise keep the line as-is with `bold=false` and the `**` markers preserved in `text` so per-segment rendering via `parseScheduleLine` still works.
   4. Apply `eligibleDays` heuristic: case-insensitive regex match against `text`:
      - `/wed|wednesday|prayer time/i` → `'wed'`
      - `/sat|saturday|cleaning|visitation/i` → `'sat'`
      - `/sunday|sunday morning|sunday evening|sunday school|kaya|alive|choir|men's prayer/i` → `'sun'`
      - Lines matching no keyword: `'sun,wed,sat'` (default — user adjusts in editor).
3. **Visual-fidelity check.** For every blob converted, render the resulting rows through the existing `FooterContent` rendering path and diff the resulting HTML against the rendering of the original blob through the same path. Any non-match prints a row to a `migration-report.txt` for manual review. Migration aborts if the report is non-empty unless invoked with `--accept-diffs`.
4. After successful conversion: delete `settings` row, drop `calendar_print_pages.normal_schedule_text` column.

The report also lists each item with its guessed `eligibleDays` so the user can scan once and adjust.

## Why

- **Hard to reverse:** the parser and the textarea editor are deleted in the same release. Reverting requires re-introducing both _and_ converting structured rows back into a blob — possible but painful.
- **Surprising without context:** a future contributor sees `theme`, `verseText`, and other text fields on `calendar_print_pages` stored as plain strings, but the schedule lives in a separate table with a `scopeType` discriminator. This file is the breadcrumb explaining why.
- **Real trade-off:** keeping the blob with an inline-tag scheme (`[S]` / `[SWA]` prefixes) or a sidecar map was simpler to ship but reintroduced parsing-as-source-of-truth and drift-between-text-and-eligibility risks. The structured table makes item identity stable, makes `inlineItemIds` references trivially valid, and lets the row-based editor surface every field directly. The cost is the migration and the loss of "edit a textarea" simplicity in the master editor — paid once.

## Consequences

- **Editor UX changes.** The textarea is removed. The new row editor is reused for both the default and per-month overrides (only `scopeType`/`scopeId` differ). A live footer preview renders alongside the form using the same `FooterContent` component, fed by the in-progress rows.
- **API shape changes.** `fetchCalendarPrintDefaultSchedule` returns `{items: NormalScheduleItem[]}` instead of `{value: string}`. `fetchCalendarPrintPage` returns the active items (`page` items if any, else `default` items) instead of `normalScheduleText`. Two new endpoints handle item CRUD (`POST/PUT/DELETE /api/calendar-print/schedule-items`).
- **Footer rendering signature changes.** `CalendarGrid` accepts `scheduleItems: NormalScheduleItem[]` instead of `(normalScheduleText | null) + defaultSchedule: string`. Internally, items are grouped by `column` and rendered through the existing `ScheduleColumn` component; spacers emit the same `6px` gap as today's blank-line branch.
- **Switching scopes drops inline selections.** When a user adds (or removes) per-month override items on a page, any `calendar_print_day_overrides` rows on that page with non-empty `inlineItemIds` are cleared — the item ids reference an obsolete scope. The UI surfaces this in a confirm dialog before the scope change is committed.
- **`eligibleDays` CSV vs separate booleans.** CSV stays simple to query (`LIKE '%sat%'` or app-level parse) and avoids three boolean columns. The set is small (3 values) and never grows.
