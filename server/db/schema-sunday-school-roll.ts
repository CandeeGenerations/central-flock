import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {schedules} from './schema-schedules.js'

// Body table for the `schedules` envelope (schedule_type='sunday_school_roll').
// The Roll is print-only: it stores rosters and labels and nothing else — no
// marks, no cells, no date rows. Columns are derived from (year, quarter).
// See docs/adr/0029-sunday-school-roll-is-print-only.md.
export const sundaySchoolRolls = sqliteTable(
  'sunday_school_rolls',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    year: integer('year').notNull(),
    quarter: integer('quarter').notNull(), // 1 | 2 | 3 | 4
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('sunday_school_rolls_schedule_uniq').on(t.scheduleId),
    uniqueIndex('sunday_school_rolls_year_quarter_uniq').on(t.year, t.quarter),
  ],
)

// One printed landscape page per Class. `label` is free text, not a foreign key
// to a configured Class list — copy-forward is the only propagation. `scholars`
// is the whole roster as newline-separated text, so line index IS row index and
// a blank line prints as a deliberate blank row.
// See docs/adr/0030-roll-classes-and-rosters-propagate-by-copy-forward.md.
export const sundaySchoolRollSheets = sqliteTable(
  'sunday_school_roll_sheets',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    rollId: integer('roll_id')
      .notNull()
      .references(() => sundaySchoolRolls.id, {onDelete: 'cascade'}),
    label: text('label').notNull().default(''),
    scholars: text('scholars').notNull().default(''),
    // Also the PDF page order.
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('sunday_school_roll_sheets_roll_idx').on(t.rollId, t.sortOrder)],
)
