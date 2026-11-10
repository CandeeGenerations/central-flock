import {describe, expect, it} from 'vitest'

import {mergeRows, rowsToLines} from '../../src/lib/music-scan-rows.js'
import type {ProposedLine, ProposedRow} from '../../src/lib/music-scan-types.js'
import type {HymnBook, MusicLineRole} from '../../src/lib/music-schedule-core.js'
import {resolveReference} from '../lib/bible-text.js'
import {
  type RawScan,
  type RawScanLine,
  type ScanContext,
  type UsualLine,
  buildProposal,
  normaliseText,
  normaliseTitle,
  rowsFromSides,
  weekStartOf,
} from './music-schedule-scan-process.js'

// The Nov 22, 2026 week as transcribed by hand from the pastor's three pages.

const song = (book: string | null, number: number | null, extra: Partial<RawScanLine> = {}): RawScanLine => ({
  kind: 'song',
  book,
  number,
  ...extra,
})
const prose = (text: string, extra: Partial<RawScanLine> = {}): RawScanLine => ({kind: 'prose', text, ...extra})

function nov22(): RawScan {
  return {
    pages: ['sunday_sheet', 'midweek_sheet', 'form'],
    services: [
      {
        which: 'sunday_school',
        page: 'sunday_sheet',
        date: '2026-11-22',
        lines: [
          prose('Live Stream – Welcome'),
          song('B', 219),
          song('S', 27),
          prose('S.S. Lesson'),
          prose('Offline, Prayer, Invitation'),
          song('B', 122, {writtenSuffix: '(x 2)', marker: 'INV'}),
          song('B', 251),
          prose('S.S. Offering, Praises, Prayer Requests'),
        ],
      },
      {
        which: 'sunday_morning',
        page: 'sunday_sheet',
        date: '2026-11-22',
        lines: [
          prose('11am Live Stream – Welcome'),
          song('S', 25, {label: 'Choir', writtenSuffix: '(Congregation joins on verse 2)'}),
          prose('Rejoice That God Put a Song in Our Heart!', {label: 'Motto'}),
          prose('Ps 40:3', {label: 'Verse'}),
          song('B', 211, {label: 'Theme', writtenSuffix: '(2x & tag)'}),
          prose('Prayer, Announcements'),
          prose("Preacher's Selection"),
          song('B', 222),
          prose('Message, Offline, Prayer, Invitation'),
          song('B', 167, {writtenSuffix: '(Invitation)'}),
          prose('Announcements, Offering Special'),
          song('B', 341),
        ],
      },
      {
        which: 'sunday_evening',
        page: 'sunday_sheet',
        date: '2026-11-22',
        occasion: 'Thanksgiving Testimonies',
        lines: [
          prose('6:30pm Live Stream – Welcome'),
          song('B', 311),
          prose('Prayer, Message, Offline, Prayer, Invitation'),
          song('B', 128, {marker: 'INV'}),
          song('B', 506),
          prose('Announcements, Offering Special'),
          prose('Birthdays, Anniversaries', {struckOut: true}),
          prose('Testimonies'),
          song('B', 145),
          song('B', 341, {marker: 'Op'}),
          prose('Prayer, Dismiss'),
        ],
      },
      {
        which: 'midweek',
        page: 'midweek_sheet',
        date: '2026-11-25',
        occasion: 'Thanksgiving Eve Candlelight',
        lines: [
          prose('7:30pm Live Stream – Welcome'),
          song('B', 191),
          song('B', 365),
          song('S', 21),
          song('S', 17),
          song('B', 416, {marker: 'INV'}),
        ],
        notes: ['FILM IT ALL'],
      },
      {
        which: 'sunday_school',
        page: 'form',
        date: '2026-11-22',
        lines: [song('B', 219, {label: 'Opening Song'}), song('S', 27, {label: "Kids' Song"})],
      },
      {
        which: 'sunday_morning',
        page: 'form',
        date: '2026-11-22',
        title: '"LET\'S TEACH OUR YOUNG TO PRAISE GOD\'S SON!"',
        text: 'Ps 79:13',
        lines: [song('S', 25, {label: 'Choir'}), song('B', 211, {label: 'Theme'}), song('B', 222)],
      },
      {
        which: 'sunday_evening',
        page: 'form',
        date: '2026-11-22',
        title: '"Let The Redeemed of The Lord Say So"',
        text: 'Ps 107:2',
        lines: [song('B', 311, {label: 'Opening Song'})],
        notes: ['Msg. Invitation — Off-line for testimonies'],
      },
      {
        which: 'midweek',
        page: 'form',
        date: '2026-11-25',
        occasion: 'Thanksgiving Eve Candlelight',
        title: '"We Can\'t Count That High!"',
        text: 'Ps 139:17-18 / Ps 40:5',
        lines: [song('B', 191), song('B', 365), song('S', 21), song('S', 17), song('B', 416, {marker: 'INV'})],
        notes: ['FILM IT ALL'],
      },
    ],
  }
}

