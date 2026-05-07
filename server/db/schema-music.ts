import {sql} from 'drizzle-orm'
import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'

import {people} from './schema-core.js'
import {hymns} from './schema-hymns.js'

export const specialMusic = sqliteTable('special_music', {
  id: integer('id').primaryKey({autoIncrement: true}),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  serviceType: text('service_type', {
    enum: ['sunday_am', 'sunday_pm', 'wednesday_pm', 'other'],
  }).notNull(),
  serviceLabel: text('service_label'),
  songTitle: text('song_title').notNull(),
  hymnId: integer('hymn_id').references(() => hymns.id, {onDelete: 'set null'}),
  songArranger: text('song_arranger'),
  songWriter: text('song_writer'),
  type: text('type', {
    enum: ['solo', 'duet', 'trio', 'group', 'instrumental', 'other'],
  }).notNull(),
  status: text('status', {
    enum: ['will_perform', 'needs_review', 'performed'],
  }).notNull(),
  occasion: text('occasion'),
  guestPerformers: text('guest_performers').notNull().default('[]'), // JSON array of strings
  youtubeUrl: text('youtube_url'),
  sheetMusicPath: text('sheet_music_path'), // /uploads/special-music/<filename>
  notes: text('notes'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const specialMusicPerformers = sqliteTable(
  'special_music_performers',
  {
    specialMusicId: integer('special_music_id')
      .notNull()
      .references(() => specialMusic.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    ordering: integer('ordering').notNull().default(0),
  },
  (t) => [primaryKey({columns: [t.specialMusicId, t.personId]})],
)
