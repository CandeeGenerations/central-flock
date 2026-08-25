import {
  NURSERY_SERVICE_COL_PX,
  SCHEDULE_CELL_PAD,
  SCHEDULE_CONTENT_WIDTH_PX,
  SCHEDULE_DATE_COL_PX,
  SCHEDULE_HEADER_FILL,
  SCHEDULE_HIGHLIGHT,
  SCHEDULE_INNER_RULE,
  SCHEDULE_RULE,
  SCHEDULE_TYPE,
} from '@/components/print/schedule-scale'
import {SearchableSelect} from '@/components/ui/searchable-select'
import type {DoubleBooking, NurseryAssignment, NurseryWorker, ServiceConfig} from '@/lib/nursery-api'
import {AlertTriangle} from 'lucide-react'
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
        cursor: 'pointer',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      <AlertTriangle style={{width: 11, height: 11, flexShrink: 0}} aria-hidden />
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
// type prints with the same envelope. Sizes come from the shared schedule type
// scale in points — see docs/adr/0021-fixed-page-box-print.md.

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

  // Column count comes from the config, not from a literal. Before this the
  // headers and cells were hardcoded `[1, 2]`, so a `workerCount` of 3 produced
  // assignments in the DB that never reached the printed sheet.
  const slotCount = Math.max(1, ...serviceConfig.map((c) => c.workerCount || 1))
  const slotNums = Array.from({length: slotCount}, (_, i) => i + 1)
  // Label columns are fixed (their content is bounded); the worker columns split
  // whatever is left, so a third slot degrades into tighter columns rather than
  // a sheet that silently drops a person.
  const workerColPx = Math.floor(
    (SCHEDULE_CONTENT_WIDTH_PX - SCHEDULE_DATE_COL_PX - NURSERY_SERVICE_COL_PX) / slotCount,
  )

  const headCell = {
    padding: SCHEDULE_CELL_PAD,
    textAlign: 'left' as const,
    fontSize: `${SCHEDULE_TYPE.tableHeader}pt`,
    fontWeight: 700,
    borderBottom: SCHEDULE_RULE,
    backgroundColor: SCHEDULE_HEADER_FILL,
  }
  const bodyCell = {padding: SCHEDULE_CELL_PAD, fontSize: `${SCHEDULE_TYPE.body}pt`, lineHeight: 1.2}

  return (
    <div className="overflow-hidden rounded-lg" style={{border: SCHEDULE_RULE}}>
      {/* Schedule Table */}
      <table style={{width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed'}}>
        <colgroup>
          <col style={{width: SCHEDULE_DATE_COL_PX}} />
          <col style={{width: NURSERY_SERVICE_COL_PX}} />
          {slotNums.map((n) => (
            <col key={n} style={{width: workerColPx}} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={headCell}>Date</th>
            <th style={{...headCell, borderLeft: SCHEDULE_RULE}}>Service</th>
            {slotNums.map((n) => (
              <th key={n} style={{...headCell, borderLeft: SCHEDULE_RULE}}>
                Worker #{n}
              </th>
            ))}
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
                    rowSpan={totalRows}
                    style={{
                      ...bodyCell,
                      fontWeight: 500,
                      verticalAlign: 'middle',
                      borderTop: groupIdx > 0 ? SCHEDULE_RULE : undefined,
                      backgroundColor: dateHighlighted ? SCHEDULE_HIGHLIGHT : SCHEDULE_HEADER_FILL,
                    }}
                  >
                    {group.displayDate}
                  </td>
                )}
                <td
                  style={{
                    ...bodyCell,
                    borderLeft: SCHEDULE_RULE,
                    borderTop:
                      svcIdx === 0 && groupIdx > 0 ? SCHEDULE_RULE : svcIdx > 0 ? SCHEDULE_INNER_RULE : undefined,
                  }}
                >
                  {svc.label}
                </td>
                {slotNums.map((slotNum) => {
                  const slotAssignment = svc.slots.find((s) => s.slot === slotNum)
                  const assignmentHighlighted = slotAssignment && highlightAssignmentIds?.has(slotAssignment.id)
                  const cellStyle = {
                    ...bodyCell,
                    borderLeft: SCHEDULE_RULE,
                    borderTop:
                      svcIdx === 0 && groupIdx > 0 ? SCHEDULE_RULE : svcIdx > 0 ? SCHEDULE_INNER_RULE : undefined,
                    ...(assignmentHighlighted ? {backgroundColor: SCHEDULE_HIGHLIGHT} : {}),
                  }
                  if (slotNum > svc.workerCount) {
                    return (
                      <td key={slotNum} style={{...cellStyle, textAlign: 'center', color: '#9ca3af'}}>
                        -
                      </td>
                    )
                  }
                  const isCarryover = slotAssignment?.isCarryover ?? false
                  const conflict = slotAssignment ? conflictByAssignment.get(slotAssignment.id) : undefined
                  if (editMode && slotAssignment && onAssignmentChange && !isCarryover) {
                    return (
                      <td key={slotNum} style={{...cellStyle, padding: '1px 4px'}}>
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
                      style={{
                        ...cellStyle,
                        fontWeight: 600,
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
