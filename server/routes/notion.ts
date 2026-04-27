import {asc, eq, like, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {getNotionSyncStatus, syncNotion} from '../services/notion-sync.js'
import {
  extractIcon,
  extractTitle,
  listChildBlocks,
  notionConfigured,
  retrieveDataSource,
  retrievePage,
} from '../services/notion.js'

export const notionRouter = Router()

notionRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(getNotionSyncStatus())
  }),
)

notionRouter.get(
  '/tree',
  asyncHandler(async (_req, res) => {
    if (!notionConfigured) {
      res.status(503).json({error: 'Notion is not configured. Set NOTION_API_TOKEN.'})
      return
    }
    const rows = db.select().from(schema.notionPages).orderBy(asc(schema.notionPages.title)).all()
    res.json(rows)
  }),
)

notionRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    if (!notionConfigured) {
      res.status(503).json({error: 'Notion is not configured.'})
      return
    }
    const q = String(req.query.q ?? '').trim()
    if (!q) {
      res.json([])
      return
    }
    const rows = db
      .select()
      .from(schema.notionPages)
      .where(like(sql`lower(${schema.notionPages.title})`, `%${q.toLowerCase()}%`))
      .orderBy(asc(schema.notionPages.title))
      .limit(50)
      .all()
    res.json(rows)
  }),
)

notionRouter.get(
  '/page/:id',
  asyncHandler(async (req, res) => {
    if (!notionConfigured) {
      res.status(503).json({error: 'Notion is not configured.'})
      return
    }
    const id = String(req.params.id)
    const cached = db.select().from(schema.notionPages).where(eq(schema.notionPages.id, id)).get()

    let title: string
    let icon: string | null
    let url: string
    let isDatabase: boolean
    let lastEditedTime: string

    if (cached?.isDatabase) {
      // "Database" entries are v5 data sources — folders, not pages with block content.
      const ds = await retrieveDataSource(id)
      if (!ds) {
        res.status(404).json({error: 'Page not found'})
        return
      }
      title = extractTitle(ds)
      icon = extractIcon(ds)
      url = ds.url
      isDatabase = true
      lastEditedTime = ds.last_edited_time
      res.json({id, title, icon, url, isDatabase, lastEditedTime, blocks: []})
      return
    }

    const page = await retrievePage(id)
    if (!page) {
      res.status(404).json({error: 'Page not found'})
      return
    }
    title = extractTitle(page)
    icon = extractIcon(page)
    url = page.url
    isDatabase = false
    lastEditedTime = page.last_edited_time

    const blocks = await listChildBlocks(id)
    res.json({id, title, icon, url, isDatabase, lastEditedTime, blocks})
  }),
)

notionRouter.post(
  '/sync',
  asyncHandler(async (_req, res) => {
    if (!notionConfigured) {
      res.status(503).json({error: 'Notion is not configured.'})
      return
    }
    const result = await syncNotion()
    res.status(result.ok ? 200 : 500).json(result)
  }),
)
