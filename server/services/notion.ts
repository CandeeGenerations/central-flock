import {Client, isFullPage} from '@notionhq/client'
import type {
  BlockObjectResponse,
  DataSourceObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js'

const token = process.env.NOTION_API_TOKEN

export const notionConfigured = !!token

const client = token ? new Client({auth: token}) : null

export function getNotionClient(): Client {
  if (!client) throw new Error('NOTION_API_TOKEN is not set')
  return client
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

export async function retrieveDataSource(id: string): Promise<DataSourceObjectResponse | null> {
  try {
    const resp = await paced(() => getNotionClient().dataSources.retrieve({data_source_id: id}))
    return isFullDataSource(resp) ? resp : null
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

export async function searchAccessibleDataSources(): Promise<DataSourceObjectResponse[]> {
  const all: DataSourceObjectResponse[] = []
  let cursor: string | undefined
  do {
    const resp = await paced(() =>
      getNotionClient().search({
        filter: {property: 'object', value: 'data_source'},
        start_cursor: cursor,
        page_size: 100,
      }),
    )
    for (const r of resp.results) if (isFullDataSource(r)) all.push(r)
    cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined
  } while (cursor)
  return all
}

export async function searchAccessiblePages(): Promise<PageObjectResponse[]> {
  const all: PageObjectResponse[] = []
  let cursor: string | undefined
  do {
    const resp = await paced(() =>
      getNotionClient().search({
        filter: {property: 'object', value: 'page'},
        start_cursor: cursor,
        page_size: 100,
      }),
    )
    for (const r of resp.results) if (isFullPage(r)) all.push(r)
    cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined
  } while (cursor)
  return all
}

type TitledEntity = {title?: unknown; properties?: unknown; icon?: unknown}

export function extractTitle(entity: TitledEntity): string {
  if (entity.properties && typeof entity.properties === 'object') {
    for (const prop of Object.values(entity.properties as Record<string, unknown>)) {
      if (
        prop &&
        typeof prop === 'object' &&
        'type' in prop &&
        (prop as {type: string}).type === 'title' &&
        'title' in prop
      ) {
        const text = ((prop as {title: {plain_text: string}[]}).title ?? []).map((t) => t.plain_text).join('')
        if (text) return text
      }
    }
  }
  if (Array.isArray(entity.title)) {
    const text = (entity.title as {plain_text: string}[]).map((t) => t.plain_text).join('')
    if (text) return text
  }
  return 'Untitled'
}

export function extractIcon(entity: TitledEntity): string | null {
  const icon = entity.icon as
    | {type: 'emoji'; emoji: string}
    | {type: 'external'; external: {url: string}}
    | {type: 'file'; file: {url: string}}
    | null
    | undefined
  if (!icon) return null
  if (icon.type === 'emoji') return icon.emoji
  if (icon.type === 'external') return icon.external.url
  if (icon.type === 'file') return icon.file.url
  return null
}

function isFullDataSource(x: unknown): x is DataSourceObjectResponse {
  return (
    !!x && typeof x === 'object' && 'object' in x && (x as {object: string}).object === 'data_source' && 'title' in x
  )
}

// Kept exported only for the page-detail route, which still calls databases.retrieve via this helper for legacy ids.
export async function retrieveDatabase(id: string): Promise<DatabaseObjectResponse | null> {
  try {
    const resp = await paced(() => getNotionClient().databases.retrieve({database_id: id}))
    if (resp && typeof resp === 'object' && 'data_sources' in resp) return resp as DatabaseObjectResponse
    return null
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && /Could not find|object_not_found/i.test(err.message)
}
