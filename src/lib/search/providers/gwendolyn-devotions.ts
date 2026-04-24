import {type GwendolynDevotional, fetchGwendolynDevotionals} from '@/lib/gwendolyn-devotion-api'
import type {SearchProvider} from '@/lib/search/registry'
import {Smartphone} from 'lucide-react'

export const gwendolynDevotionsProvider: SearchProvider<GwendolynDevotional> = {
  id: 'gwendolyn-devotions',
  label: 'Gwendolyn Devotions',
  icon: Smartphone,
  priority: 60,
  queryKey: ['gwendolyn-devotions', 'search-index'] as const,
  fetch: async () => {
    const res = await fetchGwendolynDevotionals({limit: 2000})
    return res.data
  },
  toItems: (rows) =>
    rows.map((g) => ({
      id: `gwendolyn-${g.id}`,
      label: g.title || `Devotional from ${g.date}`,
      subtitle: `${g.date} · ${g.status.replace(/_/g, ' ')}`,
      group: 'Gwendolyn Devotions',
      icon: Smartphone,
      keywords: [g.title, g.date, g.hashtags].filter(Boolean),
      action: ({navigate, close}) => {
        navigate(`/devotions/gwendolyn/${g.id}`)
        close()
      },
    })),
}
