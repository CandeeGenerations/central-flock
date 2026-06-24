import {type Schedule, fetchSchedules} from '@/lib/schedules-api'
import type {SearchProvider} from '@/lib/search/registry'
import {Tent} from 'lucide-react'

export const fairBoothSchedulesProvider: SearchProvider<Schedule> = {
  id: 'fair-booth-schedules',
  label: 'Fair Booth Schedules',
  icon: Tent,
  priority: 53,
  queryKey: ['fair-booth-schedules', 'search-index'] as const,
  fetch: () => fetchSchedules('fair_booth'),
  toItems: (rows) =>
    rows.map((s) => ({
      id: `fair-booth-${s.id}`,
      label: s.scopeLabel,
      subtitle: `${s.scopeStart ?? ''}${s.scopeEnd ? ` → ${s.scopeEnd}` : ''} · ${s.status === 'final' ? 'Final' : 'Draft'}`,
      group: 'Schedules',
      icon: Tent,
      keywords: ['fair booth', s.scopeLabel, s.status],
      action: ({navigate, close}) => {
        navigate(`/schedules/fair-booth/${s.id}`)
        close()
      },
    })),
}