const HYMNS: Record<string, string> = {
  'burgundy:122': 'HE CANNOT FAIL',
  'burgundy:128': 'THE WINDOWS OF HEAVEN',
  'burgundy:145': 'I LOVE TO TELL THE STORY',
  'burgundy:167': 'JUST AS I AM',
  'burgundy:191': 'COUNT YOUR BLESSINGS',
  'burgundy:211': "LET'S JUST PRAISE THE LORD",
  'burgundy:219': 'LITTLE IS MUCH',
  'burgundy:222': 'I SING THE MIGHTY POWER OF GOD',
  'burgundy:251': 'HE LIFTED ME',
  'burgundy:311': 'REDEEMED',
  'burgundy:341': 'VICTORY IN JESUS',
  'burgundy:365': 'HOW GREAT THOU ART',
  'burgundy:416': 'HE IS SO PRECIOUS TO ME',
  'burgundy:506': 'BLESSED ASSURANCE',
  'silver:17': "HE'S AS CLOSE AS THE MENTION OF HIS NAME",
  'silver:21': 'HOW BIG IS GOD!',
  'silver:25': 'I COULD NEVER OUTLOVE THE LORD',
  'silver:27': 'I WILL SERVE THEE',
}
const HYMN_IDS = Object.keys(HYMNS)

function line(kind: 'song' | 'prose', role: MusicLineRole, text = '', extra: Partial<UsualLine> = {}): UsualLine {
  return {
    kind,
    role,
    hymnId: null,
    hymnBook: null,
    hymnNumber: null,
    hymnTitle: null,
    freeSongTitle: null,
    suffix: '',
    leftText: '',
    text,
    merged: null,
    align: null,
    bold: null,
    italic: false,
    sticky: false,
    booth: 'auto',
    boothLabel: '',
    boothNote: '',
    musicSheet: true,
    noteColumn: 'all',
    boothOneLine: false,
    ...extra,
  }
}

// What copy-forward would give each service — last week's ordinary orders, songs cleared.
const USUAL: Record<number, UsualLine[]> = {
  1: [
    line('prose', 'plain', 'Live Stream - Welcome'),
    line('song', 'opening'),
    line('song', 'plain'),
    line('prose', 'plain', 'S.S. Lesson'),
    line('prose', 'plain', 'Offline, Prayer, Invitation'),
    line('song', 'invitation'),
    line('song', 'plain'),
    line('prose', 'offering', 'S.S. Offering, Praises, Prayer Requests'),
  ],
  2: [
    line('prose', 'plain', 'Live Stream - Welcome'),
    line('song', 'choir', '', {boothNote: '__(Choir & Cong.)__'}),
    line('prose', 'motto', "Rejoice that we're growing in grace!"),
    line('prose', 'verse', 'Psalm 1:1'),
    line('song', 'theme', '', {sticky: true}),
    line('prose', 'plain', 'Prayer, Announcements'),
    line('prose', 'pastor_selection', "Preacher's Selection"),
    line('song', 'congregational'),
    line('prose', 'message', '_Message_, Offline, Prayer, Invitation'),
    line('song', 'invitation'),
    line('prose', 'offering', 'Announcements, Offering Special'),
    line('song', 'plain'),
  ],
  3: [
    line('prose', 'plain', 'Live Stream - Welcome'),
    line('song', 'opening'),
    line('prose', 'message', 'Prayer, _Message_, Offline, Prayer, Invitation'),
    line('song', 'invitation'),
    line('song', 'plain'),
    line('prose', 'offering', 'Announcements, Offering Special'),
    line('prose', 'plain', 'Birthdays, Anniversaries'),
    line('song', 'plain'),
    line('song', 'plain', '', {suffix: '(Optional)'}),
    line('prose', 'plain', 'Prayer, Dismiss'),
  ],
  4: [
    line('prose', 'plain', 'Live Stream - Welcome'),
    line('song', 'opening'),
    line('prose', 'plain', 'Prayer, Announcements'),
    line('song', 'congregational'),
    line('prose', 'message', '_Message_, Offline, Prayer, Invitation'),
    line('song', 'invitation'),
    line('prose', 'plain', 'Prayer, Dismiss'),
  ],
}

