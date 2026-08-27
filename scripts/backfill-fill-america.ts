/**
 * Backfills four years of Fill America from "Fill America Stats.xlsx".
 *
 * Prereq: `pnpm db:migrate` (needs 0048's fill_america_* tables).
 *
 * Usage: npx tsx scripts/backfill-fill-america.ts [path/to/workbook.xlsx]
 *        (defaults to ~/Desktop/Fill America Stats.xlsx)
 *
 * Safe to re-run: upserts on the natural keys.
 *
 * WHAT THE WORKBOOK ACTUALLY CONTAINS
 *
 * One tab per campaign plus a `Grand Totals` tab of cross-sheet references.
 * Only four things on a campaign tab are typed: a household's tracts per week,
 * its goal, and the week's participants and door hangers. Tracts per week is
 * `=SUM(...)` over the roster column, the row Total is `=SUM(...)` across the
 * weeks, and per ADR 0032 Unique Participants becomes derived here too — so
 * this imports tracts, goals and door hangers, and nothing else.
 *
 * TWO TRAPS, BOTH SILENT IF MISSED
 *
 * 1. `Jun 25 - Jul 9, 22` uses a different column layout: name-block first and
 *    NO Goal column. Reading column F as the name there yields three date
 *    serials and drops the whole 25-row roster. Columns are therefore found by
 *    header name, never by fixed index.
 * 2. That same tab records individuals, not families — `Pastor Brad Weniger`,
 *    `Max Weniger` and so on where later campaigns have one `Wenigers`. The
 *    merge map rolls them up and Size carries the headcount.
 *
 * DATES COME FROM THE TAB NAME, NOT THE DATE CELLS. Campaigns are Saturday-
 * anchored — 14 of the 18 tabs' date cells land on a Saturday and four do not,
 * and in every one of those four the tab name gives the Saturday the cells miss:
 *
 *   Jun 25 - Jul 9, 22   cells 2022-06-26 (Sun)   name 2022-06-25   +1 day
 *   Sep 3-17, 22         cells 2022-09-04 (Sun)   name 2022-09-03   +1 day
 *   Jun 24 - Jul 8, 23   cells 2023-06-25 (Sun)   name 2023-06-24   +1 day
 *   Dec 6-20, 25         cells 2026-12-06 (Sun)   name 2025-12-06   +1 YEAR
 *
 * The last one is the dangerous one: trusting the cells files a 2025 campaign
 * in December 2026, out of chronological order, which breaks both the roster
 * copy-forward and every season comparison. So the start date is parsed from
 * the tab name and asserted to be a Saturday; the cells only supply the week
 * COUNT, and any month/day disagreement is reported.
 *
 * SIZE comes from that campaign's own label ("Sells x 3" in 2024 -> 3, "Sells
 * x 4" in 2025 -> 4). A label with no "x N" is size 1. Merged labels within one
 * campaign sum: sizes add and each week's tracts add. See ADR 0033.
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import XLSX from 'xlsx'

import {addDays, campaignWeekDates, defaultSeason, defaultTitle} from '../src/lib/fill-america-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'central-flock.db')
const MAP_PATH = path.join(__dirname, 'data', 'fill-america-households.json')
const DEFAULT_WORKBOOK = path.join(os.homedir(), 'Desktop', 'Fill America Stats.xlsx')

const TOTALS_SHEET = 'Grand Totals'

function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** "Candees x 5" -> 5. No suffix -> 1. */
function sizeFromLabel(label: string): number {
  const m = label.match(/x\s*(\d+)\s*$/i)
  return m ? Number(m[1]) : 1
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/** "Aug 29-Sept 12, 26" -> "2026-08-29". The campaign's real start. */
function startDateFromSheetName(sheetName: string): string {
  const year = sheetName.match(/,\s*(\d{2})\s*$/)
  const start = sheetName.match(/^\s*([A-Za-z]+)\s*(\d{1,2})/)
  if (!year || !start) throw new Error(`cannot read a date from tab name "${sheetName}"`)
  const month = MONTHS[start[1].toLowerCase()]
  if (!month) throw new Error(`unknown month "${start[1]}" in tab name "${sheetName}"`)
  const iso = `${2000 + Number(year[1])}-${String(month).padStart(2, '0')}-${String(Number(start[2])).padStart(2, '0')}`
  if (new Date(`${iso}T12:00:00Z`).getUTCDay() !== 6) {
    throw new Error(`tab "${sheetName}" starts ${iso}, which is not a Saturday`)
  }
  return iso
}

function readNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

interface RosterRow {
  household: string
  size: number
  goal: number | null
  tracts: (number | null)[]
  labels: string[]
}

interface ParsedCampaign {
  sheetName: string
  startDate: string
  endDate: string
  weekDates: string[]
  doorHangers: (number | null)[]
  sheetUnique: number
  sheetTracts: number
  sheetDoorHangers: number
  /** Set when the tab's date cells disagree with its name. */
  dateDrift: string | null
  roster: RosterRow[]
}

/**
 * Parses one campaign tab. Every column is located by its header text, which is
 * what keeps the irregular oldest tab working.
 */
function parseCampaign(wb: XLSX.WorkBook, sheetName: string, labelToHousehold: Record<string, string>): ParsedCampaign {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {header: 1, defval: null})
  const header = (rows[0] ?? []).map((v) => (v === null ? '' : String(v).trim()))
  const col = (name: string) => header.indexOf(name)

  const nameCol = col('Name')
  const goalCol = col('Goal') // -1 on the oldest tab, which has none
  const week1Col = col('Week 1')
  const dateCol = col('Date')
  const uniqCol = col('Unique Participants')
  const tractsCol = col('Tracts')
  const hangersCol = col('Door Hangers')

  for (const [label, idx] of [
    ['Name', nameCol],
    ['Week 1', week1Col],
    ['Date', dateCol],
    ['Unique Participants', uniqCol],
    ['Tracts', tractsCol],
    ['Door Hangers', hangersCol],
  ] as const) {
    if (idx === -1) throw new Error(`${sheetName}: header is missing a "${label}" column`)
  }

  const dateRows = rows.filter((r) => typeof r[dateCol] === 'number')
  if (dateRows.length === 0) throw new Error(`${sheetName}: no date rows`)

  // The cells supply the week COUNT and are cross-checked; the tab name supplies
  // the dates, because four tabs' cells drift off the Saturday anchor.
  const cellDates = dateRows.map((r) => serialToIso(r[dateCol] as number))
  const startDate = startDateFromSheetName(sheetName)
  const endDate = addDays(startDate, 7 * (cellDates.length - 1))
  const weekDates = campaignWeekDates(startDate, endDate)
  if (weekDates.length !== cellDates.length) {
    throw new Error(`${sheetName}: ${cellDates.length} date rows but ${weekDates.length} derived weeks`)
  }
  const dateDrift = weekDates.some((d, i) => d !== cellDates[i])
    ? `cells ${cellDates[0]}..${cellDates[cellDates.length - 1]} -> name ${startDate}..${endDate}`
    : null
  const weekCount = weekDates.length

  const doorHangers = dateRows.map((r) => readNumber(r[hangersCol]))
  const sheetUnique = dateRows.reduce((a, r) => a + (readNumber(r[uniqCol]) ?? 0), 0)
  const sheetTracts = dateRows.reduce((a, r) => a + (readNumber(r[tractsCol]) ?? 0), 0)
  const sheetDoorHangers = doorHangers.reduce<number>((a, h) => a + (h ?? 0), 0)

  // Roster rows, merged by household. Two labels in one campaign that map to
  // the same household sum their sizes and their weekly tracts.
  const byHousehold = new Map<string, RosterRow>()
  for (const r of rows.slice(1)) {
    const raw = r[nameCol]
    if (raw === null || raw === undefined) continue
    const label = String(raw).trim()
    if (!label || /^total/i.test(label)) continue

    const household = labelToHousehold[label]
    if (!household) throw new Error(`${sheetName}: label "${label}" is not in the merge map`)

    let row = byHousehold.get(household)
    if (!row) {
      row = {household, size: 0, goal: null, tracts: new Array<number | null>(weekCount).fill(null), labels: []}
      byHousehold.set(household, row)
    }
    row.labels.push(label)
    row.size += sizeFromLabel(label)

    const goal = goalCol === -1 ? null : readNumber(r[goalCol])
    if (goal !== null) row.goal = (row.goal ?? 0) + goal

    for (let w = 0; w < weekCount; w++) {
      const v = readNumber(r[week1Col + w])
      if (v === null) continue
      row.tracts[w] = (row.tracts[w] ?? 0) + v
    }
  }

  return {
    sheetName,
    startDate,
    endDate,
    weekDates,
    doorHangers,
    sheetUnique,
    sheetTracts,
    sheetDoorHangers,
    dateDrift,
    roster: [...byHousehold.values()],
  }
}

