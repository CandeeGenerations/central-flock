import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text, unique, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {hymns} from './schema-hymns.js'
import {schedules} from './schema-schedules.js'

// The three fixed four-month periods an edition covers: Jan-Apr, May-Aug,
// Sep-Dec. Always inside one calendar year, which is what lets an edition
// print one Yearly Theme and derive every month label from (year, term).
export const workersNotesTerms = [1, 2, 3] as const
export type WorkersNotesTerm = (typeof workersNotesTerms)[number]

export const workersNotesBlockKinds = ['note', 'spacer', 'next_term_forms', 'growth_plan', 'month_themes'] as const
export type WorkersNotesBlockKind = (typeof workersNotesBlockKinds)[number]

export const workersNotesLessonKinds = ['regular', 'special', 'combined', 'note'] as const
export type WorkersNotesLessonKind = (typeof workersNotesLessonKinds)[number]

// Body table for the `schedules` envelope (schedule_type='workers_notes').
// Holds the type's identity and the single stored lesson number — regular
// numbers are derived from it by position, never stored per row.
// See docs/adr/0020-derived-lesson-numbering.md.
export const workersNotesEditions = sqliteTable(
  'workers_notes_editions',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    year: integer('year').notNull(),
    term: integer('term').notNull(), // 1 | 2 | 3
    startingLessonNumber: integer('starting_lesson_number').notNull(),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('workers_notes_editions_schedule_uniq').on(t.scheduleId),
    uniqueIndex('workers_notes_editions_year_term_uniq').on(t.year, t.term),
  ],
)

// One row per calendar year, shared by all three editions of that year, so the
// chorus is typed once and an old edition re-exports with the theme it was
// printed with rather than the current one.
export const workersNotesThemes = sqliteTable('workers_notes_themes', {
  id: integer('id').primaryKey({autoIncrement: true}),
  year: integer('year').notNull().unique(),
  songTitle: text('song_title').notNull().default(''),
  songCredit: text('song_credit').notNull().default(''),
  chorusLyrics: text('chorus_lyrics').notNull().default(''), // newline-separated
  tagLyrics: text('tag_lyrics').notNull().default(''),
  verseText: text('verse_text').notNull().default(''),
  verseRef: text('verse_ref').notNull().default(''),
  growthPlan: text('growth_plan').notNull().default(''),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// Page-1 bullet list. Copies forward from the previous edition on create.
// `note` blocks are free text (with _underscore_ underlining) and copy
// verbatim; the three placeholder kinds render from the edition's own Term,
// Yearly Theme and Mottos, so they can never go stale.
export const workersNotesBlocks = sqliteTable(
  'workers_notes_blocks',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    editionId: integer('edition_id')
      .notNull()
      .references(() => workersNotesEditions.id, {onDelete: 'cascade'}),
    kind: text('kind', {enum: workersNotesBlockKinds}).notNull(),
    text: text('text').notNull().default(''), // only meaningful for kind='note'
    bold: integer('bold', {mode: 'boolean'}).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('workers_notes_blocks_edition_idx').on(t.editionId, t.sortOrder)],
)

// Four rows per edition. The printed Song is `songTitleOverride ?? hymn.title`
// plus a (B-###)/(S-###) derived from the hymn, so the reference cannot be
// wrong. hymnId null + an override covers a song in neither hymnal.
export const workersNotesMonths = sqliteTable(
  'workers_notes_months',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    editionId: integer('edition_id')
      .notNull()
      .references(() => workersNotesEditions.id, {onDelete: 'cascade'}),
    month: integer('month').notNull(), // 1-12
    hymnId: integer('hymn_id').references(() => hymns.id, {onDelete: 'set null'}),
    songTitleOverride: text('song_title_override'),
    // Printed verbatim on BOTH pages — page 2 as the Motto, page 1 as that
    // month's theme. No capitalisation transform.
    motto: text('motto').notNull().default(''),
    verse: text('verse').notNull().default(''),
  },
  (t) => [unique().on(t.editionId, t.month)],
)

// One row per Sunday, plus floating `note` rows anchored by sortOrder.
// No lesson-number column: `regular` numbers are derived by walking rows in
// order from the edition's startingLessonNumber, and `special`/`combined`/
// `note` consume nothing. See docs/adr/0020-derived-lesson-numbering.md.
export const workersNotesLessonRows = sqliteTable(
  'workers_notes_lesson_rows',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    editionId: integer('edition_id')
      .notNull()
      .references(() => workersNotesEditions.id, {onDelete: 'cascade'}),
    kind: text('kind', {enum: workersNotesLessonKinds}).notNull(),
    date: text('date'), // 'YYYY-MM-DD'; null for kind='note'
    specialLesson: text('special_lesson').notNull().default(''), // '142' | '151-153'
    // Points to Emphasize (regular/special), label (combined), or the italic
    // parenthetical line (note).
    text: text('text').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('workers_notes_lesson_rows_edition_idx').on(t.editionId, t.sortOrder)],
)

// The Betty Lukens catalogue. `lastPoints` is where "remember what I wrote"
// lives, so no lesson number has to be stored on a row.
export const bettyLukensStories = sqliteTable('betty_lukens_stories', {
  number: integer('number').primaryKey(), // 1-211
  title: text('title').notNull(),
  page: integer('page'),
  lastPoints: text('last_points'),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
