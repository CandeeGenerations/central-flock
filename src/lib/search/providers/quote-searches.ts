import {type QuoteSearch, listSearches} from '@/lib/quotes-api'
import type {SearchProvider} from '@/lib/search/registry'
import {History} from 'lucide-react'

export const quoteSearchesProvider: SearchProvider<QuoteSearch> = {
  id: 'quote-searches',
  label: 'Quote Searches',
  icon: History,
  priority: 61,
  queryKey: ['quotes', 'searches', 'search-index'] as const,
  fetch: () => listSearches({pageSize: 100}).then((r) => r.searches),
  toItems: (rows) =>
    rows.map((s) => ({
      id: `quote-search-${s.id}`,
      label: `Quote search: ${s.topic}`,
      subtitle: `${s.resultCount} result${s.resultCount === 1 ? '' : 's'}`,
      group: 'Quotes',
      icon: History,
      keywords: ['quote search', 'saved search', 'research', s.topic],
      navPath: `/sermons/searches/${s.id}`,
      action: ({navigate, close}) => {
        navigate(`/sermons/searches/${s.id}`)
        close()
      },
    })),
}
