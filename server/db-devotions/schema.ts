import {sql} from 'drizzle-orm'
import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const scanDrafts = sqliteTable('scan_drafts', {
  id: integer('id').primaryKey({autoIncrement: true}),
  month: text('month').notNull(),
  year: integer('year').notNull(),
  data: text('data').notNull(),
  imagePath: text('image_path'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const devotions = sqliteTable('devotions', {
  id: integer('id').primaryKey({autoIncrement: true}),
  date: text('date').notNull(),
  number: integer('number').notNull().unique(),
  devotionType: text('devotion_type', {enum: ['original', 'favorite', 'guest', 'revisit']}).notNull(),
  subcode: text('subcode'),
  guestSpeaker: text('guest_speaker'),
  guestNumber: integer('guest_number'),
  referencedDevotions: text('referenced_devotions'),
  bibleReference: text('bible_reference'),
  songName: text('song_name'),
  title: text('title'),
  talkingPoints: text('talking_points'),
  youtubeDescription: text('youtube_description'),
  facebookDescription: text('facebook_description'),
  podcastDescription: text('podcast_description'),
  produced: integer('produced', {mode: 'boolean'}).default(false).notNull(),
  rendered: integer('rendered', {mode: 'boolean'}).default(false).notNull(),
  youtube: integer('youtube', {mode: 'boolean'}).default(false).notNull(),
  facebookInstagram: integer('facebook_instagram', {mode: 'boolean'}).default(false).notNull(),
  podcast: integer('podcast', {mode: 'boolean'}).default(false).notNull(),
  notes: text('notes'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const generatedPassages = sqliteTable('generated_passages', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title').notNull(),
  bibleReference: text('bible_reference').notNull(),
  talkingPoints: text('talking_points').notNull(),
  used: integer('used', {mode: 'boolean'}).default(false).notNull(),
  devotionId: integer('devotion_id').references(() => devotions.id, {onDelete: 'set null'}),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  usedAt: text('used_at'),
})
