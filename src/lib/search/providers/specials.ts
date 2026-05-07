import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {
  SERVICE_TYPE_LABELS,
  SPECIAL_STATUS_LABELS,
  type Special,
  parseGuestPerformers,
  performerDisplayName,
  specialsApi,
} from '@/lib/specials-api'
import {Sparkles} from 'lucide-react'

function performerSummary(s: Special): string {
  const linked = s.performers.map(performerDisplayName)
  const guests = parseGuestPerformers(s.guestPerformers)
  return [...linked, ...guests].slice(0, 3).join(', ')
}

export const specialsProvider: SearchProvider<Special> = {
  id: 'specials',
  label: 'Specials',
  icon: Sparkles,
  priority: 92,
  queryKey: queryKeys.specials,
  fetch: () => specialsApi.list({}),
  toItems: (rows) =>
    rows.map((s) => ({
      id: `special-${s.id}`,
      label: s.songTitle,
      subtitle: [
        formatDate(s.date),
        SERVICE_TYPE_LABELS[s.serviceType],
        performerSummary(s),
        SPECIAL_STATUS_LABELS[s.status],
      ]
        .filter(Boolean)
        .join(' · '),
      group: 'Music',
      icon: Sparkles,
      keywords: [
        s.songTitle,
        'special',
        'music',
        SERVICE_TYPE_LABELS[s.serviceType],
        s.occasion ?? '',
        ...s.performers.map(performerDisplayName),
        ...parseGuestPerformers(s.guestPerformers),
      ].filter(Boolean),
      action: ({navigate, close}) => {
        navigate(`/music/specials/${s.id}`)
        close()
      },
    })),
}
