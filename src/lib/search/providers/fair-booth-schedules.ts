import {type Schedule, fetchSchedules} from '@/lib/schedules-api'
import {localToday} from '@/lib/search/current-period'
import type {SearchProvider} from '@/lib/search/registry'
import {Tent} from 'lucide-react'

export const fairBoothSchedulesProvider: SearchProvider<Schedule> = {
  id: 'fair-booth-schedules',
  label: 'Fair Booth Schedules',
  icon: Tent,
  priority: 53,
  queryKey: ['fair-booth-schedules', 'search-index'] as const,
  ownsPath: /^(\/schedules\/fair-booth\/\d+)(?:\/|$)/,
  fetch: () => fetchSchedules('fair_booth'),
  // Two years at a time: last year's fair and this year's (and any later one).
  toItems: (rows) => {
    const from = `${Number(localToday().slice(0, 4)) - 1}-01-01`
    return rows
      .filter((s) => {
        const end = s.scopeEnd ?? s.scopeStart
        return !end || end >= from
      })
      .map((s) => ({
        id: `fair-booth-${s.id}`,
        label: s.scopeLabel,
        subtitle: `${s.scopeStart ?? ''}${s.scopeEnd ? ` → ${s.scopeEnd}` : ''} · ${s.status === 'final' ? 'Final' : 'Draft'}`,
        group: 'Schedules',
        icon: Tent,
        keywords: ['fair booth', s.scopeLabel, s.status],
        navPath: `/schedules/fair-booth/${s.id}`,
        action: ({navigate, close}) => {
          navigate(`/schedules/fair-booth/${s.id}`)
          close()
        },
      }))
  },
}
