import {type Draft, fetchDrafts} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {FileEdit} from 'lucide-react'

export const draftsProvider: SearchProvider<Draft> = {
  id: 'drafts',
  label: 'Drafts',
  icon: FileEdit,
  priority: 70,
  queryKey: queryKeys.drafts(),
  fetch: () => fetchDrafts(),
  toItems: (rows) =>
    rows.map((d) => {
      const label = d.name?.trim() || d.content.slice(0, 60) || `Draft #${d.id}`
      return {
        id: `drafts-${d.id}`,
        label,
        subtitle: d.groupName ? `to ${d.groupName}` : d.content.slice(0, 80),
        group: 'Drafts',
        icon: FileEdit,
        keywords: [d.name ?? '', d.content.slice(0, 200), d.groupName ?? ''].filter(Boolean),
        action: ({navigate, close}) => {
          navigate(`/messages/compose?draftId=${d.id}`)
          close()
        },
      }
    }),
}