/** Unique Participants as ADR 0032 defines it, over already-merged roster rows. */
function derivedUnique(roster: RosterRow[]): number {
  let n = 0
  for (const r of roster) if (r.tracts.some((t) => t !== null && t > 0)) n += r.size
  return n
}

function main() {
  const workbookPath = process.argv[2] ?? DEFAULT_WORKBOOK
  const groups = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as Record<string, string[]>

  const labelToHousehold: Record<string, string> = {}
  for (const [household, labels] of Object.entries(groups)) {
    for (const label of labels) {
      if (labelToHousehold[label]) {
        throw new Error(`merge map lists "${label}" twice (${labelToHousehold[label]} and ${household})`)
      }
      labelToHousehold[label] = household
    }
  }
  const householdNames = Object.keys(groups).sort((a, b) => a.localeCompare(b))
  console.log(`Merge map: ${Object.keys(labelToHousehold).length} labels -> ${householdNames.length} households`)

  const wb = XLSX.readFile(workbookPath)
  // Oldest first, so campaign ids and sort orders read chronologically.
  const sheetNames = wb.SheetNames.filter((n) => n !== TOTALS_SHEET).reverse()
  const campaigns = sheetNames.map((n) => parseCampaign(wb, n, labelToHousehold))

  const drifted = campaigns.filter((c) => c.dateDrift)
  if (drifted.length) {
    console.log(`\n${drifted.length} tab(s) have date cells that miss the Saturday anchor — using the tab name:`)
    for (const c of drifted) console.log(`  ${c.sheetName.padEnd(22)} ${c.dateDrift}`)
  }

  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const insertHousehold = db.prepare(
    `INSERT INTO fill_america_households (name, sort_order) VALUES (?, ?)
     ON CONFLICT (name) DO UPDATE SET updated_at = datetime('now')`,
  )
  const getHousehold = db.prepare('SELECT id FROM fill_america_households WHERE name = ?')
  const upsertCampaign = db.prepare(
    `INSERT INTO fill_america_campaigns (title, start_date, end_date, season) VALUES (@title, @startDate, @endDate, @season)
     ON CONFLICT (start_date) DO UPDATE SET title = excluded.title, end_date = excluded.end_date,
       season = excluded.season, updated_at = datetime('now')`,
  )
  const getCampaign = db.prepare('SELECT id FROM fill_america_campaigns WHERE start_date = ?')
  const upsertWeek = db.prepare(
    `INSERT INTO fill_america_campaign_weeks (campaign_id, week_no, week_date, door_hangers)
     VALUES (@campaignId, @weekNo, @weekDate, @doorHangers)
     ON CONFLICT (campaign_id, week_no) DO UPDATE SET week_date = excluded.week_date, door_hangers = excluded.door_hangers`,
  )
  const getWeek = db.prepare('SELECT id FROM fill_america_campaign_weeks WHERE campaign_id = ? AND week_no = ?')
  const upsertEntry = db.prepare(
    `INSERT INTO fill_america_roster_entries (campaign_id, household_id, size, goal, sort_order)
     VALUES (@campaignId, @householdId, @size, @goal, @sortOrder)
     ON CONFLICT (campaign_id, household_id) DO UPDATE SET size = excluded.size, goal = excluded.goal,
       sort_order = excluded.sort_order`,
  )
  const getEntry = db.prepare('SELECT id FROM fill_america_roster_entries WHERE campaign_id = ? AND household_id = ?')
  const upsertTracts = db.prepare(
    `INSERT INTO fill_america_tract_reports (roster_entry_id, week_id, tracts) VALUES (@entryId, @weekId, @tracts)
     ON CONFLICT (roster_entry_id, week_id) DO UPDATE SET tracts = excluded.tracts`,
  )
  const clearTracts = db.prepare('DELETE FROM fill_america_tract_reports WHERE roster_entry_id = ? AND week_id = ?')

  const run = db.transaction(() => {
    householdNames.forEach((name, i) => insertHousehold.run(name, i))
    const householdIds = new Map<string, number>()
    for (const name of householdNames) {
      householdIds.set(name, (getHousehold.get(name) as {id: number}).id)
    }

    for (const c of campaigns) {
      upsertCampaign.run({
        title: defaultTitle(c.startDate, c.endDate),
        startDate: c.startDate,
        endDate: c.endDate,
        season: defaultSeason(c.startDate),
      })
      const campaignId = (getCampaign.get(c.startDate) as {id: number}).id

      const weekIds: number[] = []
      c.weekDates.forEach((weekDate, i) => {
        upsertWeek.run({campaignId, weekNo: i + 1, weekDate, doorHangers: c.doorHangers[i] ?? null})
        weekIds.push((getWeek.get(campaignId, i + 1) as {id: number}).id)
      })

      c.roster.forEach((r, i) => {
        const householdId = householdIds.get(r.household)!
        upsertEntry.run({campaignId, householdId, size: r.size, goal: r.goal, sortOrder: i})
        const entryId = (getEntry.get(campaignId, householdId) as {id: number}).id
        r.tracts.forEach((t, w) => {
          // Blank stays absent — the participant rules read a missing report as
          // "did not go out", which is exactly what a blank cell means.
          if (t === null) clearTracts.run(entryId, weekIds[w])
          else upsertTracts.run({entryId, weekId: weekIds[w], tracts: t})
        })
      })
    }
  })
  run()

  // --- Verification against the workbook's own Grand Totals -------------------
  console.log('\nCampaign                Tracts   Hangers   Uniq sheet   derived')
  let bad = 0
  let sheetUniqTotal = 0
  let derivedUniqTotal = 0
  const diffs: string[] = []
  for (const c of campaigns) {
    const derivedTracts = c.roster.reduce((a, r) => a + r.tracts.reduce<number>((x, t) => x + (t ?? 0), 0), 0)
    const uniq = derivedUnique(c.roster)
    sheetUniqTotal += c.sheetUnique
    derivedUniqTotal += uniq
    const tOk = derivedTracts === c.sheetTracts
    const hOk = c.sheetDoorHangers === c.doorHangers.reduce<number>((a, h) => a + (h ?? 0), 0)
    if (!tOk || !hOk) bad++
    if (uniq !== c.sheetUnique) diffs.push(`${c.sheetName}: sheet ${c.sheetUnique}, derived ${uniq}`)
    console.log(
      `${c.sheetName.padEnd(22)} ${(tOk ? '✓' : `✗ ${derivedTracts}/${c.sheetTracts}`).padEnd(8)} ` +
        `${(hOk ? '✓' : '✗').padEnd(9)} ${String(c.sheetUnique).padStart(10)} ${String(uniq).padStart(9)}`,
    )
  }

  console.log(`\nUnique Participants differs on ${diffs.length} campaign(s) — expected, ADR 0032:`)
  for (const d of diffs) console.log(`  ${d}`)
  console.log(`  all-time: sheet ${sheetUniqTotal}, derived ${derivedUniqTotal}`)

  if (bad > 0) {
    throw new Error(`${bad} campaign(s) failed the tracts/door-hanger reconciliation — the parser or map is wrong`)
  }

  const stored = db
    .prepare(
      `SELECT (SELECT count(*) FROM fill_america_households) AS households,
              (SELECT count(*) FROM fill_america_campaigns) AS campaigns,
              (SELECT count(*) FROM fill_america_campaign_weeks) AS weeks,
              (SELECT count(*) FROM fill_america_roster_entries) AS entries,
              (SELECT count(*) FROM fill_america_tract_reports) AS reports,
              (SELECT coalesce(sum(tracts), 0) FROM fill_america_tract_reports) AS tracts`,
    )
    .get() as Record<string, number>
  console.log(
    `\nStored: ${stored.households} households, ${stored.campaigns} campaigns, ${stored.weeks} weeks, ` +
      `${stored.entries} roster entries, ${stored.reports} tract reports, ${stored.tracts} tracts.`,
  )
  db.close()
  console.log('Done.')
}

main()
