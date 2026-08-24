import type {SearchProvider} from '@/lib/search/registry'
import {type SermonListItem, listSermons} from '@/lib/sermons-api'
import {ScrollText} from 'lucide-react'

export const sermonsProvider: SearchProvider<SermonListItem> = {
  id: 'sermons',
  label: 'Sermons',
  icon: ScrollText,
  priority: 77,
  queryKey: ['sermons', 'search-index'] as const,
  fetch: async () => {
    const res = await listSermons({pageSize: 500})
    return res.data
  },
  toItems: (rows) =>
    rows.map((s) => ({
      id: `sermons-${s.id}`,
      label: s.title || `${s.serviceTimeName} — ${s.sermonDate}`,
      subtitle: [s.sermonDate, s.speaker, s.series ?? '', s.bigIdea ?? ''].filter(Boolean).join(' — ').slice(0, 120),
      group: 'Sermons',
      icon: ScrollText,
      keywords: [s.title ?? '', s.series ?? '', s.speaker, s.serviceTimeName, s.sermonDate, s.bigIdea ?? ''].filter(
        Boolean,
      ),
      navPath: `/sermons/social/${s.id}`,
      action: ({navigate, close}) => {
        navigate(`/sermons/social/${s.id}`)
        close()
      },
    })),
}
