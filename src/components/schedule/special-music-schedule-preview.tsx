import {
  SCHEDULE_CELL_PAD,
  SCHEDULE_CONTENT_WIDTH_PX,
  SCHEDULE_DATE_COL_PX,
  SCHEDULE_HEADER_FILL,
  SCHEDULE_HIGHLIGHT,
  SCHEDULE_RULE,
  SCHEDULE_TYPE,
  SPECIAL_MUSIC_MIN_ROW_PX,
} from '@/components/print/schedule-scale'
import type {DoubleBooking, SpecialMusicCell} from '@/lib/schedules-api'
import {AlertTriangle, Plus} from 'lucide-react'

// One printed column. Which Service Times the schedule covers is configurable
// rather than a hardcoded AM/PM pair. See docs/adr/0025.
export interface PreviewService {
  id: number
  label: string
}

interface Props {
  scopeStart: string
  scopeEnd: string
  cells: SpecialMusicCell[]
  services: PreviewService[]
  editMode?: boolean
  onCellClick?: (date: string, serviceTimeId: number) => void
  exporting?: boolean
  // Advisory Double Bookings. Suppressed when `exporting` — the printed sheet
  // goes to the musicians. See docs/adr/0026.
  doubleBookings?: DoubleBooking[]
  // When set, render those cells + the date column on those rows with a
  // highlight background. Used by the per-recipient PDF pages.
  highlightCellIds?: Set<number>
  highlightDates?: Set<string>
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sundaysBetween(start: string, end: string): string[] {
  const out: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const cursor = new Date(sy, sm - 1, sd)
  const endDate = new Date(ey, em - 1, ed)
  // Advance cursor to the first Sunday >= start
  while (cursor.getDay() !== 0 && cursor <= endDate) cursor.setDate(cursor.getDate() + 1)
  while (cursor <= endDate) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 7)
  }
  return out
}

function formatDate(d: string): string {
  const [, m, day] = d.split('-').map(Number)
  return `${MONTH_NAMES_SHORT[m - 1]} ${day}`
}

// Collapse consecutive linked performers who share a last name AND both want
// the last name shown, into "First and First Last". Performers with
// displayFirstNameOnly = true render bare ("Madeline"). Mirrors the
// printed-sheet convention.
function renderLinkedNames(performers: SpecialMusicCell['performers']): string[] {
  const sorted = performers.slice().sort((a, b) => a.ordering - b.ordering)
  const out: string[] = []
  let i = 0
  while (i < sorted.length) {
    const p = sorted[i]
    if (p.displayName) {
      out.push(p.displayName)
      i += 1
      continue
    }
    const startLast = p.lastName?.trim() ?? ''
    if (p.displayFirstNameOnly || !startLast) {
      out.push((p.firstName ?? '').trim())
      i += 1
      continue
    }
    let j = i
    const firsts: string[] = []
    while (j < sorted.length) {
      const q = sorted[j]
      if (q.displayName || q.displayFirstNameOnly || (q.lastName?.trim() ?? '') !== startLast) break
      firsts.push((q.firstName ?? '').trim())
      j += 1
    }
    if (firsts.length === 1) {
      out.push(`${firsts[0]} ${startLast}`)
    } else if (firsts.length === 2) {
      out.push(`${firsts[0]} and ${firsts[1]} ${startLast}`)
    } else {
      out.push(`${firsts.slice(0, -1).join(', ')}, and ${firsts[firsts.length - 1]} ${startLast}`)
    }
    i = j
  }
  return out.filter(Boolean)
}

