/**
 * Seeds the Music Schedule for the week of 16 August 2026 from the paper
 * originals — the Sound Booth sheet, the Sunday music sheet, and the Midweek
 * music sheet — and stores each service's line structure as the default order
 * for its Service Time, so a first week with no predecessor has something to
 * build from.
 *
 * The 23 August Sound Booth sheet exists on paper too, which makes creating
 * that week through the real "New week" flow an acceptance test with a
 * known-correct answer.
 *
 * Prereq: `pnpm db:migrate` (needs the music_schedule_* tables).
 *
 * Usage: npx tsx scripts/seed-music-schedule-2026-08-16.ts
 *
 * Safe to re-run: keyed on week_start; an existing week is left alone.
 *
 * Transcription notes:
 *   - The hymns catalogue stores titles in capitals, and the paper's wording is
 *     sometimes shorter than the catalogue's ("I Will Sing Of The Mercies" vs
 *     "I WILL SING OF THE MERCIES OF THE LORD"). Where they differ, the line
 *     carries the paper's wording; the reference always comes from the FK.
 *   - The morning opener's left cell reads "NO CHOIR  Cong." on the paper, which
 *     is a one-off override of the reference — so the reference prints inline.
 */
import Database from 'better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import {type OrderLine, draftBoothLine, serviceDateFor, weekBounds, weekLabel} from '../src/lib/music-schedule-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '..', 'central-flock.db'))
db.pragma('foreign_keys = ON')

const WEEK_START = '2026-08-16'

type Book = 'burgundy' | 'silver'

interface SeedLine {
  kind: 'song' | 'prose' | 'page_break'
  role: string
  book?: Book
  number?: number
  /** The paper's wording, when it differs from the catalogue title. */
  title?: string
  suffix?: string
  leftText?: string
  text?: string
  merged?: boolean | null
  bold?: boolean | null
  italic?: boolean
  highlight?: boolean
  sticky?: boolean
  boothNote?: string
}

interface SeedService {
  serviceTimeName: string
  dayOfWeek: number
  time: string
  uploaded: boolean
  episodeNumber: number | null
  title?: string
  titleNote?: string
  titleHighlight?: boolean
  scripture?: string
  scriptureNote?: string
  scriptureHighlight?: boolean
  lines: SeedLine[]
  /** Hand-edited condensed Sound Booth lines, where they differ from the draft. */
  boothEdits?: Partial<Record<'motto_verse_theme' | 'prayer_announcements', string>>
}

// The first line of every service is split so its time lands in the left cell.
const opener = (): SeedLine => ({kind: 'prose', role: 'plain', text: 'Live Stream - Welcome', merged: false})

