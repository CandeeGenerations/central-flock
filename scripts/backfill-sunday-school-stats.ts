/**
 * Backfills Department Counts from the "Sunday School Stats (YYYY).xlsx"
 * workbooks this feature replaces.
 *
 * Prereq: `pnpm db:migrate` (needs 0047's sunday_school_* tables and its three
 * seeded departments).
 *
 * Usage: npx tsx scripts/backfill-sunday-school-stats.ts <workbook.xlsx>...
 *        (with no arguments, defaults to ~/Desktop/Sunday School Stats (2026).xlsx)
 *
 * The year comes from the filename, NOT from the date cells — see below.
 * Safe to re-run: upserts on (week_of, department_id).
 *
 * Each workbook is four `Quarter N` tabs. A quarter is 12-14 Sunday rows wide
 * by three groups, and only Girls and Boys are typed — Total, Diff and the
 * Averages row are all formulas, and none of them is imported. The header row
 * calls the group column "Service" in some years and "Group" in others, but the
 * Girls/Boys pairs sit at the same columns throughout.
 *
 * Blank is not zero and the sheets distinguish them, so this does too:
 *   - both cells empty  -> no row at all
 *   - an explicit 0     -> a stored 0
 *
 * DATES ARE DERIVED, NOT READ. Each row's week_of comes from
 * sundaysInQuarter(year, quarter) at that row's position, after asserting the
 * sheet's own month/day sequence agrees. Two workbooks make this necessary:
 *
 *   - The whole 2024 workbook carries 2023 in every date cell. It is not a copy
 *     of the 2023 file — the month/day sequence is 2024's Sundays (2024-01-07
 *     is a Sunday, 2023-01-07 is a Saturday), so only the year is wrong.
 *     Trusting those cells would interleave 2024 counts into 2023.
 *   - 2025 Q2 row 11 reads 2022-06-15 where every neighbour reads 2025.
 *
 * A month/day disagreement is a hard failure: that would mean the rows are
 * genuinely misaligned, which no amount of year-fixing can repair.
 */
import Database from 'better-sqlite3'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import XLSX from 'xlsx'

import {QUARTERS, type Quarter, sundaysInQuarter} from '../src/lib/sunday-school-roll-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'central-flock.db')
const DEFAULT_WORKBOOK = path.join(os.homedir(), 'Desktop', 'Sunday School Stats (2026).xlsx')

/** Excel serial (1900 system) -> 'YYYY-MM-DD'. */
function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

const monthDay = (iso: string) => iso.slice(5)

/**
 * Girls/Boys column pairs for the three groups. The sheet repeats
 * Group/Girls/Boys/Total/Diff/spacer six columns apart, so the pairs land at
 * C/D, I/J and O/P — read positionally, because the header names them
 * "Girls", "Girls 2", "Girls 3".
 */
const GENDER_COLS: [number, number][] = [
  [2, 3],
  [8, 9],
  [14, 15],
]

type Cell = {weekOf: string; departmentId: number; girls: number | null; boys: number | null}

function readNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** "…/Sunday School Stats (2024).xlsx" -> 2024. */
function yearFromFilename(file: string): number {
  const m = path.basename(file).match(/\((\d{4})\)/)
  if (!m) throw new Error(`cannot read a year from "${path.basename(file)}" — expected "... (YYYY).xlsx"`)
  return Number(m[1])
}

type QuarterSummary = {
  year: number
  quarter: Quarter
  sundays: number
  withData: number
  total: number
  repaired: number
}

