async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, {
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

export interface NotionPage {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  url: string
  isDatabase: boolean
  isFolder: boolean
  lastEditedTime: string
  syncedAt: string
}

export interface NotionStatus {
  configured: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
}

export interface NotionTableColumn {
  key: string
  name: string
  type: string
}

export interface NotionTableRow {
  id: string
  url: string
  values: Record<string, unknown>
}

export interface NotionTable {
  columns: NotionTableColumn[]
  rows: NotionTableRow[]
}

export interface NotionPageDetail {
  id: string
  title: string
  icon: string | null
  url: string
  isDatabase: boolean
  lastEditedTime: string
  blocks: NotionBlock[]
  table?: NotionTable
}

// Loose Notion block shape — matches @notionhq/client's BlockObjectResponse but
// kept structural here to avoid leaking the SDK into the frontend.
export interface NotionBlock {
  id: string
  type: string
  has_children: boolean
  [key: string]: unknown
}

export function fetchNotionStatus() {
  return request<NotionStatus>('/notion/status')
}

export function fetchNotionTree() {
  return request<NotionPage[]>('/notion/tree')
}

export function fetchNotionPage(id: string) {
  return request<NotionPageDetail>(`/notion/page/${id}`)
}

export function searchNotion(q: string) {
  return request<NotionPage[]>(`/notion/search?q=${encodeURIComponent(q)}`)
}

export function triggerNotionSync() {
  return request<{ok: boolean; pages: number; error?: string}>('/notion/sync', {method: 'POST'})
}

// Build a parent → children map for tree rendering.
export function buildTree(pages: NotionPage[]): {roots: NotionPage[]; childrenByParent: Map<string, NotionPage[]>} {
  const ids = new Set(pages.map((p) => p.id))
  const childrenByParent = new Map<string, NotionPage[]>()
  const roots: NotionPage[] = []
  for (const p of pages) {
    if (p.parentId && ids.has(p.parentId)) {
      const list = childrenByParent.get(p.parentId) ?? []
      list.push(p)
      childrenByParent.set(p.parentId, list)
    } else {
      roots.push(p)
    }
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => a.title.localeCompare(b.title))
  roots.sort((a, b) => a.title.localeCompare(b.title))
  return {roots, childrenByParent}
}