const SERVICES: SeedService[] = [
  {
    serviceTimeName: 'Sunday School',
    dayOfWeek: 0,
    time: '09:45',
    uploaded: false,
    episodeNumber: null,
    lines: [
      opener(),
      {
        kind: 'song',
        role: 'opening',
        book: 'burgundy',
        number: 269,
        title: 'I Will Sing Of The Mercies',
        boothNote: '(Pastor Candee)',
        highlight: true,
      },
      {kind: 'prose', role: 'plain', text: 'Prayer, Announcements'},
      {kind: 'song', role: 'congregational', book: 'burgundy', number: 35, title: 'He Is Lord'},
      {kind: 'prose', role: 'message', text: '_Message_, Offline, Prayer, Invitation'},
      {
        kind: 'song',
        role: 'invitation',
        book: 'burgundy',
        number: 110,
        title: 'Spirit of the Living God',
        suffix: '(Invitation)',
      },
      {kind: 'song', role: 'plain', book: 'burgundy', number: 254, title: 'His Name Is Wonderful'},
      {kind: 'prose', role: 'offering', text: 'Offering, Praises, Prayer Requests, Dismiss'},
    ],
  },
  {
    serviceTimeName: 'Sunday Morning',
    dayOfWeek: 0,
    time: '11:00',
    uploaded: true,
    episodeNumber: 97,
    title: 'Jesus Saith, ... I Am The Truth...',
    scripture: 'John 14:6',
    scriptureNote: '(Pastor Candee)',
    scriptureHighlight: true,
    lines: [
      opener(),
      {
        kind: 'song',
        role: 'congregational',
        book: 'burgundy',
        number: 324,
        title: 'Take The Name of Jesus With You',
        leftText: 'NO CHOIR  Cong.',
        highlight: true,
      },
      {kind: 'prose', role: 'motto', text: 'Rejoice That God Allows... _Soulwinners_'},
      {kind: 'prose', role: 'verse', text: 'Proverbs 11:30'},
      {
        kind: 'song',
        role: 'theme',
        book: 'burgundy',
        number: 546,
        title: 'Lead Me to Some Soul Today',
        suffix: '(x2 w/tag)',
        sticky: true,
      },
      {kind: 'prose', role: 'plain', text: 'Prayer, Announcements'},
      {kind: 'prose', role: 'pastor_selection', text: "NO Pastor's Selection TODAY", highlight: true},
      {kind: 'song', role: 'congregational', book: 'burgundy', number: 99, title: "Isn't He Wonderful", suffix: '(x2)'},
      {kind: 'prose', role: 'message', text: '_Message_, Offline, Prayer, Invitation'},
      {
        kind: 'song',
        role: 'invitation',
        book: 'burgundy',
        number: 167,
        title: 'Just As I Am',
        suffix: '(Invitation)',
      },
      {kind: 'prose', role: 'special', text: 'Announcements, Offering, Special'},
      {kind: 'song', role: 'plain', book: 'burgundy', number: 341, title: 'Victory in Jesus'},
    ],
    // The paper trims the parentheticals this week; the draft carries them.
    boothEdits: {motto_verse_theme: 'Motto, Verse, Theme Song'},
  },
  {
    serviceTimeName: 'Sunday Evening',
    dayOfWeek: 0,
    time: '18:30',
    uploaded: true,
    episodeNumber: 98,
    title: 'What the Word Will Do',
    scripture: 'Psalm 19:7-8',
    scriptureNote: '(Pastor Candee)',
    scriptureHighlight: true,
    lines: [
      opener(),
      {kind: 'song', role: 'opening', book: 'burgundy', number: 472, title: 'Wonderful Words of Life'},
      {
        kind: 'prose',
        role: 'message',
        text: 'Prayer, Announcements, _Message_, Offline, Prayer, Invitation',
      },
      {
        kind: 'song',
        role: 'invitation',
        book: 'burgundy',
        number: 467,
        title: 'The Bible Stands',
        suffix: '(x2) (Invitation)',
      },
      {kind: 'song', role: 'plain', book: 'burgundy', number: 244, title: 'Hold The Fort'},
      {kind: 'prose', role: 'special', text: 'Announcements, Offering, Special'},
      {kind: 'prose', role: 'plain', text: 'Birthdays, Anniversaries'},
      {kind: 'song', role: 'plain', book: 'silver', number: 59, title: 'Psalm 19'},
      {
        kind: 'song',
        role: 'plain',
        book: 'burgundy',
        number: 341,
        title: 'Victory in Jesus',
        suffix: '(Optional)',
        italic: true,
      },
      {kind: 'prose', role: 'plain', text: 'Prayer, Dismiss'},
    ],
  },
  {
    serviceTimeName: 'Wednesday Evening',
    dayOfWeek: 3,
    time: '19:30',
    uploaded: true,
    episodeNumber: 99,
    title: "Don't Neglect To Teach - Part 3",
    scripture: 'Titus 2:11-15',
    scriptureNote: '(Preacher)',
    lines: [
      opener(),
      {kind: 'song', role: 'opening', book: 'burgundy', number: 241, title: 'Grace Greater Than Our Sin'},
      {kind: 'prose', role: 'message', text: 'Prayer, Announcements, _Message_, Invitation'},
      {
        kind: 'song',
        role: 'invitation',
        book: 'burgundy',
        number: 526,
        title: "It's Harvest Time",
        suffix: '(Invitation)',
      },
      {kind: 'song', role: 'plain', book: 'silver', number: 44, title: 'Look For Me At Jesus Feet'},
      {kind: 'prose', role: 'offering', text: 'Announcements, Offering'},
      {kind: 'song', role: 'plain', book: 'burgundy', number: 469, title: 'Some Bright Morning', suffix: '(x2)'},
      {kind: 'prose', role: 'plain', text: 'Praise, Prayer Requests'},
      {kind: 'prose', role: 'plain', text: 'Prayer, Dismiss'},
    ],
  },
]

