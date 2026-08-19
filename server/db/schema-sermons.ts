import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {serviceTimes} from './schema-attendance.js'
import {people} from './schema-core.js'
import {quotes} from './schema-quotes.js'

// One preached message. Identified by (service_time, date) — the same key a Service Record uses,
// so AM and PM on one Sunday are two Sermons. Transcript is stored inline (not UPLOADS_DIR):
// Quote Context indexes into it by character offset. See CONTEXT.md + docs/adr/0019.
export const sermons = sqliteTable(
  'sermons',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    serviceTimeId: integer('service_time_id')
      .notNull()
      .references(() => serviceTimes.id),
    sermonDate: text('sermon_date').notNull(), // 'YYYY-MM-DD'
    speakerPersonId: integer('speaker_person_id')
      .notNull()
      .references(() => people.id),
    title: text('title'),
    series: text('series'),
    // The single statement the preacher wanted people to leave with. Extracted, not typed.
    bigIdea: text('big_idea'),
    transcript: text('transcript').notNull(),
    generatedAt: text('generated_at'),
    generationModel: text('generation_model'),
    generationDurationMs: integer('generation_duration_ms'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [uniqueIndex('sermons_service_date_uniq').on(t.serviceTimeId, t.sermonDate)],
)

// The preacher's own words, in three forms. verbatim_text is the receipt and is never edited —
// edited_text overrides display only. Offsets drive Quote Context and are null once a transcript
// is replaced. See docs/adr/0019.
export const sermonSocialQuotes = sqliteTable('sermon_social_quotes', {
  id: integer('id').primaryKey({autoIncrement: true}),
  sermonId: integer('sermon_id')
    .notNull()
    .references(() => sermons.id, {onDelete: 'cascade'}),
  verbatimText: text('verbatim_text').notNull(),
  cleanedText: text('cleaned_text').notNull(),
  polishedText: text('polished_text').notNull(),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  rankTier: text('rank_tier', {enum: ['high', 'medium', 'low']}).notNull(),
  rankOrder: integer('rank_order').notNull(),
  rankNote: text('rank_note'),
  sensitive: integer('sensitive', {mode: 'boolean'}).notNull().default(false),
  sensitiveReason: text('sensitive_reason'),
  editedText: text('edited_text'),
  used: integer('used', {mode: 'boolean'}).notNull().default(false),
  promotedQuoteId: integer('promoted_quote_id').references(() => quotes.id, {onDelete: 'set null'}),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// ~100-200 word post written from a portion of the sermon. Free in voice, bound by the
// Scripture Floor (only passages this sermon cited, AKJV wording only).
export const sermonReflections = sqliteTable('sermon_reflections', {
  id: integer('id').primaryKey({autoIncrement: true}),
  sermonId: integer('sermon_id')
    .notNull()
    .references(() => sermons.id, {onDelete: 'cascade'}),
  body: text('body').notNull(),
  rankTier: text('rank_tier', {enum: ['high', 'medium', 'low']}).notNull(),
  rankOrder: integer('rank_order').notNull(),
  rankNote: text('rank_note'),
  sensitive: integer('sensitive', {mode: 'boolean'}).notNull().default(false),
  sensitiveReason: text('sensitive_reason'),
  editedBody: text('edited_body'),
  used: integer('used', {mode: 'boolean'}).notNull().default(false),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

// A passage the preacher actually cited. Doubles as the Scripture Floor whitelist and as the
// "have I preached this before?" index — book/chapter are split out for that lookup.
export const sermonScriptures = sqliteTable('sermon_scriptures', {
  id: integer('id').primaryKey({autoIncrement: true}),
  sermonId: integer('sermon_id')
    .notNull()
    .references(() => sermons.id, {onDelete: 'cascade'}),
  reference: text('reference').notNull(), // 'Psalm 19:7', 'Romans 7:18-8:2'
  book: text('book').notNull(),
  chapter: integer('chapter'),
  sortOrder: integer('sort_order').notNull().default(0),
})