function collect(file: string, pending: Cell[], departmentIds: number[]): QuarterSummary[] {
  const year = yearFromFilename(file)
  const wb = XLSX.readFile(file)
  const out: QuarterSummary[] = []

  for (const quarter of QUARTERS) {
    const sheetName = `Quarter ${quarter}`
    const sheet = wb.Sheets[sheetName]
    if (!sheet) throw new Error(`${path.basename(file)}: missing sheet "${sheetName}"`)

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1, defval: null})
    const dateRows = rows.filter((r) => typeof r[0] === 'number')
    const derived = sundaysInQuarter(year, quarter)
    const sheetDates = dateRows.map((r) => serialToIso(r[0] as number))

    if (sheetDates.length !== derived.length) {
      throw new Error(
        `${path.basename(file)} ${sheetName}: ${sheetDates.length} date rows but ` +
          `sundaysInQuarter(${year}, ${quarter}) yields ${derived.length}`,
      )
    }
    // Month/day must line up row for row. Only the year is ever allowed to
    // disagree, and when it does the derived value wins.
    const misaligned = sheetDates
      .map((d, i) => ({i, sheet: d, derived: derived[i]}))
      .filter((x) => monthDay(x.sheet) !== monthDay(x.derived))
    if (misaligned.length > 0) {
      const shown = misaligned
        .slice(0, 5)
        .map((x) => `  row ${x.i + 1}: sheet ${x.sheet}, derived ${x.derived}`)
        .join('\n')
      throw new Error(
        `${path.basename(file)} ${sheetName}: ${misaligned.length} row(s) disagree on month/day, ` +
          `so the rows are genuinely misaligned:\n${shown}`,
      )
    }
    const repaired = sheetDates.filter((d, i) => d !== derived[i]).length

    let withData = 0
    let quarterTotal = 0
    for (let r = 0; r < dateRows.length; r++) {
      const row = dateRows[r]
      const weekOf = derived[r]
      let rowHasData = false
      for (let i = 0; i < departmentIds.length; i++) {
        const [gc, bc] = GENDER_COLS[i]
        const girls = readNumber(row[gc])
        const boys = readNumber(row[bc])
        if (girls === null && boys === null) continue
        rowHasData = true
        quarterTotal += (girls ?? 0) + (boys ?? 0)
        pending.push({weekOf, departmentId: departmentIds[i], girls, boys})
      }
      if (rowHasData) withData++
    }
    out.push({year, quarter, sundays: dateRows.length, withData, total: quarterTotal, repaired})
  }
  return out
}

function main() {
  const files = process.argv.slice(2)
  const workbooks = files.length > 0 ? files : [DEFAULT_WORKBOOK]

  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const departments = db
    .prepare('SELECT id, name, sort_order FROM sunday_school_departments ORDER BY sort_order')
    .all() as {id: number; name: string; sort_order: number}[]

  if (departments.length !== 3) {
    throw new Error(`expected 3 seeded departments, found ${departments.length} — run pnpm db:migrate first`)
  }
  console.log(`Departments: ${departments.map((d) => `${d.name} (#${d.id})`).join(', ')}`)

  const ids = departments.map((d) => d.id)
  const pending: Cell[] = []
  const summary: QuarterSummary[] = []
  for (const file of workbooks) summary.push(...collect(file, pending, ids))

  console.log('\nYear  Qtr  Sundays  With data  Scholars  Dates repaired')
  for (const s of summary) {
    console.log(
      `${s.year}   Q${s.quarter}     ${String(s.sundays).padStart(4)}     ${String(s.withData).padStart(4)}` +
        `     ${String(s.total).padStart(6)}  ${s.repaired ? String(s.repaired).padStart(8) : '       -'}`,
    )
  }

  const repaired = summary.reduce((a, s) => a + s.repaired, 0)
  if (repaired > 0) {
    console.log(`\n${repaired} date cell(s) carried the wrong year and were taken from sundaysInQuarter() instead.`)
  }

  const weeks = new Set(pending.map((c) => c.weekOf)).size
  const grand = summary.reduce((a, s) => a + s.total, 0)
  console.log(`\n${pending.length} rows across ${weeks} Sundays, ${grand} scholars.`)

  // A duplicate here would mean two workbooks claim the same Sunday — the exact
  // failure the derived dates exist to prevent. Catch it before writing.
  const seen = new Set<string>()
  for (const c of pending) {
    const key = `${c.weekOf}|${c.departmentId}`
    if (seen.has(key)) throw new Error(`two workbooks both supply ${key}`)
    seen.add(key)
  }

  const upsert = db.prepare(`
    INSERT INTO sunday_school_department_counts (week_of, department_id, girls, boys)
    VALUES (@weekOf, @departmentId, @girls, @boys)
    ON CONFLICT (week_of, department_id)
    DO UPDATE SET girls = excluded.girls, boys = excluded.boys, updated_at = datetime('now')
  `)
  db.transaction((cells: Cell[]) => {
    for (const c of cells) upsert.run(c)
  })(pending)

  const stored = db
    .prepare(
      `SELECT count(*) AS rows, count(DISTINCT week_of) AS weeks,
              min(week_of) AS first, max(week_of) AS last,
              coalesce(sum(coalesce(girls,0) + coalesce(boys,0)), 0) AS total
       FROM sunday_school_department_counts`,
    )
    .get() as {rows: number; weeks: number; first: string; last: string; total: number}

  console.log(
    `\nTable now holds ${stored.rows} rows across ${stored.weeks} Sundays (${stored.first} .. ${stored.last}), ${stored.total} scholars.`,
  )
  db.close()
  console.log('Done.')
}

main()