function performerListText(cell: SpecialMusicCell): string {
  const linked = renderLinkedNames(cell.performers)
  const all = [...linked, ...cell.guestPerformers]
  if (all.length === 0) return 'TBA'
  if (all.length === 1) return all[0]
  if (all.length === 2) return `${all[0]} and ${all[1]}`
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

function cellPrefix(cell: SpecialMusicCell): string {
  if (cell.serviceLabel?.trim()) return cell.serviceLabel.trim().toUpperCase()
  return cell.type.toUpperCase()
}

export function SpecialMusicSchedulePreview({
  scopeStart,
  scopeEnd,
  cells,
  services,
  editMode,
  onCellClick,
  exporting,
  doubleBookings,
  highlightCellIds,
  highlightDates,
}: Props) {
  const sundays = sundaysBetween(scopeStart, scopeEnd)
  const byKey = new Map<string, SpecialMusicCell>()
  for (const c of cells) byKey.set(`${c.date}:${c.serviceTimeId}`, c)
  const conflictsByCell = new Map<number, DoubleBooking[]>()
  if (!exporting) {
    for (const c of doubleBookings ?? []) {
      const list = conflictsByCell.get(c.specialMusicId) ?? []
      list.push(c)
      conflictsByCell.set(c.specialMusicId, list)
    }
  }
  // Label column fixed (it only ever holds "Sep 30"); the service columns split
  // whatever is left, so adding a third Service Time yields tighter columns
  // rather than a table that runs off the page box.
  const serviceColPx = Math.floor((SCHEDULE_CONTENT_WIDTH_PX - SCHEDULE_DATE_COL_PX) / Math.max(1, services.length))

  const headCell = {
    padding: SCHEDULE_CELL_PAD,
    textAlign: 'left' as const,
    fontSize: `${SCHEDULE_TYPE.tableHeader}pt`,
    fontWeight: 700,
    borderBottom: SCHEDULE_RULE,
    backgroundColor: SCHEDULE_HEADER_FILL,
  }
  const bodyCell = {
    padding: SCHEDULE_CELL_PAD,
    fontSize: `${SCHEDULE_TYPE.body}pt`,
    lineHeight: 1.2,
    verticalAlign: 'middle' as const,
  }

  return (
    <div className="overflow-hidden rounded-lg" style={{border: SCHEDULE_RULE}}>
      <table style={{width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed'}}>
        <colgroup>
          <col style={{width: SCHEDULE_DATE_COL_PX}} />
          {services.map((svc) => (
            <col key={svc.id} style={{width: serviceColPx}} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={headCell}>DATE</th>
            {services.map((svc) => (
              <th key={svc.id} style={{...headCell, borderLeft: SCHEDULE_RULE}}>
                {svc.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sundays.map((d, rowIdx) => {
            const rowBorder = rowIdx > 0 ? SCHEDULE_RULE : undefined
            const dateHighlighted = highlightDates?.has(d) ?? false
            return (
              // Natural height plus a floor, not the old hardcoded 52px pin —
              // that number competed with the type scale. See ADR 0021.
              <tr key={d} style={{height: SPECIAL_MUSIC_MIN_ROW_PX}}>
                <td
                  style={{
                    ...bodyCell,
                    fontWeight: 500,
                    borderTop: rowBorder,
                    backgroundColor: dateHighlighted ? SCHEDULE_HIGHLIGHT : SCHEDULE_HEADER_FILL,
                  }}
                >
                  {formatDate(d)}
                </td>
                {services.map((svc) => {
                  const slot = svc.id
                  const cell = byKey.get(`${d}:${svc.id}`)
                  const conflicts = cell ? (conflictsByCell.get(cell.id) ?? []) : []
                  const clickable = editMode && !exporting && onCellClick
                  const cellHighlighted = cell && highlightCellIds?.has(cell.id)
                  const baseStyle = {
                    ...bodyCell,
                    borderLeft: SCHEDULE_RULE,
                    borderTop: rowBorder,
                    ...(cellHighlighted ? {backgroundColor: SCHEDULE_HIGHLIGHT} : {}),
                  }
                  if (!cell) {
                    return (
                      <td key={slot} style={baseStyle} onClick={clickable ? () => onCellClick(d, slot) : undefined}>
                        {clickable && !exporting ? (
                          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                            <Plus className="h-3 w-3" /> Add
                          </span>
                        ) : (
                          <span style={{color: '#9ca3af'}}>&nbsp;</span>
                        )}
                      </td>
                    )
                  }
                  return (
                    <td
                      key={slot}
                      style={{...baseStyle, ...(clickable ? {cursor: 'pointer'} : {})}}
                      onClick={clickable ? () => onCellClick(d, slot) : undefined}
                    >
                      <span style={{fontWeight: 600}}>{cellPrefix(cell)}</span>
                      <span> – {performerListText(cell)}</span>
                      {conflicts.map((c) => (
                        <span
                          key={c.nurseryAssignmentId}
                          title={`${c.personName} is also working the nursery for ${c.serviceName} on ${c.date}`}
                          style={{
                            marginLeft: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#92400e',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fbbf24',
                            borderRadius: 4,
                            padding: '1px 5px',
                            verticalAlign: 'middle',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <AlertTriangle style={{width: 11, height: 11, flexShrink: 0}} aria-hidden />
                          {c.personName.split(/\s+/)[0]} in nursery
                        </span>
                      ))}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {sundays.length === 0 && (
            <tr>
              <td colSpan={services.length + 1} className="text-muted-foreground px-3 py-4 text-center text-sm">
                No Sundays in this date range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
