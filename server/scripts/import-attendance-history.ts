// One-time import of the Church Metrics backup into service_records.
// Loads Attendance / Attendance - Streaming rows for the 4 recurring service times
// (legacy service_time_ids 353121/122/123/124); skips all other categories and
// event rows. Idempotent: upserts on (service_time_id, service_date).
//
//   pnpm tsx server/scripts/import-attendance-history.ts [path/to/backup.csv]
import {and, eq} from 'drizzle-orm'
import {readFileSync} from 'fs'
import path from 'path'

import {schema, sqlite} from '../db/index.js'
import {db} from '../db/index.js'

const csvPath = process.argv[2] ?? 'data/cbc-attendence-backup.csv'

// legacy Service Time Id -> {dayOfWeek, time} of the seeded service_times
const LEGACY: Record<string, {day: number; time: string}> = {
  '353121': {day: 0, time: '09:45'},
  '353122': {day: 0, time: '11:00'},
  '353123': {day: 0, time: '18:30'},
  '353124': {day: 3, time: '19:30'},
}

function serviceTimeIdFor(day: number, time: string): number | null {
  const row = db
    .select({id: schema.serviceTimes.id})
    .from(schema.serviceTimes)
    .where(and(eq(schema.serviceTimes.dayOfWeek, day), eq(schema.serviceTimes.time, time)))
    .get()
  return row?.id ?? null
}

// Resolve legacy id -> our service_time id
const legacyToId = new Map<string, number>()
for (const [legacy, {day, time}] of Object.entries(LEGACY)) {
  const id = serviceTimeIdFor(day, time)
  if (!id) throw new Error(`No seeded service_time for day=${day} time=${time} (legacy ${legacy})`)
  legacyToId.set(legacy, id)
}

type Acc = {attendance: number | null; streaming: number | null}
const acc = new Map<string, Acc>() // key: `${serviceTimeId}|${date}`

const raw = readFileSync(path.resolve(csvPath), 'utf8')
const lines = raw.split(/\r?\n/).slice(1) // drop header
let scanned = 0
let used = 0
for (const line of lines) {
  if (!line.trim()) continue
  scanned++
  const cols = line.split(',')
  const category = cols[1]
  const value = cols[2]
  const dateTime = cols[3]
  const legacyId = cols[6]
  const stId = legacyToId.get(legacyId)
  if (!stId) continue // event / non-recurring service time
  if (category !== 'Attendance' && category !== 'Attendance - Streaming') continue
  const date = (dateTime ?? '').split(' ')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
  const n = Math.round(parseFloat(value))
  if (!Number.isFinite(n)) continue
  const key = `${stId}|${date}`
  const cur = acc.get(key) ?? {attendance: null, streaming: null}
  if (category === 'Attendance') cur.attendance = n
  else cur.streaming = n
  acc.set(key, cur)
  used++
}

const upsert = sqlite.prepare(
  `INSERT INTO service_records (service_time_id, service_date, attendance, streaming)
   VALUES (@stId, @date, @attendance, @streaming)
   ON CONFLICT(service_time_id, service_date) DO UPDATE SET
     attendance = excluded.attendance,
     streaming  = excluded.streaming,
     updated_at = datetime('now')`,
)
const tx = sqlite.transaction(
  (rows: Array<{stId: number; date: string; attendance: number | null; streaming: number | null}>) => {
    for (const r of rows) upsert.run(r)
  },
)

const rows = [...acc.entries()].map(([key, v]) => {
  const [stId, date] = key.split('|')
  return {stId: Number(stId), date, attendance: v.attendance, streaming: v.streaming}
})
tx(rows)

console.log(`scanned ${scanned} lines, used ${used} category rows -> ${rows.length} service records upserted`)
