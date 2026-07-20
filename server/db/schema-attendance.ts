import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

// Recurring worship-service slot. day_of_week: 0=Sun..6=Sat. time: 'HH:MM' 24h.
// active=false soft-retires it (hidden from public entry, history kept in reports).
// See CONTEXT.md (Service Stats) + docs/adr/0014.
export const serviceTimes = sqliteTable('service_times', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  time: text('time').notNull(),
  active: integer('active', {mode: 'boolean'}).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// Named entrant. token = access gate + attribution basis (RSVP-style). See ADR-0015.
// Soft-retire via active; hard-delete only when zero edits.
export const recorders = sqliteTable('recorders', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  active: integer('active', {mode: 'boolean'}).notNull().default(true),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// One record per (service_time, date). attendance/streaming nullable: blank != 0.
// Upsert on write. service_date = 'YYYY-MM-DD'. latestRecorder* denormalize the newest edit.
export const serviceRecords = sqliteTable(
  'service_records',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    serviceTimeId: integer('service_time_id')
      .notNull()
      .references(() => serviceTimes.id, {onDelete: 'cascade'}),
    serviceDate: text('service_date').notNull(),
    attendance: integer('attendance'),
    streaming: integer('streaming'),
    // Denormalized latest attribution for fast table display (null = imported/no edit).
    latestRecorderId: integer('latest_recorder_id').references(() => recorders.id, {onDelete: 'set null'}),
    latestRecorderName: text('latest_recorder_name'),
    latestEnteredAt: text('latest_entered_at'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [uniqueIndex('service_records_time_date_uniq').on(t.serviceTimeId, t.serviceDate)],
)

// Full change log. One row per save. recorderId null = admin edit. recorderName snapshotted
// so history survives recorder deletion.
export const serviceRecordEdits = sqliteTable('service_record_edits', {
  id: integer('id').primaryKey({autoIncrement: true}),
  serviceRecordId: integer('service_record_id')
    .notNull()
    .references(() => serviceRecords.id, {onDelete: 'cascade'}),
  recorderId: integer('recorder_id').references(() => recorders.id, {onDelete: 'set null'}),
  recorderName: text('recorder_name').notNull(),
  attendance: integer('attendance'),
  streaming: integer('streaming'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
