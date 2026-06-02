import {
  type FairDay,
  type FairPerson,
  type FairSignup,
  type HeadcountColor,
  type HispanicCoverage,
  colorForHeadcount,
  computeInitialsForRoster,
  deriveFairDays,
  distributeSignupsToRows,
  fairRoleStars,
  formatTimeShort,
  headerCountsForDay,
  hispanicCoverageForDay,
  shiftRoleDashes,
  slotIndexForSignup,
  stableRegionsForSlot,
} from '@/lib/fair-booth-render'
import type {FairBoothFairRole, FairBoothRosterAttr, FairBoothSignup} from '@/lib/schedules-api'

const HOUR_ROWS = [14, 15, 16, 17, 18, 19, 20, 21] // 2pm-9pm rows; each row spans 1 hour ending at the next.

const BG_BY_COLOR: Record<HeadcountColor, string> = {
  red: 'bg-red-200',
  orange: 'bg-orange-200',
  yellow: 'bg-yellow-200',
  cyan: 'bg-cyan-200',
  blue: 'bg-blue-200',
  green: 'bg-green-200',
  purple: 'bg-purple-200',
}

const HEADER_BG_BY_COVERAGE: Record<HispanicCoverage, string> = {
  full: 'bg-green-300',
  partial: 'bg-orange-300',
  none: 'bg-red-300',
}

interface FairBoothGridProps {
  scopeStart: string
  signups: FairBoothSignup[]
  people: FairPerson[]
  rosterAttrs: FairBoothRosterAttr[]
  blank?: boolean
}

interface CellRender {
  bgClass: string
  dotted: boolean
  entries: {signupId: number; line: string}[]
}

export function FairBoothGrid({scopeStart, signups, people, rosterAttrs, blank = false}: FairBoothGridProps) {
  let days: FairDay[]
  try {
    days = deriveFairDays(scopeStart)
  } catch {
    return <div className="text-destructive p-4">Invalid schedule start date — must be a Friday.</div>
  }
  const attrsByPerson = new Map(rosterAttrs.map((a) => [a.personId, a]))
  const hispanicIds = new Set(people.filter((p) => p.isHispanic).map((p) => p.id))
  const overrides = new Map<number, string>()
  for (const a of rosterAttrs) {
    if (a.initialsOverride && a.initialsOverride.trim() !== '') overrides.set(a.personId, a.initialsOverride)
  }
  const initials = computeInitialsForRoster(
    people.map((p) => ({id: p.id, firstName: p.firstName ?? '', lastName: p.lastName ?? '', isHispanic: p.isHispanic})),
    overrides,
  )

  const renderFn = (day: FairDay): Map<number, CellRender> => {
    const map = new Map<number, CellRender>()
    for (const h of HOUR_ROWS) map.set(h * 60, {bgClass: '', dotted: false, entries: []})
    if (blank) return map
    for (const slot of day.slots) {
      const regions = stableRegionsForSlot(signups as FairSignup[], day.date, slot)
      // dotted transitions inside the slot
      for (let i = 1; i < regions.length; i++) {
        const r = regions[i]
        const cell = map.get(r.startHour)
        if (cell) cell.dotted = true
      }
      for (const region of regions) {
        // color: every row in region gets the same headcount color
        for (const h of region.hourRows) {
          const cell = map.get(h)
          if (cell) cell.bgClass = BG_BY_COLOR[colorForHeadcount(region.headcount)]
        }
        // distribute signups across rows
        const inSlot = (signups as FairSignup[]).filter(
          (s) =>
            s.dayDate === day.date &&
            s.startMinute < region.endHour &&
            s.endMinute > region.startHour &&
            slotIndexForSignup(s, day) === slot.index,
        )
        const placement = distributeSignupsToRows(region, inSlot)
        // Sort each row's entries: UL, AsstUL, Worker, then sortOrder
        const orderRank: Record<string, number> = {unit_leader: 0, asst_unit: 1, worker: 2}
        const grouped = new Map<number, FairSignup[]>()
        for (const s of inSlot) {
          const row = placement.get(s.id)
          if (row === undefined) continue
          const arr = grouped.get(row) ?? []
          arr.push(s)
          grouped.set(row, arr)
        }
        for (const [row, list] of grouped) {
          list.sort((a, b) => {
            const ra = orderRank[a.shiftRole] ?? 9
            const rb = orderRank[b.shiftRole] ?? 9
            if (ra !== rb) return ra - rb
            return a.sortOrder - b.sortOrder || a.id - b.id
          })
          const cell = map.get(row)
          if (!cell) continue
          for (const s of list) {
            const dashes = shiftRoleDashes(s.shiftRole)
            const init = initials.get(s.personId) ?? '??'
            const attr = attrsByPerson.get(s.personId)
            const fairRole: FairBoothFairRole = attr?.fairRole ?? 'worker'
            const stars = fairRoleStars(fairRole)
            const slotFull = s.startMinute <= slot.startMinute && s.endMinute >= slot.endMinute
            const partial = slotFull ? '' : ` (${formatTimeShort(s.startMinute)}-${formatTimeShort(s.endMinute)})`
            cell.entries.push({signupId: s.id, line: `${dashes}${init}${stars}${partial}`})
          }
        }
      }
    }
    return map
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="border bg-white p-1 text-left text-xs font-normal w-16"></th>
          {days.map((d) => {
            const coverage = blank ? 'none' : hispanicCoverageForDay(signups as FairSignup[], hispanicIds, d)
            const headerBg = blank ? 'bg-white' : HEADER_BG_BY_COVERAGE[coverage]
            const counts = blank ? '' : headerCountsForDay(signups as FairSignup[], d)
            const dayDate = new Date(d.date + 'T12:00:00')
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()]
            return (
              <th key={d.date} className={`border p-1 text-center text-sm ${headerBg}`}>
                <a href={`day/${d.date}`} className="block cursor-pointer">
                  {dayName}, {dayDate.getDate()}
                  {counts ? ` (${counts})` : ''}
                </a>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {HOUR_ROWS.map((h) => {
          const label = `${formatTimeShort(h * 60)} - ${formatTimeShort((h + 1) * 60)} PM`
          return (
            <tr key={h}>
              <td className="border bg-white p-1 text-xs text-right whitespace-nowrap">{label}</td>
              {days.map((d) => {
                const cells = renderFn(d)
                const cell = cells.get(h * 60)!
                const inAnySlot = d.slots.some((s) => h * 60 >= s.startMinute && h * 60 < s.endMinute)
                const slotBoundary = d.slots.length > 1 && h * 60 === d.slots[1].startMinute
                const bg = inAnySlot ? cell.bgClass || 'bg-white' : 'bg-gray-700'
                const borderTop = cell.dotted
                  ? 'border-t-dotted border-t-2 border-t-gray-500'
                  : slotBoundary
                    ? 'border-t-2 border-t-black'
                    : ''
                return (
                  <td
                    key={d.date}
                    className={`border align-top p-1 ${bg} ${borderTop} cursor-pointer`}
                    onClick={() => {
                      window.location.assign(`day/${d.date}`)
                    }}
                  >
                    {inAnySlot &&
                      cell.entries.map((e) => (
                        <div key={e.signupId} className="font-mono leading-tight">
                          {e.line}
                        </div>
                      ))}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
