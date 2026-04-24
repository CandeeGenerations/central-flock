import {type Quote, listQuotes} from '@/lib/quotes-api'
import type {SearchProvider} from '@/lib/search/registry'
import {Quote as QuoteIcon} from 'lucide-react'

export const quotesProvider: SearchProvider<Quote> = {
  id: 'quotes',
  label: 'Quotes',
  icon: QuoteIcon,
  priority: 78,
  queryKey: ['quotes', 'search-index'] as const,
  fetch: async () => {
    const res = await listQuotes({pageSize: 1000, sort: 'capturedAt', dir: 'desc'})
    return res.quotes
  },
  toItems: (rows) =>
    rows.map((q) => ({
      id: `quotes-${q.id}`,
      label: q.title,
      subtitle: [q.author, q.summary].filter(Boolean).slice(0, 2).join(' — ').slice(0, 120) || undefined,
      group: 'Quotes',
      icon: QuoteIcon,
      keywords: [q.title, q.author ?? '', q.summary ?? '', ...(q.tags ?? [])].filter(Boolean),
      action: ({navigate, close}) => {
        navigate(`/sermons/quotes/${q.id}`)
        close()
      },
    })),
}
