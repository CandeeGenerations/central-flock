import {type NurserySchedule, fetchNurserySchedules} from '@/lib/nursery-api'
import {monthEnd, notEnded} from '@/lib/search/current-period'
import type {SearchProvider} from '@/lib/search/registry'
import {Calendar} from 'lucide-react'

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

export const nurserySchedulesProvider: SearchProvider<NurserySchedule> = {
  id: 'nursery-schedules',
  label: 'Nursery Schedules',
  icon: Calendar,
  priority: 55,
  queryKey: ['nursery-schedules', 'search-index'] as const,
  ownsPath: /^(\/nursery\/\d+)(?:\/|$)/,
  fetch: fetchNurserySchedules,
  // This month and later only.
  toItems: (rows) =>
    rows
      .filter((s) => notEnded(monthEnd(s.year, s.month)))
      .map((s) => {
        const monthName = MONTH_NAMES[s.month - 1] ?? `Month ${s.month}`
        return {
          id: `nursery-${s.id}`,
          label: `${monthName} ${s.year}`,
          subtitle: s.status === 'final' ? 'Final' : 'Draft',
          group: 'Schedules',
          icon: Calendar,
          keywords: [monthName, String(s.year), s.status],
          navPath: `/nursery/${s.id}`,
          action: ({navigate, close}) => {
            navigate(`/nursery/${s.id}`)
            close()
          },
        }
      }),
}
