import {SearchableSelect} from '@/components/ui/searchable-select'
import type {NurseryAssignment, NurseryWorker, ServiceConfig, ServiceType} from '@/lib/nursery-api'
import {useMemo} from 'react'

const SERVICE_ORDER: ServiceType[] = ['sunday_school', 'morning', 'evening', 'wednesday_evening']

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
}

interface DateGroup {
  date: string
  displayDate: string
  services: {
    serviceType: ServiceType
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
export function NurserySchedulePreview({
  assignments,
  serviceConfig,
  editMode,
  workers,
  onAssignmentChange,
  exporting,
  onCarryoverClick,
}: SchedulePreviewProps) {
  const configMap = useMemo(() => {
    const map = new Map<ServiceType, ServiceConfig>()
    serviceConfig.forEach((c) => map.set(c.serviceType, c))
    return map
  }, [serviceConfig])

  const dateGroups: DateGroup[] = useMemo(() => {
    const dates = [...new Set(assignments.map((a) => a.date))].sort()
    return dates.map((date) => {
      const dateAssignments = assignments.filter((a) => a.date === date)
      const serviceTypes = [...new Set(dateAssignments.map((a) => a.serviceType))]
      serviceTypes.sort((a, b) => SERVICE_ORDER.indexOf(a) - SERVICE_ORDER.indexOf(b))

      return {
        date,
        displayDate: formatDisplayDate(date),
        services: serviceTypes.map((st) => {
          const config = configMap.get(st)
          return {
            serviceType: st,
            label: config?.label || st,
            workerCount: config?.workerCount || 1,
            slots: dateAssignments.filter((a) => a.serviceType === st).sort((a, b) => a.slot - b.slot),
          }
        }),
      }
    })
  }, [assignments, configMap])

  const workerOptions = useMemo(() => {
    if (!workers) return []
    return [
      {value: '', label: '- Unassigned -'},
      ...workers.filter((w) => w.isActive).map((w) => ({value: String(w.id), label: w.name})),
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
            return group.services.map((svc, svcIdx) => (
              <tr key={`${group.date}-${svc.serviceType}`}>
                {svcIdx === 0 && (
                  <td
                    className="px-3 py-2 text-sm font-medium align-middle"
                    rowSpan={totalRows}
                    style={{
                      borderTop: groupIdx > 0 ? '1.5px solid #000' : undefined,
                      backgroundColor: '#f3f4f6',
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
                  const cellStyle = {
                    borderLeft: '1.5px solid #000' as const,
                    borderTop:
                      svcIdx === 0 && groupIdx > 0
                        ? ('1.5px solid #000' as const)
                        : svcIdx > 0
                          ? ('1px solid #d1d5db' as const)
                          : undefined,
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
