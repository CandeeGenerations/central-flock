import {type HymnSearchListItem, listHymnSearches} from '@/lib/hymns-api'
import type {SearchProvider} from '@/lib/search/registry'
import {History} from 'lucide-react'

export const hymnSearchesProvider: SearchProvider<HymnSearchListItem> = {
  id: 'hymn-searches',
  label: 'Hymn Searches',
  icon: History,
  priority: 61,
  queryKey: ['hymns', 'searches', 'search-index'] as const,
  fetch: () => listHymnSearches({pageSize: 100}).then((r) => r.searches),
  toItems: (rows) =>
    rows.map((s) => ({
      id: `hymn-search-${s.id}`,
      label: `Hymn search: ${s.title || s.theme}`,
      subtitle: s.theme && s.theme !== s.title ? s.theme : undefined,
      group: 'Hymns',
      icon: History,
      keywords: ['hymn search', 'saved search', s.title, s.theme],
      navPath: `/music/hymns/searches/${s.id}`,
      action: ({navigate, close}) => {
        navigate(`/music/hymns/searches/${s.id}`)
        close()
      },
    })),
}
