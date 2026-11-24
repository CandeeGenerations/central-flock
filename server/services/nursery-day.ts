import {and, eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {workerDisplayName} from './nursery-workers.js'

// One day of the Nursery schedule, flattened for outside readers (the reminder bot via cgen-api).
// Read-only, names only — no contact details leave through here. "Nobody scheduled" (no schedule covers the day) and "a slot nobody fills" are both
// stated outright, so a caller never has to guess from an empty list.

const TIME_ZONE = 'America/New_York'

export interface DayRow {
  scheduleId: number
  scheduleMonth: number | null
  scheduleYear: number | null
  scheduleStatus: 'draft' | 'final'
  scheduleLabel: string
  scheduleUpdatedAt: string
  serviceTimeId: number
  serviceName: string
  serviceTime: string // "HH:MM"
  serviceSort: number
  slot: number
  workerId: number | null
  workerOverride: string | null
  firstName: string | null
  lastName: string | null
}

export interface NurseryDayAssignment {
  service: string
  serviceTimeId: number
  time: string // "9:45 AM"
  slot: number
  worker: string
  firstName: string
}

export interface NurseryDay {
  date: string
  schedule: {id: number; label: string; status: 'draft' | 'final'} | null
  assignments: NurseryDayAssignment[]
  unfilled: {service: string; serviceTimeId: number; time: string; slot: number}[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function todayIn(now: Date, timeZone = TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(now)
}

// The coming Sunday in Eastern time; today when today is Sunday.
export function nextSunday(now: Date): string {
  const today = todayIn(now)
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + ((7 - dt.getUTCDay()) % 7))
  return dt.toISOString().slice(0, 10)
}

// "18:30" → "6:30 PM"
export function formatServiceTime(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!match) return hhmm
  const h = Number(match[1])
  const suffix = h < 12 ? 'AM' : 'PM'
  return `${h % 12 === 0 ? 12 : h % 12}:${match[2]} ${suffix}`
}

// Which schedule speaks for the day when more than one holds rows for it: the month that owns the
// date (a borrowed first Sunday belongs to the prior month's schedule, which is that date's month),
// then final over draft, then the most recently edited — the same rule the scheduler uses.
function pickSchedule(rows: DayRow[], date: string): number | null {
  const [y, m] = date.split('-').map(Number)
  const byId = new Map<number, DayRow>()
  for (const r of rows) if (!byId.has(r.scheduleId)) byId.set(r.scheduleId, r)
  const ranked = [...byId.values()].sort((a, b) => {
    const ownA = a.scheduleYear === y && a.scheduleMonth === m ? 0 : 1
    const ownB = b.scheduleYear === y && b.scheduleMonth === m ? 0 : 1
    if (ownA !== ownB) return ownA - ownB
    const finalA = a.scheduleStatus === 'final' ? 0 : 1
    const finalB = b.scheduleStatus === 'final' ? 0 : 1
    if (finalA !== finalB) return finalA - finalB
    return a.scheduleUpdatedAt < b.scheduleUpdatedAt ? 1 : -1
  })
  return ranked[0]?.scheduleId ?? null
}

export function buildNurseryDay(date: string, rows: DayRow[]): NurseryDay {
  const scheduleId = pickSchedule(rows, date)
  if (scheduleId === null) return {date, schedule: null, assignments: [], unfilled: []}
  const mine = rows
    .filter((r) => r.scheduleId === scheduleId)
    .sort((a, b) => a.serviceSort - b.serviceSort || a.serviceTime.localeCompare(b.serviceTime) || a.slot - b.slot)
  const head = mine[0]
  const out: NurseryDay = {
    date,
    schedule: {id: head.scheduleId, label: head.scheduleLabel, status: head.scheduleStatus},
    assignments: [],
    unfilled: [],
  }
  for (const r of mine) {
    const service = {service: r.serviceName, serviceTimeId: r.serviceTimeId, time: formatServiceTime(r.serviceTime)}
    if (r.workerId === null) {
      out.unfilled.push({...service, slot: r.slot})
      continue
    }
    const worker = workerDisplayName(r.workerOverride, r.firstName, r.lastName)
    out.assignments.push({
      ...service,
      slot: r.slot,
      worker,
      // The roster name can be an override ("Yuny Mejia" for contact "Juni Salgado"); greet by it.
      firstName: worker.split(/\s+/)[0] ?? worker,
    })
  }
  return out
}

export function loadNurseryDay(date: string): NurseryDay {
  const rows = db
    .select({
      scheduleId: schema.schedules.id,
      scheduleMonth: schema.schedules.month,
      scheduleYear: schema.schedules.year,
      scheduleStatus: schema.schedules.status,
      scheduleLabel: schema.schedules.scopeLabel,
      scheduleUpdatedAt: schema.schedules.updatedAt,
      serviceTimeId: schema.serviceTimes.id,
      serviceName: schema.serviceTimes.name,
      serviceTime: schema.serviceTimes.time,
      serviceSort: schema.serviceTimes.sortOrder,
      slot: schema.nurseryAssignments.slot,
      workerId: schema.nurseryAssignments.workerId,
      workerOverride: schema.nurseryWorkers.name,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.nurseryAssignments)
    .innerJoin(schema.schedules, eq(schema.schedules.id, schema.nurseryAssignments.scheduleId))
    .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.nurseryAssignments.serviceTimeId))
    .leftJoin(schema.nurseryWorkers, eq(schema.nurseryWorkers.id, schema.nurseryAssignments.workerId))
    .leftJoin(schema.people, eq(schema.people.id, schema.nurseryWorkers.personId))
    .where(and(eq(schema.nurseryAssignments.date, date), eq(schema.schedules.scheduleType, 'nursery')))
    .all()
  return buildNurseryDay(date, rows)
}
