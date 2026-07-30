import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {messages, people, templates} from './schema-core.js'
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
    nameOverride: text('name_override'),
    // Manual roster inclusion: show this person on page 2 with (0) despite no signup.
    manualInclude: integer('manual_include', {mode: 'boolean'}).notNull().default(false),
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

export const fairBoothReminderRunStatuses = [
  'scheduled',
  'sending',
  'completed',
  'skipped',
  'past_due',
  'canceled',
] as const
export type FairBoothReminderRunStatus = (typeof fairBoothReminderRunStatuses)[number]

// A Reminder Run: "text everyone working <target_day>, the evening before."
//
// Deliberately stores no recipients and no rendered text — only the standing
// instruction. Recipients and their Shifts are resolved when the Run fires, so
// a Signup added after queuing is still included. This is the one queued send
// in the app that is NOT pre-rendered; see docs/adr/0018-fair-booth-reminder-runs.md.
export const fairBoothReminderRuns = sqliteTable(
  'fair_booth_reminder_runs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    // The day being worked — NOT the day the text goes out (that's the evening before).
    targetDay: text('target_day').notNull(),
    // Live reference, not a snapshot: editing the template changes pending Runs.
    // Re-validated at fire time; a template that lost {{timeSlot}} blocks the send.
    templateId: integer('template_id')
      .notNull()
      .references(() => templates.id, {onDelete: 'restrict'}),
    // UTC 'YYYY-MM-DD HH:MM:SS', same convention as messages.scheduled_at.
    scheduledAt: text('scheduled_at').notNull(),
    status: text('status', {enum: fairBoothReminderRunStatuses}).notNull().default('scheduled'),
    // Set once the Run fires and creates an ordinary, fully-rendered message.
    messageId: integer('message_id').references(() => messages.id, {onDelete: 'set null'}),
    error: text('error'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  // The idempotency guarantee: queuing twice can never double-send a day.
  (t) => [uniqueIndex('fair_booth_reminder_runs_schedule_day_uniq').on(t.scheduleId, t.targetDay)],
)
