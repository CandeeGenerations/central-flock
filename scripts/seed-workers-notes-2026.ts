/**
 * Seeds the 2026 Yearly Theme and the two Workers' Notes Editions that were
 * printed on paper (Jan-Apr 2026 and May-Aug 2026), so that Sep-Dec 2026 can be
 * created through the real "New Edition" flow as the acceptance test.
 *
 * Prereq: `pnpm db:migrate` (needs the workers_notes_* tables and the Betty
 * Lukens catalogue from 0040).
 *
 * Usage: npx tsx scripts/seed-workers-notes-2026.ts
 *
 * Safe to re-run: keyed on (year, term); an edition that already exists is left
 * completely alone. Also back-fills betty_lukens_stories.last_points from every
 * Points line on the two sheets, so the lesson picker prefills from day one.
 *
 * Two deliberate corrections to the paper originals:
 *   - February 15, not the sheet's "February 14" (which was a Saturday).
 *   - Hymn B-488 for "A New Name In Glory"; the sheet prints B-448, which is
 *     "I'll Be True, Precious Jesus".
 */
import Database from 'better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import {
  parseSpecialLesson,
  resolveLessonNumbers,
  scopeBounds,
  sundaysInTerm,
  termLabel,
} from '../src/lib/workers-notes-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '..', 'central-flock.db'))
db.pragma('foreign_keys = ON')

const THEME_2026 = {
  year: 2026,
  songTitle: 'Rejoice In The Lord',
  songCredit: 'Words & Music by Dr. Brad Weniger',
  chorusLyrics: [
    'Rejoice in the Lord alway and again I say, Rejoice!',
    "In twenty-twenty six I'm going to lift up my voice.",
    "I'm going to say what I mean, and I will mean what I say,",
    "And I'll rejoice in my Savior throughout all of my days. (repeat all)",
  ].join('\n'),
  tagLyrics: [
    "I'm going to say what I mean, and I will mean what I say—",
    "And I'll rejoice in my Savior throughout all of my days.",
  ].join('\n'),
  verseText: 'Rejoice in the Lord alway: and again I say, Rejoice.',
  verseRef: 'Philippians 4:4',
  growthPlan:
    'Decision and visitor follow-up and any assigned referral calls. The entire church will be urged ' +
    'to visit. Prayerfully mentor one other person every year, and, thus, double ourselves annually. ' +
    'We have a goal of doubling every ministry. (What are _you_ personally doing about this?)',
}

// Page-1 bullet list. The three placeholder kinds carry no text -- they render
// from the edition's own Term, Yearly Theme, and Mottos.
const BLOCKS: {kind: string; text: string}[] = [
  {
    kind: 'note',
    text:
      "Let's pray for visitors from referrals and visitation among our bus crowd and drive-ins which " +
      'will result in an influx of new Sunday school attenders, turnover, and growth. Each one is ' +
      'important and needs a follow-up visit in the home. Encourage parents to attend! This is a vital ' +
      'part of our visitation program at Central. Every family should receive an in-depth visit a couple ' +
      "times a year. Be faithful! Keep good records. Let's _baptize_ more converts! Emphasize this step " +
      'of obedience. Use the permission forms. Every class, every bus, and every ministry ought to bear ' +
      'fruit (John 15:8).',
  },
  {
    kind: 'note',
    text: 'We will continue to hear preaching on a variety of scriptural subjects. Try not to miss a single Sunday!',
  },
  {kind: 'next_term_forms', text: ''},
  {kind: 'growth_plan', text: ''},
  {kind: 'month_themes', text: ''},
]

interface MonthSeed {
  month: number
  hymnBook: 'burgundy' | 'silver'
  hymnNumber: number
  songTitleOverride: string
  motto: string
  verse: string
}

const MONTHS_T1: MonthSeed[] = [
  {
    month: 1,
    hymnBook: 'burgundy',
    hymnNumber: 488, // sheet prints B-448 -- a transposition; 488 is the real one
    songTitleOverride: 'A New Name In Glory',
    motto: 'Rejoice that our names are written down in Heaven!',
    verse: '"...rejoice, because your names are written in heaven." Luke 10:20',
  },
  {
    month: 2,
    hymnBook: 'silver',
    hymnNumber: 34,
    songTitleOverride: "If That Isn't Love",
    motto: 'Rejoice that God so loved us!',
    verse: '"For God so loved the world, that He gave..." all of John 3:16',
  },
  {
    month: 3,
    hymnBook: 'silver',
    hymnNumber: 36,
    songTitleOverride: "It's My Desire",
    motto: "Rejoice that we're growing in grace!",
    verse: '"...Grow in grace..." 2 Peter 3:18',
  },
  {
    month: 4,
    hymnBook: 'burgundy',
    hymnNumber: 150,
    songTitleOverride: 'He Lives',
    motto: 'Rejoice that Jesus is alive forevermore!',
    verse: '"...He is able also to save them to the uttermost..." Hebrews 7:25',
  },
]

