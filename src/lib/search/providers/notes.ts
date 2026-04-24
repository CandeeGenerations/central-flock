import {type NoteTreeItem, fetchNotesTree} from '@/lib/notes-api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchItem, SearchProvider} from '@/lib/search/registry'
import {FileText, Folder} from 'lucide-react'

function breadcrumbFor(item: NoteTreeItem, byId: Map<number, NoteTreeItem>): string {
  const parts: string[] = []
  let current: NoteTreeItem | undefined = item
  while (current && current.parentId != null) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    parts.unshift(parent.title)
    current = parent
  }
  return parts.join(' / ')
}

export const notesProvider: SearchProvider<NoteTreeItem> = {
  id: 'notes',
  label: 'Notes & Folders',
  icon: FileText,
  priority: 90,
  queryKey: queryKeys.notesTree,
  fetch: fetchNotesTree,
  toItems: (rows) => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    const items: SearchItem[] = []
    for (const row of rows) {
      const breadcrumb = breadcrumbFor(row, byId)
      const isFolder = row.type === 'folder'
      items.push({
        id: `notes-${row.type}-${row.id}`,
        label: row.title || (isFolder ? 'Untitled Folder' : 'Untitled Note'),
        subtitle: breadcrumb || (isFolder ? 'Folder' : row.excerpt?.slice(0, 120) || undefined),
        group: isFolder ? 'Folders' : 'Notes',
        icon: isFolder ? Folder : FileText,
        keywords: [row.title, row.excerpt ?? '', breadcrumb].filter(Boolean),
        action: ({navigate, close}) => {
          if (isFolder) {
            navigate(`/notes?expand=${row.id}`)
          } else {
            navigate(`/notes/note/${row.id}`)
          }
          close()
        },
      })
    }
    return items
  },
}