/* ------------------------------------------------------------------ seed */

const existing = db.prepare('select id from music_schedules where week_start = ?').get(WEEK_START) as
  | {id: number}
  | undefined
if (existing) {
  console.log(`Week ${WEEK_START} already exists (id ${existing.id}) — nothing to do.`)
  process.exit(0)
}

const hymnId = (book: Book, number: number): number | null => {
  const row = db.prepare('select id from hymns where book = ? and number = ?').get(book, number) as
    | {id: number}
    | undefined
  if (!row) {
    console.warn(`  ! no ${book} #${number} in the hymns catalogue — seeding the line with no reference`)
    return null
  }
  return row.id
}

const serviceTimeId = (name: string): number | null => {
  const row = db.prepare('select id from service_times where name = ?').get(name) as {id: number} | undefined
  if (!row) console.warn(`  ! no Service Time named "${name}" — seeding as a one-off service`)
  return row?.id ?? null
}

const {scopeStart, scopeEnd} = weekBounds(WEEK_START)
const scheduleId = db
  .prepare(
    `insert into schedules (schedule_type, scope_kind, scope_start, scope_end, scope_label, status)
     values ('music_schedule', 'date_range', ?, ?, ?, 'final')`,
  )
  .run(scopeStart, scopeEnd, weekLabel(WEEK_START)).lastInsertRowid as number

const weekId = db
  .prepare('insert into music_schedules (schedule_id, week_start) values (?, ?)')
  .run(scheduleId, WEEK_START).lastInsertRowid as number

const defaultOrders: Record<string, unknown[]> = {}

