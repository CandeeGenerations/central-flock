import {and, asc, desc, eq, like, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {buildCorrectionNote} from '../services/gwendolyn-correction-note.js'
import {generateHashtags} from '../services/gwendolyn-hashtags.js'
import {parseDevotional} from '../services/gwendolyn-parse.js'
import {
  type BlockCheck,
  type Dismissal,
  checkBlock,
  explainNotFound,
  openFindingCount,
  pruneDismissals,
} from '../services/scripture-check.js'
import {getSetting} from './settings.js'

export const gwendolynDevotionsRouter = Router()

const table = schema.gwendolynDevotions

type StoredBlock =
  | {type: 'point'; text: string}
  | {type: 'scripture'; text: string; reference: string; dismissals?: Dismissal[]}

// A scripture block's lead-in is the point just before it
function leadInOf(blocks: StoredBlock[], i: number): string | undefined {
  const prev = blocks[i - 1]
  return prev?.type === 'point' ? prev.text : undefined
}

// Index-aligned with the blocks; null for points, which the Scripture Check never looks at
function checksFor(blocks: StoredBlock[]): (BlockCheck | null)[] {
  return blocks.map((b, i) => (b.type === 'scripture' ? checkBlock({...b, leadIn: leadInOf(blocks, i)}) : null))
}

function countOpenFindings(blocks: StoredBlock[]): number {
  return checksFor(blocks).reduce((n, c) => n + (c ? openFindingCount(c) : 0), 0)
}

// Drops Dismissals that no longer match a Finding, so edits don't leave stale ones behind
function withPrunedDismissals(blocks: StoredBlock[]): StoredBlock[] {
  return blocks.map((b, i) => {
    if (b.type !== 'scripture') return b
    const kept = pruneDismissals({...b, leadIn: leadInOf(blocks, i)})
    return {type: 'scripture', text: b.text, reference: b.reference, ...(kept ? {dismissals: kept} : {})}
  })
}

// GET / — list
gwendolynDevotionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined
    const status = req.query.status as string | undefined
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    // limit=all returns every row on one page
    const all = req.query.limit === 'all'
    const limit = all ? -1 : Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const sort = (req.query.sort as string) || 'date'
    const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc'
    const offset = all ? 0 : (page - 1) * limit

    const conditions = []
    if (search) conditions.push(like(table.title, `%${search}%`))
    if (status && status !== 'all') conditions.push(eq(table.status, status as never))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const orderCol = sort === 'title' ? table.title : sort === 'createdAt' ? table.createdAt : table.date
    const orderFn = sortDir === 'asc' ? asc : desc

    const [data, totalRow] = await Promise.all([
      db.select().from(table).where(where).orderBy(orderFn(orderCol)).limit(limit).offset(offset).all(),
      db
        .select({count: sql<number>`count(*)`})
        .from(table)
        .where(where)
        .get(),
    ])

    const total = totalRow?.count ?? 0

    const parsed = data.map((row) => {
      const blocks = JSON.parse(row.blocks) as StoredBlock[]
      return {...row, blocks, openFindings: countOpenFindings(blocks)}
    })

    res.json({data: parsed, total, page, limit})
  }),
)

// GET /:id — single
gwendolynDevotionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const row = db.select().from(table).where(eq(table.id, id)).get()
    if (!row) return void res.status(404).json({error: 'Not found'})
    const blocks = JSON.parse(row.blocks) as StoredBlock[]
    const checks = checksFor(blocks)
    res.json({
      ...row,
      blocks,
      checks,
      correctionNote: buildCorrectionNote({rawInput: row.rawInput, blocks, checks}),
    })
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

    // The AI fallback only runs for blocks the Bible Text lookup couldn't place
    const [, checks] = await Promise.all([
      generateHashtags(deriveText).then(
        (h) => void (hashtags = h),
        (err) => void (warning = err instanceof Error ? err.message : 'Hashtag generation failed'),
      ),
      Promise.all(
        parsed.blocks.map((b, i) =>
          b.type === 'scripture' ? explainNotFound({...b, leadIn: leadInOf(parsed.blocks, i)}) : null,
        ),
      ),
    ])

    res.json({
      title: parsed.title,
      date: parsed.date,
      blocks: parsed.blocks,
      checks,
      hashtags,
      rawInput: parsed.rawInput,
      ...(warning ? {warning} : {}),
    })
  }),
)

