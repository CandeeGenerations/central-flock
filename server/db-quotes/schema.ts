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
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const quoteSearches = sqliteTable('quote_searches', {
  id: integer('id').primaryKey({autoIncrement: true}),
  topic: text('topic').notNull(),
  synthesis: text('synthesis').notNull(),
  results: text('results').notNull(), // JSON: [{quoteId, note, relevance}]
  model: text('model').notNull(),
  candidateCount: integer('candidate_count').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