const MONTHS_T2: MonthSeed[] = [
  {
    month: 5,
    hymnBook: 'burgundy',
    hymnNumber: 23,
    songTitleOverride: 'The Family of God',
    motto: "Rejoice that we're part of God's family!",
    verse: 'Ephesians 3:14-15',
  },
  {
    month: 6,
    hymnBook: 'burgundy',
    hymnNumber: 272,
    songTitleOverride: 'The Winning Side',
    motto: 'Rejoice that God allows us to be on the winning side!',
    verse: '1 Corinthians 15:57',
  },
  {
    month: 7,
    hymnBook: 'burgundy',
    hymnNumber: 126,
    songTitleOverride: "My Country 'Tis of Thee",
    motto: 'Rejoice that God still blesses America after 250 years!',
    verse: 'Psalm 33:12',
  },
  {
    month: 8,
    hymnBook: 'burgundy',
    hymnNumber: 525,
    songTitleOverride: 'A Soulwinner for Jesus',
    motto: 'Rejoice that God allows us to be soulwinners!',
    verse: 'Proverbs 11:30',
  },
]

// Points to Emphasize, in printed order.
const POINTS_T1_BEFORE_EASTER = [
  'Acknowledge the Lord in all your ways (Proverbs 3:5-6)',
  'Ask the Lord to help you to be faithful. (Isaiah 58:11)',
  'Nothing is too hard for God. (Genesis 18:14)',
  'Thank God He watches over us. (Proverbs 15:3)',
  'Have faith in God. (Mark 11:22)',
  'God will guide our choices. (Psalm 31:3)',
  'Tell the truth. (Colossians 3:9)',
  'Make peace whenever possible. (Matthew 5:9)',
  'Be honest. (Ephesians 4:25)',
  'The Lord is with us. (Genesis 28:15)',
  "God's way is best. (Romans 8:28)",
]
const POINTS_T1_AFTER_EASTER = [
  'God has plans for us. (Jeremiah 29:11)',
  'Even in challenges, God can use us. (2 Timothy 1:7)',
  "If we're faithful, God will promote us. (Matthew 25:21)",
]
const POINTS_T2 = [
  "We'll reap what we sow. (Galatians 6:7)",
  'Forgive others. (Matthew 6:14)',
  'God works things out. (Romans 8:28)',
  "Have faith in God and don't fear. (Psalm 118:6)",
  'God speaks to us in the Bible. (Psalm 119:24)',
  'God directs our speech. (Proverbs 16:1)',
  'God protects and watches over us. (Psalm 91:10)',
  "Don't resist God. (James 4:7)",
  'Jesus Christ is our Passover. (1 Corinthians 5:7)',
  'God leads us safely on. (Psalm 78:53)',
  'God supplies our needs. (Philippians 4:19)',
  'God proves Himself (Isaiah 46:9-10)',
  'God provides water. (Isaiah 48:21)',
  'Obey the Lord. (2 John 6)',
  'Worship only the Lord. (Exodus 20:3)',
  'God wants to dwell among us. (Exodus 25:8)',
  "We're glad the Lord is with us. (1 Corinthians 6:19-20)",
  "Don't complain. (Philippians 2:14)",
]

interface RowSeed {
  kind: 'regular' | 'special' | 'combined' | 'note'
  date: string | null
  specialLesson: string
  text: string
}

function rowsForTerm1(): RowSeed[] {
  const sundays = sundaysInTerm(2026, 1) // Jan 4 .. Apr 26, 17 of them
  const beforeEaster = sundays.slice(0, 11) // Jan 4 .. Mar 15
  const afterEaster = sundays.slice(14) // Apr 12 .. Apr 26
  return [
    ...beforeEaster.map((date, i) => ({
      kind: 'regular' as const,
      date,
      specialLesson: '',
      text: POINTS_T1_BEFORE_EASTER[i],
    })),
    {
      kind: 'note' as const,
      date: null,
      specialLesson: '',
      text: '(For the next three weeks, we review lessons on the Death, Burial, and Resurrection of Jesus)',
    },
    {
      kind: 'special' as const,
      date: '2026-03-22',
      specialLesson: '142',
      text: "Let's show our love for Jesus. (1 John 4:19)",
    },
    {
      kind: 'special' as const,
      date: '2026-03-29',
      specialLesson: '143',
      text: 'Jesus is our coming King. (Matthew 21:9)',
    },
    {
      kind: 'special' as const,
      date: '2026-04-05',
      specialLesson: '151-153',
      text: 'Jesus died, He was buried, and He rose again. (1 Corinthians 15:3-4)',
    },
    {
      kind: 'note' as const,
      date: null,
      specialLesson: '',
      text: '(We return to our regular sequence of lessons.)',
    },
    ...afterEaster.map((date, i) => ({
      kind: 'regular' as const,
      date,
      specialLesson: '',
      text: POINTS_T1_AFTER_EASTER[i],
    })),
  ]
}

