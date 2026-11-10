import {mergeRows} from '../../src/lib/music-scan-rows.js'
import type {
  ProposedLine,
  ProposedRow,
  ProposedService,
  ScanFlag,
  ScanPageKind,
  ScanProposal,
} from '../../src/lib/music-scan-types.js'
import {
  type HymnBook,
  type MusicLineRole,
  type OrderLine,
  ROLE_DEFAULTS,
  serviceDateFor,
  weekStartFor,
} from '../../src/lib/music-schedule-core.js'
import {parseReference} from '../lib/bible-reference.js'

// Deterministic half of the Schedule Scan: turns the model's transcription into a
// reviewable proposal. No DB and no model here — every lookup is injected, so
// this is unit-tested on a hand-built transcription. See CONTEXT.md → Schedule Scan.

export type ScanWhich = 'sunday_school' | 'sunday_morning' | 'sunday_evening' | 'midweek'

/** One line as transcribed — what is on the page, nothing resolved. */
export interface RawScanLine {
  kind: 'song' | 'prose'
  /** A label written or typed on the line: "Choir", "Motto", "Verse", "Theme". */
  label?: string | null
  /** 'B' / 'S' as written; null when no book was written. */
  book?: string | null
  number?: number | null
  /** A parenthetical beside the song: "(x2)", "(2x & tag)", "(Invitation)". */
  writtenSuffix?: string | null
  /** A margin marker: "INV" (invitation) or "Op" (optional). */
  marker?: string | null
  /** Prose text, or a labelled line's value. For songs, the written title (ignored). */
  text?: string | null
  /** A typed line crossed out by hand. Dropped. */
  struckOut?: boolean
}

export interface RawScanService {
  which: ScanWhich
  page: ScanPageKind
  /** 'YYYY-MM-DD' */
  date?: string | null
  occasion?: string | null
  title?: string | null
  text?: string | null
  lines: RawScanLine[]
  notes?: string[]
}

export interface RawScan {
  pages: ScanPageKind[]
  services: RawScanService[]
}

export interface ScanServiceTime {
  id: number
  name: string
  dayOfWeek: number
  time: string
}

/** A line of the order the week would otherwise get — what copy-forward produces. */
export type UsualLine = Omit<OrderLine, 'id' | 'sortOrder' | 'highlight' | 'boothHighlight'>

export interface ScanContext {
  /** Active Service Times. */
  serviceTimes: ScanServiceTime[]
  usualLinesFor: (serviceTimeId: number) => UsualLine[]
  lookupHymn: (book: HymnBook, number: number) => {id: number; title: string} | null
  /** Bible Text check; ok carries the canonical form. */
  checkReference: (ref: string) => {ok: true; canonical: string} | {ok: false}
  existingWeekId: number | null
}

/* ---------------------------------------------------------------- week */

/** The Sunday the pages describe, from the first readable date. */
export function weekStartOf(raw: RawScan): string | null {
  const dates = raw.services
    .map((s) => s.date)
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  return dates.length ? weekStartFor(dates[0]) : null
}

/** Which Service Time a transcribed service is: Sunday ones by time order, midweek = Wednesday. */
export function serviceTimeFor(which: ScanWhich, times: ScanServiceTime[]): ScanServiceTime | null {
  if (which === 'midweek') return [...times].filter((t) => t.dayOfWeek === 3).sort(byTime)[0] ?? null
  const sunday = [...times].filter((t) => t.dayOfWeek === 0).sort(byTime)
  const index = {sunday_school: 0, sunday_morning: 1, sunday_evening: 2}[which]
  return sunday[index] ?? null
}

const byTime = (a: ScanServiceTime, b: ScanServiceTime) => a.time.localeCompare(b.time)

/* ---------------------------------------------------------- normalising */

