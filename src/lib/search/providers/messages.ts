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
      return {
        id: `messages-${m.id}`,
        label: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
        subtitle: m.groupName ? `to ${m.groupName}` : `${m.totalRecipients} recipients`,
        group: 'Messages',
        icon: MessageSquare,
        keywords: [preview, m.groupName ?? '', m.status].filter(Boolean),
        action: ({navigate, close}) => {
          navigate(`/messages/${m.id}`)
          close()
        },
      }
    }),
}
