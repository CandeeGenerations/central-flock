import {fetchMusicScans} from '@/lib/music-scan-api'
import type {MusicScanListItem} from '@/lib/music-scan-types'
import {weekLabel} from '@/lib/music-schedule-core'
import type {SearchProvider} from '@/lib/search/registry'
import {ScanLine} from 'lucide-react'

export const musicScansProvider: SearchProvider<MusicScanListItem> = {
  id: 'music-scans',
  label: 'Music Schedule Scans',
  icon: ScanLine,
  priority: 55,
  queryKey: ['music-scans', 'search-index'] as const,
  fetch: fetchMusicScans,
  toItems: (rows) =>
    rows.map((s) => {
      const week = s.weekStart ? weekLabel(s.weekStart) : 'Week not read'
      return {
        id: `music-scan-${s.id}`,
        label: `Review scan – ${week}`,
        subtitle: s.summary ? `${s.summary.resolved} of ${s.summary.songs} songs found` : 'Not read',
        group: 'Schedules',
        icon: ScanLine,
        keywords: ['scan', 'review', 'music schedule', 'photos', week, s.weekStart ?? ''],
        navPath: `/schedules/music/scans/${s.id}`,
        action: ({navigate, close}) => {
          navigate(`/schedules/music/scans/${s.id}`)
          close()
        },
      }
    }),
}
