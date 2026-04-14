import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, unique} from 'drizzle-orm/sqlite-core'

export const serviceTypes = ['sunday_school', 'morning', 'evening', 'wednesday_evening'] as const
export type ServiceType = (typeof serviceTypes)[number]

export const nurseryWorkers = sqliteTable('nursery_workers', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
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
    serviceType: text('service_type', {enum: serviceTypes}).notNull(),
    maxPerMonth: integer('max_per_month'),
  },
  (t) => [unique().on(t.workerId, t.serviceType)],
)

export const nurseryServiceConfig = sqliteTable('nursery_service_config', {
  serviceType: text('service_type', {enum: serviceTypes}).primaryKey(),
  label: text('label').notNull(),
  workerCount: integer('worker_count').notNull().default(2),
  sortOrder: integer('sort_order').notNull(),
})

export const nurserySchedules = sqliteTable('nursery_schedules', {
  id: integer('id').primaryKey({autoIncrement: true}),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
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

export const nurseryAssignments = sqliteTable(
  'nursery_assignments',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => nurserySchedules.id, {onDelete: 'cascade'}),
    date: text('date').notNull(),
    serviceType: text('service_type', {enum: serviceTypes}).notNull(),
    slot: integer('slot').notNull(),
    workerId: integer('worker_id').references(() => nurseryWorkers.id, {onDelete: 'set null'}),
  },
  (t) => [unique().on(t.scheduleId, t.date, t.serviceType, t.slot)],
)

export const nurserySettings = sqliteTable('nursery_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