SERVICES.forEach((svc, order) => {
  const stId = serviceTimeId(svc.serviceTimeName)
  const date = serviceDateFor(WEEK_START, svc.dayOfWeek)
  const svcId = db
    .prepare(
      `insert into music_schedule_services
        (music_schedule_id, service_time_id, name, date, time, meeting, uploaded, episode_number,
         title, title_note, title_highlight, scripture, scripture_note, scripture_highlight, sort_order)
       values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      weekId,
      stId,
      svc.serviceTimeName,
      date,
      svc.time,
      svc.uploaded ? 1 : 0,
      svc.episodeNumber,
      svc.title ?? '',
      svc.titleNote ?? '',
      svc.titleHighlight ? 1 : 0,
      svc.scripture ?? '',
      svc.scriptureNote ?? '',
      svc.scriptureHighlight ? 1 : 0,
      order,
    ).lastInsertRowid as number

  const insertLine = db.prepare(
    `insert into music_schedule_lines
      (service_id, kind, role, hymn_id, free_song_title, suffix, left_text, text, merged, align,
       bold, italic, highlight, sticky, booth, booth_label, booth_note, sort_order)
     values (?, ?, ?, ?, null, ?, ?, ?, ?, null, ?, ?, ?, ?, 'auto', '', ?, ?)`,
  )

  // Built alongside the inserts so the condensed Sound Booth drafts can be
  // computed from the same data the page will see.
  const asOrderLines: OrderLine[] = []

  svc.lines.forEach((l, i) => {
    const hid = l.kind === 'song' && l.book && l.number ? hymnId(l.book, l.number) : null
    insertLine.run(
      svcId,
      l.kind,
      l.role,
      hid,
      l.suffix ?? '',
      l.leftText ?? '',
      l.kind === 'song' ? (l.title ?? '') : (l.text ?? ''),
      l.merged === undefined ? null : l.merged ? 1 : 0,
      l.bold === undefined ? null : l.bold ? 1 : 0,
      l.italic ? 1 : 0,
      l.highlight ? 1 : 0,
      l.sticky ? 1 : 0,
      l.boothNote ?? '',
      i,
    )
    asOrderLines.push({
      id: i,
      kind: l.kind,
      role: l.role as OrderLine['role'],
      hymnId: hid,
      hymnBook: l.book ?? null,
      hymnNumber: l.number ?? null,
      hymnTitle: null,
      freeSongTitle: null,
      suffix: l.suffix ?? '',
      leftText: l.leftText ?? '',
      text: l.kind === 'song' ? (l.title ?? '') : (l.text ?? ''),
      merged: l.merged === undefined ? null : l.merged,
      align: null,
      bold: l.bold === undefined ? null : l.bold,
      italic: Boolean(l.italic),
      highlight: Boolean(l.highlight),
      sticky: Boolean(l.sticky),
      booth: 'auto',
      boothLabel: '',
      boothNote: l.boothNote ?? '',
      sortOrder: i,
    })
  })

  // Condensed lines: store the draft as `drafted_from` even where the paper's
  // wording was hand-trimmed, so a seeded week isn't flagged stale on sight.
  for (const slot of ['motto_verse_theme', 'prayer_announcements'] as const) {
    const draft = draftBoothLine(slot, asOrderLines)
    if (!draft) continue
    db.prepare(
      `insert into music_schedule_booth_lines (service_id, slot, text, highlight, drafted_from, sort_order)
       values (?, ?, ?, ?, ?, ?)`,
    ).run(svcId, slot, svc.boothEdits?.[slot] ?? draft.text, draft.highlight ? 1 : 0, draft.text, 0)
  }

  // The same structure, stripped of songs and highlights, becomes the default.
  if (stId != null)
    defaultOrders[String(stId)] = svc.lines.map((l) => ({
      kind: l.kind,
      role: l.role,
      text: l.kind === 'song' ? '' : (l.text ?? ''),
      suffix: l.suffix ?? '',
      leftText: l.kind === 'song' ? '' : (l.leftText ?? ''),
      merged: l.merged === undefined ? null : l.merged,
      align: null,
      bold: l.bold === undefined ? null : l.bold,
      italic: Boolean(l.italic),
      booth: 'auto',
      boothLabel: '',
      boothNote: '',
      sticky: Boolean(l.sticky),
    }))

  console.log(
    `  ${svc.serviceTimeName} — ${svc.lines.length} lines${svc.episodeNumber ? ` · #${svc.episodeNumber}` : ''}`,
  )
})

const now = new Date().toISOString()
db.prepare(
  `insert into settings (key, value, updated_at) values (?, ?, ?)
   on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
).run('schedules.musicSchedule.defaultOrders', JSON.stringify(defaultOrders), now)

// Two printed headings per Service Time — the sheets name the same service
// differently, which is the whole reason this table exists.
const HEADINGS: Record<string, {music: string; booth: string}> = {}
for (const svc of SERVICES) {
  const stId = serviceTimeId(svc.serviceTimeName)
  if (stId == null) continue
  HEADINGS[String(stId)] = {
    music:
      svc.serviceTimeName === 'Sunday School'
        ? 'SUNDAY SCHOOL'
        : svc.serviceTimeName === 'Sunday Morning'
          ? 'MORNING SERVICE'
          : svc.serviceTimeName === 'Sunday Evening'
            ? 'EVENING SERVICE'
            : 'MIDWEEK SERVICE',
    booth: svc.serviceTimeName.toUpperCase(),
  }
}
db.prepare(
  `insert into settings (key, value, updated_at) values (?, ?, ?)
   on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
).run('schedules.musicSchedule.serviceHeadings', JSON.stringify(HEADINGS), now)

// The Midweek page's standing footer.
db.prepare(
  `insert into settings (key, value, updated_at) values (?, ?, ?)
   on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
).run(
  'schedules.musicSchedule.footerBlocks',
  JSON.stringify([
    {kind: 'quote', text: '"...singing and making melody\nin your heart to the Lord."'},
    {kind: 'note', text: 'Ephesians 5:19'},
  ]),
  now,
)

console.log(`\nSeeded ${weekLabel(WEEK_START)} (week id ${weekId}).`)
console.log('Next: create the week of 23 August 2026 through the UI and compare it to the paper sheet.')
