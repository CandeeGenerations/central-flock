import {sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {extractCitedAuthor} from '../services/quote-parser.js'

export const quotesWebhookRouter = Router()

interface WebhookBody {
  externalId: string
  title?: string
  author?: string
  dateCaptured?: string
  summary: string
  quoteText: string
  tags?: string[] | string
}

function parseHashtags(tags: string[] | string | undefined): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean)
  // Space-separated hashtag string: "#Joy #Suffering #Lawrence Bowman"
  return tags
    .split(/ (?=#)/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
}

// POST /webhooks/quotes — ingest a quote from cgen-api (upsert by externalId)
quotesWebhookRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<WebhookBody>

    // Validate required fields
    if (!body.externalId || !body.summary || !body.quoteText) {
      res.status(400).json({error: 'Missing required fields: externalId, summary, quoteText'})
      return
    }

    const resolvedAuthor = extractCitedAuthor(body.quoteText) ?? body.author ?? 'Unknown'
    const capturedBy = body.author ?? resolvedAuthor
    const dateDisplay = body.dateCaptured ?? ''
    const title = body.title ?? `${resolvedAuthor}${dateDisplay ? ` · ${dateDisplay}` : ''}`

    // Attempt ISO parse of dateCaptured
    let capturedAt = dateDisplay
    if (dateDisplay) {
      const d = new Date(dateDisplay.replace(' at ', ' '))
      if (!isNaN(d.getTime())) capturedAt = d.toISOString()
    }

    const existing = db
      .select({id: schema.quotes.id})
      .from(schema.quotes)
      .where(sql`${schema.quotes.externalId} = ${body.externalId}`)
      .get()

    const tags = JSON.stringify(parseHashtags(body.tags))

    const result = db
      .insert(schema.quotes)
      .values({
        externalId: body.externalId,
        title,
        author: resolvedAuthor,
        capturedBy,
        capturedAt,
        dateDisplay,
        summary: body.summary,
        quoteText: body.quoteText,
        tags,
        source: 'n8n',
      })
      .onConflictDoUpdate({
        target: schema.quotes.externalId,
        set: {
          title,
          author: resolvedAuthor,
          capturedBy,
          capturedAt,
          dateDisplay,
          summary: body.summary,
          quoteText: body.quoteText,
          tags,
          updatedAt: sql`datetime('now')`,
        },
      })
      .returning({id: schema.quotes.id})
      .get()

    res.json({ok: true, id: result!.id, created: !existing})
  }),
)