// POST /check — Scripture Check without persistence. Deterministic (the live re-check) unless
// `ai` is set, which runs the AI fallback on the blocks' Not Found Findings.
gwendolynDevotionsRouter.post(
  '/check',
  asyncHandler(async (req, res) => {
    // Each block carries its own `leadIn`; the client sends only the blocks it needs checked
    const {blocks, ai} = req.body as {blocks?: (StoredBlock & {leadIn?: string})[]; ai?: boolean}
    if (!Array.isArray(blocks)) return void res.status(400).json({error: 'blocks is required'})
    const checks = ai
      ? await Promise.all(blocks.map((b) => (b?.type === 'scripture' ? explainNotFound(b) : null)))
      : blocks.map((b) => (b?.type === 'scripture' ? checkBlock(b) : null))
    res.json({checks})
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

    const row = db
      .insert(table)
      .values({
        title,
        date,
        blocks: JSON.stringify(withPrunedDismissals(blocks as StoredBlock[])),
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
    const existing = db.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    // No rawInput: the Original is set once, on create, and never altered
    const {title, date, blocks, hashtags, status} = req.body as {
      title?: string
      date?: string
      blocks?: StoredBlock[]
      hashtags?: string
      status?: string
    }

    const updated = db
      .update(table)
      .set({
        ...(title !== undefined ? {title} : {}),
        ...(date !== undefined ? {date} : {}),
        ...(blocks !== undefined ? {blocks: JSON.stringify(withPrunedDismissals(blocks))} : {}),
        ...(hashtags !== undefined ? {hashtags} : {}),
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

    const existing = db.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    const updated = db
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
    const existing = db.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    const blocks = JSON.parse(existing.blocks) as Array<{type: string; text: string; reference?: string}>
    const deriveText = blocks
      .map((b) => (b.type === 'scripture' ? `"${b.text}" ${b.reference ?? ''}`.trim() : b.text))
      .join('\n\n')

    const hashtags = await generateHashtags(deriveText)

    db.update(table)
      .set({hashtags, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19)})
      .where(eq(table.id, id))
      .run()

    res.json({hashtags})
  }),
)

function buildDevoVideoUrl(date: string): string {
  // date = YYYY-MM-DD → https://cbcwoodbridge-social.s3.us-east-1.amazonaws.com/YYYY/MM/devo-reels-YYYYMMDD.mp4
  const [y, m, d] = date.split('-')
  return `https://cbcwoodbridge-social.s3.us-east-1.amazonaws.com/${y}/${m}/devo-reels-${y}${m}${d}.mp4`
}

// POST /:id/schedule-message — schedule a text to the configured Gwendolyn person with the devo URL
gwendolynDevotionsRouter.post(
  '/:id/schedule-message',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const devotional = db.select().from(table).where(eq(table.id, id)).get()
    if (!devotional) return void res.status(404).json({error: 'Not found'})

    const personIdStr = getSetting('gwendolynPersonId').trim()
    const personId = Number(personIdStr)
    if (!personId || !Number.isFinite(personId)) {
      res.status(400).json({error: 'Gwendolyn person is not configured. Set it in Settings.'})
      return
    }
    const person = db.select().from(schema.people).where(eq(schema.people.id, personId)).get()
    if (!person) {
      res.status(400).json({error: 'Configured Gwendolyn person no longer exists.'})
      return
    }
    if (!person.phoneNumber) {
      res.status(400).json({error: 'Configured Gwendolyn person has no phone number.'})
      return
    }

    const {scheduledAt, content} = req.body as {scheduledAt?: string; content?: string}
    if (!scheduledAt) {
      res.status(400).json({error: 'scheduledAt is required'})
      return
    }
    const scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      res.status(400).json({error: 'Scheduled time must be in the future'})
      return
    }
    const scheduledAtUtc = scheduledDate.toISOString().replace('T', ' ').slice(0, 19)

    const url = buildDevoVideoUrl(devotional.date)
    const messageContent = (content && content.trim()) || url

    const message = db
      .insert(schema.messages)
      .values({
        content: messageContent,
        renderedPreview: messageContent,
        totalRecipients: 1,
        skippedCount: 0,
        status: 'scheduled',
        scheduledAt: scheduledAtUtc,
      })
      .returning()
      .get()

    db.insert(schema.messageRecipients)
      .values({
        messageId: message.id,
        personId: person.id,
        renderedContent: messageContent,
        status: 'pending',
      })
      .run()

    res.status(201).json({messageId: message.id, url, scheduledAt: scheduledAtUtc})
  }),
)

// DELETE /:id
gwendolynDevotionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const existing = db.select().from(table).where(eq(table.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    db.delete(table).where(eq(table.id, id)).run()
    res.json({success: true})
  }),
)
