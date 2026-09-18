import ExcelJS from 'exceljs'

/**
 * Reads .xlsx workbooks as plain row arrays, the way `xlsx`'s
 * `sheet_to_json(sheet, {header: 1, defval: null})` used to.
 *
 * ExcelJS is the maintained reader (the `xlsx` line on npm stopped at 0.18.5 and
 * carries two unpatched high advisories), but its cell model is richer than the
 * parsers here want: indices start at 1, blank rows are skipped, and a cell can
 * hold a formula/hyperlink/rich-text object rather than a primitive. Everything
 * in this module exists to flatten that back down.
 */

/** A cell as the parsers expect it: primitive, `Date`, or `null` when empty. */
export type CellValue = string | number | boolean | Date | null

/**
 * Rebuilds a date at the same wall-clock reading in local time.
 *
 * ExcelJS resolves a date cell to UTC midnight; `xlsx` resolved the same cell to
 * *local* midnight. That five-hour gap matters because the devotion parser reads
 * `getFullYear`/`getMonth`/`getDate` — local getters — so a UTC-midnight date
 * reads as the previous day anywhere west of Greenwich, silently shifting every
 * imported date back by one.
 *
 * A spreadsheet date cell is a calendar date, not an instant, so the wall-clock
 * reading is the part worth preserving.
 */
const toLocalWallClock = (d: Date): Date =>
  new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  )

/**
 * Flattens one ExcelJS cell value to a primitive.
 *
 * This is the load-bearing part. ExcelJS returns objects for several ordinary
 * cell kinds, and every one of them stringifies to "[object Object]" — so
 * without this, a formula or a bit of rich text would silently parse as garbage
 * instead of failing loudly.
 */
export const flattenCell = (value: unknown): CellValue => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return toLocalWallClock(value)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value

  if (typeof value === 'object') {
    const v = value as Record<string, unknown>

    // Formula cells: {formula, result} / {sharedFormula, result}. Use the cached
    // result, which is what the old reader surfaced. A formula that has never
    // been evaluated has no result, and an error result is {error: '#DIV/0!'}.
    if ('result' in v) {
      const result = v.result
      if (result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)) return null
      return flattenCell(result)
    }
    if ('formula' in v || 'sharedFormula' in v) return null

    // Rich text: {richText: [{text}, ...]} — concatenate the runs.
    if (Array.isArray(v.richText)) {
      return v.richText.map((run) => String((run as {text?: unknown}).text ?? '')).join('')
    }

    // Hyperlink cells: {text, hyperlink}. The display text is what was read before.
    if ('text' in v) return flattenCell(v.text)

    // Error cells: {error: '#N/A'} — treated as empty, as the old reader did.
    if ('error' in v) return null
  }

  return null
}

/**
 * Returns every row of a worksheet as a dense, 0-indexed array.
 *
 * Two ExcelJS behaviours are deliberately undone:
 *
 * - `row.values` is 1-indexed with an empty slot at 0, so it is sliced.
 * - `eachRow` skips blank rows by default. Row *position* is load-bearing here:
 *   the devotion parser falls back to the row index as a day-of-month when a
 *   date cell will not parse, so a collapsed blank row would shift dates. Rows
 *   are therefore walked by number, and blanks come back as empty arrays.
 */
export const sheetRows = (sheet: ExcelJS.Worksheet): CellValue[][] => {
  const rows: CellValue[][] = []
  const width = sheet.columnCount

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const out: CellValue[] = []
    for (let c = 1; c <= width; c++) {
      out.push(flattenCell(row.getCell(c).value))
    }
    rows.push(out)
  }

  return rows
}

/** Sheet names in workbook order, matching the old reader's `SheetNames`. */
export const sheetNames = (workbook: ExcelJS.Workbook): string[] => workbook.worksheets.map((s) => s.name)

/** Reads a workbook from an in-memory buffer (the upload path). */
export const readWorkbookFromBuffer = async (buffer: Buffer): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS types the reader as taking a stream, but it accepts a Buffer and the
  // upload path has the whole file in memory already.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  return workbook
}

/** Reads a workbook from disk (the backfill-script path). */
export const readWorkbookFromFile = async (filePath: string): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return workbook
}
