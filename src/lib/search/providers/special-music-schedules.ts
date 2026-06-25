import {type Schedule, fetchSchedules} from '@/lib/schedules-api'
import type {SearchProvider} from '@/lib/search/registry'
import {Music} from 'lucide-react'

export const specialMusicSchedulesProvider: SearchProvider<Schedule> = {
  id: 'special-music-schedules',
  label: 'Special Music Schedules',
  icon: Music,
  priority: 54,
  queryKey: ['special-music-schedules', 'search-index'] as const,
  fetch: () => fetchSchedules('special_music'),
  toItems: (rows) =>
    rows.map((s) => ({
      id: `special-music-${s.id}`,
      label: s.scopeLabel,
      subtitle: `${s.scopeStart ?? ''} → ${s.scopeEnd ?? ''} · ${s.status === 'final' ? 'Final' : 'Draft'}`,
      group: 'Schedules',
      icon: Music,
      keywords: ['special music', s.scopeLabel, s.status],
      navPath: `/special-music/${s.id}`,
      action: ({navigate, close}) => {
        navigate(`/special-music/${s.id}`)
        close()
      },
    })),
}
