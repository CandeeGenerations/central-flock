import type {SearchProvider} from '@/lib/search/registry'
import {type RecentEntity, fetchRecents} from '@/lib/usage-api'
import {Clock} from 'lucide-react'

export const recentsProvider: SearchProvider<RecentEntity> = {
  id: 'recents',
  label: 'Recent',
  icon: Clock,
  priority: 1000,
  queryKey: ['usage-recents', 'search-index'] as const,
  fetch: fetchRecents,
  toItems: (rows) =>
    rows.map((r) => ({
      id: `recent-${r.path}`,
      label: r.label,
      subtitle: r.typeLabel,
      group: 'Recent',
      icon: Clock,
      keywords: [r.label, r.typeLabel],
      navPath: r.path,
      action: ({navigate, close}) => {
        navigate(r.path)
        close()
      },
    })),
}
