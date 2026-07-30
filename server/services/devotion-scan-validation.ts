import {asc, desc, gt, inArray, lt} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

/**
 * Validation for parsed handwritten devotion sheets.
 *
 * The log has one devotion per calendar day and the number increases by exactly
 * 1 each day, so a sheet is fully determined by a single (date, number) anchor.
 * That makes OCR slips loud: a misread day, a skipped row, or a wrong day-of-week
 * label all break the date/number lockstep somewhere.
 */

export type ScanIssueSeverity = 'error' | 'warning'

export interface ScanIssueFix {
  field: 'date' | 'number'
  value: string | number
  label: string
}

export interface ScanIssue {
  code: string
  severity: ScanIssueSeverity
  /** Row this issue belongs to, or null for sheet-level issues. */
  rowIndex: number | null
  field?: 'date' | 'number' | 'dayOfWeek' | 'type' | 'chain'
  message: string
  /** One-click corrections the reviewer can apply to this row. */
  fixes?: ScanIssueFix[]
  /** Sheet-level correction: add this delta to every devotion number. */
  shiftAll?: number
}

export interface ValidatableDevotion {
  date: string
  number: number
  devotionType: string
  /** Day-of-week exactly as written on the sheet — cross-checked, never imported. */
  dayOfWeek?: string | null
  guestSpeaker?: string | null
  songName?: string | null
  referencedDevotions?: number[]
}

