// Pure Quarter arithmetic for the Sunday School Roll. Imported by BOTH the
// client (rendering the sheet) and the server (seeding a Roll), so it must stay
// free of React, the `@` alias, and any Node or DOM API.
//
// A **Quarter** here is a genuine calendar quarter — unlike the Workers' Notes
// **Term**, which is a four-month third of the year. See CONTEXT.md.

export type Quarter = 1 | 2 | 3 | 4

export const QUARTERS: Quarter[] = [1, 2, 3, 4]

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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const ORDINALS: Record<Quarter, string> = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}

/**
 * Rows on a Roll Sheet. Sized to fill the landscape content box: 816 - 96
 * padding = 720px tall, less the ~82px logo block, ~31px title and ~28px grid
 * header, leaves 579px — 18 rows at 32px (0.33in), which is writable by hand.
 * See docs/adr/0021-fixed-page-box-print.md.
 */
export const ROLL_ROW_COUNT = 18

/**
 * Seeds the sheets of the very first Roll only. Every later Roll copies its
 * predecessor, so nothing reads this again — it is a convenience string, not
 * configuration. See docs/adr/0030.
 */
export const DEFAULT_SHEET_LABELS = [
  '3 yrs - Kindergarten',
  '1st-5th girls',
  '1st-5th boys',
  '6th-12th girls',
  '6th-12th boys',
] as const

export function isQuarter(value: number): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4
}

/** Quarter 3 -> [7, 8, 9]. */
export function quarterMonths(quarter: Quarter): number[] {
  const first = (quarter - 1) * 3 + 1
  return [first, first + 1, first + 2]
}

/** "3rd". */
export function quarterOrdinal(quarter: Quarter): string {
  return ORDINALS[quarter]
}

/** "2026 – 3rd Quarter" — the page heading and list row. */
export function quarterTitleLabel(year: number, quarter: Quarter): string {
  return `${year} – ${quarterOrdinal(quarter)} Quarter`
}

/** "July – September 2026" — the months column on the list. */
export function quarterRangeLabel(year: number, quarter: Quarter): string {
  const months = quarterMonths(quarter)
  return `${MONTH_NAMES[months[0] - 1]} – ${MONTH_NAMES[months[2] - 1]} ${year}`
}

/**
 * The line printed under the logo, matching the spreadsheet these sheets
 * replace: "Attendance 2026 - 3rd Quarter (July - September) | 3 yrs -
 * Kindergarten". Plain hyphens, deliberately — this is what the teachers read.
 */
export function rollSheetTitle(titlePrefix: string, year: number, quarter: Quarter, sheetLabel: string): string {
  const months = quarterMonths(quarter)
  const range = `${MONTH_NAMES[months[0] - 1]} - ${MONTH_NAMES[months[2] - 1]}`
  const head = `${titlePrefix} ${year} - ${quarterOrdinal(quarter)} Quarter (${range})`.trim()
  return sheetLabel.trim() ? `${head} | ${sheetLabel.trim()}` : head
}

/** Slug for export filenames: "2026-q3". */
export function quarterSlug(year: number, quarter: Quarter): string {
  return `${year}-q${quarter}`
}

export function nextQuarter(year: number, quarter: Quarter): {year: number; quarter: Quarter} {
  return quarter === 4 ? {year: year + 1, quarter: 1} : {year, quarter: (quarter + 1) as Quarter}
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

/**
 * Every Sunday in the Quarter, in order — 12, 13 or 14 of them. Derived at
 * render time and never stored: a Sunday with no Sunday School still gets a
 * column, which the teacher strikes through on paper. See ADR 0029.
 */
export function sundaysInQuarter(year: number, quarter: Quarter): string[] {
  const out: string[] = []
  for (const month of quarterMonths(quarter)) {
    const total = daysInMonth(year, month)
    for (let day = 1; day <= total; day++) {
      if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) out.push(isoDate(year, month, day))
    }
  }
  return out
}

/** "Jul 5" — one date column header. */
export function rollDateHeader(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${MONTH_ABBR[m - 1]} ${d}`
}

/** scope_start / scope_end for the `schedules` envelope row. */
export function scopeBounds(year: number, quarter: Quarter): {scopeStart: string; scopeEnd: string} {
  const months = quarterMonths(quarter)
  const last = months[2]
  return {scopeStart: isoDate(year, months[0], 1), scopeEnd: isoDate(year, last, daysInMonth(year, last))}
}

/**
 * Roster text -> the lines the sheet prints. Line index IS row index, so a
 * blank line in the middle stays a blank row; trailing blanks are dropped and
 * the grid pads back out to ROLL_ROW_COUNT. See ADR 0030.
 */
export function scholarLines(scholars: string): string[] {
  const lines = scholars.split('\n')
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return lines
}

/** How many names a sheet actually carries — what the overflow warning counts. */
export function scholarCount(scholars: string): number {
  return scholarLines(scholars).filter((l) => l.trim() !== '').length
}

/** Pages a sheet needs. 1 unless the roster outgrows the grid. */
export function sheetPageCount(scholars: string): number {
  return Math.max(1, Math.ceil(scholarLines(scholars).length / ROLL_ROW_COUNT))
}

/** The rows of one printed page, padded to a full grid. */
export function rowsForPage(scholars: string, page: number): string[] {
  const lines = scholarLines(scholars)
  const slice = lines.slice(page * ROLL_ROW_COUNT, (page + 1) * ROLL_ROW_COUNT)
  return [...slice, ...Array(Math.max(0, ROLL_ROW_COUNT - slice.length)).fill('')]
}

/** Drop empty lines and alphabetise. The explicit Sort A–Z gesture. */
export function sortScholars(scholars: string): string {
  return scholarLines(scholars)
    .map((l) => l.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}))
    .join('\n')
}
