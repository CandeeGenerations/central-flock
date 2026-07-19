// Pure rendering computations for the Fair Booth schedule. See
// docs/adr/0009-fair-booth-schedule.md and the glossary in CONTEXT.md.
import type {FairBoothFairRole, FairBoothShiftRole} from '../../server/db/schema-fair-booth'

export type DayOfWeek = 'fri' | 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu'

export interface FairSlot {
  index: 0 | 1
  startMinute: number
  endMinute: number
  label: string
}

export interface FairDay {
  date: string // YYYY-MM-DD
  dayOfWeek: DayOfWeek
  slots: FairSlot[]
  dayStartMinute: number // earliest slot start
  dayEndMinute: number // latest slot end
}

export interface FairSignup {
  id: number
  personId: number
  dayDate: string
  startMinute: number
  endMinute: number
  shiftRole: FairBoothShiftRole
  sortOrder: number
  displayRowOverride: number | null
}

export interface FairPerson {
  id: number
  firstName: string | null
  lastName: string | null
  isHispanic: boolean
}

export interface RosterRow {
  personId: number
  firstName: string
  lastName: string
  fairRole: FairBoothFairRole
  initialsOverride: string | null
  signupCount: number
  isHispanic: boolean
}

const DAY_NAMES: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const TWO_SLOT_DAYS: ReadonlySet<DayOfWeek> = new Set(['sat', 'sun', 'tue'])

const MIN_2PM = 14 * 60
const MIN_6PM = 18 * 60
const MIN_10PM = 22 * 60
const MIN_5PM = 17 * 60

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isFriday(date: string): boolean {
  return parseLocalDate(date).getDay() === 5
}

// 9 days: Fri -> next Sat. Hardcoded slot pattern by day-of-week.
export function deriveFairDays(scopeStart: string): FairDay[] {
  if (!isFriday(scopeStart)) {
    throw new Error(`scopeStart must be a Friday: ${scopeStart}`)
  }
  const start = parseLocalDate(scopeStart)
  const days: FairDay[] = []
  for (let i = 0; i < 9; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const dow = DAY_NAMES[d.getDay()]
    const slots: FairSlot[] = TWO_SLOT_DAYS.has(dow)
      ? [
          {index: 0, startMinute: MIN_2PM, endMinute: MIN_6PM, label: '2-6'},
          {index: 1, startMinute: MIN_6PM, endMinute: MIN_10PM, label: '6-10'},
        ]
      : [{index: 0, startMinute: MIN_5PM, endMinute: MIN_10PM, label: '5-10'}]
    days.push({
      date: formatLocalDate(d),
      dayOfWeek: dow,
      slots,
      dayStartMinute: slots[0].startMinute,
      dayEndMinute: slots[slots.length - 1].endMinute,
    })
  }
  return days
}

// Headcount = distinct people whose [start, end) overlaps the minute.
export function headcountAtMinute(signups: FairSignup[], dayDate: string, minute: number): number {
  let n = 0
  for (const s of signups) {
    if (s.dayDate !== dayDate) continue
    if (s.startMinute <= minute && minute < s.endMinute) n++
  }
  return n
}

export interface StableRegion {
  startHour: number // minute-of-day, hour-aligned
  endHour: number // exclusive
  headcount: number
  hourRows: number[] // list of hour-start minutes in this region
}

// Walk hour rows in a slot; group consecutive rows with the same headcount.
export function stableRegionsForSlot(signups: FairSignup[], dayDate: string, slot: FairSlot): StableRegion[] {
  const regions: StableRegion[] = []
  let current: StableRegion | null = null
  for (let m = slot.startMinute; m < slot.endMinute; m += 60) {
    const count = headcountAtMinute(signups, dayDate, m)
    if (current && current.headcount === count) {
      current.endHour = m + 60
      current.hourRows.push(m)
    } else {
      current = {startHour: m, endHour: m + 60, headcount: count, hourRows: [m]}
      regions.push(current)
    }
  }
  return regions
}

