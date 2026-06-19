import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const quotes = sqliteTable('quotes', {
  id: integer('id').primaryKey({autoIncrement: true}),
  externalId: text('external_id').notNull().unique(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  capturedBy: text('captured_by').notNull(),
  capturedAt: text('captured_at').notNull(),
  dateDisplay: text('date_display').notNull(),
  summary: text('summary').notNull(),
  quoteText: text('quote_text').notNull(),
  tags: text('tags').notNull(), // JSON array of strings
  source: text('source').notNull(), // 'n8n' | 'import' | 'manual'
  createdAt: text('created_at').default(sql`(datetime('now', 'localtime'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now', 'localtime'))`),
})

export const quoteSearches = sqliteTable('quote_searches', {
  id: integer('id').primaryKey({autoIncrement: true}),
  topic: text('topic').notNull(),
  // Quote portion — nullable so a search can be music-only
  synthesis: text('synthesis'),
  results: text('results'), // JSON: [{quoteId, note, relevance}]
  model: text('model'),
  candidateCount: integer('candidate_count'),
  durationMs: integer('duration_ms'),
  // Music portion — self-contained (lyrics aren't in the DB, can't rehydrate)
  musicResults: text('music_results'), // JSON: MusicResult[] | null (null = music not searched)
  musicModel: text('music_model'),
  musicSearchedAt: text('music_searched_at'),
  musicDurationMs: integer('music_duration_ms'),
  createdAt: text('created_at').default(sql`(datetime('now', 'localtime'))`),
})
