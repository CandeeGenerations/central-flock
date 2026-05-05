import type {DataSourceObjectResponse, PageObjectResponse} from '@notionhq/client/build/src/api-endpoints.js'

import {db, schema, sqlite} from '../db/index.js'
import {
  extractIcon,
  extractTitle,
  findChildDatabaseRefs,
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
  blocksWalkedAt: string | null
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

  const cachedWalkedAt = new Map<string, string | null>()
  for (const row of db
    .select({id: schema.notionPages.id, blocksWalkedAt: schema.notionPages.blocksWalkedAt})
    .from(schema.notionPages)
    .all()) {
    cachedWalkedAt.set(row.id, row.blocksWalkedAt)
  }

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
      blocksWalkedAt: cachedWalkedAt.get(d.id) ?? null,
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
      blocksWalkedAt: cachedWalkedAt.get(p.id) ?? null,
    })
  }

  await reparentLinkedDatabases(entries, dataSources)
  collapseDatabaseWrappers(entries)
  promoteHiddenRoot(entries)

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

// Pages can embed a database via toggle/inline blocks ("linked database view")
// without that database actually being their child in Notion's parent graph.
// Walk blocks for non-database pages whose content has changed since the last
// walk; if a child_database block points at a workspace-rooted database that's
// referenced by exactly one page, reparent the database to that page.
async function reparentLinkedDatabases(
  entries: Map<string, SyncedEntry>,
  dataSources: DataSourceObjectResponse[],
): Promise<void> {
  const wrapperToDataSources = new Map<string, string[]>()
  for (const d of dataSources) {
    const wrapperId = (d.parent as {database_id?: string}).database_id
    if (!wrapperId) continue
    const list = wrapperToDataSources.get(wrapperId) ?? []
    list.push(d.id)
    wrapperToDataSources.set(wrapperId, list)
  }

  const refsByDataSource = new Map<string, Set<string>>()
  const now = new Date().toISOString()
  let walked = 0

  for (const e of entries.values()) {
    if (e.isDatabase) continue
    if (e.blocksWalkedAt && e.blocksWalkedAt >= e.lastEditedTime) {
      const cachedRefs = cachedRefsForPage(e.id)
      for (const dsId of cachedRefs) addRef(refsByDataSource, dsId, e.id)
      continue
    }
    try {
      const wrapperIds = await findChildDatabaseRefs(e.id)
      const dataSourceIds: string[] = []
      for (const w of wrapperIds) {
        for (const dsId of wrapperToDataSources.get(w) ?? []) {
          dataSourceIds.push(dsId)
          addRef(refsByDataSource, dsId, e.id)
        }
      }
      writeCachedRefs(e.id, dataSourceIds)
      e.blocksWalkedAt = now
      walked++
    } catch (err) {
      console.warn(`[notion-sync] block walk failed for ${e.id}:`, err instanceof Error ? err.message : err)
    }
  }

  if (walked > 0) console.log(`[notion-sync] walked blocks for ${walked} pages`)

  // Apply reparenting: a workspace-rooted data source referenced from exactly
  // one page is moved under that page. Multiple references → leave alone.
  for (const [dsId, pageIds] of refsByDataSource) {
    if (pageIds.size !== 1) continue
    const ds = entries.get(dsId)
    if (!ds || !ds.isDatabase || ds.parentId !== null) continue
    const [pageId] = pageIds
    if (!entries.has(pageId)) continue
    ds.parentId = pageId
  }
}

function addRef(map: Map<string, Set<string>>, dsId: string, pageId: string) {
  const set = map.get(dsId) ?? new Set<string>()
  set.add(pageId)
  map.set(dsId, set)
}

// Cached child_database references per page, persisted in a tiny side table so
// unchanged pages don't need to be re-walked on every sync.
function cachedRefsForPage(pageId: string): string[] {
  ensureRefsTable()
  const row = sqlite.prepare(`SELECT data_source_ids FROM notion_page_refs WHERE page_id=?`).get(pageId) as
    | {data_source_ids: string}
    | undefined
  if (!row) return []
  try {
    const parsed = JSON.parse(row.data_source_ids)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeCachedRefs(pageId: string, ids: string[]) {
  ensureRefsTable()
  sqlite
    .prepare(
      `INSERT INTO notion_page_refs (page_id, data_source_ids) VALUES (?, ?)
       ON CONFLICT(page_id) DO UPDATE SET data_source_ids=excluded.data_source_ids`,
    )
    .run(pageId, JSON.stringify(ids))
}

let refsTableEnsured = false
function ensureRefsTable() {
  if (refsTableEnsured) return
  sqlite.exec(`CREATE TABLE IF NOT EXISTS notion_page_refs (page_id TEXT PRIMARY KEY, data_source_ids TEXT NOT NULL)`)
  refsTableEnsured = true
}

// A Notion full-page-database renders as a page that contains a single same-named
// data source. Without this pass, the sidebar shows two nested folders with the
// same title. Collapse the page and let the data source take its tree position.
function collapseDatabaseWrappers(entries: Map<string, SyncedEntry>): void {
  const childrenOf = new Map<string, string[]>()
  for (const e of entries.values()) {
    if (!e.parentId) continue
    const list = childrenOf.get(e.parentId) ?? []
    list.push(e.id)
    childrenOf.set(e.parentId, list)
  }

  for (const page of [...entries.values()]) {
    if (page.isDatabase) continue
    const childIds = childrenOf.get(page.id) ?? []
    if (childIds.length !== 1) continue
    const child = entries.get(childIds[0])
    if (!child?.isDatabase) continue
    if (child.title.trim().toLowerCase() !== page.title.trim().toLowerCase()) continue

    child.parentId = page.parentId
    if (!child.icon) child.icon = page.icon
    entries.delete(page.id)
  }
}

// If NOTION_HIDDEN_ROOT_ID is set, the configured page is removed from the tree
// and its direct children are promoted to its place in the hierarchy.
function promoteHiddenRoot(entries: Map<string, SyncedEntry>): void {
  const hiddenId = process.env.NOTION_HIDDEN_ROOT_ID?.trim()
  if (!hiddenId) return
  const hidden = entries.get(hiddenId)
  if (!hidden) return
  for (const e of entries.values()) {
    if (e.parentId === hiddenId) e.parentId = hidden.parentId
  }
  entries.delete(hiddenId)
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
            blocksWalkedAt: e.blocksWalkedAt,
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
              blocksWalkedAt: e.blocksWalkedAt,
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
