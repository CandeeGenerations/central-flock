// Pure Term arithmetic and lesson numbering for the Four-Month Workers' Notes.
// Imported by BOTH the client (live renumbering in the editor) and the server
// (seeding rows on create), so it must stay free of React, the `@` alias, and
// any Node or DOM API.
//
// See docs/adr/0020-derived-lesson-numbering.md.

export type WorkersNotesTerm = 1 | 2 | 3

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
] as const

/** Highest story number in the Betty Lukens catalogue. */
export const MAX_LESSON_NUMBER = 182

export const TERMS: WorkersNotesTerm[] = [1, 2, 3]

export function isTerm(value: number): value is WorkersNotesTerm {
  return value === 1 || value === 2 || value === 3
}

/** Term 1 -> [1,2,3,4], term 2 -> [5,6,7,8], term 3 -> [9,10,11,12]. */
export function termMonths(term: WorkersNotesTerm): number[] {
  const first = (term - 1) * 4 + 1
  return [first, first + 1, first + 2, first + 3]
}

/** The term a month belongs to. */
export function termOfMonth(month: number): WorkersNotesTerm {
  return (Math.floor((month - 1) / 4) + 1) as WorkersNotesTerm
}

/** "January, February, March, and April 2026" — the boxed line on page 1. */
export function termLabel(year: number, term: WorkersNotesTerm): string {
  const names = termMonths(term).map((m) => MONTH_NAMES[m - 1])
  return `${names[0]}, ${names[1]}, ${names[2]}, and ${names[3]} ${year}`
}

/** "January - April 2026" — the page-2 box header. */
export function termRangeLabel(year: number, term: WorkersNotesTerm): string {
  const months = termMonths(term)
  return `${MONTH_NAMES[months[0] - 1]} – ${MONTH_NAMES[months[3] - 1]} ${year}`
}

/** "January through April 2027" — the "Forms for ..." sentence. */
export function termThroughLabel(year: number, term: WorkersNotesTerm): string {
  const months = termMonths(term)
  return `${MONTH_NAMES[months[0] - 1]} through ${MONTH_NAMES[months[3] - 1]} ${year}`
}

/** Slug for export filenames: "jan-apr-2026". */
export function termSlug(year: number, term: WorkersNotesTerm): string {
  const months = termMonths(term)
  const abbr = (m: number) => MONTH_NAMES[m - 1].slice(0, 3).toLowerCase()
  return `${abbr(months[0])}-${abbr(months[3])}-${year}`
}

/** Term 3 rolls into the next year's term 1. */
export function nextTerm(year: number, term: WorkersNotesTerm): {year: number; term: WorkersNotesTerm} {
  return term === 3 ? {year: year + 1, term: 1} : {year, term: (term + 1) as WorkersNotesTerm}
}

export function previousTerm(year: number, term: WorkersNotesTerm): {year: number; term: WorkersNotesTerm} {
  return term === 1 ? {year: year - 1, term: 3} : {year, term: (term - 1) as WorkersNotesTerm}
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Every Sunday in a month, as 'YYYY-MM-DD'. */
export function sundaysInMonth(year: number, month: number): string[] {
  const out: string[] = []
  const total = daysInMonth(year, month)
  for (let day = 1; day <= total; day++) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) out.push(isoDate(year, month, day))
  }
  return out
}

/** Every Sunday in the Term, in order. 17 or 18 of them. */
export function sundaysInTerm(year: number, term: WorkersNotesTerm): string[] {
  return termMonths(term).flatMap((m) => sundaysInMonth(year, m))
}

/** scope_start / scope_end for the `schedules` envelope row. */
export function scopeBounds(year: number, term: WorkersNotesTerm): {scopeStart: string; scopeEnd: string} {
  const months = termMonths(term)
  const last = months[3]
  return {
    scopeStart: isoDate(year, months[0], 1),
    scopeEnd: isoDate(year, last, daysInMonth(year, last)),
  }
}

/** "May  3" — the Date column. Two spaces so single digits align, as printed. */
export function lessonRowDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  void y
  return `${MONTH_NAMES[m - 1]} ${String(d).padStart(2, ' ')}`
}

export type LessonKind = 'regular' | 'special' | 'combined' | 'note'

export interface LessonRowInput {
  id?: number
  kind: LessonKind
  date?: string | null
  specialLesson?: string
  text?: string
  sortOrder?: number
}

export interface ResolvedLessonRow extends LessonRowInput {
  /** The number printed in the Lesson column, or '' when the kind prints none. */
  lessonLabel: string
  /** Resolved story number for `regular` rows — used for Points prefill. */
  storyNumber: number | null
  /** True once the running sequence has passed MAX_LESSON_NUMBER. */
  overflow: boolean
}

/**
 * Walk rows in order, incrementing the counter only on `regular`. `special`,
 * `combined` and `note` consume nothing — which is why marking two Sundays
 * combined slides every later lesson down by two, and why the Easter specials
 * left 20/21/22 for the weeks after them.
 */
export function resolveLessonNumbers(rows: LessonRowInput[], startingLessonNumber: number): ResolvedLessonRow[] {
  let next = startingLessonNumber
  return rows.map((row) => {
    if (row.kind === 'regular') {
      const storyNumber = next
      next += 1
      return {
        ...row,
        lessonLabel: String(storyNumber),
        storyNumber,
        overflow: storyNumber > MAX_LESSON_NUMBER,
      }
    }
    return {
      ...row,
      lessonLabel: row.kind === 'special' ? (row.specialLesson ?? '') : '',
      storyNumber: null,
      overflow: false,
    }
  })
}

/** The number the next edition starts at: last regular consumed + 1. */
export function nextStartingLessonNumber(rows: LessonRowInput[], startingLessonNumber: number): number {
  const regulars = rows.filter((r) => r.kind === 'regular').length
  return startingLessonNumber + regulars
}

/** Story numbers a `special` row prints — '151-153' -> [151, 152, 153]. */
export function parseSpecialLesson(value: string): number[] {
  const out: number[] = []
  for (const part of value.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const range = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)$/)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from <= to && to - from < 50) for (let n = from; n <= to; n++) out.push(n)
      continue
    }
    if (/^\d+$/.test(trimmed)) out.push(Number(trimmed))
  }
  return out
}

/** "(B-448)" / "(S-34)" from a hymn's book and number. */
export function hymnRefLabel(book: 'burgundy' | 'silver', number: number): string {
  return `(${book === 'burgundy' ? 'B' : 'S'}-${number})`
}
