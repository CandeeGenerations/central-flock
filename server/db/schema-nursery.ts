import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, unique} from 'drizzle-orm/sqlite-core'

import {serviceTimes} from './schema-attendance.js'
import {people} from './schema-core.js'
import {schedules} from './schema-schedules.js'

// A Nursery Worker IS a Person (see docs/adr/0025). `name` is a nullable
// override for what the printed roster shows — worker "Yuny Mejia" is contact
// "Juni Salgado". With no override the contact's own name prints.
export const nurseryWorkers = sqliteTable('nursery_workers', {
  id: integer('id').primaryKey({autoIncrement: true}),
  personId: integer('person_id')
    .notNull()
    .references(() => people.id, {onDelete: 'cascade'}),
  name: text('name'),
  maxPerMonth: integer('max_per_month').notNull().default(4),
  allowMultiplePerDay: integer('allow_multiple_per_day', {mode: 'boolean'}).notNull().default(false),
  isActive: integer('is_active', {mode: 'boolean'}).notNull().default(true),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const nurseryWorkerServices = sqliteTable(
  'nursery_worker_services',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    workerId: integer('worker_id')
      .notNull()
      .references(() => nurseryWorkers.id, {onDelete: 'cascade'}),
    serviceTimeId: integer('service_time_id')
      .notNull()
      .references(() => serviceTimes.id, {onDelete: 'cascade'}),
    maxPerMonth: integer('max_per_month'),
  },
  (t) => [unique().on(t.workerId, t.serviceTimeId)],
)

// Label and sort order live on service_times — this holds only how many
// workers the service needs. See docs/adr/0025.
export const nurseryServiceConfig = sqliteTable('nursery_service_config', {
  serviceTimeId: integer('service_time_id')
    .primaryKey()
    .references(() => serviceTimes.id, {onDelete: 'cascade'}),
  workerCount: integer('worker_count').notNull().default(2),
})

// nursery_schedules was merged into the shared `schedules` envelope table
// (see docs/adr/0006-multi-type-schedule-envelope.md). Nursery assignments
// now FK directly to schedules.id with schedule_type='nursery'.

export const nurseryAssignments = sqliteTable(
  'nursery_assignments',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    date: text('date').notNull(),
    serviceTimeId: integer('service_time_id')
      .notNull()
      .references(() => serviceTimes.id, {onDelete: 'cascade'}),
    slot: integer('slot').notNull(),
    workerId: integer('worker_id').references(() => nurseryWorkers.id, {onDelete: 'set null'}),
  },
  (t) => [unique().on(t.scheduleId, t.date, t.serviceTimeId, t.slot)],
)

export const nurserySettings = sqliteTable('nursery_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