const QUOTES = /^[\s"'“”‘’«»]+|[\s"'“”‘’«»]+$/g

/** Every word capitalised, no quote marks — the way stored titles read. */
export function normaliseTitle(raw: string): string {
  return raw
    .replace(QUOTES, '')
    .trim()
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part
      const lower = part.toLowerCase()
      const i = lower.search(/[a-z]/)
      return i < 0 ? lower : lower.slice(0, i) + lower[i].toUpperCase() + lower.slice(i + 1)
    })
    .join('')
}

/** "Ps 139:17-18 / Ps 40:5" -> "Psalm 139:17-18 & Psalm 40:5", plus any reference that doesn't exist. */
export function normaliseText(raw: string, check: ScanContext['checkReference']): {text: string; invalid: string[]} {
  const pieces: string[] = []
  const invalid: string[] = []
  let lastBook = ''
  for (const seg of raw.split(/\s*(?:[;/&]|\band\b)\s*/i).filter((s) => s.trim())) {
    const cv = seg.match(/\d+\s*:\s*\d+(?:\s*[-–—]\s*\d+(?::\d+)?)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*/)
    const parsed = parseReference(lastBook && /^\s*\d+\s*:/.test(seg) ? `${lastBook} ${seg}` : seg)[0]
    if (!parsed || !cv) {
      pieces.push(seg.trim())
      invalid.push(seg.trim())
      continue
    }
    lastBook = parsed.book
    const built = `${parsed.book} ${cv[0].replace(/\s+/g, '').replace(/[–—]/g, '-').replace(/,/g, ', ')}`
    const checked = check(built)
    if (checked.ok) pieces.push(checked.canonical)
    else {
      pieces.push(built)
      invalid.push(built)
    }
  }
  return {text: pieces.join(' & '), invalid}
}

function bookOf(raw: string | null | undefined): HymnBook {
  return raw && /^s/i.test(raw.trim()) ? 'silver' : 'burgundy'
}

function refOf(book: HymnBook, number: number): string {
  return `${book === 'silver' ? 'S' : 'B'} #${number}`
}

/** "(x 2)" -> "(x2)"; bare text gets parentheses. */
function cleanSuffix(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const inner = t.replace(/^\(|\)$/g, '').trim()
  const tidy = inner.replace(/\bx\s+(\d)/i, 'x$1').replace(/(\d)\s+x\b/i, '$1x')
  return `(${tidy})`
}

