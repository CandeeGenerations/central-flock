import Anthropic from '@anthropic-ai/sdk'
import {Router} from 'express'

import {quotesDb, quotesSchema, quotesSqlite} from '../db-quotes/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {extractCitedAuthor} from '../services/quote-parser.js'
import {rehydrateSearch, runQuoteResearch} from '../services/quote-research.js'

const anthropic = new Anthropic()

export const quotesRouter = Router()

// GET /api/quotes/authors — distinct author list for filter dropdown
quotesRouter.get(
  '/authors',
  asyncHandler(async (_req, res) => {
    const rows = quotesSqlite.prepare(`SELECT DISTINCT author FROM quotes ORDER BY author ASC`).all() as {
      author: string
    }[]
    res.json(rows.map((r) => r.author))
  }),
)

// GET /api/quotes/searches — paginated recent searches
quotesRouter.get(
  '/searches',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'))))
    const q = String(req.query.q ?? '').trim()
    const offset = (page - 1) * pageSize

    let whereClause = ''
    const params: unknown[] = []
    if (q) {
      whereClause = `WHERE topic LIKE ?`
      params.push(`%${q}%`)
    }

    const countRow = quotesSqlite
      .prepare(`SELECT COUNT(*) AS count FROM quote_searches ${whereClause}`)
      .get(...params) as {count: number}

    const rows = quotesSqlite
      .prepare(
        `SELECT id, topic, created_at AS createdAt, model, json_array_length(results) AS resultCount
         FROM quote_searches ${whereClause}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as {
      id: number
      topic: string
      createdAt: string
      model: string
      resultCount: number
    }[]

    res.json({
      searches: rows,
      total: countRow.count,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.count / pageSize),
    })
  }),
)

// GET /api/quotes/searches/:id — single search detail (rehydrated)
quotesRouter.get(
  '/searches/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) {
      res.status(400).json({error: 'Invalid id'})
      return
    }

    const row = quotesSqlite
      .prepare(`SELECT id, topic, synthesis, results, model, created_at AS createdAt FROM quote_searches WHERE id = ?`)
      .get(id) as
      | {
          id: number
          topic: string
          synthesis: string
          results: string
          model: string
          createdAt: string
        }
      | undefined

    if (!row) {
      res.status(404).json({error: 'Search not found'})
      return
    }

    res.json(rehydrateSearch(row))
  }),
)

// POST /api/quotes/research — run AI topic research
quotesRouter.post(
  '/research',
  asyncHandler(async (req, res) => {
    const {topic} = req.body as {topic?: string}
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      res.status(400).json({error: 'topic is required'})
      return
    }

    const result = await runQuoteResearch(topic.trim())
    res.json(result)
  }),
)

// POST /api/quotes/ai-tags — generate summary + tags for a quote via AI
quotesRouter.post(
  '/ai-tags',
  asyncHandler(async (req, res) => {
    const {quoteText} = req.body as {quoteText?: string}
    if (!quoteText || typeof quoteText !== 'string' || !quoteText.trim()) {
      res.status(400).json({error: 'quoteText is required'})
      return
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Here is a quote:\n\n${quoteText.trim()}\n\nRespond with ONLY a JSON object (no markdown, no backticks, no explanation) with these two fields:\n- "summary": Summarize this quote in 1-2 sentences without including words such as "This passage describes". Just include the summary.\n- "hashtags": A space-separated string of relevant hashtags (each starting with #) based on the content so it can be quickly searched by topic, theme, and application. Example format: #Faith #Suffering #Hope #ChristianLiving`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    // Strip markdown code fences if the model wraps its response (e.g. ```json ... ```)
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    let parsed: {summary: string; hashtags: string}
    try {
      parsed = JSON.parse(cleaned) as {summary: string; hashtags: string}
    } catch {
      res.status(500).json({error: 'AI returned invalid JSON', raw})
      return
    }

    // Parse space-separated "#Tag #Multi Word Tag" into ["Tag", "Multi Word Tag"]
    // Split on occurrences of " #" (space then hash), handle the leading # on the first token
    const hashtagsStr = String(parsed.hashtags ?? '')
    const tags = hashtagsStr
      .split(/ (?=#)/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean)

    res.json({summary: parsed.summary ?? '', tags})
  }),
)

// GET /api/quotes — paginated list with search + filters
quotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'))))
    const q = String(req.query.q ?? '').trim()
    const author = String(req.query.author ?? '').trim()
    const dateFrom = String(req.query.dateFrom ?? '').trim()
    const dateTo = String(req.query.dateTo ?? '').trim()
    const sortField = String(req.query.sort ?? 'capturedAt')
    const sortDir = String(req.query.dir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const params: unknown[] = []

    if (q) {
      // Use FTS if available, else LIKE fallback
      try {
        const ftsQuery = q.split(/\s+/).filter(Boolean).join(' OR ')
        const ftsIds = (
          quotesSqlite.prepare(`SELECT rowid FROM quotes_fts WHERE quotes_fts MATCH ? LIMIT 1000`).all(ftsQuery) as {
            rowid: number
          }[]
        ).map((r) => r.rowid)
        if (ftsIds.length > 0) {
          conditions.push(`id IN (${ftsIds.map(() => '?').join(',')})`)
          params.push(...ftsIds)
        } else {
          // No FTS hits — force empty result
          conditions.push('1=0')
        }
      } catch {
        conditions.push(`(title LIKE ? OR author LIKE ? OR summary LIKE ? OR quote_text LIKE ?)`)
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
      }
    }

    if (author) {
      conditions.push(`author = ?`)
      params.push(author)
    }
    if (dateFrom) {
      conditions.push(`captured_at >= ?`)
      params.push(dateFrom)
    }
    if (dateTo) {
      conditions.push(`captured_at <= ?`)
      params.push(dateTo + 'T23:59:59')
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const allowedSort: Record<string, string> = {
      title: 'title',
      author: 'author',
      capturedAt: 'captured_at',
      dateDisplay: 'date_display',
      createdAt: 'created_at',
    }
    const orderCol = allowedSort[sortField] ?? 'captured_at'
    const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC'

    const countRow = quotesSqlite.prepare(`SELECT COUNT(*) AS count FROM quotes ${whereClause}`).get(...params) as {
      count: number
    }

    const rows = quotesSqlite
      .prepare(
        `SELECT id, external_id AS externalId, title, author, captured_by AS capturedBy,
                captured_at AS capturedAt, date_display AS dateDisplay, summary,
                quote_text AS quoteText, tags, source, created_at AS createdAt, updated_at AS updatedAt
         FROM quotes ${whereClause}
         ORDER BY ${orderCol} ${orderDir}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[]

    const quotes = rows.map((r) => ({...r, tags: JSON.parse(r.tags as string) as string[]}))

    res.json({
      quotes,
      total: countRow.count,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.count / pageSize),
    })
  }),
)

// GET /api/quotes/:id — single quote detail
quotesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) {
      res.status(400).json({error: 'Invalid id'})
      return
    }

    const row = quotesSqlite
      .prepare(
        `SELECT id, external_id AS externalId, title, author, captured_by AS capturedBy,
                captured_at AS capturedAt, date_display AS dateDisplay, summary,
                quote_text AS quoteText, tags, source, created_at AS createdAt, updated_at AS updatedAt
         FROM quotes WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined

    if (!row) {
      res.status(404).json({error: 'Quote not found'})
      return
    }

    res.json({...row, tags: JSON.parse(row.tags as string) as string[]})
  }),
)

// POST /api/quotes — manual create
quotesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as {
      title?: string
      author?: string
      capturedBy?: string
      dateDisplay?: string
      summary?: string
      quoteText?: string
      tags?: string[]
    }

    if (!body.title || !body.summary || !body.quoteText) {
      res.status(400).json({error: 'title, summary, and quoteText are required'})
      return
    }

    // Resolve author: cited author from ◇ line takes priority
    const citedAuthor = extractCitedAuthor(body.quoteText)
    const author = citedAuthor ?? body.author ?? 'Unknown'
    const capturedBy = body.capturedBy ?? body.author ?? 'Tyler Candee'
    const dateDisplay =
      body.dateDisplay ?? new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
    const capturedAt = new Date().toISOString()

    // Generate a unique externalId for manual quotes
    const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const result = quotesDb
      .insert(quotesSchema.quotes)
      .values({
        externalId,
        title: body.title,
        author,
        capturedBy,
        capturedAt,
        dateDisplay,
        summary: body.summary,
        quoteText: body.quoteText,
        tags: JSON.stringify(body.tags ?? []),
        source: 'manual',
      })
      .returning({id: quotesSchema.quotes.id})
      .get()

    res.status(201).json({id: result!.id})
  }),
)

