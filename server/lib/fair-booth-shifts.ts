// Shifts: the person-facing view of Fair Booth Signups. See CONTEXT.md.
//
// A Signup is a stored row, always slot-sized — 3-7 PM on a two-slot day is two
// rows. A Shift is what the volunteer experiences: one contiguous run of their
// Signups on one day at one role. Derived here, never stored.
//
// This module lives under server/ because the Reminder Run resolver needs it
// (server never imports from src/), but it is deliberately PURE — no db, no
// express, no node built-ins — so the client bundle can import it too.
// src/lib/fair-booth-render.ts re-exports everything here, which is what
// guarantees a Shifts Card and a Shift Reminder can never format the same day
// two different ways. See docs/adr/0018-fair-booth-reminder-runs.md.
import type {FairBoothShiftRole} from '../db/schema-fair-booth.js'

export interface ShiftRange {
  startMinute: number
  endMinute: number
}

export interface ShiftGroup {
  shiftRole: FairBoothShiftRole
  // Contiguous-merged. More than one entry means a real break in the day.
  ranges: ShiftRange[]
}

export interface ShiftDay {
  dayDate: string
  // More than one group means the role changed mid-day; the card renders
  // those as sub-bullets under a single date.
  groups: ShiftGroup[]
}

// Minimal shape needed to derive Shifts — the full FairSignup satisfies it.
export interface ShiftSourceSignup {
  personId: number
  dayDate: string
  startMinute: number
  endMinute: number
  shiftRole: FairBoothShiftRole
}

export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatTimeShort(minute: number): string {
  let h = Math.floor(minute / 60)
  const m = minute % 60
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}

function mergeRanges(ranges: ShiftRange[]): ShiftRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute)
  const out: ShiftRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    // Touching counts as contiguous: 2-6 followed by 6-10 is one Shift.
    if (last && r.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, r.endMinute)
    } else {
      out.push({...r})
    }
  }
  return out
}

// Group one person's signups by (day, role), merging contiguous runs within
// each group. Days ordered chronologically; groups within a day by first start.
export function computePersonShifts(signups: ShiftSourceSignup[], personId: number): ShiftDay[] {
  const byDay = new Map<string, Map<FairBoothShiftRole, ShiftRange[]>>()
  for (const s of signups) {
    if (s.personId !== personId) continue
    if (!byDay.has(s.dayDate)) byDay.set(s.dayDate, new Map())
    const byRole = byDay.get(s.dayDate)!
    if (!byRole.has(s.shiftRole)) byRole.set(s.shiftRole, [])
    byRole.get(s.shiftRole)!.push({startMinute: s.startMinute, endMinute: s.endMinute})
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([dayDate, byRole]) => ({
      dayDate,
      groups: [...byRole.entries()]
        .map(([shiftRole, ranges]) => ({shiftRole, ranges: mergeRanges(ranges)}))
        .sort((a, b) => a.ranges[0].startMinute - b.ranges[0].startMinute),
    }))
}

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Fri, Jul 24"
export function formatShiftDate(dayDate: string): string {
  const d = parseLocalDate(dayDate)
  return `${SHORT_DAY[d.getDay()]}, ${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`
}

function meridiem(minute: number): 'AM' | 'PM' {
  return minute >= 12 * 60 ? 'PM' : 'AM'
}

// "5–10 PM", or "2–4 PM and 7–10 PM" when the day has a real break. Every fair
// hour is PM today, so a single trailing marker reads best; the AM branch only
// fires if the slot map ever changes.
export function formatShiftRanges(ranges: ShiftRange[]): string {
  const allPm = ranges.every((r) => meridiem(r.startMinute) === 'PM' && meridiem(r.endMinute) === 'PM')
  // With a break in the day each range carries its own marker — "2–4 and
  // 7–10 PM" reads as though only the last range is PM.
  const suffix = allPm && ranges.length > 1 ? ' PM' : ''
  const parts = ranges.map((r) =>
    allPm
      ? `${formatTimeShort(r.startMinute)}–${formatTimeShort(r.endMinute)}${suffix}`
      : `${formatTimeShort(r.startMinute)} ${meridiem(r.startMinute)}–${formatTimeShort(r.endMinute)} ${meridiem(r.endMinute)}`,
  )
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return allPm && ranges.length === 1 ? `${joined} PM` : joined
}

export const SHIFT_ROLE_LABEL: Record<FairBoothShiftRole, string> = {
  unit_leader: 'Unit Leader',
  asst_unit: 'Asst Unit Leader',
  worker: 'Worker',
}

// The {{timeSlot}} body of a Shift Reminder: one line per Shift on a single
// day, formatted exactly like a Shifts Card bullet minus the bullet.
//
// A plain Worker line stays quiet — only leadership is called out — but when a
// day has more than one group the role changed mid-day, and then EVERY line is
// labelled: an unlabelled sibling next to "(Asst Unit Leader)" reads as a
// mistake rather than as "Worker". Mirrors the Shifts Card's own rule.
export function formatShiftReminderTimeSlot(days: ShiftDay[]): string {
  const lines: string[] = []
  for (const day of days) {
    const labelAll = day.groups.length > 1
    for (const g of day.groups) {
      const role = labelAll || g.shiftRole !== 'worker' ? `  (${SHIFT_ROLE_LABEL[g.shiftRole]})` : ''
      lines.push(`${formatShiftDate(day.dayDate)} — ${formatShiftRanges(g.ranges)}${role}`)
    }
  }
  return lines.join('\n')
}