function rowsForTerm2(): RowSeed[] {
  return sundaysInTerm(2026, 2).map((date, i) => ({
    kind: 'regular' as const,
    date,
    specialLesson: '',
    text: POINTS_T2[i],
  }))
}

function seedEdition(term: 1 | 2, startingLessonNumber: number, months: MonthSeed[], rows: RowSeed[]) {
  const existing = db.prepare('SELECT id FROM workers_notes_editions WHERE year = ? AND term = ?').get(2026, term) as
    | {id: number}
    | undefined
  if (existing) {
    console.log(`  2026 term ${term}: already seeded (edition ${existing.id}) — left alone`)
    return existing.id
  }

  const {scopeStart, scopeEnd} = scopeBounds(2026, term)
  const scheduleId = Number(
    db
      .prepare(
        `INSERT INTO schedules (schedule_type, scope_kind, scope_start, scope_end, scope_label, status)
         VALUES ('workers_notes', 'date_range', ?, ?, ?, 'final')`,
      )
      .run(scopeStart, scopeEnd, termLabel(2026, term)).lastInsertRowid,
  )
  const editionId = Number(
    db
      .prepare(
        `INSERT INTO workers_notes_editions (schedule_id, year, term, starting_lesson_number)
         VALUES (?, 2026, ?, ?)`,
      )
      .run(scheduleId, term, startingLessonNumber).lastInsertRowid,
  )

  const insBlock = db.prepare(
    'INSERT INTO workers_notes_blocks (edition_id, kind, text, bold, sort_order) VALUES (?, ?, ?, 0, ?)',
  )
  BLOCKS.forEach((b, i) => insBlock.run(editionId, b.kind, b.text, i))

  const findHymn = db.prepare('SELECT id FROM hymns WHERE book = ? AND number = ?')
  const insMonth = db.prepare(
    `INSERT INTO workers_notes_months (edition_id, month, hymn_id, song_title_override, motto, verse)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const m of months) {
    const hymn = findHymn.get(m.hymnBook, m.hymnNumber) as {id: number} | undefined
    if (!hymn) throw new Error(`Hymn not found: ${m.hymnBook} ${m.hymnNumber}`)
    insMonth.run(editionId, m.month, hymn.id, m.songTitleOverride, m.motto, m.verse)
  }

  const insRow = db.prepare(
    `INSERT INTO workers_notes_lesson_rows (edition_id, kind, date, special_lesson, text, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  rows.forEach((r, i) => insRow.run(editionId, r.kind, r.date, r.specialLesson, r.text, i))

  console.log(
    `  2026 term ${term}: schedule ${scheduleId}, edition ${editionId}, ${rows.length} rows, start ${startingLessonNumber}`,
  )
  return editionId
}

/** Bank every Points line against its story, so the picker prefills from day one. */
function backfillLastPoints(rows: RowSeed[], startingLessonNumber: number) {
  const resolved = resolveLessonNumbers(rows, startingLessonNumber)
  const upd = db.prepare(
    "UPDATE betty_lukens_stories SET last_points = ?, updated_at = datetime('now') WHERE number = ?",
  )
  let n = 0
  for (const row of resolved) {
    if (!row.text) continue
    if (row.kind === 'regular' && row.storyNumber !== null) {
      upd.run(row.text, row.storyNumber)
      n++
    } else if (row.kind === 'special') {
      // A range like 151-153 banks the same line against each story it covers.
      for (const story of parseSpecialLesson(row.specialLesson ?? '')) {
        upd.run(row.text, story)
        n++
      }
    }
  }
  return n
}

const run = db.transaction(() => {
  const theme = db.prepare('SELECT id FROM workers_notes_themes WHERE year = ?').get(2026) as {id: number} | undefined
  if (theme) {
    console.log('  2026 Yearly Theme: already present — left alone')
  } else {
    db.prepare(
      `INSERT INTO workers_notes_themes
       (year, song_title, song_credit, chorus_lyrics, tag_lyrics, verse_text, verse_ref, growth_plan)
       VALUES (@year, @songTitle, @songCredit, @chorusLyrics, @tagLyrics, @verseText, @verseRef, @growthPlan)`,
    ).run(THEME_2026)
    console.log('  2026 Yearly Theme: seeded')
  }

  const t1Rows = rowsForTerm1()
  const t2Rows = rowsForTerm2()
  seedEdition(1, 9, MONTHS_T1, t1Rows)
  seedEdition(2, 23, MONTHS_T2, t2Rows)

  const banked = backfillLastPoints(t1Rows, 9) + backfillLastPoints(t2Rows, 23)
  console.log(`  Points banked against ${banked} stories`)
})

console.log("Seeding 2026 Workers' Notes...")
run()
console.log('Done.')
