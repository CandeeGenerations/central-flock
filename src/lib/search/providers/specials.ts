import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {
  SPECIAL_STATUS_LABELS,
  type Special,
  parseGuestPerformers,
  performerDisplayName,
  specialsApi,
} from '@/lib/specials-api'
import {Sparkles} from 'lucide-react'

// The palette has no React context to read Service Times from, so it labels a
// special by its own stored serviceLabel and falls back to the date's meaning.
// Cheap and stable — the palette is a search index, not the schedule.
function serviceLabel(s: Special): string {
  return s.serviceLabel?.trim() || ''
}

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
      label: s.songTitle ?? '(no song)',
      subtitle: [formatDate(s.date), serviceLabel(s), performerSummary(s), SPECIAL_STATUS_LABELS[s.status]]
        .filter(Boolean)
        .join(' · '),
      group: 'Music',
      icon: Sparkles,
      keywords: [
        s.songTitle ?? '',
        'special',
        'music',
        serviceLabel(s),
        s.occasion ?? '',
        ...s.performers.map(performerDisplayName),
        ...parseGuestPerformers(s.guestPerformers),
      ].filter(Boolean),
      navPath: `/music/specials/${s.id}`,
      action: ({navigate, close}) => {
        navigate(`/music/specials/${s.id}`)
        close()
      },
    })),
}