// (openCount-closeCount) per slot; collapse single number when equal; join slots with //.
export function headerCountsForDay(signups: FairSignup[], day: FairDay): string {
  const parts: string[] = []
  for (const slot of day.slots) {
    const open = headcountAtMinute(signups, day.date, slot.startMinute)
    const close = headcountAtMinute(signups, day.date, slot.endMinute - 1)
    parts.push(open === close ? String(open) : `${open}-${close}`)
  }
  return parts.join(' // ')
}

// Union of is_hispanic people's [start,end) intervals intersected with day window.
export type HispanicCoverage = 'full' | 'partial' | 'none'

export function hispanicCoverageForDay(
  signups: FairSignup[],
  hispanicPersonIds: ReadonlySet<number>,
  day: FairDay,
): HispanicCoverage {
  const intervals: [number, number][] = []
  for (const s of signups) {
    if (s.dayDate !== day.date || !hispanicPersonIds.has(s.personId)) continue
    const a = Math.max(s.startMinute, day.dayStartMinute)
    const b = Math.min(s.endMinute, day.dayEndMinute)
    if (a < b) intervals.push([a, b])
  }
  if (intervals.length === 0) return 'none'
  intervals.sort((x, y) => x[0] - y[0])
  let covered = 0
  let curStart = intervals[0][0]
  let curEnd = intervals[0][1]
  for (let i = 1; i < intervals.length; i++) {
    const [a, b] = intervals[i]
    if (a <= curEnd) {
      curEnd = Math.max(curEnd, b)
    } else {
      covered += curEnd - curStart
      curStart = a
      curEnd = b
    }
  }
  covered += curEnd - curStart
  const totalWindow = day.dayEndMinute - day.dayStartMinute
  if (covered >= totalWindow) return 'full'
  return 'partial'
}

export type HeadcountColor = 'darkred' | 'red' | 'orange' | 'yellow' | 'cyan' | 'blue' | 'green' | 'purple'

export function colorForHeadcount(n: number): HeadcountColor {
  if (n <= 2) return 'darkred'
  if (n === 3) return 'red'
  if (n === 4) return 'orange'
  if (n === 5) return 'yellow'
  if (n === 6) return 'cyan'
  if (n === 7) return 'blue'
  if (n === 8) return 'green'
  return 'purple'
}

// Initials: firstInitial + lastInitial; on collision, alphabetically-first
// (by lastName then firstName) keeps the base; others extend by walking
// first-name characters from position 1 until unique, lowercased slice
// inserted between F and L. Overrides win + are excluded from pool.
export function computeInitialsForRoster(
  people: FairPerson[],
  overrides: ReadonlyMap<number, string>,
): Map<number, string> {
  const out = new Map<number, string>()
  const pool: {p: FairPerson; first: string; last: string}[] = []
  for (const p of people) {
    if (overrides.has(p.id) && overrides.get(p.id)!.trim() !== '') {
      out.set(p.id, overrides.get(p.id)!.trim())
      continue
    }
    const first = (p.firstName ?? '').trim()
    const last = (p.lastName ?? '').trim()
    pool.push({p, first, last})
  }
  const groups = new Map<string, typeof pool>()
  for (const item of pool) {
    const base = (item.first[0] ?? '').toUpperCase() + (item.last[0] ?? '').toUpperCase()
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(item)
  }
  for (const [base, members] of groups) {
    if (members.length === 1) {
      out.set(members[0].p.id, base)
      continue
    }
    members.sort((a, b) => {
      const la = a.last.toLowerCase()
      const lb = b.last.toLowerCase()
      if (la !== lb) return la < lb ? -1 : 1
      const fa = a.first.toLowerCase()
      const fb = b.first.toLowerCase()
      return fa < fb ? -1 : fa > fb ? 1 : 0
    })
    // First keeps the base
    out.set(members[0].p.id, base)
    const taken = new Set<string>([base])
    for (let i = 1; i < members.length; i++) {
      const {p, first, last} = members[i]
      const F = (first[0] ?? '').toUpperCase()
      const L = (last[0] ?? '').toUpperCase()
      let chosen = `${F}${first.slice(1, 2).toLowerCase()}${L}`
      let extLen = 1
      while (taken.has(chosen) && extLen < first.length) {
        extLen++
        chosen = `${F}${first.slice(1, 1 + extLen).toLowerCase()}${L}`
      }
      taken.add(chosen)
      out.set(p.id, chosen)
    }
  }
  return out
}

