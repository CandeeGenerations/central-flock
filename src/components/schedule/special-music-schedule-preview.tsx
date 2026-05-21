import type {SpecialMusicCell} from '@/lib/schedules-api'
import {Plus} from 'lucide-react'

interface Props {
  scopeStart: string
  scopeEnd: string
  cells: SpecialMusicCell[]
  editMode?: boolean
  onCellClick?: (date: string, serviceType: 'sunday_am' | 'sunday_pm') => void
  exporting?: boolean
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

function performerListText(cell: SpecialMusicCell): string {
  const linked = cell.performers
    .slice()
    .sort((a, b) => a.ordering - b.ordering)
    .map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim())
    .filter(Boolean)
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

export function SpecialMusicSchedulePreview({scopeStart, scopeEnd, cells, editMode, onCellClick, exporting}: Props) {
  const sundays = sundaysBetween(scopeStart, scopeEnd)
  const byKey = new Map<string, SpecialMusicCell>()
  for (const c of cells) byKey.set(`${c.date}:${c.serviceType}`, c)

  const cellWidth = '290px'
  return (
    <div className="overflow-hidden rounded-lg" style={{border: '1.5px solid #000'}}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{width: '90px', borderBottom: '1.5px solid #000', backgroundColor: '#f3f4f6'}}
            >
              DATE
            </th>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{
                width: cellWidth,
                borderBottom: '1.5px solid #000',
                borderLeft: '1.5px solid #000',
                backgroundColor: '#f3f4f6',
              }}
            >
              SUNDAY AM
            </th>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{
                width: cellWidth,
                borderBottom: '1.5px solid #000',
                borderLeft: '1.5px solid #000',
                backgroundColor: '#f3f4f6',
              }}
            >
              SUNDAY PM
            </th>
          </tr>
        </thead>
        <tbody>
          {sundays.map((d, rowIdx) => {
            const am = byKey.get(`${d}:sunday_am`)
            const pm = byKey.get(`${d}:sunday_pm`)
            const rowBorder = rowIdx > 0 ? ('1.5px solid #000' as const) : undefined
            return (
              <tr key={d}>
                <td
                  className="px-3 py-2 text-sm font-medium"
                  style={{borderTop: rowBorder, backgroundColor: '#f3f4f6'}}
                >
                  {formatDate(d)}
                </td>
                {(['sunday_am', 'sunday_pm'] as const).map((slot) => {
                  const cell = slot === 'sunday_am' ? am : pm
                  const clickable = editMode && !exporting && onCellClick
                  const baseStyle = {
                    borderLeft: '1.5px solid #000' as const,
                    borderTop: rowBorder,
                  }
                  if (!cell) {
                    return (
                      <td
                        key={slot}
                        className="px-3 py-2 text-sm"
                        style={baseStyle}
                        onClick={clickable ? () => onCellClick(d, slot) : undefined}
                      >
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
                      className="px-3 py-2 text-sm"
                      style={{...baseStyle, ...(clickable ? {cursor: 'pointer'} : {})}}
                      onClick={clickable ? () => onCellClick(d, slot) : undefined}
                    >
                      <span style={{fontWeight: 600}}>{cellPrefix(cell)}</span>
                      <span> – {performerListText(cell)}</span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {sundays.length === 0 && (
            <tr>
              <td colSpan={3} className="text-muted-foreground px-3 py-4 text-center text-sm">
                No Sundays in this date range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