// PATCH /api/quotes/:id — edit an existing quote
quotesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) {
      res.status(400).json({error: 'Invalid id'})
      return
    }

    const body = req.body as {
      title?: string
      author?: string
      capturedBy?: string
      dateDisplay?: string
      summary?: string
      quoteText?: string
      tags?: string[]
    }

    const existing = quotesSqlite.prepare(`SELECT id FROM quotes WHERE id = ?`).get(id)
    if (!existing) {
      res.status(404).json({error: 'Quote not found'})
      return
    }

    const updates: string[] = []
    const params: unknown[] = []

    if (body.title !== undefined) {
      updates.push('title = ?')
      params.push(body.title)
    }
    if (body.author !== undefined) {
      updates.push('author = ?')
      params.push(body.author)
    }
    if (body.capturedBy !== undefined) {
      updates.push('captured_by = ?')
      params.push(body.capturedBy)
    }
    if (body.dateDisplay !== undefined) {
      updates.push('date_display = ?')
      params.push(body.dateDisplay)
    }
    if (body.summary !== undefined) {
      updates.push('summary = ?')
      params.push(body.summary)
    }
    if (body.quoteText !== undefined) {
      updates.push('quote_text = ?')
      params.push(body.quoteText)
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?')
      params.push(JSON.stringify(body.tags))
    }

    if (updates.length === 0) {
      res.status(400).json({error: 'No fields to update'})
      return
    }

    updates.push(`updated_at = datetime('now')`)
    params.push(id)

    quotesSqlite.prepare(`UPDATE quotes SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    res.json({ok: true})
  }),
)

// DELETE /api/quotes/:id — delete a quote
quotesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) {
      res.status(400).json({error: 'Invalid id'})
      return
    }

    const result = quotesSqlite.prepare(`DELETE FROM quotes WHERE id = ?`).run(id)
    if (result.changes === 0) {
      res.status(404).json({error: 'Quote not found'})
      return
    }

    res.json({ok: true})
  }),
)