const ctx: ScanContext = {
  serviceTimes: [
    {id: 1, name: 'Sunday School', dayOfWeek: 0, time: '09:45'},
    {id: 2, name: 'Sunday Morning', dayOfWeek: 0, time: '11:00'},
    {id: 3, name: 'Sunday Evening', dayOfWeek: 0, time: '18:30'},
    {id: 4, name: 'Wednesday Evening', dayOfWeek: 3, time: '19:30'},
  ],
  usualLinesFor: (id) => USUAL[id] ?? [],
  lookupHymn: (book: HymnBook, number: number) => {
    const key = `${book}:${number}`
    return HYMNS[key] ? {id: HYMN_IDS.indexOf(key) + 1, title: HYMNS[key]} : null
  },
  checkReference: (ref) => {
    const r = resolveReference(ref)
    return r.ok ? {ok: true, canonical: r.canonical} : {ok: false}
  },
  existingWeekId: null,
}

const propose = (raw = nov22()) => buildProposal(raw, ctx, weekStartOf(raw)!)
const svc = (p: ReturnType<typeof propose>, id: number) => p.services.find((s) => s.serviceTimeId === id)!
const active = (s: ReturnType<typeof svc>) => rowsToLines(s.rows)
const acceptAll = (rows: ProposedRow[]) => rows.map((r) => ({...r, accepted: true}))
const removed = (s: ReturnType<typeof svc>) => s.rows.filter((r) => r.change === 'removed').map((r) => r.usual!.text)

