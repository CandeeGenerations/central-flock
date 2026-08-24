import {SearchableSelect} from '@/components/ui/searchable-select'
import type {DoubleBooking, NurseryAssignment, NurseryWorker, ServiceConfig} from '@/lib/nursery-api'
import {useMemo} from 'react'

interface SchedulePreviewProps {
  assignments: NurseryAssignment[]
  serviceConfig: ServiceConfig[]
  editMode?: boolean
  workers?: NurseryWorker[]
  onAssignmentChange?: (assignmentId: number, workerId: number | null) => void
  // When true, suppress carryover badges so html-to-image captures the clean
  // parishioner-facing layout. Defaults to false.
  exporting?: boolean
  onCarryoverClick?: (assignment: NurseryAssignment) => void
  // Per-recipient PDF highlighting. assignment ids = worker slot cells;
  // dates = the date column on the matching rows.
  highlightAssignmentIds?: Set<number>
  highlightDates?: Set<string>
  // Advisory Double Bookings for this schedule. Suppressed when `exporting`.
  doubleBookings?: DoubleBooking[]
}

// Advisory Double Booking marker. Never rendered when `exporting` — the
// printed sheet goes to the nursery wall. See docs/adr/0026.
function DoubleBookedBadge({conflict}: {conflict: DoubleBooking}) {
  return (
    <a
      href={`/music/specials/${conflict.specialMusicId}`}
      title={`${conflict.personName} is also singing at ${conflict.serviceName} on ${conflict.date}${
        conflict.specialMusicTitle ? ` — ${conflict.specialMusicTitle}` : ''
      }`}
      style={{
        marginLeft: 6,
        fontSize: 10,
        fontWeight: 600,
        color: '#92400e',
        backgroundColor: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: 4,
        padding: '1px 5px',
        cursor: 'pointer',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      also singing
    </a>
  )
}

interface DateGroup {
  date: string
  displayDate: string
  services: {
    serviceTimeId: number
    label: string
    workerCount: number
    slots: NurseryAssignment[]
  }[]
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const monthName = MONTH_NAMES[date.getMonth()]
  return `${monthName.slice(0, 3)} ${date.getDate()}`
}

// Renders only the schedule's table body. The surrounding logo/title header
// and footer text blocks live in `SchedulePreviewFrame` so every Schedule
// type prints with the same envelope.
const HIGHLIGHT = '#fde68a'

export function NurserySchedulePreview({
  assignments,
  serviceConfig,
  editMode,
  workers,
  onAssignmentChange,
  exporting,
  onCarryoverClick,
  highlightAssignmentIds,
  highlightDates,
  doubleBookings,
}: SchedulePreviewProps) {
  const configMap = useMemo(() => {
    const map = new Map<number, ServiceConfig>()
    serviceConfig.forEach((c) => map.set(c.serviceTimeId, c))
    return map
  }, [serviceConfig])

  // A Double Booking is advisory and never exported — keyed by assignment id so
  // a cell can look itself up. See docs/adr/0026.
  const conflictByAssignment = useMemo(() => {
    const map = new Map<number, DoubleBooking>()
    if (!exporting) doubleBookings?.forEach((c) => map.set(c.nurseryAssignmentId, c))
    return map
  }, [doubleBookings, exporting])

  const dateGroups: DateGroup[] = useMemo(() => {
    const dates = [...new Set(assignments.map((a) => a.date))].sort()
    return dates.map((date) => {
      const dateAssignments = assignments.filter((a) => a.date === date)
      const serviceTimeIds = [...new Set(dateAssignments.map((a) => a.serviceTimeId))]
      serviceTimeIds.sort((a, b) => (configMap.get(a)?.sortOrder ?? 0) - (configMap.get(b)?.sortOrder ?? 0))

      return {
        date,
        displayDate: formatDisplayDate(date),
        services: serviceTimeIds.map((stId) => {
          const config = configMap.get(stId)
          return {
            serviceTimeId: stId,
            label: config?.label || `Service #${stId}`,
            workerCount: config?.workerCount || 1,
            slots: dateAssignments.filter((a) => a.serviceTimeId === stId).sort((a, b) => a.slot - b.slot),
          }
        }),
      }
    })
  }, [assignments, configMap])

  const workerOptions = useMemo(() => {
    if (!workers) return []
    return [
      {value: '', label: '- Unassigned -'},
      ...workers.filter((w) => w.isActive).map((w) => ({value: String(w.id), label: w.displayName})),
    ]
  }, [workers])

  return (
    <div className="overflow-hidden rounded-lg" style={{border: '1.5px solid #000'}}>
      {/* Schedule Table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{width: '110px', borderBottom: '1.5px solid #000', backgroundColor: '#f3f4f6'}}
            >
              Date
            </th>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{
                width: '220px',
                borderBottom: '1.5px solid #000',
                borderLeft: '1.5px solid #000',
                backgroundColor: '#f3f4f6',
              }}
            >
              Service
            </th>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{
                borderBottom: '1.5px solid #000',
                borderLeft: '1.5px solid #000',
                backgroundColor: '#f3f4f6',
              }}
            >
              Worker #1
            </th>
            <th
              className="px-3 py-2 text-left text-sm font-bold"
              style={{
                borderBottom: '1.5px solid #000',
                borderLeft: '1.5px solid #000',
                backgroundColor: '#f3f4f6',
              }}
            >
              Worker #2
            </th>
          </tr>
        </thead>
        <tbody>
          {dateGroups.map((group, groupIdx) => {
            const totalRows = group.services.length
            const dateHighlighted = highlightDates?.has(group.date) ?? false
            return group.services.map((svc, svcIdx) => (
              <tr key={`${group.date}-${svc.serviceTimeId}`}>
                {svcIdx === 0 && (
                  <td
                    className="px-3 py-2 text-sm font-medium align-middle"
                    rowSpan={totalRows}
                    style={{
                      borderTop: groupIdx > 0 ? '1.5px solid #000' : undefined,
                      backgroundColor: dateHighlighted ? HIGHLIGHT : '#f3f4f6',
                    }}
                  >
                    {group.displayDate}
                  </td>
                )}
                <td
                  className="px-3 py-2 text-sm"
                  style={{
                    borderLeft: '1.5px solid #000',
                    borderTop:
                      svcIdx === 0 && groupIdx > 0 ? '1.5px solid #000' : svcIdx > 0 ? '1px solid #d1d5db' : undefined,
                  }}
                >
                  {svc.label}
                </td>
                {[1, 2].map((slotNum) => {
                  const slotAssignment = svc.slots.find((s) => s.slot === slotNum)
                  const assignmentHighlighted = slotAssignment && highlightAssignmentIds?.has(slotAssignment.id)
                  const cellStyle = {
                    borderLeft: '1.5px solid #000' as const,
                    borderTop:
                      svcIdx === 0 && groupIdx > 0
                        ? ('1.5px solid #000' as const)
                        : svcIdx > 0
                          ? ('1px solid #d1d5db' as const)
                          : undefined,
                    ...(assignmentHighlighted ? {backgroundColor: HIGHLIGHT} : {}),
                  }
                  if (slotNum > svc.workerCount) {
                    return (
                      <td
                        key={slotNum}
                        className="px-3 py-2 text-sm text-center"
                        style={{...cellStyle, color: '#9ca3af'}}
                      >
                        -
                      </td>
                    )
                  }
                  const isCarryover = slotAssignment?.isCarryover ?? false
                  const conflict = slotAssignment ? conflictByAssignment.get(slotAssignment.id) : undefined
                  if (editMode && slotAssignment && onAssignmentChange && !isCarryover) {
                    return (
                      <td key={slotNum} className="px-1 py-1 text-sm" style={cellStyle}>
                        <SearchableSelect
                          value={slotAssignment.workerId ? String(slotAssignment.workerId) : ''}
                          onValueChange={(v) => onAssignmentChange(slotAssignment.id, v ? Number(v) : null)}
                          options={workerOptions}
                          placeholder="Select worker"
                          className="w-full text-xs h-7 border-0 px-2 !bg-transparent"
                        />
                        {conflict ? <DoubleBookedBadge conflict={conflict} /> : null}
                      </td>
                    )
                  }
                  return (
                    <td
                      key={slotNum}
                      className="px-3 py-2 text-sm font-semibold"
                      style={{
                        ...cellStyle,
                        ...(!slotAssignment?.workerName ? {color: '#ef4444', fontStyle: 'italic'} : {}),
                      }}
                    >
                      <span>{slotAssignment?.workerName || (slotAssignment?.workerId ? 'Unknown' : 'Unassigned')}</span>
                      {conflict ? <DoubleBookedBadge conflict={conflict} /> : null}
                      {isCarryover && !exporting && slotAssignment ? (
                        <button
                          type="button"
                          onClick={() => onCarryoverClick?.(slotAssignment)}
                          title={
                            slotAssignment.sourceMonth
                              ? `From ${MONTH_NAMES[slotAssignment.sourceMonth - 1]} ${slotAssignment.sourceYear} — click to open that schedule`
                              : 'Carried over from prior month'
                          }
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#1e3a8a',
                            backgroundColor: '#dbeafe',
                            border: '1px solid #93c5fd',
                            borderRadius: 4,
                            padding: '1px 5px',
                            cursor: onCarryoverClick ? 'pointer' : 'default',
                            verticalAlign: 'middle',
                          }}
                        >
                          from{' '}
                          {slotAssignment.sourceMonth ? MONTH_NAMES[slotAssignment.sourceMonth - 1].slice(0, 3) : '?'}
                        </button>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}