// Per-region row placement.
export function distributeSignupsToRows(region: StableRegion, signups: FairSignup[]): Map<number, number> {
  const out = new Map<number, number>()
  const full: FairSignup[] = []
  const partial: FairSignup[] = []
  for (const s of signups) {
    if (s.startMinute <= region.startHour && s.endMinute >= region.endHour) {
      full.push(s)
    } else {
      partial.push(s)
    }
  }
  // Partials anchor to the hour row they first overlap.
  for (const s of partial) {
    let anchor = region.hourRows[0]
    for (const h of region.hourRows) {
      if (s.startMinute >= h && s.startMinute < h + 60) {
        anchor = h
        break
      }
      if (s.startMinute < h) {
        anchor = h
        break
      }
    }
    out.set(s.id, anchor)
  }
  const rows = region.hourRows.length
  // Spread full-region signups evenly across rows (early-loaded).
  full.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  for (let i = 0; i < full.length; i++) {
    const s = full[i]
    if (s.displayRowOverride !== null && s.displayRowOverride >= 0 && s.displayRowOverride < rows) {
      out.set(s.id, region.hourRows[s.displayRowOverride])
      continue
    }
    const rowIdx = Math.min(Math.floor((i * rows) / Math.max(full.length, 1)), rows - 1)
    out.set(s.id, region.hourRows[rowIdx])
  }
  return out
}

const FAIR_ROLE_ORDER: Record<FairBoothFairRole, number> = {
  fair_mgr: 0,
  asst_fair_mgr: 1,
  unit_leader: 2,
  asst_unit: 3,
  worker: 4,
}

export function orderRoster(roster: RosterRow[]): RosterRow[] {
  return [...roster].sort((a, b) => {
    const ra = FAIR_ROLE_ORDER[a.fairRole]
    const rb = FAIR_ROLE_ORDER[b.fairRole]
    if (ra !== rb) return ra - rb
    const la = (a.lastName ?? '').toLowerCase()
    const lb = (b.lastName ?? '').toLowerCase()
    if (la !== lb) return la < lb ? -1 : 1
    const fa = (a.firstName ?? '').toLowerCase()
    const fb = (b.firstName ?? '').toLowerCase()
    return fa < fb ? -1 : fa > fb ? 1 : 0
  })
}

export function splitRosterColumns(ordered: RosterRow[]): {left: RosterRow[]; right: RosterRow[]} {
  const mid = Math.ceil(ordered.length / 2)
  return {left: ordered.slice(0, mid), right: ordered.slice(mid)}
}

export function formatTimeShort(minute: number): string {
  let h = Math.floor(minute / 60)
  const m = minute % 60
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}

export function shiftRoleDashes(role: FairBoothShiftRole): string {
  return role === 'unit_leader' ? '-' : role === 'asst_unit' ? '--' : '---'
}

export function fairRoleStars(role: FairBoothFairRole): string {
  return role === 'fair_mgr'
    ? '*****'
    : role === 'asst_fair_mgr'
      ? '****'
      : role === 'unit_leader'
        ? '***'
        : role === 'asst_unit'
          ? '**'
          : '*'
}

// The cap rule: 1*=worker only, 2*=up to asst_unit, 3*/4*/5*=up to unit_leader.
export function maxShiftRoleFor(fr: FairBoothFairRole): FairBoothShiftRole {
  if (fr === 'worker') return 'worker'
  if (fr === 'asst_unit') return 'asst_unit'
  return 'unit_leader'
}

// Render placement: which slot column does a signup belong to?
// "Majority of hours in slot wins; ties to later slot."
export function slotIndexForSignup(signup: FairSignup, day: FairDay): number {
  if (day.slots.length === 1) return 0
  let best = 0
  let bestOverlap = -1
  for (let i = 0; i < day.slots.length; i++) {
    const s = day.slots[i]
    const a = Math.max(signup.startMinute, s.startMinute)
    const b = Math.min(signup.endMinute, s.endMinute)
    const overlap = Math.max(0, b - a)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = i
    }
  }
  return best
}
