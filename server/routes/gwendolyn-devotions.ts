import {and, asc, desc, eq, like, sql} from 'drizzle-orm'
import {Router} from 'express'

import {devotionsDb, devotionsSchema} from '../db-devotions/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {generateHashtags} from '../services/gwendolyn-hashtags.js'
import {parseDevotional} from '../services/gwendolyn-parse.js'

export const gwendolynDevotionsRouter = Router()

const table = devotionsSchema.gwendolynDevotions

// GET / — list
gwendolynDevotionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined
    const status = req.query.status as string | undefined
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const sort = (req.query.sort as string) || 'date'
    const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc'
    const offset = (page - 1) * limit

    const conditions = []
    if (search) conditions.push(like(table.title, `%${search}%`))
    if (status && status !== 'all') conditions.push(eq(table.status, status as never))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const orderCol = sort === 'title' ? table.title : sort === 'createdAt' ? table.createdAt : table.date
    const orderFn = sortDir === 'asc' ? asc : desc

    const [data, totalRow] = await Promise.all([
      devotionsDb.select().from(table).where(where).orderBy(orderFn(orderCol)).limit(limit).offset(offset).all(),
      devotionsDb
        .select({count: sql<number>`count(*)`})
        .from(table)
        .where(where)
        .get(),
    ])

    const total = totalRow?.count ?? 0

    const parsed = data.map((row) => ({
      ...row,
      blocks: JSON.parse(row.blocks),
    }))

    res.json({data: parsed, total, page, limit})
  }),
)

// GET /:id — single
gwendolynDevotionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const row = devotionsDb.select().from(table).where(eq(table.id, id)).get()
    if (!row) return void res.status(404).json({error: 'Not found'})
    res.json({...row, blocks: JSON.parse(row.blocks)})
  }),
)

// POST /parse — no persistence
gwendolynDevotionsRouter.post(
  '/parse',
  asyncHandler(async (req, res) => {
    const {rawText} = req.body as {rawText: string}
    if (!rawText?.trim()) return void res.status(400).json({error: 'rawText is required'})

    const parsed = parseDevotional(rawText)

    const deriveText = parsed.blocks
      .map((b) => (b.type === 'scripture' ? `"${b.text}" ${b.reference}`.trim() : b.text))
      .join('\n\n')

    let hashtags = ''
    let warning: string | undefined

    try {
      hashtags = await generateHashtags(deriveText)
    } catch (err) {
      warning = err instanceof Error ? err.message : 'Hashtag generation failed'
    }

    res.json({
      title: parsed.title,
      date: parsed.date,
      blocks: parsed.blocks,
      hashtags,
      rawInput: parsed.rawInput,
      ...(warning ? {warning} : {}),
    })
  }),
)

// POST / — create
gwendolynDevotionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {title, date, blocks, hashtags, rawInput, status} = req.body as {
      title: string
      date: string
      blocks: unknown[]
      hashtags?: string
      rawInput?: string
      status?: string
    }

    if (!title || !date || !blocks?.length) {
      return void res.status(400).json({error: 'title, date, and blocks are required'})
    }

    const row = devotionsDb
      .insert(table)
      .values({
        title,
        date,
        blocks: JSON.stringify(blocks),
        hashtags: hashtags ?? '',
        rawInput: rawInput ?? null,
        status: (status as never) ?? 'received',
      })
      .returning()
      .get()

    res.status(201).json({...row, blocks: JSON.parse(row.blocks)})
  }),
)

// PUT /:id — update
gwendolynDevotionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const existing = devotionsDb.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    const {title, date, blocks, hashtags, rawInput, status} = req.body as {
      title?: string
      date?: string
      blocks?: unknown[]
      hashtags?: string
      rawInput?: string
      status?: string
    }

    const updated = devotionsDb
      .update(table)
      .set({
        ...(title !== undefined ? {title} : {}),
        ...(date !== undefined ? {date} : {}),
        ...(blocks !== undefined ? {blocks: JSON.stringify(blocks)} : {}),
        ...(hashtags !== undefined ? {hashtags} : {}),
        ...(rawInput !== undefined ? {rawInput} : {}),
        ...(status !== undefined ? {status: status as never} : {}),
        updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      })
      .where(eq(table.id, id))
      .returning()
      .get()

    res.json({...updated, blocks: JSON.parse(updated.blocks)})
  }),
)

// PATCH /:id/status
gwendolynDevotionsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const {status} = req.body as {status: string}
    if (!status) return void res.status(400).json({error: 'status is required'})

    const existing = devotionsDb.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    const updated = devotionsDb
      .update(table)
      .set({status: status as never, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19)})
      .where(eq(table.id, id))
      .returning()
      .get()

    res.json({...updated, blocks: JSON.parse(updated.blocks)})
  }),
)

// POST /:id/regenerate-hashtags
gwendolynDevotionsRouter.post(
  '/:id/regenerate-hashtags',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const existing = devotionsDb.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    const blocks = JSON.parse(existing.blocks) as Array<{type: string; text: string; reference?: string}>
    const deriveText = blocks
      .map((b) => (b.type === 'scripture' ? `"${b.text}" ${b.reference ?? ''}`.trim() : b.text))
      .join('\n\n')

    const hashtags = await generateHashtags(deriveText)

    devotionsDb
      .update(table)
      .set({hashtags, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19)})
      .where(eq(table.id, id))
      .run()

    res.json({hashtags})
  }),
)

// DELETE /:id
gwendolynDevotionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const existing = devotionsDb.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    devotionsDb.delete(table).where(eq(table.id, id)).run()
    res.json({success: true})
  }),
)
