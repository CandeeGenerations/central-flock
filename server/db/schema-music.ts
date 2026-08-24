import {sql} from 'drizzle-orm'
import {integer, primaryKey, sqliteTable, text, unique} from 'drizzle-orm/sqlite-core'

import {serviceTimes} from './schema-attendance.js'
import {people} from './schema-core.js'
import {hymns} from './schema-hymns.js'

export const specialMusic = sqliteTable('special_music', {
  id: integer('id').primaryKey({autoIncrement: true}),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  // Nullable: a one-off service (revival night) carries null + its own
  // serviceLabel, the same shape music_schedule_services uses. A null can never
  // be part of a Double Booking. See docs/adr/0025.
  serviceTimeId: integer('service_time_id').references(() => serviceTimes.id, {onDelete: 'restrict'}),
  serviceLabel: text('service_label'),
  // Nullable so Special Music schedule cells can exist as "scheduled, not yet
  // sung" placeholders without a song chosen. See ADR 0006.
  songTitle: text('song_title'),
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
    // Per-cell override of the person's displayFirstNameOnly default.
    // null = inherit from people.display_first_name_only.
    displayFirstNameOnly: integer('display_first_name_only', {mode: 'boolean'}),
    displayName: text('display_name'),
  },
  (t) => [primaryKey({columns: [t.specialMusicId, t.personId]})],
)

export const households = sqliteTable('households', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const householdMembers = sqliteTable(
  'household_members',
  {
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
  },
  (t) => [primaryKey({columns: [t.householdId, t.personId]}), unique().on(t.personId)],
)
