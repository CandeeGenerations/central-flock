const BASE_URL = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    ...options,
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteTreeItem {
  id: number
  type: 'folder' | 'note'
  parentId: number | null
  title: string
  excerpt: string | null
  icon: string | null
  position: number
  updatedAt: string
  createdAt: string
  // Assembled client-side when building the tree
  subRows?: NoteTreeItem[]
}

export interface NoteItem extends NoteTreeItem {
  contentJson: string | null
}

export type Breadcrumb = {id: number; title: string; type: 'folder' | 'note'}

// ---------------------------------------------------------------------------
// Tree helpers (client-side)
// ---------------------------------------------------------------------------

export function buildNoteTree(items: NoteTreeItem[]): NoteTreeItem[] {
  const byId = new Map(items.map((i) => [i.id, {...i, subRows: [] as NoteTreeItem[]}]))
  const roots: NoteTreeItem[] = []
  for (const item of byId.values()) {
    if (item.parentId == null) {
      roots.push(item)
    } else {
      const parent = byId.get(item.parentId)
      if (parent) {
        parent.subRows!.push(item)
      } else {
        roots.push(item) // orphan → treat as root
      }
    }
  }

  function sortItems(arr: NoteTreeItem[]) {
    arr.sort((a, b) => {
      // Folders first, then notes
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      // Then by position, then by title
      return a.position - b.position || a.title.localeCompare(b.title)
    })
    for (const item of arr) {
      if (item.subRows?.length) sortItems(item.subRows)
    }
  }
  sortItems(roots)
  return roots
}

export function filterNoteTree(items: NoteTreeItem[], search: string): NoteTreeItem[] {
  if (!search.trim()) return items
  const term = search.toLowerCase()

  function matchesOrHasMatch(item: NoteTreeItem): boolean {
    if (item.title.toLowerCase().includes(term)) return true
    if (item.excerpt?.toLowerCase().includes(term)) return true
    return item.subRows?.some(matchesOrHasMatch) ?? false
  }

  function filterItems(arr: NoteTreeItem[]): NoteTreeItem[] {
    return arr.filter(matchesOrHasMatch).map((item) => ({
      ...item,
      subRows: item.subRows ? filterItems(item.subRows) : [],
    }))
  }

  return filterItems(items)
}

/** Count all descendants of the given tree items (recursively). */
export function countDescendants(items: NoteTreeItem[]): number {
  let count = 0
  for (const item of items) {
    if (item.subRows?.length) {
      count += item.subRows.length + countDescendants(item.subRows)
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function fetchNotesTree() {
  return request<NoteTreeItem[]>('/notes/tree')
}

export function fetchNote(id: number) {
  return request<NoteItem>(`/notes/${id}`)
}

export function fetchNotesBreadcrumb(id: number) {
  return request<Breadcrumb[]>(`/notes/breadcrumb/${id}`)
}

export function createNoteItem(data: {type: 'folder' | 'note'; parentId?: number | null; title?: string}) {
  return request<NoteItem>('/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateNoteItem(id: number, data: {title?: string; contentJson?: string | null; icon?: string | null}) {
  return request<NoteItem>(`/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function moveNoteItem(id: number, data: {parentId: number | null; position?: number}) {
  return request<NoteItem>(`/notes/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteNoteItems(ids: number[]) {
  return request<{success: boolean; deleted: number}>('/notes/delete', {
    method: 'POST',
    body: JSON.stringify({ids}),
  })
}

export function duplicateNote(id: number) {
  return request<NoteItem>(`/notes/${id}/duplicate`, {method: 'POST'})
}
