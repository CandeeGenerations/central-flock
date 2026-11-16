import {type MusicWeekSummary, fetchMusicWeeks} from '@/lib/music-schedule-api'
import {addDaysIso, notEnded} from '@/lib/search/current-period'
import type {SearchProvider} from '@/lib/search/registry'
import {ListMusic} from 'lucide-react'

export const musicSchedulesProvider: SearchProvider<MusicWeekSummary> = {
  id: 'music-schedules',
  label: 'Music Schedules',
  icon: ListMusic,
  priority: 54,
  queryKey: ['music-schedules', 'search-index'] as const,
  ownsPath: /^(\/schedules\/music\/\d+)(?:\/|$)/,
  fetch: () => fetchMusicWeeks(),
  // This week and later only — a week runs weekStart … weekStart + 6.
  toItems: (rows) =>
    rows
      .filter((w) => notEnded(addDaysIso(w.weekStart, 6)))
      .map((w) => {
        const episodes =
          w.episodeFirst == null
            ? ''
            : w.episodeFirst === w.episodeLast
              ? `#${w.episodeFirst}`
              : `#${w.episodeFirst}-${w.episodeLast}`
        return {
          id: `music-schedule-${w.id}`,
          label: w.label,
          subtitle: [episodes, `${w.serviceCount} services`, w.status === 'final' ? 'Final' : 'Draft']
            .filter(Boolean)
            .join(' · '),
          group: 'Schedules',
          icon: ListMusic,
          // Searchable by date and by episode number — the two ways a week gets
          // referred to out loud.
          keywords: ['music schedule', 'sound booth', w.label, w.weekStart, episodes, w.status],
          navPath: `/schedules/music/${w.id}`,
          action: ({navigate, close}) => {
            navigate(`/schedules/music/${w.id}`)
            close()
          },
        }
      }),
}
