import {Router} from 'express'

import {sqlite} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {type HymnalFilter, rehydrateHymnSearch, runHymnSuggestion} from '../services/hymn-suggestion.js'

export const hymnsRouter = Router()

// GET /api/hymns/searches — paginated saved searches
hymnsRouter.get(
  '/searches',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'))))
    const q = String(req.query.q ?? '').trim()
    const offset = (page - 1) * pageSize

    let whereClause = ''
    const params: unknown[] = []
    if (q) {
      whereClause = `WHERE title LIKE ? OR theme LIKE ?`
      params.push(`%${q}%`, `%${q}%`)
    }

    const countRow = sqlite.prepare(`SELECT COUNT(*) AS count FROM hymn_searches ${whereClause}`).get(...params) as {
      count: number
    }

    const rows = sqlite
      .prepare(
        `SELECT id, title, theme, hymnal_filter AS hymnalFilter, model, duration_ms AS durationMs,
                candidate_count AS candidateCount, created_at AS createdAt
         FROM hymn_searches ${whereClause}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as {
      id: number
      title: string
      theme: string
      hymnalFilter: HymnalFilter
      model: string
      durationMs: number
      candidateCount: number
      createdAt: string
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

// GET /api/hymns/searches/:id — single search detail (rehydrated)
hymnsRouter.get(
  '/searches/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) {
      res.status(400).json({error: 'Invalid id'})
      return
    }

    const row = sqlite
      .prepare(
        `SELECT id, title, scripture_text AS scriptureText, theme, audience,
                hymnal_filter AS hymnalFilter, sections, model,
                candidate_count AS candidateCount, duration_ms AS durationMs,
                created_at AS createdAt
         FROM hymn_searches WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number
          title: string
          scriptureText: string
          theme: string
          audience: string
          hymnalFilter: HymnalFilter
          sections: string
          model: string
          candidateCount: number
          durationMs: number
          createdAt: string | null
        }
      | undefined

    if (!row) {
      res.status(404).json({error: 'Search not found'})
      return
    }

    res.json(rehydrateHymnSearch(row))
  }),
)

// DELETE /api/hymns/searches/:id — remove a saved search
hymnsRouter.delete(
  '/searches/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    if (isNaN(id)) {
      res.status(400).json({error: 'Invalid id'})
      return
    }
    const result = sqlite.prepare(`DELETE FROM hymn_searches WHERE id = ?`).run(id)
    if (result.changes === 0) {
      res.status(404).json({error: 'Search not found'})
      return
    }
    res.json({ok: true})
  }),
)

// POST /api/hymns/suggest — run AI hymn suggestion for a sermon
hymnsRouter.post(
  '/suggest',
  asyncHandler(async (req, res) => {
    const body = req.body as {
      title?: string
      scriptureText?: string
      theme?: string
      audience?: string
      hymnalFilter?: HymnalFilter
    }

    const title = body.title?.trim()
    const scriptureText = body.scriptureText?.trim()
    const theme = body.theme?.trim()
    const audience = body.audience?.trim()

    if (!title || !scriptureText || !theme || !audience) {
      res.status(400).json({error: 'title, scriptureText, theme, and audience are all required'})
      return
    }

    const hymnalFilter = body.hymnalFilter ?? 'both'
    if (hymnalFilter !== 'burgundy' && hymnalFilter !== 'silver' && hymnalFilter !== 'both') {
      res.status(400).json({error: 'hymnalFilter must be burgundy, silver, or both'})
      return
    }

    const result = await runHymnSuggestion({title, scriptureText, theme, audience, hymnalFilter})
    res.json(result)
  }),
)

// GET /api/hymns — paginated list of hymns (for browse/debug)
hymnsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'))))
    const q = String(req.query.q ?? '').trim()
    const book = String(req.query.book ?? '').trim()
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const params: unknown[] = []
    if (q) {
      conditions.push(`(title LIKE ? OR first_line LIKE ?)`)
      params.push(`%${q}%`, `%${q}%`)
    }
    if (book === 'burgundy' || book === 'silver') {
      conditions.push(`book = ?`)
      params.push(book)
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = sqlite.prepare(`SELECT COUNT(*) AS count FROM hymns ${whereClause}`).get(...params) as {
      count: number
    }

    const rows = sqlite
      .prepare(
        `SELECT id, book, number, title, first_line AS firstLine, refrain_line AS refrainLine,
                author, composer, tune, meter, topics, scripture_refs AS scriptureRefs, notes
         FROM hymns ${whereClause}
         ORDER BY book ASC, number ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[]

    const hymns = rows.map((r) => ({
      ...r,
      topics: JSON.parse(String(r.topics ?? '[]')) as string[],
      scriptureRefs: JSON.parse(String(r.scriptureRefs ?? '[]')) as string[],
    }))

    res.json({
      hymns,
      total: countRow.count,
      page,
      pageSize,
      totalPages: Math.ceil(countRow.count / pageSize),
    })
  }),
)
