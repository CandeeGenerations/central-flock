// Pure week arithmetic, role defaults, and Sound Booth projection for the Music
// Schedule. Imported by BOTH the client (live preview) and the server (seeding,
// validation), so it must stay free of React, the `@` alias, and any Node or
// DOM API.
//
// See docs/adr/0022-sound-booth-sheet-projection.md and
// docs/adr/0024-episode-numbers-stored-and-yearly.md.

export type MusicLineRole =
  | 'plain'
  | 'opening'
  | 'choir'
  | 'congregational'
  | 'motto'
  | 'verse'
  | 'theme'
  | 'pastor_selection'
  | 'message'
  | 'invitation'
  | 'special'
  | 'offering'

export type MusicLineKind = 'song' | 'prose' | 'page_break'
export type MusicBoothMode = 'auto' | 'include' | 'exclude'
export type MusicBoothSlot = 'motto_verse_theme' | 'prayer_announcements'
export type MusicLineAlign = 'left' | 'center'
export type HymnBook = 'burgundy' | 'silver'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/* ------------------------------------------------------------------ dates */

/** Parses 'YYYY-MM-DD' as local calendar parts. Never goes through Date's UTC parsing. */
export function parseDate(iso: string): {y: number; m: number; d: number} {
  const [y, m, d] = iso.split('-').map(Number)
  return {y, m, d}
}

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addDays(iso: string, days: number): string {
  const {y, m, d} = parseDate(iso)
  const dt = new Date(y, m - 1, d + days)
  return toIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

export function dayOfWeek(iso: string): number {
  const {y, m, d} = parseDate(iso)
  return new Date(y, m - 1, d).getDay()
}

/** The Sunday that opens the week `iso` falls in. */
export function weekStartFor(iso: string): string {
  return addDays(iso, -dayOfWeek(iso))
}

/**
 * A service's date within a week. `dayOfWeek` 0=Sun..6=Sat, so Wednesday
 * resolves to the Wednesday AFTER the week's Sunday — which is how the paper
 * originals pair 16 August with 19 August.
 */
export function serviceDateFor(weekStart: string, dow: number): string {
  return addDays(weekStart, dow)
}

export function weekBounds(weekStart: string): {scopeStart: string; scopeEnd: string} {
  return {scopeStart: weekStart, scopeEnd: addDays(weekStart, 6)}
}

export function yearOf(iso: string): number {
  return parseDate(iso).y
}

/** 'AUGUST 16, MORNING SERVICE' — the Music Sheet's service heading. */
export function musicHeading(iso: string, heading: string): string {
  const {m, d} = parseDate(iso)
  return `${MONTH_NAMES[m - 1].toUpperCase()} ${d}, ${heading.toUpperCase()}`
}

/** 'AUGUST 16, 2026' — the Sound Booth Sheet's date column. */
export function boothHeading(iso: string): string {
  const {y, m, d} = parseDate(iso)
  return `${MONTH_NAMES[m - 1].toUpperCase()} ${d}, ${y}`
}

export function weekLabel(weekStart: string): string {
  const {y, m, d} = parseDate(weekStart)
  return `Week of ${MONTH_NAMES[m - 1]} ${d}, ${y}`
}

export function weekSlug(weekStart: string): string {
  return weekStart
}

/** '09:45' -> '9:45 am'; '11:00' -> '11 am' (the :00 drops, as on the paper). */
export function formatServiceTime(time: string | null | undefined): string {
  if (!time) return ''
  const [hRaw, mRaw] = time.split(':').map(Number)
  if (!Number.isFinite(hRaw)) return ''
  const suffix = hRaw >= 12 ? 'pm' : 'am'
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12
  return mRaw ? `${h12}:${String(mRaw).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`
}

/* ------------------------------------------------------------------ hymns */

export function hymnRef(book: HymnBook | null | undefined, number: number | null | undefined): string {
  if (!book || number == null) return ''
  return `${book === 'silver' ? 'S' : 'B'} #${number}`
}

/* ---------------------------------------------------------- role defaults */

/**
 * How a role behaves before any per-line override. `leftLabel: null` means the
 * left cell holds the hymn reference (and so the right cell is just the title);
 * a string means the left cell is that label and a song's reference moves
 * inline into the right cell, the way 'Theme: B #546 Lead Me to Some Soul
 * Today' reads on the paper.
 *
 * `booth: 'fold'` means the line does not get a row of its own on the Sound
 * Booth Sheet — it feeds a condensed line instead. See ADR 0022.
 */
export interface RoleDefaults {
  merged: boolean
  align: MusicLineAlign
  leftLabel: string | null
  bold: boolean
  booth: 'include' | 'exclude' | 'fold'
  boothLabel: string
  boothNote: string
  sticky: boolean
}

export const ROLE_DEFAULTS: Record<MusicLineRole, RoleDefaults> = {
  plain: {
    merged: true,
    align: 'left',
    leftLabel: '',
    bold: false,
    booth: 'exclude',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  opening: {
    merged: false,
    align: 'left',
    leftLabel: null,
    bold: true,
    booth: 'include',
    boothLabel: 'Opening Song:',
    boothNote: '',
    sticky: false,
  },
  choir: {
    merged: false,
    align: 'left',
    leftLabel: 'Choir:',
    bold: true,
    booth: 'include',
    boothLabel: 'Opening Song:',
    boothNote: '(Choir & Cong.)',
    sticky: false,
  },
  congregational: {
    merged: false,
    align: 'left',
    leftLabel: null,
    bold: true,
    booth: 'include',
    boothLabel: 'Congregational:',
    boothNote: '',
    sticky: false,
  },
  motto: {
    merged: false,
    align: 'left',
    leftLabel: 'Motto:',
    bold: true,
    booth: 'fold',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  verse: {
    merged: false,
    align: 'left',
    leftLabel: 'Verse:',
    bold: true,
    booth: 'fold',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  theme: {
    merged: false,
    align: 'left',
    leftLabel: 'Theme:',
    bold: true,
    booth: 'fold',
    boothLabel: '',
    boothNote: '',
    sticky: true,
  },
  pastor_selection: {
    merged: true,
    align: 'left',
    leftLabel: '',
    bold: true,
    booth: 'fold',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  message: {
    merged: true,
    align: 'left',
    leftLabel: '',
    bold: false,
    booth: 'exclude',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  invitation: {
    merged: false,
    align: 'left',
    leftLabel: null,
    bold: true,
    booth: 'exclude',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  special: {
    merged: true,
    align: 'left',
    leftLabel: '',
    bold: false,
    booth: 'exclude',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
  offering: {
    merged: true,
    align: 'left',
    leftLabel: '',
    bold: false,
    booth: 'exclude',
    boothLabel: '',
    boothNote: '',
    sticky: false,
  },
}

export const ROLE_LABELS: Record<MusicLineRole, string> = {
  plain: 'Plain',
  opening: 'Opening',
  choir: 'Choir',
  congregational: 'Congregational',
  motto: 'Motto',
  verse: 'Verse',
  theme: 'Theme',
  pastor_selection: "Pastor's Selection",
  message: 'Message',
  invitation: 'Invitation',
  special: 'Special',
  offering: 'Offering',
}

/* ------------------------------------------------------------- line shapes */

/** The stored shape both sides pass around. Nullable fields mean "role default". */
export interface OrderLine {
  id: number
  kind: MusicLineKind
  role: MusicLineRole
  hymnId: number | null
  hymnBook: HymnBook | null
  hymnNumber: number | null
  hymnTitle: string | null
  freeSongTitle: string | null
  suffix: string
  leftText: string
  text: string
  merged: boolean | null
  align: MusicLineAlign | null
  bold: boolean | null
  italic: boolean
  highlight: boolean
  sticky: boolean
  booth: MusicBoothMode
  boothLabel: string
  boothNote: string
  sortOrder: number
}

export interface ServiceInfo {
  id: number
  serviceTimeId: number | null
  name: string
  musicHeading: string
  boothHeading: string
  date: string
  time: string | null
  meeting: boolean
  uploaded: boolean
  episodeNumber: number | null
  title: string
  titleNote: string
  titleHighlight: boolean
  scripture: string
  scriptureNote: string
  scriptureHighlight: boolean
  sortOrder: number
}

export interface BoothLine {
  id: number
  slot: MusicBoothSlot
  text: string
  highlight: boolean
  draftedFrom: string
  sortOrder: number
}

// The hymns catalogue stores titles in capitals ("HOLD THE FORT"), which is not
// how they print. Title-case them for the page; a line's own `text` overrides
// this whenever the house wording differs from the hymnal's.
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'up',
  'with',
])

export function toTitleCase(text: string): string {
  const words = text.toLowerCase().split(/(\s+)/)
  let wordIndex = 0
  return words
    .map((part) => {
      if (/^\s+$/.test(part)) return part
      const isEdge = wordIndex === 0
      wordIndex += 1
      if (!isEdge && SMALL_WORDS.has(part.replace(/[^a-z']/g, ''))) return part
      return part.replace(/^([a-z])/, (c) => c.toUpperCase())
    })
    .join('')
}

/**
 * The song title as printed: the line's own wording if it has one, else the
 * hymnal title title-cased, else a free title for a song in neither book.
 */
export function songTitle(line: OrderLine): string {
  if (line.text.trim()) return line.text.trim()
  if (line.freeSongTitle?.trim()) return line.freeSongTitle.trim()
  return line.hymnTitle ? toTitleCase(line.hymnTitle) : ''
}

export function lineRef(line: OrderLine): string {
  return hymnRef(line.hymnBook, line.hymnNumber)
}

/** A rendered Order Line: two cells, or one merged cell. */
export interface RenderedLine {
  id: number
  kind: MusicLineKind
  merged: boolean
  align: MusicLineAlign
  left: string
  /** Printed bold; `suffix` prints unbolded beside it. */
  right: string
  suffix: string
  bold: boolean
  italic: boolean
  highlight: boolean
}

/**
 * Applies per-line overrides over the role defaults. `isFirst` gives the
 * service's opening line its time in the left cell, whatever its role.
 */
export function renderLine(line: OrderLine, service: ServiceInfo, isFirst: boolean): RenderedLine {
  const d = ROLE_DEFAULTS[line.role]
  // A song is always a two-cell row unless told otherwise — its reference has to
  // sit in a column, whatever role it carries.
  const merged = line.merged ?? (line.kind === 'song' ? false : d.merged)
  const ref = lineRef(line)
  const title = songTitle(line)

  let left = line.leftText
  let right = line.kind === 'song' ? '' : line.text
  if (line.kind === 'song') {
    // The reference lives in the left cell unless something else is there —
    // a role label ("Theme:") or a one-off override ("NO CHOIR"). When it is,
    // the reference moves inline so the row still carries it.
    const refInLeft = !d.leftLabel && !line.leftText
    if (refInLeft) {
      left = ref
      right = title
    } else {
      if (!left) left = d.leftLabel ?? ''
      right = ref ? `${ref}  ${title}` : title
    }
  } else if (!left && d.leftLabel) {
    left = d.leftLabel
  }
  if (isFirst && !line.leftText && !merged && line.kind !== 'song') left = formatServiceTime(service.time)

  return {
    id: line.id,
    kind: line.kind,
    merged,
    align: line.align ?? d.align,
    left,
    right,
    suffix: line.suffix,
    // Songs print bold on every original, whatever their role.
    bold: line.bold ?? (line.kind === 'song' ? true : d.bold),
    italic: line.italic,
    highlight: line.highlight,
  }
}

/* --------------------------------------------------------- episode numbers */

/**
 * Walks meeting + uploaded services in date order and hands each the next
 * number available in the year of its OWN date, so a week straddling New Year
 * numbers its Sunday from the old year and its Wednesday from the new at #1.
 * See docs/adr/0024-episode-numbers-stored-and-yearly.md.
 */
export function assignEpisodeNumbers(
  services: {id: number; date: string; meeting: boolean; uploaded: boolean}[],
  highestByYear: Record<number, number>,
): Record<number, number | null> {
  const counters: Record<number, number> = {...highestByYear}
  const out: Record<number, number | null> = {}
  const ordered = [...services].sort((a, b) => a.date.localeCompare(b.date))
  for (const s of ordered) {
    if (!s.meeting || !s.uploaded) {
      out[s.id] = null
      continue
    }
    const y = yearOf(s.date)
    const next = (counters[y] ?? 0) + 1
    counters[y] = next
    out[s.id] = next
  }
  return out
}

/* -------------------------------------------------- Sound Booth projection */

function stripOuterParens(s: string): string {
  const t = s.trim()
  return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t
}

/**
 * The first draft of a condensed Sound Booth line, written from the master's
 * own lines so both the affirmative and the negative wording come from what the
 * author actually typed. Stored and then hand-editable — ADR 0022.
 */
export function draftBoothLine(slot: MusicBoothSlot, lines: OrderLine[]): {text: string; highlight: boolean} | null {
  if (slot === 'motto_verse_theme') {
    const motto = lines.find((l) => l.role === 'motto')
    const verse = lines.find((l) => l.role === 'verse')
    const theme = lines.find((l) => l.role === 'theme')
    if (!motto && !verse && !theme) return null
    const parts: string[] = []
    if (motto) parts.push('Motto')
    if (verse) parts.push(verse.text.trim() ? `Verse (${verse.text.trim()})` : 'Verse')
    if (theme) {
      const detail = [lineRef(theme), stripOuterParens(theme.suffix)].filter(Boolean).join(', ')
      parts.push(detail ? `Theme Song (${detail})` : 'Theme Song')
    }
    const highlight = [motto, verse, theme].some((l) => l?.highlight)
    return {text: parts.join(', '), highlight}
  }

  const sel = lines.find((l) => l.role === 'pastor_selection')
  if (!sel) return null
  const idx = lines.indexOf(sel)
  const lead = [...lines.slice(0, idx)].reverse().find((l) => l.role === 'plain' && l.text.trim())
  const leadText = lead?.text.trim() || 'Prayer, Announcements'
  return {text: `${leadText}, _${sel.text.trim()}_`, highlight: sel.highlight}
}

/** True when a stored condensed line no longer matches a fresh draft. */
export function boothLineStale(stored: BoothLine, lines: OrderLine[]): boolean {
  const fresh = draftBoothLine(stored.slot, lines)
  if (!fresh) return stored.text.trim().length > 0
  return fresh.text !== stored.draftedFrom
}

export interface BoothRow {
  key: string
  kind: 'title' | 'scripture' | 'song' | 'condensed'
  label: string
  /** The episode number beside "Title:", printed bold italic. */
  labelSuffix: string
  note: string
  /** Song rows print the reference on one line and the title beneath it. */
  value: string
  valueSecond: string
  suffix: string
  merged: boolean
  align: MusicLineAlign
  highlight: boolean
  stale: boolean
  lineId: number | null
}

/**
 * The rows the Sound Booth Sheet prints for one service: Title, Text, then the
 * Order Lines their role marks for the booth, with condensed lines emitted
 * where their source roles first appear.
 */
export function resolveBoothRows(service: ServiceInfo, lines: OrderLine[], boothLines: BoothLine[]): BoothRow[] {
  const rows: BoothRow[] = []

  if (service.uploaded || service.title.trim()) {
    rows.push({
      key: `title-${service.id}`,
      kind: 'title',
      label: 'Title:',
      labelSuffix: service.episodeNumber != null ? `(#${service.episodeNumber})` : '',
      note: service.titleNote,
      value: service.title,
      valueSecond: '',
      suffix: '',
      merged: false,
      align: 'left',
      highlight: service.titleHighlight,
      stale: false,
      lineId: null,
    })
    rows.push({
      key: `scripture-${service.id}`,
      kind: 'scripture',
      label: 'Text:',
      labelSuffix: '',
      note: service.scriptureNote,
      value: service.scripture,
      valueSecond: '',
      suffix: '',
      merged: false,
      align: 'left',
      highlight: service.scriptureHighlight,
      stale: false,
      lineId: null,
    })
  }

  const hasChoir = lines.some((l) => l.role === 'choir')
  const emitted = new Set<MusicBoothSlot>()
  let firstSongDone = false

  for (const line of lines) {
    if (line.kind === 'page_break') continue
    const d = ROLE_DEFAULTS[line.role]
    const mode = line.booth === 'auto' ? d.booth : line.booth

    if (mode === 'fold') {
      const slot: MusicBoothSlot = line.role === 'pastor_selection' ? 'prayer_announcements' : 'motto_verse_theme'
      if (emitted.has(slot)) continue
      emitted.add(slot)
      const stored = boothLines.find((b) => b.slot === slot)
      const draft = draftBoothLine(slot, lines)
      if (!stored && !draft) continue
      rows.push({
        key: `booth-${service.id}-${slot}`,
        kind: 'condensed',
        label: '',
        labelSuffix: '',
        note: '',
        value: stored?.text ?? draft?.text ?? '',
        valueSecond: '',
        suffix: '',
        merged: true,
        align: 'center',
        highlight: stored?.highlight ?? draft?.highlight ?? false,
        stale: stored ? boothLineStale(stored, lines) : false,
        lineId: line.id,
      })
      continue
    }

    if (mode === 'exclude') continue
    if (line.kind !== 'song') continue

    // Absence wording lives on the role, not on a guess about the service:
    // a `choir` opener reads "(Choir & Cong.)", a `congregational` opener in a
    // service with no choir line reads "Cong. Opener (No Choir)". See ADR 0022.
    let label = line.boothLabel || d.boothLabel
    let note = line.boothNote || d.boothNote
    let highlight = line.highlight
    if (!firstSongDone) {
      firstSongDone = true
      if (line.role === 'congregational' && !hasChoir && !line.boothLabel) {
        label = 'Cong. Opener:'
        note = line.boothNote || '(No Choir)'
        highlight = true
      }
    } else if (line.role === 'congregational' && !line.boothLabel) {
      label = 'Congregational:'
    }

    rows.push({
      key: `song-${line.id}`,
      kind: 'song',
      label,
      labelSuffix: '',
      note,
      value: lineRef(line),
      valueSecond: songTitle(line),
      suffix: line.suffix,
      merged: false,
      align: 'left',
      highlight,
      stale: false,
      lineId: line.id,
    })
  }

  return rows
}

/* -------------------------------------------------------------- readiness */

export interface WeekWarning {
  key: string
  serviceId: number | null
  message: string
}

/**
 * The readiness list. Warnings only — export and finalize are never blocked,
 * because a genuine gap in the episode sequence (a service that was not
 * recorded) is legitimate and must be dismissible by ignoring it.
 */
export function weekWarnings(
  services: (ServiceInfo & {lines: OrderLine[]; boothLines: (BoothLine & {stale?: boolean})[]})[],
): WeekWarning[] {
  const out: WeekWarning[] = []
  const meeting = services.filter((s) => s.meeting)

  for (const s of meeting) {
    const label = s.name || 'Service'
    for (const l of s.lines) {
      if (l.kind === 'song' && l.hymnId == null && !l.freeSongTitle?.trim())
        out.push({key: `song-${l.id}`, serviceId: s.id, message: `${label} — a song line has no song chosen`})
    }
    if (s.uploaded && !s.title.trim())
      out.push({key: `title-${s.id}`, serviceId: s.id, message: `${label} — no Title set`})
    if (s.uploaded && !s.scripture.trim())
      out.push({key: `text-${s.id}`, serviceId: s.id, message: `${label} — no Text set`})
    for (const bl of s.boothLines) {
      if (bl.stale ?? boothLineStale(bl, s.lines))
        out.push({
          key: `stale-${bl.id}`,
          serviceId: s.id,
          message: `${label} — a Sound Booth line was drafted from roles that have since changed`,
        })
    }
  }

  // Episode numbers are scoped per calendar year — ADR 0024.
  const byYear = new Map<number, {id: number; n: number; label: string}[]>()
  for (const s of meeting) {
    if (s.episodeNumber == null) continue
    const y = yearOf(s.date)
    const list = byYear.get(y) ?? []
    list.push({id: s.id, n: s.episodeNumber, label: s.name || 'Service'})
    byYear.set(y, list)
  }
  for (const [year, list] of byYear) {
    const seen = new Map<number, string>()
    for (const item of list) {
      const prior = seen.get(item.n)
      if (prior)
        out.push({
          key: `dup-${item.id}`,
          serviceId: item.id,
          message: `#${item.n} is used twice in ${year} — ${prior} and ${item.label}`,
        })
      else seen.set(item.n, item.label)
    }
  }

  return out
}
