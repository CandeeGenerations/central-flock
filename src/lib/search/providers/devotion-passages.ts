import {type PoolPassage, fetchPool} from '@/lib/devotion-api'
import type {SearchProvider} from '@/lib/search/registry'
import {Sparkles} from 'lucide-react'

export const devotionPassagesProvider: SearchProvider<PoolPassage> = {
  id: 'devotion-passages',
  label: 'Passages',
  icon: Sparkles,
  priority: 58,
  queryKey: ['devotion-passages', 'search-index'] as const,
  fetch: () => fetchPool({limit: 1000}),
  toItems: (rows) =>
    rows.map((p) => ({
      id: `passage-${p.id}`,
      label: p.title,
      subtitle: [p.bibleReference, p.notes, p.used ? 'used' : 'available'].filter(Boolean).join(' · '),
      group: 'Passages',
      icon: Sparkles,
      keywords: [p.title, p.bibleReference, p.notes ?? '', p.subcode ?? ''].filter(Boolean),
      navPath: `/devotions/passages/${p.id}`,
      action: ({navigate, close}) => {
        navigate(`/devotions/passages/${p.id}`)
        close()
      },
    })),
}
