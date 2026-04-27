import {type NotionPage, fetchNotionTree} from '@/lib/notion-api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {Database, FileText, Folder, NotebookText} from 'lucide-react'

export const notionProvider: SearchProvider<NotionPage> = {
  id: 'notion',
  label: 'Notion',
  icon: NotebookText,
  priority: 85,
  queryKey: queryKeys.notionTree,
  fetch: async () => {
    try {
      return await fetchNotionTree()
    } catch {
      // Notion not configured (503) — return empty so the palette stays usable.
      return []
    }
  },
  toItems: (pages) =>
    pages.map((p) => ({
      id: `notion-${p.id}`,
      label: p.title,
      group: 'Notion',
      icon: p.isDatabase ? Database : p.isFolder ? Folder : FileText,
      keywords: [p.title],
      action: ({navigate, close}) => {
        navigate(`/notion/page/${p.id}`)
        close()
      },
    })),
}