describe('Schedule Scan proposal — Nov 22, 2026', () => {
  it('reads the week and resolves every song by book and number', () => {
    const p = propose()
    expect(p.weekStart).toBe('2026-11-22')
    expect(p.summary).toEqual({songs: 19, resolved: 19, toCheck: 0})

    const written = new Set(
      p.services.flatMap((s) =>
        active(s)
          .filter((l) => l.kind === 'song' && l.hymnNumber != null)
          .map((l) => `${l.hymnBook}:${l.hymnNumber}`),
      ),
    )
    // The 16 handwritten songs (plus the typed B-167 and B-341).
    for (const k of HYMN_IDS) expect(written.has(k), k).toBe(true)
    // The hymnal names the song, never the handwriting.
    expect(active(svc(p, 4))[1].hymnTitle).toBe('COUNT YOUR BLESSINGS')
  })

  it('normalises titles and texts', () => {
    const p = propose()
    expect(svc(p, 2).title).toBe("Let's Teach Our Young To Praise God's Son!")
    expect(svc(p, 2).text).toBe('Psalm 79:13')
    expect(svc(p, 3).title).toBe('Let The Redeemed Of The Lord Say So')
    expect(svc(p, 4).title).toBe("We Can't Count That High!")
    expect(svc(p, 4).text).toBe('Psalm 139:17-18 & Psalm 40:5')
  })

  it('takes occasions and suggests Standalone', () => {
    const p = propose()
    expect(svc(p, 3)).toMatchObject({occasion: 'Thanksgiving Testimonies', standalone: true})
    expect(svc(p, 4)).toMatchObject({occasion: 'Thanksgiving Eve Candlelight', standalone: true})
    expect(svc(p, 1)).toMatchObject({occasion: '', standalone: false})
  })

  it('fills songs into the usual order when it matches', () => {
    const s = svc(propose(), 1)
    expect(s.orderDiffers).toBe(false)
    expect(s.rows.map((r) => r.change)).not.toContain('added')
    expect(active(s)).toEqual(s.usualLines)
    expect(s.usualLines.filter((l) => l.status === 'filled').map((l) => l.hymnNumber)).toEqual([219, 27, 122, 251])
    expect(s.usualLines[5].suffix).toBe('(x2)')
  })

  it('keeps line settings on matched lines and takes the new motto', () => {
    const s = svc(propose(), 2)
    expect(s.orderDiffers).toBe(false)
    expect(s.usualLines[1]).toMatchObject({role: 'choir', hymnNumber: 25, boothNote: '__(Choir & Cong.)__'})
    expect(s.usualLines[1].suffix).toBe('(Congregation joins on verse 2)')
    expect(s.usualLines[2]).toMatchObject({role: 'motto', text: 'Rejoice That God Put a Song in Our Heart!'})
    expect(s.usualLines[3]).toMatchObject({role: 'verse', text: 'Psalm 40:3', status: 'filled'})
    expect(s.usualLines[8].text).toBe('_Message_, Offline, Prayer, Invitation')
  })

  it('takes the scanned order for the candlelight service', () => {
    const s = svc(propose(), 4)
    expect(s.orderDiffers).toBe(true)
    expect(rowsToLines(acceptAll(s.rows))).toEqual(s.scannedLines)
    expect(s.scannedLines.map((l) => (l.kind === 'song' ? l.hymnNumber : l.text))).toEqual([
      'Live Stream - Welcome',
      191,
      365,
      21,
      17,
      416,
    ])
    expect(s.scannedLines[1].role).toBe('opening')
    expect(s.scannedLines[5].role).toBe('invitation')
    expect(removed(s)).toContain('Prayer, Announcements')
    expect(s.notes).toContain('FILM IT ALL')
  })

  it('drops a struck-out line and adds what was written in', () => {
    const s = svc(propose(), 3)
    expect(s.orderDiffers).toBe(true)
    expect(removed(s)).toEqual(['Birthdays, Anniversaries'])
    const testimonies = s.scannedLines.find((l) => l.text === 'Testimonies')
    expect(testimonies?.status).toBe('added')
    expect(s.scannedLines.find((l) => l.hymnNumber === 128)?.role).toBe('invitation')
    expect(s.scannedLines.find((l) => l.hymnNumber === 341)?.suffix).toBe('(Optional)')
  })

  it('flags a form that disagrees with the sheet', () => {
    const raw = nov22()
    const form = raw.services.find((s) => s.which === 'sunday_morning' && s.page === 'form')!
    form.lines[0] = song('S', 26, {label: 'Choir'})
    const s = svc(propose(raw), 2)
    const conflict = s.flags.find((f) => f.kind === 'song_conflict')!
    expect(conflict.options?.map((o) => `${o.book}:${o.number}`)).toEqual(['silver:25', 'silver:26'])
    expect(conflict.lineIndex).toBe(1)
  })

  it('flags a song number that is not in the hymnal', () => {
    const raw = nov22()
    raw.services[3].lines[2] = song('B', 999)
    const p = propose(raw)
    const s = svc(p, 4)
    const flag = s.flags.find((f) => f.kind === 'song_unresolved')!
    expect(s.rows[flag.lineIndex!].sheet).toBe(s.scannedLines[2])
    expect(s.scannedLines[2].hymnId).toBeNull()
    expect(p.summary.resolved).toBe(18)
  })

  it('flags a Text that is not in the Bible', () => {
    const raw = nov22()
    raw.services[5].text = 'Ps 179:13'
    expect(svc(propose(raw), 2).flags.map((f) => f.kind)).toContain('text_invalid')
  })
})

