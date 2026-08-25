import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text, unique, uniqueIndex} from 'drizzle-orm/sqlite-core'

import {serviceTimes} from './schema-attendance.js'
import {hymns} from './schema-hymns.js'
import {schedules} from './schema-schedules.js'

// What an Order Line is for. Drives its default layout, its left cell, whether
// the Sound Booth Sheet includes it, and the wording used when the role is
// ABSENT ("No Choir", "NO Pastor's Selection TODAY").
// See docs/adr/0022-sound-booth-sheet-projection.md.
export const musicLineRoles = [
  'plain',
  'opening',
  'choir',
  'congregational',
  'motto',
  'verse',
  'theme',
  'pastor_selection',
  'message',
  'invitation',
  'special',
  'offering',
] as const
export type MusicLineRole = (typeof musicLineRoles)[number]

export const musicLineKinds = ['song', 'prose', 'page_break'] as const
export type MusicLineKind = (typeof musicLineKinds)[number]

// 'auto' defers to the role's default; the other two are the explicit override.
export const musicBoothModes = ['auto', 'include', 'exclude'] as const
export type MusicBoothMode = (typeof musicBoothModes)[number]

export const musicBoothSlots = ['motto_verse_theme', 'prayer_announcements'] as const
export type MusicBoothSlot = (typeof musicBoothSlots)[number]

export const musicLineAligns = ['left', 'center'] as const
export type MusicLineAlign = (typeof musicLineAligns)[number]

// Body table for the `schedules` envelope (schedule_type='music_schedule').
// One row per week, keyed on the Sunday; the Wednesday is derived.
export const musicSchedules = sqliteTable(
  'music_schedules',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id, {onDelete: 'cascade'}),
    weekStart: text('week_start').notNull(), // the Sunday, 'YYYY-MM-DD'
    // A free note about the week as a whole — "Tyler running services". Shown
    // and searchable on the week list; never printed.
    note: text('note').notNull().default(''),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('music_schedules_schedule_uniq').on(t.scheduleId),
    uniqueIndex('music_schedules_week_uniq').on(t.weekStart),
  ],
)

// One service that week. Seeded from active service_times; a one-off service (a
// revival night) carries serviceTimeId null and its own name. Title/scripture
// and their notes print only on the Sound Booth Sheet.
export const musicScheduleServices = sqliteTable(
  'music_schedule_services',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    musicScheduleId: integer('music_schedule_id')
      .notNull()
      .references(() => musicSchedules.id, {onDelete: 'cascade'}),
    serviceTimeId: integer('service_time_id').references(() => serviceTimes.id, {onDelete: 'set null'}),
    name: text('name').notNull().default(''),
    // Per-week overrides; blank falls back to the settings heading table.
    musicHeading: text('music_heading').notNull().default(''),
    boothHeading: text('booth_heading').notNull().default(''),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    time: text('time'), // 'HH:MM' override; null = the Service Time's
    meeting: integer('meeting', {mode: 'boolean'}).notNull().default(true),
    // Consumes an Episode Number. Off for Sunday School — it isn't uploaded.
    uploaded: integer('uploaded', {mode: 'boolean'}).notNull().default(true),
    episodeNumber: integer('episode_number'),
    title: text('title').notNull().default(''),
    titleNote: text('title_note').notNull().default(''), // '(Pastor Candee)'
    titleHighlight: integer('title_highlight', {mode: 'boolean'}).notNull().default(false),
    scripture: text('scripture').notNull().default(''), // the 'Text:' line
    scriptureNote: text('scripture_note').notNull().default(''),
    scriptureHighlight: integer('scripture_highlight', {mode: 'boolean'}).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('music_schedule_services_week_idx').on(t.musicScheduleId, t.sortOrder)],
)

// One row of a Service Order, printed as a row of a two-column table. A split
// row fills both cells; a merged row spans the width. Both the split/merge
// choice and the left cell default from `role` and are overridable — nullable
// columns mean "use the role default".
export const musicScheduleLines = sqliteTable(
  'music_schedule_lines',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    serviceId: integer('service_id')
      .notNull()
      .references(() => musicScheduleServices.id, {onDelete: 'cascade'}),
    kind: text('kind', {enum: musicLineKinds}).notNull(),
    role: text('role', {enum: musicLineRoles}).notNull().default('plain'),
    hymnId: integer('hymn_id').references(() => hymns.id, {onDelete: 'set null'}),
    freeSongTitle: text('free_song_title'), // song in neither hymnal
    suffix: text('suffix').notNull().default(''), // '(x2) (Invitation)' — prints unbolded
    leftText: text('left_text').notNull().default(''), // blank = derive
    text: text('text').notNull().default(''), // right cell, or merged content
    merged: integer('merged', {mode: 'boolean'}), // null = role default
    align: text('align', {enum: musicLineAligns}), // merged rows; null = default
    bold: integer('bold', {mode: 'boolean'}), // null = role default
    italic: integer('italic', {mode: 'boolean'}).notNull().default(false),
    // One highlight per sheet: the same line is often exceptional to the
    // musicians but routine to the sound team, or the other way round.
    highlight: integer('highlight', {mode: 'boolean'}).notNull().default(false),
    boothHighlight: integer('booth_highlight', {mode: 'boolean'}).notNull().default(false),
    // Keep the song when copying the week forward. On by default for `theme`.
    sticky: integer('sticky', {mode: 'boolean'}).notNull().default(false),
    booth: text('booth', {enum: musicBoothModes}).notNull().default('auto'),
    boothLabel: text('booth_label').notNull().default(''),
    boothNote: text('booth_note').notNull().default(''), // '(Choir & Cong.)'
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('music_schedule_lines_service_idx').on(t.serviceId, t.sortOrder)],
)

// The condensed prose lines the Sound Booth Sheet prints. Drafted from the roles
// present, then stored and hand-edited; `draftedFrom` holds the draft that was
// current when saved, so a line is stale when a fresh draft differs from it.
// Never rewritten silently — see docs/adr/0022-sound-booth-sheet-projection.md.
export const musicScheduleBoothLines = sqliteTable(
  'music_schedule_booth_lines',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    serviceId: integer('service_id')
      .notNull()
      .references(() => musicScheduleServices.id, {onDelete: 'cascade'}),
    slot: text('slot', {enum: musicBoothSlots}).notNull(),
    text: text('text').notNull().default(''),
    highlight: integer('highlight', {mode: 'boolean'}).notNull().default(false),
    draftedFrom: text('drafted_from').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [unique().on(t.serviceId, t.slot)],
)
