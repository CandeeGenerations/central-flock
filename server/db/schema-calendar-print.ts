import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, unique} from 'drizzle-orm/sqlite-core'

export const calendarPrintEventStyles = ['bold', 'no_kaya', 'regular'] as const
export type CalendarPrintEventStyle = (typeof calendarPrintEventStyles)[number]

export const calendarPrintPages = sqliteTable(
  'calendar_print_pages',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    theme: text('theme'),
    themeColor: text('theme_color'),
    themePlacement: text('theme_placement'),
    versePlacement: text('verse_placement'),
    verseText: text('verse_text'),
    verseReference: text('verse_reference'),
    normalScheduleText: text('normal_schedule_text'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [unique().on(t.year, t.month)],
)

export const calendarPrintEvents = sqliteTable('calendar_print_events', {
  id: integer('id').primaryKey({autoIncrement: true}),
  pageId: integer('page_id')
    .notNull()
    .references(() => calendarPrintPages.id, {onDelete: 'cascade'}),
  date: text('date').notNull(),
  title: text('title').notNull(),
  style: text('style', {enum: calendarPrintEventStyles}).notNull(),
  suppressNormalSchedule: integer('suppress_normal_schedule', {mode: 'boolean'}).default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