/** Collapse a prose line to what identifies it: no markup, dashes, times or punctuation. */
export function proseKey(text: string): string {
  return text
    .replace(/[*_]/g, '')
    .replace(/^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function roleFromLabel(label: string | null | undefined): MusicLineRole | null {
  const l = (label ?? '').toLowerCase().replace(/[^a-z']/g, '')
  if (!l) return null
  if (l.startsWith('choir')) return 'choir'
  if (l.startsWith('motto')) return 'motto'
  if (l.startsWith('verse')) return 'verse'
  if (l.startsWith('theme')) return 'theme'
  if (l.startsWith('inv')) return 'invitation'
  if (l.startsWith('open')) return 'opening'
  return null
}

function roleFromProse(text: string): MusicLineRole {
  const k = proseKey(text)
  if (/^(preacher|pastor)s? selection/.test(k)) return 'pastor_selection'
  if (/\bmessage\b/.test(k)) return 'message'
  if (/^(s s )?offering\b/.test(k) || /\boffering special\b/.test(k)) return 'offering'
  return 'plain'
}

/* ------------------------------------------------------------- matching */

interface ScannedItem {
  kind: 'song' | 'prose'
  key: string
  role: MusicLineRole | null
  text: string
  book: HymnBook | null
  number: number | null
  suffix: string
}

function lineKey(
  kind: 'song' | 'prose' | 'note' | 'page_break',
  role: MusicLineRole | null,
  text: string,
  invitationKeyed = false,
): string {
  // When the sheet marks its invitation, an invitation song only lines up with an
  // invitation slot — else the first song after the message takes the slot and
  // the marked one lands as an extra line.
  if (kind === 'song') return invitationKeyed && role === 'invitation' ? 'song:invitation' : 'song'
  if (kind === 'page_break') return 'break'
  // The pastor's sheets never carry the week's notes, so a note never matches.
  if (kind === 'note') return `note:${text}`
  if (role === 'motto' || role === 'verse') return `role:${role}`
  return `prose:${proseKey(text)}`
}

/** Longest common subsequence on keys: pairs of [usualIndex, scannedIndex]. */
export function alignKeys(a: string[], b: string[]): [number, number][] {
  const dp = Array.from({length: a.length + 1}, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

function blankLine(kind: 'song' | 'prose', role: MusicLineRole): UsualLine {
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
    text: '',
    merged: null,
    align: null,
    bold: null,
    italic: false,
    sticky: ROLE_DEFAULTS[role].sticky,
    booth: 'auto',
    boothLabel: '',
    boothNote: '',
    musicSheet: true,
    noteColumn: 'all',
    boothOneLine: false,
  }
}

/* ------------------------------------------------------------- proposal */

interface SongTally {
  songs: number
  resolved: number
}

export function buildProposal(raw: RawScan, ctx: ScanContext, weekStart: string): ScanProposal {
  const tally: SongTally = {songs: 0, resolved: 0}
  const services: ProposedService[] = []
  const unmatched: ScanFlag[] = []

  // A service shows up on its sheet and again on the form; group them.
  const groups = new Map<ScanWhich, RawScanService[]>()
  for (const s of raw.services) groups.set(s.which, [...(groups.get(s.which) ?? []), s])

  for (const [which, parts] of groups) {
    const time = serviceTimeFor(which, ctx.serviceTimes)
    if (!time) {
      unmatched.push({
        kind: 'service_unmatched',
        message: `No Service Time matches the ${which.replace('_', ' ')} on the pages`,
      })
      continue
    }
    services.push(proposeService(time, parts, ctx, tally, weekStart))
  }

  if (unmatched.length && services.length) services[0].flags.push(...unmatched)
  services.sort(
    (a, b) =>
      ctx.serviceTimes.findIndex((t) => t.id === a.serviceTimeId) -
      ctx.serviceTimes.findIndex((t) => t.id === b.serviceTimeId),
  )

  return {
    weekStart,
    existingWeekId: ctx.existingWeekId,
    pages: raw.pages,
    services,
    summary: {...tally, toCheck: services.reduce((n, s) => n + s.flags.length, 0)},
  }
}

function proposeService(
  time: ScanServiceTime,
  parts: RawScanService[],
  ctx: ScanContext,
  tally: SongTally,
  weekStart: string,
): ProposedService {
  const sheet = parts.find((p) => p.page !== 'form')
  const form = parts.find((p) => p.page === 'form')
  const primary = sheet ?? form!
  const flags: ScanFlag[] = []
  // The same margin note often appears on both the sheet and the form.
  const seen = new Set<string>()
  const notes = parts
    .flatMap((p) => p.notes ?? [])
    .map((n) => n.trim())
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))

  const pick = (k: 'title' | 'text' | 'occasion' | 'date') => (form?.[k] ?? '').trim() || (sheet?.[k] ?? '').trim()
  // The note beside the heading is often fuller on one page ("Thanksgiving
  // Testimonies" on the sheet, "(Testimonies)" on the form): take the fuller one.
  const pickOccasion = () =>
    [form?.occasion, sheet?.occasion]
      .map((o) => (o ?? '').trim().replace(/^\((.*)\)$/, '$1'))
      .sort((a, b) => b.length - a.length)[0] ?? ''

  // ---- the scanned order
  const items: ScannedItem[] = []
  let firstSong = true
  for (const l of primary.lines) {
    if (l.struckOut) continue
    const markerRole = /^inv/i.test(l.marker ?? '') || /invitation/i.test(l.writtenSuffix ?? '') ? 'invitation' : null
    const labelRole = roleFromLabel(l.label)
    const suffix = [cleanSuffix(l.writtenSuffix), /^op/i.test(l.marker ?? '') ? '(Optional)' : '']
      .filter(Boolean)
      .join(' ')
    if (l.kind === 'song') {
      const role = markerRole ?? labelRole ?? (firstSong ? 'opening' : null)
      firstSong = false
      items.push({
        kind: 'song',
        key: 'song',
        role,
        text: '',
        book: l.number != null ? bookOf(l.book) : null,
        number: l.number ?? null,
        suffix,
      })
    } else {
      const written = (l.text ?? '').trim()
      const role = labelRole ?? roleFromProse(written)
      // A Verse line's value is a reference — written the same way as the Text.
      const text = role === 'verse' && written ? normaliseText(written, ctx.checkReference).text : written
      if (!text && role !== 'motto' && role !== 'verse') continue
      items.push({kind: 'prose', key: lineKey('prose', role, text), role, text, book: null, number: null, suffix})
    }
  }

  // ---- songs on the form that disagree with the sheet
  if (sheet && form) {
    const sheetSongs = items.filter((i) => i.kind === 'song')
    const formSongs = form.lines.filter((l) => l.kind === 'song' && !l.struckOut && l.number != null)
    const sameShape = formSongs.length === sheetSongs.length
    formSongs.forEach((f, idx) => {
      const role = /^inv/i.test(f.marker ?? '') ? 'invitation' : roleFromLabel(f.label)
      const counterpart = sameShape ? sheetSongs[idx] : role ? sheetSongs.find((s) => s.role === role) : undefined
      if (!counterpart || counterpart.number == null) return
      const fBook = bookOf(f.book)
      if (counterpart.book === fBook && counterpart.number === f.number) return
      const lineIndex = items.indexOf(counterpart)
      const opt = (book: HymnBook, number: number, page: ScanPageKind) => {
        const h = ctx.lookupHymn(book, number)
        return {book, number, hymnId: h?.id ?? null, title: h?.title ?? null, page}
      }
      flags.push({
        kind: 'song_conflict',
        message: `The pages disagree: ${refOf(counterpart.book!, counterpart.number)} on the sheet, ${refOf(fBook, f.number!)} on the form`,
        lineIndex,
        options: [opt(counterpart.book!, counterpart.number, sheet.page), opt(fBook, f.number!, 'form')],
      })
    })
  }

  // ---- align with the usual order
  const usual = ctx.usualLinesFor(time.id)
  const invitationKeyed = items.some((i) => i.kind === 'song' && i.role === 'invitation')
  const pairs = alignKeys(
    usual.map((u) => lineKey(u.kind, u.role, u.text, invitationKeyed)),
    items.map((i) => (i.kind === 'song' ? lineKey('song', i.role, '', invitationKeyed) : i.key)),
  )
  const usualFor = new Map(pairs.map(([u, s]) => [s, u]))
  const scannedFor = new Map(pairs.map(([u, s]) => [u, s]))

  const songFlags = new Map<number, ScanFlag>()
  const resolve = (item: ScannedItem, scannedIndex: number) => {
    if (item.kind !== 'song') return null
    tally.songs++
    const hymn = item.number != null && item.book ? ctx.lookupHymn(item.book, item.number) : null
    if (hymn) tally.resolved++
    else
      songFlags.set(scannedIndex, {
        kind: 'song_unresolved',
        message:
          item.number == null
            ? 'A song number couldn’t be read — pick the song'
            : `${refOf(item.book!, item.number)} isn’t in the hymnal — check the number`,
      })
    return hymn
  }
  const hymns = items.map((item, i) => resolve(item, i))

  const withSong = (base: UsualLine, item: ScannedItem, i: number): UsualLine => {
    if (item.kind !== 'song') return base
    const hymn = hymns[i]
    return {
      ...base,
      hymnId: hymn?.id ?? null,
      hymnBook: hymn ? item.book : null,
      hymnNumber: hymn ? item.number : null,
      hymnTitle: hymn?.title ?? null,
      freeSongTitle: null,
      suffix: item.suffix || base.suffix,
    }
  }

  const scannedLines: ProposedLine[] = items.map((item, i) => {
    const u = usualFor.get(i)
    if (u != null) {
      const base = usual[u]
      // An explicit label or INV beats the role the usual line had.
      const role = item.kind === 'song' && item.role && item.role !== 'opening' ? item.role : base.role
      const line = withSong({...base, role}, item, i)
      const valueChanged =
        item.kind === 'prose' &&
        (base.role === 'motto' || base.role === 'verse') &&
        item.text &&
        item.text !== base.text
      if (valueChanged) line.text = item.text
      return {...line, status: item.kind === 'song' || valueChanged ? 'filled' : 'unchanged'}
    }
    const role = item.role ?? (item.kind === 'song' ? 'congregational' : 'plain')
    const line = withSong({...blankLine(item.kind, role), text: item.kind === 'prose' ? item.text : ''}, item, i)
    if (item.kind === 'prose') line.suffix = item.suffix
    return {...line, status: 'added'}
  })

  const usualLines: ProposedLine[] = usual.map((u, ui) => {
    const s = scannedFor.get(ui)
    if (s == null) return {...u, status: 'unchanged'}
    const item = items[s]
    if (item.kind === 'song') return {...withSong(u, item, s), status: 'filled'}
    if ((u.role === 'motto' || u.role === 'verse') && item.text && item.text !== u.text)
      return {...u, text: item.text, status: 'filled'}
    return {...u, status: 'unchanged'}
  })

  const orderDiffers = pairs.length !== usual.length || pairs.length !== items.length

  // A rejected Motto/Verse change keeps the usual wording, not the filled-in one.
  const {rows, rowOfScanned} = mergeRows(usualLines, scannedLines, pairs, (ui) => ({
    ...usual[ui],
    status: 'unchanged',
  }))

  // Line flags point at rows. Conflict flags were placed by scanned index.
  for (const f of flags) if (f.lineIndex != null) f.lineIndex = rowOfScanned.get(f.lineIndex)
  for (const [i, flag] of songFlags) flags.push({...flag, lineIndex: rowOfScanned.get(i)})

  const textRaw = pick('text')
  const text = textRaw ? normaliseText(textRaw, ctx.checkReference) : {text: '', invalid: []}
  for (const ref of text.invalid)
    flags.push({kind: 'text_invalid', message: `“${ref}” isn’t a verse in the Bible — check the Text`})

  const occasion = pickOccasion()
  const title = pick('title')

  return {
    serviceTimeId: time.id,
    name: time.name,
    // The Service Time's day in this week — a misread date on one page can't move a service.
    date: serviceDateFor(weekStart, time.dayOfWeek),
    title: title ? normaliseTitle(title) : '',
    text: text.text,
    occasion,
    standalone: !!occasion,
    orderDiffers,
    scannedLines,
    usualLines,
    rows,
    notes,
    flags,
  }
}

/**
 * Rows for a proposal saved before rows existed: re-align its two saved orders.
 * A Motto/Verse change shows as unchanged here, since the usual side already took the sheet's wording.
 */
export function rowsFromSides(usualLines: ProposedLine[], scannedLines: ProposedLine[]): ProposedRow[] {
  const invitationKeyed = scannedLines.some((l) => l.kind === 'song' && l.role === 'invitation')
  const key = (l: ProposedLine) => lineKey(l.kind, l.role, l.text, invitationKeyed)
  return mergeRows(usualLines, scannedLines, alignKeys(usualLines.map(key), scannedLines.map(key))).rows
}
