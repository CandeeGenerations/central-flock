import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

export const hymns = sqliteTable(
  'hymns',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    book: text('book', {enum: ['burgundy', 'silver']}).notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    firstLine: text('first_line'),
    refrainLine: text('refrain_line'),
    author: text('author'),
    composer: text('composer'),
    tune: text('tune'),
    meter: text('meter'),
    topics: text('topics').notNull(), // JSON array of strings
    scriptureRefs: text('scripture_refs').notNull(), // JSON array of strings
    notes: text('notes'),
    createdAt: text('created_at').default(sql`(datetime('now', 'localtime'))`),
  },
  (t) => ({
    bookNumberUnique: uniqueIndex('idx_hymns_book_number').on(t.book, t.number),
  }),
)

export const hymnSearches = sqliteTable('hymn_searches', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title').notNull(),
  scriptureText: text('scripture_text').notNull(),
  theme: text('theme').notNull(),
  audience: text('audience').notNull(),
  hymnalFilter: text('hymnal_filter', {enum: ['burgundy', 'silver', 'both']}).notNull(),
  sections: text('sections').notNull(), // JSON: full HymnSuggestionSections blob
  rawResponse: text('raw_response').notNull(),
  model: text('model').notNull(),
  candidateCount: integer('candidate_count').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now', 'localtime'))`),
})
