import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {people} from './schema-core.js'
import {schedules} from './schema-schedules.js'

export const fairBoothFairRoles = ['worker', 'asst_unit', 'unit_leader', 'asst_fair_mgr', 'fair_mgr'] as const
export type FairBoothFairRole = (typeof fairBoothFairRoles)[number]

export const fairBoothShiftRoles = ['worker', 'asst_unit', 'unit_leader'] as const
export type FairBoothShiftRole = (typeof fairBoothShiftRoles)[number]

// Sparse per-schedule per-person overrides. Missing row -> defaults
// (fair_role='worker', computed initials). See docs/adr/0009-fair-booth-schedule.md.
export const fairBoothRosterAttrs = sqliteTable(
  'fair_booth_roster_attrs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    fairRole: text('fair_role', {enum: fairBoothFairRoles}).notNull().default('worker'),
    initialsOverride: text('initials_override'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [uniqueIndex('fair_booth_roster_attrs_schedule_person_uniq').on(t.scheduleId, t.personId)],
)

// Signups are time-ranges (minutes since midnight, 30-min granularity).
// Slot is render-only — derived from majority-of-hours-in-slot at render time.
export const fairBoothSignups = sqliteTable('fair_booth_signups', {
  id: integer('id').primaryKey({autoIncrement: true}),
  scheduleId: integer('schedule_id')
    .notNull()
    .references(() => schedules.id, {onDelete: 'cascade'}),
  personId: integer('person_id')
    .notNull()
    .references(() => people.id, {onDelete: 'cascade'}),
  dayDate: text('day_date').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  shiftRole: text('shift_role', {enum: fairBoothShiftRoles}).notNull().default('worker'),
  sortOrder: integer('sort_order').notNull().default(0),
  displayRowOverride: integer('display_row_override'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
