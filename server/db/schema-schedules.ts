import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const scheduleTypes = ['nursery', 'special_music'] as const
export type ScheduleType = (typeof scheduleTypes)[number]

export const scopeKinds = ['monthly', 'date_range'] as const
export type ScopeKind = (typeof scopeKinds)[number]

// Shared envelope for every printable Schedule across types.
// Per-type body rows live in type-specific tables (nursery_assignments) or are
// queried by date range against an existing table (special_music). See
// docs/adr/0006-multi-type-schedule-envelope.md.
export const schedules = sqliteTable('schedules', {
  id: integer('id').primaryKey({autoIncrement: true}),
  scheduleType: text('schedule_type', {enum: scheduleTypes}).notNull(),
  scopeKind: text('scope_kind', {enum: scopeKinds}).notNull(),
  // monthly scope (nursery)
  month: integer('month'),
  year: integer('year'),
  // date_range scope (special_music, future sunday_school)
  scopeStart: text('scope_start'),
  scopeEnd: text('scope_end'),
  // displayed in the title after the type's titlePrefix setting
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
