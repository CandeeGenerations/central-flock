import {
  type FairDay,
  type FairPerson,
  type FairSignup,
  type HeadcountColor,
  type HispanicCoverage,
  colorForHeadcount,
  computeInitialsForRoster,
  deriveFairDays,
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
  scheduleId?: number
  // When set, render only the column for this date (no two-half split).
  onlyDate?: string
}

interface CellRender {
  bgClass: string
  dotted: boolean
  entries: {signupId: number; line: string}[]
}

export function FairBoothGrid({
  scopeStart,
  signups,
  people,
  rosterAttrs,
  blank = false,
  scheduleId,
  onlyDate,
}: FairBoothGridProps) {
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
    people.map((p) => {
      const ov = attrsByPerson.get(p.id)?.nameOverride
      let first = p.firstName ?? ''
      let last = p.lastName ?? ''
      if (ov && ov.trim() !== '') {
        const parts = ov.trim().split(/\s+/)
        first = parts[0] ?? ''
        last = parts.slice(1).join(' ')
      }
      return {id: p.id, firstName: first, lastName: last, isHispanic: p.isHispanic}
    }),
    overrides,
  )

  const renderFn = (day: FairDay): Map<number, CellRender> => {
    const map = new Map<number, CellRender>()
    for (const h of HOUR_ROWS) map.set(h * 60, {bgClass: '', dotted: false, entries: []})
    if (blank) return map
    for (const slot of day.slots) {
      const regions = stableRegionsForSlot(signups as FairSignup[], day.date, slot)
      for (let i = 1; i < regions.length; i++) {
        const r = regions[i]
        const cell = map.get(r.startHour)
        if (cell) cell.dotted = true
      }
      for (const region of regions) {
        for (const h of region.hourRows) {
          const cell = map.get(h)
          if (cell) cell.bgClass = BG_BY_COLOR[colorForHeadcount(region.headcount)]
        }
      }
      // List every signup for this slot once. Default anchor = slot start row;
      // displayRowOverride shifts the entry N hours later (within slot bounds).
      const inSlot = (signups as FairSignup[]).filter(
        (s) => s.dayDate === day.date && slotIndexForSignup(s, day) === slot.index,
      )
      const orderRank: Record<string, number> = {unit_leader: 0, asst_unit: 1, worker: 2}
      const sorted = [...inSlot].sort((a, b) => {
        const ra = orderRank[a.shiftRole] ?? 9
        const rb = orderRank[b.shiftRole] ?? 9
        if (ra !== rb) return ra - rb
        return a.sortOrder - b.sortOrder || a.id - b.id
      })
      const slotRowsCount = Math.floor((slot.endMinute - slot.startMinute) / 60)
      for (const s of sorted) {
        const offset = Math.max(0, Math.min(s.displayRowOverride ?? 0, slotRowsCount - 1))
        const anchorRow = slot.startMinute + offset * 60
        const cell = map.get(anchorRow)
        if (!cell) continue
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
    return map
  }

  if (onlyDate) {
    const day = days.find((d) => d.date === onlyDate)
    if (!day) return <div className="text-muted-foreground p-2 text-sm">Date not in this fair.</div>
    return (
      <HalfGrid
        days={[day]}
        emptyTrailing={0}
        renderFn={renderFn}
        blank={blank}
        signups={signups as FairSignup[]}
        hispanicIds={hispanicIds}
        scheduleId={scheduleId}
        clickable={false}
      />
    )
  }

  // Split days into two stacked halves: first 5, then remaining 4 + one empty
  // slot so both halves render the same column count and align visually.
  const half1 = days.slice(0, 5)
  const half2 = days.slice(5, 9)

  return (
    <div className="space-y-4">
      <HalfGrid
        days={half1}
        emptyTrailing={0}
        renderFn={renderFn}
        blank={blank}
        signups={signups as FairSignup[]}
        hispanicIds={hispanicIds}
        scheduleId={scheduleId}
      />
      <HalfGrid
        days={half2}
        emptyTrailing={5 - half2.length}
        renderFn={renderFn}
        blank={blank}
        signups={signups as FairSignup[]}
        hispanicIds={hispanicIds}
        scheduleId={scheduleId}
      />
    </div>
  )
}

interface HalfGridProps {
  days: FairDay[]
  emptyTrailing: number
  renderFn: (day: FairDay) => Map<number, CellRender>
  blank: boolean
  signups: FairSignup[]
  hispanicIds: Set<number>
  scheduleId?: number
  clickable?: boolean
}

function dayHref(scheduleId: number | undefined, date: string): string {
  return scheduleId !== undefined ? `/schedules/fair-booth/${scheduleId}/day/${date}` : `day/${date}`
}

function HalfGrid({
  days,
  emptyTrailing,
  renderFn,
  blank,
  signups,
  hispanicIds,
  scheduleId,
  clickable = true,
}: HalfGridProps) {
  return (
    <table className="w-full border-collapse text-xs table-fixed">
      <thead>
        <tr>
          <th className="border bg-white p-1 text-left text-xs font-normal w-16"></th>
          {days.map((d) => {
            const coverage = blank ? 'none' : hispanicCoverageForDay(signups, hispanicIds, d)
            const headerBg = blank ? 'bg-white' : HEADER_BG_BY_COVERAGE[coverage]
            const counts = blank ? '' : headerCountsForDay(signups, d)
            const dayDate = new Date(d.date + 'T12:00:00')
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()]
            return (
              <th key={d.date} className={`border p-1 text-center text-sm text-gray-900 ${headerBg}`}>
                {clickable ? (
                  <a href={dayHref(scheduleId, d.date)} className="block cursor-pointer text-gray-900">
                    {dayName}, {dayDate.getDate()}
                    {counts ? ` (${counts})` : ''}
                  </a>
                ) : (
                  <span className="block text-gray-900">
                    {dayName}, {dayDate.getDate()}
                    {counts ? ` (${counts})` : ''}
                  </span>
                )}
              </th>
            )
          })}
          {Array.from({length: emptyTrailing}).map((_, i) => (
            <th key={`empty-${i}`} className="border bg-gray-700"></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {HOUR_ROWS.map((h) => {
          const label = `${formatTimeShort(h * 60)} - ${formatTimeShort((h + 1) * 60)} PM`
          return (
            <tr key={h}>
              <td className="border bg-white p-1 text-xs text-right whitespace-nowrap text-gray-900">{label}</td>
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
                    className={`border align-top p-1 text-gray-900 ${bg} ${borderTop} ${clickable ? 'cursor-pointer' : ''}`}
                    onClick={
                      clickable
                        ? () => {
                            window.location.assign(dayHref(scheduleId, d.date))
                          }
                        : undefined
                    }
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
              {Array.from({length: emptyTrailing}).map((_, i) => (
                <td key={`empty-${i}`} className="border bg-gray-700"></td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
