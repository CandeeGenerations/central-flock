import {type Message, fetchMessages} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {MessageSquare} from 'lucide-react'

export const messagesProvider: SearchProvider<Message> = {
  id: 'messages',
  label: 'Messages',
  icon: MessageSquare,
  priority: 80,
  queryKey: queryKeys.messages(),
  fetch: () => fetchMessages(),
  toItems: (rows) =>
    rows.map((m) => {
      const preview = m.renderedPreview?.trim() || m.content?.slice(0, 120) || `Message #${m.id}`
      const groupLabel = m.groupNames.join(', ')
      return {
        id: `messages-${m.id}`,
        label: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
        subtitle: groupLabel ? `to ${groupLabel}` : `${m.totalRecipients} recipients`,
        group: 'Messages',
        icon: MessageSquare,
        keywords: [preview, groupLabel, m.status].filter(Boolean),
        navPath: `/messages/${m.id}`,
        action: ({navigate, close}) => {
          navigate(`/messages/${m.id}`)
          close()
        },
      }
    }),
}
