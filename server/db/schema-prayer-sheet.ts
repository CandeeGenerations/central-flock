import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const prayerSheetEditions = sqliteTable('prayer_sheet_editions', {
  id: integer('id').primaryKey({autoIncrement: true}),
  themeColor: text('theme_color').notNull(),
  // null = auto-split at midpoint; integer = split after Sunday N (1-based)
  columnSplit: integer('column_split'),
  // /uploads URL of the printed-sheet photo an imported edition was read from
  sourcePhotoPath: text('source_photo_path'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const prayerSheetSundays = sqliteTable(
  'prayer_sheet_sundays',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    editionId: integer('edition_id')
      .notNull()
      .references(() => prayerSheetEditions.id, {onDelete: 'cascade'}),
    sundayDate: text('sunday_date').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('prayer_sheet_sundays_edition_idx').on(t.editionId, t.sortOrder)],
)

export const prayerSheetEntries = sqliteTable(
  'prayer_sheet_entries',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    sundayId: integer('sunday_id')
      .notNull()
      .references(() => prayerSheetSundays.id, {onDelete: 'cascade'}),
    text: text('text').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('prayer_sheet_entries_sunday_idx').on(t.sundayId, t.sortOrder)],
)

// Singleton — id always 1
export const prayerSheetSettings = sqliteTable('prayer_sheet_settings', {
  id: integer('id').primaryKey(),
  title: text('title').notNull().default('CBC PRAYER SHEET'),
  scriptureText: text('scripture_text')
    .notNull()
    .default(
      '“And it shall come to pass, that before they call, I will answer; and while they are yet speaking, I will hear.”',
    ),
  scriptureReference: text('scripture_reference').notNull().default('Isaiah 65:24'),
  // Colors for each Sunday-of-month position (1st–5th Sunday)
  colorSunday1: text('color_sunday_1').notNull().default('#1D4ED8'),
  colorSunday2: text('color_sunday_2').notNull().default('#15803D'),
  colorSunday3: text('color_sunday_3').notNull().default('#B91C1C'),
  colorSunday4: text('color_sunday_4').notNull().default('#B45309'),
  colorSunday5: text('color_sunday_5').notNull().default('#6D28D9'),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const prayerSheetMinistryItems = sqliteTable('prayer_sheet_ministry_items', {
  id: integer('id').primaryKey({autoIncrement: true}),
  text: text('text').notNull().default(''),
  bold: integer('bold', {mode: 'boolean'}).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
})
