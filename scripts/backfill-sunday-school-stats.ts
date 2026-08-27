/**
 * Backfills Department Counts from the "Sunday School Stats (2026).xlsx"
 * workbook this feature replaces.
 *
 * Prereq: `pnpm db:migrate` (needs 0047's sunday_school_* tables and its three
 * seeded departments).
 *
 * Usage: npx tsx scripts/backfill-sunday-school-stats.ts [path/to/workbook.xlsx]
 *        (defaults to ~/Desktop/Sunday School Stats (2026).xlsx)
 *
 * Safe to re-run: upserts on (week_of, department_id).
 *
 * The workbook is four `Quarter N` tabs, each 13 Sunday rows wide by three
 * groups. Only Girls and Boys are typed — Total, Diff and the Averages row are
 * all formulas, and none of them is imported.
 *
 * Blank is not zero and the sheet distinguishes them, so this does too:
 *   - both cells empty  -> no row at all (Q3 stops after 2026-08-23; Q4 is bare)
 *   - an explicit 0     -> a stored 0 (2026-01-25 and 2026-03-22 are real zeros)
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

const YEAR = 2026

/** Excel serial (1900 system) -> 'YYYY-MM-DD'. */
function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Girls/Boys column pairs for the three groups. The sheet repeats
 * Group/Girls/Boys/Total/Diff/spacer six columns apart, so the pairs land at
 * C/D, I/J and O/P — read positionally because the header row names them
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

function main() {
  const workbookPath = process.argv[2] ?? DEFAULT_WORKBOOK
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const departments = db
    .prepare('SELECT id, name, sort_order FROM sunday_school_departments ORDER BY sort_order')
    .all() as {id: number; name: string; sort_order: number}[]

  if (departments.length !== 3) {
    throw new Error(`expected 3 seeded departments, found ${departments.length} — run pnpm db:migrate first`)
  }
  console.log(`Departments: ${departments.map((d) => `${d.name} (#${d.id})`).join(', ')}`)

  const wb = XLSX.readFile(workbookPath)
  const pending: Cell[] = []
  const summary: {quarter: Quarter; sundays: number; withData: number; total: number}[] = []

  for (const quarter of QUARTERS) {
    const sheetName = `Quarter ${quarter}`
    const sheet = wb.Sheets[sheetName]
    if (!sheet) throw new Error(`missing sheet "${sheetName}"`)

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1, defval: null})
    const dateRows = rows.filter((r) => typeof r[0] === 'number')
    const expected = sundaysInQuarter(YEAR, quarter)
    const actual = dateRows.map((r) => serialToIso(r[0] as number))

    // Assert rather than trust row order: the derived Sundays are what the app
    // will render forever, so a workbook that disagrees is a real problem.
    if (actual.length !== expected.length || actual.some((d, i) => d !== expected[i])) {
      throw new Error(
        `${sheetName}: dates do not match sundaysInQuarter(${YEAR}, ${quarter})\n` +
          `  sheet:   ${actual.join(', ')}\n  derived: ${expected.join(', ')}`,
      )
    }

    let withData = 0
    let quarterTotal = 0
    for (const row of dateRows) {
      const weekOf = serialToIso(row[0] as number)
      let rowHasData = false
      for (let i = 0; i < departments.length; i++) {
        const [gc, bc] = GENDER_COLS[i]
        const girls = readNumber(row[gc])
        const boys = readNumber(row[bc])
        if (girls === null && boys === null) continue
        rowHasData = true
        quarterTotal += (girls ?? 0) + (boys ?? 0)
        pending.push({weekOf, departmentId: departments[i].id, girls, boys})
      }
      if (rowHasData) withData++
    }
    summary.push({quarter, sundays: dateRows.length, withData, total: quarterTotal})
  }

  console.log('\nQuarter  Sundays  With data  Total scholars')
  for (const s of summary) {
    console.log(
      `   Q${s.quarter}     ${String(s.sundays).padStart(4)}     ${String(s.withData).padStart(4)}      ${String(s.total).padStart(6)}`,
    )
  }
  const weeks = new Set(pending.map((c) => c.weekOf)).size
  const grand = summary.reduce((a, s) => a + s.total, 0)
  console.log(`\n${pending.length} rows across ${weeks} Sundays, ${grand} scholars total.`)

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
              coalesce(sum(coalesce(girls,0) + coalesce(boys,0)), 0) AS total
       FROM sunday_school_department_counts`,
    )
    .get() as {rows: number; weeks: number; total: number}

  console.log(`\nStored: ${stored.rows} rows, ${stored.weeks} Sundays, ${stored.total} scholars.`)
  if (stored.total !== grand) {
    throw new Error(`stored total ${stored.total} != workbook total ${grand}`)
  }
  db.close()
  console.log('Done.')
}

main()
