import type {DataSourceObjectResponse, PageObjectResponse} from '@notionhq/client/build/src/api-endpoints.js'

import {db, schema, sqlite} from '../db/index.js'
import {
  extractIcon,
  extractTitle,
  notionConfigured,
  searchAccessibleDataSources,
  searchAccessiblePages,
} from './notion.js'

interface SyncedEntry {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  url: string
  isDatabase: boolean
  isFolder: boolean
  lastEditedTime: string
}

export interface SyncResult {
  ok: boolean
  pages: number
  error?: string
}

let inFlight: Promise<SyncResult> | null = null
let intervalId: ReturnType<typeof setInterval> | null = null
let lastSyncedAt: string | null = null
let lastSyncError: string | null = null

export function getNotionSyncStatus() {
  return {lastSyncedAt, lastSyncError, configured: notionConfigured}
}

type ParentRef = {type: string} & Record<string, string | undefined>

function resolveParent(parent: ParentRef, accessibleIds: Set<string>): string | null {
  if (parent.type === 'page_id' && parent.page_id) {
    return accessibleIds.has(parent.page_id) ? parent.page_id : null
  }
  if (parent.type === 'data_source_id' && parent.data_source_id) {
    return accessibleIds.has(parent.data_source_id) ? parent.data_source_id : null
  }
  if (parent.type === 'database_id' && parent.database_id) {
    return accessibleIds.has(parent.database_id) ? parent.database_id : null
  }
  return null
}

async function discoverAll(): Promise<Map<string, SyncedEntry>> {
  const dataSources: DataSourceObjectResponse[] = await searchAccessibleDataSources()
  const pages: PageObjectResponse[] = await searchAccessiblePages()

  const accessibleIds = new Set<string>()
  for (const d of dataSources) accessibleIds.add(d.id)
  for (const p of pages) accessibleIds.add(p.id)

  const entries = new Map<string, SyncedEntry>()

  // Each data source is treated as a top-level "folder" entity. Its tree-parent comes from
  // `database_parent` (the database's workspace/page), not `parent` (which is the database itself).
  for (const d of dataSources) {
    const dbParent = (d.database_parent ?? {type: 'workspace'}) as ParentRef
    entries.set(d.id, {
      id: d.id,
      parentId: resolveParent(dbParent, accessibleIds),
      title: extractTitle(d),
      icon: extractIcon(d),
      url: d.url,
      isDatabase: true,
      isFolder: true,
      lastEditedTime: d.last_edited_time,
    })
  }

  for (const p of pages) {
    entries.set(p.id, {
      id: p.id,
      parentId: resolveParent(p.parent as ParentRef, accessibleIds),
      title: extractTitle(p),
      icon: extractIcon(p),
      url: p.url,
      isDatabase: false,
      isFolder: false,
      lastEditedTime: p.last_edited_time,
    })
  }

  // Mark pages with descendants as folders so the sidebar renders them expandable.
  const childCount = new Map<string, number>()
  for (const e of entries.values()) {
    if (e.parentId) childCount.set(e.parentId, (childCount.get(e.parentId) ?? 0) + 1)
  }
  for (const e of entries.values()) {
    if (!e.isDatabase && (childCount.get(e.id) ?? 0) > 0) e.isFolder = true
  }

  return entries
}

async function doSync(): Promise<SyncResult> {
  if (!notionConfigured) {
    return {ok: false, pages: 0, error: 'NOTION_API_TOKEN is not configured'}
  }

  try {
    const map = await discoverAll()
    const now = new Date().toISOString()

    sqlite.transaction(() => {
      for (const e of map.values()) {
        db.insert(schema.notionPages)
          .values({
            id: e.id,
            parentId: e.parentId,
            title: e.title,
            icon: e.icon,
            url: e.url,
            isDatabase: e.isDatabase,
            isFolder: e.isFolder,
            lastEditedTime: e.lastEditedTime,
            syncedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.notionPages.id,
            set: {
              parentId: e.parentId,
              title: e.title,
              icon: e.icon,
              url: e.url,
              isDatabase: e.isDatabase,
              isFolder: e.isFolder,
              lastEditedTime: e.lastEditedTime,
              syncedAt: now,
            },
          })
          .run()
      }
      sqlite.prepare(`DELETE FROM notion_pages WHERE synced_at < ?`).run(now)
    })()

    lastSyncedAt = now
    lastSyncError = null
    return {ok: true, pages: map.size}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[notion-sync] Sync failed:', msg)
    lastSyncError = msg
    return {ok: false, pages: 0, error: msg}
  }
}

export function syncNotion(): Promise<SyncResult> {
  if (inFlight) return inFlight
  inFlight = doSync().finally(() => {
    inFlight = null
  })
  return inFlight
}

export function startNotionSyncScheduler(intervalMs = 5 * 60_000) {
  if (!notionConfigured) {
    console.log('[notion-sync] Skipped: NOTION_API_TOKEN not set')
    return
  }

  syncNotion()
    .then((r) => {
      if (r.ok) console.log(`[notion-sync] Initial sync: ${r.pages} entries`)
      else console.warn('[notion-sync] Initial sync failed:', r.error)
    })
    .catch((err) => console.error('[notion-sync] Initial sync error:', err))

  intervalId = setInterval(() => {
    syncNotion()
      .then((r) => {
        if (r.ok) console.log(`[notion-sync] Synced ${r.pages} entries`)
      })
      .catch((err) => console.error('[notion-sync] Scheduled sync error:', err))
  }, intervalMs)

  console.log(`Notion sync scheduler started (every ${Math.round(intervalMs / 60_000)}m)`)
}

export function stopNotionSyncScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