const DAY_MS = 86_400_000

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MONTHS = [
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

/** Parse YYYY-MM-DD as UTC midnight, rejecting non-existent dates like Feb 30. */
function toDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return dt
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

function dayIndex(d: Date): number {
  return Math.round(d.getTime() / DAY_MS)
}

function fmt(d: Date): string {
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

function fmtShort(d: Date): string {
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`
}

/** "MON", "Monday", "Tues." → weekday index, or null if unrecognizable. */
function normalizeWeekday(value: string | null | undefined): number | null {
  const s = (value || '').toLowerCase().replace(/[^a-z]/g, '')
  if (s.length < 3) return null
  const prefix = s.slice(0, 3)
  const idx = WEEKDAYS.findIndex((w) => w.toLowerCase().startsWith(prefix))
  return idx === -1 ? null : idx
}

function monthIndex(name: string | null | undefined): number | null {
  const s = (name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (s.length < 3) return null
  const idx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.slice(0, 3)))
  return idx === -1 ? null : idx
}

interface Row {
  index: number
  row: ValidatableDevotion
  date: Date
  number: number
}

export function validateParsedDevotions(
  devotions: ValidatableDevotion[],
  meta: {month?: string | null; year?: number | null} = {},
): ScanIssue[] {
  const issues: ScanIssue[] = []
  if (!devotions || devotions.length === 0) return issues

  const label = (index: number, number: unknown) => `Row ${index + 1} (#${number})`

  // ---- Row-level sanity ------------------------------------------------
  const rows: Row[] = []
  for (let i = 0; i < devotions.length; i++) {
    const row = devotions[i]
    const date = toDate(row.date)
    const numberOk = Number.isInteger(row.number) && row.number > 0

    if (!date) {
      issues.push({
        code: 'invalid_date',
        severity: 'error',
        rowIndex: i,
        field: 'date',
        message: `${label(i, row.number)}: "${row.date}" is not a valid calendar date.`,
      })
    }
    if (!numberOk) {
      issues.push({
        code: 'invalid_number',
        severity: 'error',
        rowIndex: i,
        field: 'number',
        message: `Row ${i + 1}: "${row.number}" is not a valid devotion number.`,
      })
    }
    if (date && numberOk) rows.push({index: i, row, date, number: row.number})
  }

  if (rows.length === 0) return issues

  const ordered = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())
  const firstDate = ordered[0].date
  const lastDate = ordered[ordered.length - 1].date

  // ---- Sheet month / year ---------------------------------------------
  const expectedMonth = monthIndex(meta.month)
  const expectedYear = meta.year ?? null
  if (expectedMonth !== null && expectedYear) {
    for (const r of rows) {
      if (r.date.getUTCMonth() !== expectedMonth || r.date.getUTCFullYear() !== expectedYear) {
        issues.push({
          code: 'wrong_month',
          severity: 'error',
          rowIndex: r.index,
          field: 'date',
          message: `${label(r.index, r.number)} is dated ${fmt(r.date)}, but this sheet is ${MONTHS[expectedMonth]} ${expectedYear}.`,
        })
      }
    }

    const monthStart = new Date(Date.UTC(expectedYear, expectedMonth, 1))
    const monthEnd = new Date(Date.UTC(expectedYear, expectedMonth + 1, 0))
    if (firstDate.getTime() > monthStart.getTime() && firstDate.getUTCMonth() === expectedMonth) {
      const missing = dayIndex(firstDate) - dayIndex(monthStart)
      issues.push({
        code: 'missing_leading_days',
        severity: 'warning',
        rowIndex: null,
        field: 'date',
        message: `The sheet starts on ${fmtShort(firstDate)} — no rows for the first ${missing} day${missing > 1 ? 's' : ''} of ${MONTHS[expectedMonth]}.`,
      })
    }
    if (lastDate.getTime() < monthEnd.getTime() && lastDate.getUTCMonth() === expectedMonth) {
      const missing = dayIndex(monthEnd) - dayIndex(lastDate)
      issues.push({
        code: 'missing_trailing_days',
        severity: 'warning',
        rowIndex: null,
        field: 'date',
        message: `The sheet ends on ${fmtShort(lastDate)} — no rows for the last ${missing} day${missing > 1 ? 's' : ''} of ${MONTHS[expectedMonth]}.`,
      })
    }
  }

  // ---- Day-of-week cross-check ----------------------------------------
  // The handwritten DAY column is the usual culprit, but a mismatch can also
  // mean the DATE was misread — so say which one the surrounding rows favour.
  const byDate = new Map<number, Row[]>()
  for (const r of rows) {
    const key = dayIndex(r.date)
    byDate.set(key, [...(byDate.get(key) ?? []), r])
  }
  const hasNeighbour = (r: Row) => byDate.has(dayIndex(r.date) - 1) || byDate.has(dayIndex(r.date) + 1)

  for (const r of rows) {
    const claimed = normalizeWeekday(r.row.dayOfWeek)
    if (claimed === null) continue
    const actual = r.date.getUTCDay()
    if (claimed === actual) continue

    const forward = (claimed - actual + 7) % 7
    const nearest = addDays(r.date, forward <= 3 ? forward : forward - 7)
    const dateLooksRight = hasNeighbour(r) && (byDate.get(dayIndex(nearest))?.length ?? 0) > 0

    issues.push({
      code: 'weekday_mismatch',
      severity: 'warning',
      rowIndex: r.index,
      field: 'dayOfWeek',
      message:
        `${label(r.index, r.number)}: the sheet says ${WEEKDAYS[claimed]}, but ${fmt(r.date)} is a ${WEEKDAYS[actual]}. ` +
        (dateLooksRight
          ? 'The date fits the rows around it, so the handwritten day label is probably the mistake.'
          : `The nearest ${WEEKDAYS[claimed]} is ${fmtShort(nearest)} — check whether the date was misread.`),
      fixes: dateLooksRight
        ? undefined
        : [{field: 'date', value: toIso(nearest), label: `Set date to ${fmtShort(nearest)}`}],
    })
  }

  // ---- Date sequence ---------------------------------------------------
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    const gap = dayIndex(cur.date) - dayIndex(prev.date)

    if (gap === 0) {
      issues.push({
        code: 'duplicate_date',
        severity: 'error',
        rowIndex: cur.index,
        field: 'date',
        message: `${label(cur.index, cur.number)} and ${label(prev.index, prev.number)} are both dated ${fmt(cur.date)}. Each day should appear once.`,
      })
    } else if (gap > 1) {
      const missing: string[] = []
      for (let d = 1; d < gap && missing.length < 8; d++) missing.push(fmtShort(addDays(prev.date, d)))
      const suffix = gap - 1 > missing.length ? `, +${gap - 1 - missing.length} more` : ''
      issues.push({
        code: 'missing_date',
        severity: 'error',
        rowIndex: cur.index,
        field: 'date',
        message: `No row for ${missing.join(', ')}${suffix} — the sheet jumps from ${fmtShort(prev.date)} to ${fmtShort(cur.date)}.`,
      })
    }
  }

  const listedOutOfOrder = rows.some((r, i) => i > 0 && r.date.getTime() < rows[i - 1].date.getTime())
  if (listedOutOfOrder) {
    issues.push({
      code: 'dates_out_of_order',
      severity: 'warning',
      rowIndex: null,
      field: 'date',
      message: 'Rows are not listed in date order. Check that no two rows were swapped during parsing.',
    })
  }

  // ---- Number sequence -------------------------------------------------
  // Rows already carrying a numbering error don't need the database conflict
  // repeated back at them further down.
  const numberErrorRows = new Set<number>()

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    const dayGap = dayIndex(cur.date) - dayIndex(prev.date)
    const numGap = cur.number - prev.number
    if (dayGap <= 0 || numGap === dayGap) continue

    const expected = prev.number + dayGap
    const skipped = numGap - dayGap
    let message: string
    if (numGap <= 0) {
      message = `${label(cur.index, cur.number)} does not follow #${prev.number} on ${fmtShort(prev.date)}. Numbers must increase by 1 per day.`
    } else if (skipped > 0) {
      message = `${label(cur.index, cur.number)} skips ${skipped} number${skipped > 1 ? 's' : ''} after #${prev.number} on ${fmtShort(prev.date)}.`
    } else {
      message = `${label(cur.index, cur.number)} only advances ${numGap} after #${prev.number}, but ${dayGap} days passed since ${fmtShort(prev.date)}.`
    }

    numberErrorRows.add(cur.index)
    issues.push({
      code: numGap <= 0 ? 'number_out_of_order' : 'number_gap',
      severity: 'error',
      rowIndex: cur.index,
      field: 'number',
      message,
      fixes: [{field: 'number', value: expected, label: `Set # to ${expected}`}],
    })
  }

  const dupNumbers = new Map<number, Row[]>()
  for (const r of rows) dupNumbers.set(r.number, [...(dupNumbers.get(r.number) ?? []), r])
  for (const [number, group] of dupNumbers) {
    if (group.length < 2) continue
    for (const r of group.slice(1)) {
      numberErrorRows.add(r.index)
      issues.push({
        code: 'duplicate_number',
        severity: 'error',
        rowIndex: r.index,
        field: 'number',
        message: `#${number} appears on ${group.map((g) => fmtShort(g.date)).join(' and ')}. Devotion numbers are unique.`,
      })
    }
  }

  // ---- Date/number lockstep -------------------------------------------
  // number - dayIndex is constant across the whole log. Rows that disagree with
  // the sheet's own consensus have either a bad date or a bad number.
  const anchorBefore = db
    .select({date: schema.devotions.date, number: schema.devotions.number})
    .from(schema.devotions)
    .where(lt(schema.devotions.date, toIso(firstDate)))
    .orderBy(desc(schema.devotions.date))
    .limit(1)
    .get()
  const anchorAfter = db
    .select({date: schema.devotions.date, number: schema.devotions.number})
    .from(schema.devotions)
    .where(gt(schema.devotions.date, toIso(lastDate)))
    .orderBy(asc(schema.devotions.date))
    .limit(1)
    .get()

  let sheetOffsetReported = false
  const anchor = anchorBefore ?? anchorAfter
  const anchorDate = anchor ? toDate(anchor.date) : null
  const anchorOffset = anchor && anchorDate ? anchor.number - dayIndex(anchorDate) : null

  const offsetCounts = new Map<number, number>()
  for (const r of rows) {
    const offset = r.number - dayIndex(r.date)
    offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1)
  }
  let consensus = rows[0].number - dayIndex(rows[0].date)
  let best = -1
  for (const [offset, count] of offsetCounts) {
    // Prefer the offset the database already agrees with when counts tie.
    const score = count * 2 + (offset === anchorOffset ? 1 : 0)
    if (score > best) {
      best = score
      consensus = offset
    }
  }

  for (const r of rows) {
    const offset = r.number - dayIndex(r.date)
    if (offset === consensus) continue
    const expectedNumber = consensus + dayIndex(r.date)
    const expectedDate = addDays(r.date, offset - consensus)
    numberErrorRows.add(r.index)
    issues.push({
      code: 'number_date_mismatch',
      severity: 'error',
      rowIndex: r.index,
      field: 'number',
      message: `${label(r.index, r.number)} on ${fmtShort(r.date)} breaks the date/number lockstep — that day should be #${expectedNumber} (or #${r.number} belongs on ${fmtShort(expectedDate)}).`,
      fixes: [
        {field: 'number', value: expectedNumber, label: `Set # to ${expectedNumber}`},
        {field: 'date', value: toIso(expectedDate), label: `Set date to ${fmtShort(expectedDate)}`},
      ],
    })
  }

  if (anchor && anchorDate && anchorOffset !== null && anchorOffset !== consensus) {
    const delta = anchorOffset - consensus
    const distance = Math.abs(dayIndex(anchorDate) - dayIndex(anchorBefore ? firstDate : lastDate))
    const expectedFirst = anchorOffset + dayIndex(firstDate)
    const sheetFirst = consensus + dayIndex(firstDate)
    issues.push({
      code: 'sheet_number_offset',
      severity: distance > 45 ? 'warning' : 'error',
      rowIndex: null,
      field: 'number',
      message:
        `Every number on this sheet is off by ${delta > 0 ? '+' : ''}${delta} from the database: #${anchor.number} is dated ${fmtShort(anchorDate)}, ` +
        `so ${fmtShort(firstDate)} should be #${expectedFirst}, not #${sheetFirst}.` +
        (distance > 45 ? ` (The nearest known devotion is ${distance} days away — double-check before shifting.)` : ''),
      shiftAll: delta,
    })
    sheetOffsetReported = true
  }

  // ---- Conflicts with devotions already in the database ----------------
  // Only worth reporting where the row isn't already flagged for its numbering,
  // otherwise a one-day slip repeats itself on every remaining row.
  const existingOnDates = db
    .select({date: schema.devotions.date, number: schema.devotions.number})
    .from(schema.devotions)
    .where(
      inArray(
        schema.devotions.date,
        rows.map((r) => toIso(r.date)),
      ),
    )
    .all()
  const existingByDate = new Map(existingOnDates.map((e) => [e.date, e.number]))
  const conflicts = rows.filter((r) => {
    const existing = existingByDate.get(toIso(r.date))
    return existing != null && existing !== r.number && !numberErrorRows.has(r.index)
  })

  if (!sheetOffsetReported && conflicts.length > 3) {
    const sample = conflicts.slice(0, 3).map((r) => `${fmtShort(r.date)} (#${existingByDate.get(toIso(r.date))})`)
    issues.push({
      code: 'db_date_conflicts',
      severity: 'error',
      rowIndex: null,
      field: 'number',
      message: `${conflicts.length} rows are numbered differently than the database has them for the same date — e.g. ${sample.join(', ')}.`,
    })
  } else if (!sheetOffsetReported) {
    for (const r of conflicts) {
      const existing = existingByDate.get(toIso(r.date))!
      issues.push({
        code: 'db_date_conflict',
        severity: 'error',
        rowIndex: r.index,
        field: 'number',
        message: `${fmt(r.date)} is already recorded as #${existing} in the database, but this row says #${r.number}.`,
        fixes: [{field: 'number', value: existing, label: `Set # to ${existing}`}],
      })
    }
  }

  // ---- Type-specific checks -------------------------------------------
  const referenced = [...new Set(rows.flatMap((r) => r.row.referencedDevotions ?? []))]
  const knownRefs = new Set<number>(
    referenced.length > 0
      ? db
          .select({number: schema.devotions.number})
          .from(schema.devotions)
          .where(inArray(schema.devotions.number, referenced))
          .all()
          .map((d) => d.number)
      : [],
  )
  const sheetNumbers = new Set(rows.map((r) => r.number))

  for (const r of rows) {
    const refs = r.row.referencedDevotions ?? []
    if (r.row.devotionType === 'revisit') {
      if (refs.length === 0) {
        issues.push({
          code: 'revisit_missing_chain',
          severity: 'warning',
          rowIndex: r.index,
          field: 'chain',
          message: `${label(r.index, r.number)} is a revisit with no referenced devotion.`,
        })
      }
      for (const ref of refs) {
        if (ref >= r.number) {
          issues.push({
            code: 'forward_reference',
            severity: 'error',
            rowIndex: r.index,
            field: 'chain',
            message: `${label(r.index, r.number)} references #${ref}, which is not an earlier devotion.`,
          })
        } else if (!knownRefs.has(ref) && !sheetNumbers.has(ref)) {
          issues.push({
            code: 'unknown_reference',
            severity: 'warning',
            rowIndex: r.index,
            field: 'chain',
            message: `${label(r.index, r.number)} references #${ref}, which is not in the database.`,
          })
        }
      }
    }

    if (r.row.devotionType === 'guest' && !r.row.guestSpeaker) {
      issues.push({
        code: 'guest_missing_speaker',
        severity: 'warning',
        rowIndex: r.index,
        field: 'type',
        message: `${label(r.index, r.number)} is a guest devotion with no speaker.`,
      })
    }

    if (r.row.songName && r.row.devotionType !== 'original') {
      issues.push({
        code: 'song_on_non_original',
        severity: 'warning',
        rowIndex: r.index,
        field: 'type',
        message: `${label(r.index, r.number)} is a ${r.row.devotionType} but has a song ("${r.row.songName}"). Songs only import on originals.`,
      })
    }
  }

  return issues.sort((a, b) => (a.rowIndex ?? -1) - (b.rowIndex ?? -1))
}
