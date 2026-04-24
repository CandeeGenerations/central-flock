import {type Devotion, fetchDevotions} from '@/lib/devotion-api'
import type {SearchProvider} from '@/lib/search/registry'
import {BookOpen} from 'lucide-react'

export const devotionsProvider: SearchProvider<Devotion> = {
  id: 'devotions',
  label: 'Devotions',
  icon: BookOpen,
  priority: 85,
  queryKey: ['devotions', 'search-index'] as const,
  fetch: async () => {
    const res = await fetchDevotions({limit: 5000})
    return res.data
  },
  toItems: (rows) =>
    rows.map((d) => {
      const label = d.title?.trim() || `#${d.number} — ${d.bibleReference ?? 'Devotion'}`
      const subtitleParts = [
        `#${d.number}`,
        d.bibleReference,
        d.guestSpeaker ? `guest: ${d.guestSpeaker}` : null,
        d.songName ? `♪ ${d.songName}` : null,
      ].filter(Boolean)
      return {
        id: `devotions-${d.id}`,
        label,
        subtitle: subtitleParts.join(' · '),
        group: 'Devotions',
        icon: BookOpen,
        keywords: [d.title ?? '', d.bibleReference ?? '', d.guestSpeaker ?? '', d.songName ?? ''].filter(Boolean),
        action: ({navigate, close}) => {
          navigate(`/devotions/${d.id}`)
          close()
        },
      }
    }),
}
