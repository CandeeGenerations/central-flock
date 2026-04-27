import {Client, isFullDatabase, isFullPage} from '@notionhq/client'
import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js'

const token = process.env.NOTION_API_TOKEN
const rootPageId = process.env.NOTION_ROOT_PAGE_ID

export const notionConfigured = !!token && !!rootPageId

const client = token ? new Client({auth: token}) : null

export function getNotionClient(): Client {
  if (!client) throw new Error('NOTION_API_TOKEN is not set')
  return client
}

export function getRootPageId(): string {
  if (!rootPageId) throw new Error('NOTION_ROOT_PAGE_ID is not set')
  return rootPageId
}

// Naive throttle: Notion allows ~3 req/s; we cap at 2.5 to leave headroom.
const MIN_INTERVAL_MS = 400
let lastCallAt = 0
async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - now)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallAt = Date.now()
  return fn()
}

export async function retrievePage(id: string): Promise<PageObjectResponse | null> {
  try {
    const resp = await paced(() => getNotionClient().pages.retrieve({page_id: id}))
    return isFullPage(resp) ? resp : null
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

export async function retrieveDatabase(id: string): Promise<DatabaseObjectResponse | null> {
  try {
    const resp = await paced(() => getNotionClient().databases.retrieve({database_id: id}))
    return isFullDatabase(resp) ? resp : null
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

export async function listChildBlocks(blockId: string): Promise<(BlockObjectResponse | PartialBlockObjectResponse)[]> {
  const all: (BlockObjectResponse | PartialBlockObjectResponse)[] = []
  let cursor: string | undefined
  do {
    const resp = await paced(() =>
      getNotionClient().blocks.children.list({block_id: blockId, start_cursor: cursor, page_size: 100}),
    )
    all.push(...resp.results)
    cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined
  } while (cursor)
  return all
}

export async function queryDatabaseRows(database: DatabaseObjectResponse): Promise<PageObjectResponse[]> {
  const all: PageObjectResponse[] = []
  for (const ds of database.data_sources) {
    let cursor: string | undefined
    do {
      const resp = await paced(() =>
        getNotionClient().dataSources.query({data_source_id: ds.id, start_cursor: cursor, page_size: 100}),
      )
      for (const r of resp.results) if (isFullPage(r)) all.push(r)
      cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined
    } while (cursor)
  }
  return all
}

export function extractTitle(entity: PageObjectResponse | DatabaseObjectResponse): string {
  if ('properties' in entity && entity.properties) {
    for (const prop of Object.values(entity.properties)) {
      if (prop && typeof prop === 'object' && 'type' in prop && prop.type === 'title' && 'title' in prop) {
        const text = (prop.title as {plain_text: string}[]).map((t) => t.plain_text).join('')
        if (text) return text
      }
    }
  }
  if ('title' in entity && Array.isArray(entity.title)) {
    const text = entity.title.map((t) => t.plain_text).join('')
    if (text) return text
  }
  return 'Untitled'
}

export function extractIcon(entity: PageObjectResponse | DatabaseObjectResponse): string | null {
  const icon = entity.icon
  if (!icon) return null
  if (icon.type === 'emoji') return icon.emoji
  if (icon.type === 'external') return icon.external.url
  if (icon.type === 'file') return icon.file.url
  return null
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && /Could not find|object_not_found/i.test(err.message)
}