describe('Schedule Scan proposal — regressions from the first real scan', () => {
  it('puts a marked invitation in the invitation slot, not the song before it', () => {
    const wed = svc(propose(), 4)
    const lines = wed.scannedLines.filter((l) => l.kind === 'song')
    const b365 = lines.find((l) => l.hymnNumber === 365)!
    const b416 = lines.find((l) => l.hymnNumber === 416)!
    expect(b365.role).not.toBe('invitation')
    expect(b416).toMatchObject({role: 'invitation', status: 'filled'})
    expect(lines.filter((l) => l.role === 'invitation')).toHaveLength(1)
  })

  it('takes the fuller occasion when the form and sheet differ', () => {
    const raw = nov22()
    raw.services.find((s) => s.which === 'sunday_evening' && s.page === 'form')!.occasion = '(Testimonies)'
    expect(svc(propose(raw), 3).occasion).toBe('Thanksgiving Testimonies')
  })

  it('lists a margin note once when both pages carry it', () => {
    expect(svc(propose(), 4).notes).toEqual(['FILM IT ALL'])
  })
})

describe('normalising helpers', () => {
  it('capitalises every word and drops quotes', () => {
    expect(normaliseTitle('“WHAT IS YOUR FOUNDATION?”')).toBe('What Is Your Foundation?')
    expect(normaliseTitle("run, don't walk")).toBe("Run, Don't Walk")
  })

  it('writes texts with full book names', () => {
    const check = ctx.checkReference
    expect(normaliseText('Deut 2:7 & 2 Cor 9:1-15', check).text).toBe('Deuteronomy 2:7 & 2 Corinthians 9:1-15')
    expect(normaliseText('Ps 40:3', check)).toEqual({text: 'Psalm 40:3', invalid: []})
  })
})

describe('Schedule Scan proposal — per-row review', () => {
  it('rejecting a removal keeps the usual line, rejecting an addition drops it', () => {
    const s = svc(propose(), 3)
    const rows = s.rows.map((r) => (r.change === 'removed' || r.change === 'added' ? {...r, accepted: false} : r))
    const texts = rowsToLines(rows).map((l) => l.text)
    expect(texts).toContain('Birthdays, Anniversaries')
    expect(texts).not.toContain('Testimonies')
  })

  it('rejecting a Motto change keeps the usual wording', () => {
    const s = svc(propose(), 2)
    const motto = s.rows.find((r) => r.sheet?.role === 'motto')!
    expect(motto.change).toBe('changed')
    expect(motto.usual!.text).not.toBe(motto.sheet!.text)
    const rejected = s.rows.map((r) => (r === motto ? {...r, accepted: false} : r))
    expect(rowsToLines(rejected).find((l) => l.role === 'motto')!.text).toBe(motto.usual!.text)
  })

  it('rebuilds rows for a proposal saved before rows existed', () => {
    const s = svc(propose(), 4)
    const rows = acceptAll(rowsFromSides(s.usualLines, s.scannedLines))
    expect(rowsToLines(rows).map((l) => (l.kind === 'song' ? l.hymnNumber : l.text))).toEqual(
      s.scannedLines.map((l) => (l.kind === 'song' ? l.hymnNumber : l.text)),
    )
  })

  it('pairs a reworded line into one change and starts it on the usual wording', () => {
    const usual = [
      {kind: 'prose', role: 'offering', text: 'Offering, Praises, Prayer Requests'},
      {kind: 'prose', role: 'plain', text: 'Prayer, Announcements'},
    ] as ProposedLine[]
    const sheet = [
      {kind: 'prose', role: 'plain', text: 'S.S. Lesson'},
      {kind: 'prose', role: 'plain', text: 'S.S. Offering, Praises, Prayer Requests'},
    ] as ProposedLine[]
    const {rows} = mergeRows(usual, sheet, [])
    expect(rows.map((r) => r.change)).toEqual(['changed', 'removed', 'added'])
    expect(rows[0].sheet).toMatchObject({role: 'offering', text: 'S.S. Offering, Praises, Prayer Requests'})
    expect(rowsToLines(rows).map((l) => l.text)).toEqual([
      'Offering, Praises, Prayer Requests',
      'Prayer, Announcements',
    ])
  })
})
