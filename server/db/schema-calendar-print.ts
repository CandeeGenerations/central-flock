import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text, unique} from 'drizzle-orm/sqlite-core'

export const calendarPrintEventStyles = ['bold', 'regular'] as const
export type CalendarPrintEventStyle = (typeof calendarPrintEventStyles)[number]

export const normalScheduleItemTypes = ['line', 'spacer'] as const
export type NormalScheduleItemType = (typeof normalScheduleItemTypes)[number]

export const normalScheduleItemScopes = ['default', 'page'] as const
export type NormalScheduleItemScope = (typeof normalScheduleItemScopes)[number]

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
    hideNormalScheduleFooter: integer('hide_normal_schedule_footer', {mode: 'boolean'}).notNull().default(false),
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
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

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
    hidden: integer('hidden', {mode: 'boolean'}).notNull().default(false),
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
    inlineItemIds: text('inline_item_ids').notNull().default('[]'),
    showNoKaya: integer('show_no_kaya', {mode: 'boolean'}).notNull().default(false),
    showNormalScheduleLabel: integer('show_normal_schedule_label', {mode: 'boolean'}).notNull().default(true),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [unique().on(t.pageId, t.date)],
)
