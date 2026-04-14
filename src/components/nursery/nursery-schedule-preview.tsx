import {SearchableSelect} from '@/components/ui/searchable-select'
import type {NurseryAssignment, NurseryWorker, ServiceConfig, ServiceType} from '@/lib/nursery-api'
import {forwardRef, useMemo} from 'react'

const SERVICE_ORDER: ServiceType[] = ['sunday_school', 'morning', 'evening', 'wednesday_evening']

interface SchedulePreviewProps {
  assignments: NurseryAssignment[]
  serviceConfig: ServiceConfig[]
  logoPath?: string
  month: number
  year: number
  editMode?: boolean
  workers?: NurseryWorker[]
  onAssignmentChange?: (assignmentId: number, workerId: number | null) => void
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

export const NurserySchedulePreview = forwardRef<HTMLDivElement, SchedulePreviewProps>(function NurserySchedulePreview(
  {assignments, serviceConfig, logoPath, month, year, editMode, workers, onAssignmentChange},
  ref,
) {
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

  const title = `Nursery Schedule - ${MONTH_NAMES[month - 1]} ${year}`

  return (
    <div
      ref={ref}
      className="py-6 px-4 mx-auto"
      style={{
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#ffffff',
        color: '#000000',
        width: '800px',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div className="text-center mb-6">
        {logoPath ? (
          <img src={logoPath} alt="" className="mx-auto max-h-20 object-contain mb-2" crossOrigin="anonymous" />
        ) : (
          <h2 className="text-xl font-bold mb-2" style={{color: '#000'}}>
            {title}
          </h2>
        )}
      </div>

      {/* Schedule Table */}
      <div className="rounded-lg overflow-hidden" style={{border: '1.5px solid #000'}}>
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
                        svcIdx === 0 && groupIdx > 0
                          ? '1.5px solid #000'
                          : svcIdx > 0
                            ? '1px solid #d1d5db'
                            : undefined,
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
                        <td key={slotNum} className="px-3 py-2 text-sm text-center" style={{...cellStyle, color: '#9ca3af'}}>
                          -
                        </td>
                      )
                    }
                    if (editMode && slotAssignment && onAssignmentChange) {
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
                        style={{...cellStyle, ...(!slotAssignment?.workerName ? {color: '#ef4444', fontStyle: 'italic'} : {})}}
                      >
                        {slotAssignment?.workerName || (slotAssignment?.workerId ? 'Unknown' : 'Unassigned')}
                      </td>
                    )
                  })}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
})
