import {db, schema, sqlite} from '../db/index.js'
import {
  extractIcon,
  extractTitle,
  getRootPageId,
  listChildBlocks,
  notionConfigured,
  queryDatabaseRows,
  retrieveDatabase,
  retrievePage,
} from './notion.js'

interface SyncedPage {
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

async function walkTree(rootId: string): Promise<Map<string, SyncedPage>> {
  const seen = new Map<string, SyncedPage>()
  const queue: {id: string; parentId: string | null; isDatabase: boolean}[] = [
    {id: rootId, parentId: null, isDatabase: false},
  ]

  while (queue.length > 0) {
    const item = queue.shift()!
    if (seen.has(item.id)) continue

    let title: string
    let icon: string | null
    let url: string
    let lastEditedTime: string

    if (item.isDatabase) {
      const dbResp = await retrieveDatabase(item.id)
      if (!dbResp) continue
      title = extractTitle(dbResp)
      icon = extractIcon(dbResp)
      url = dbResp.url
      lastEditedTime = dbResp.last_edited_time
      for (const row of await queryDatabaseRows(dbResp)) {
        queue.push({id: row.id, parentId: item.id, isDatabase: false})
      }
    } else {
      const page = await retrievePage(item.id)
      if (!page) continue
      title = extractTitle(page)
      icon = extractIcon(page)
      url = page.url
      lastEditedTime = page.last_edited_time
    }

    let hasChildren = item.isDatabase
    for (const block of await listChildBlocks(item.id)) {
      if (!('type' in block)) continue
      if (block.type === 'child_page') {
        hasChildren = true
        queue.push({id: block.id, parentId: item.id, isDatabase: false})
      } else if (block.type === 'child_database') {
        hasChildren = true
        queue.push({id: block.id, parentId: item.id, isDatabase: true})
      }
    }

    seen.set(item.id, {
      id: item.id,
      parentId: item.parentId,
      title,
      icon,
      url,
      isDatabase: item.isDatabase,
      isFolder: hasChildren,
      lastEditedTime,
    })
  }

  return seen
}

async function doSync(): Promise<SyncResult> {
  if (!notionConfigured) {
    return {ok: false, pages: 0, error: 'NOTION_API_TOKEN or NOTION_ROOT_PAGE_ID not configured'}
  }

  try {
    const map = await walkTree(getRootPageId())
    const now = new Date().toISOString()

    sqlite.transaction(() => {
      for (const p of map.values()) {
        db.insert(schema.notionPages)
          .values({
            id: p.id,
            parentId: p.parentId,
            title: p.title,
            icon: p.icon,
            url: p.url,
            isDatabase: p.isDatabase,
            isFolder: p.isFolder,
            lastEditedTime: p.lastEditedTime,
            syncedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.notionPages.id,
            set: {
              parentId: p.parentId,
              title: p.title,
              icon: p.icon,
              url: p.url,
              isDatabase: p.isDatabase,
              isFolder: p.isFolder,
              lastEditedTime: p.lastEditedTime,
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
    console.log('[notion-sync] Skipped: NOTION_API_TOKEN or NOTION_ROOT_PAGE_ID not set')
    return
  }

  syncNotion()
    .then((r) => {
      if (r.ok) console.log(`[notion-sync] Initial sync: ${r.pages} pages`)
      else console.warn('[notion-sync] Initial sync failed:', r.error)
    })
    .catch((err) => console.error('[notion-sync] Initial sync error:', err))

  intervalId = setInterval(() => {
    syncNotion()
      .then((r) => {
        if (r.ok) console.log(`[notion-sync] Synced ${r.pages} pages`)
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
