import {and, asc, desc, eq, like, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'
import {buildQuoteContext, generateSermonSocial, normalizeTranscript} from '../services/sermon-social.js'

export const sermonsRouter = Router()

function speakerName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unknown'
}

function loadSermonRow(id: number) {
  return db
    .select({
      id: schema.sermons.id,
      serviceTimeId: schema.sermons.serviceTimeId,
      serviceTimeName: schema.serviceTimes.name,
      sermonDate: schema.sermons.sermonDate,
      speakerPersonId: schema.sermons.speakerPersonId,
      speakerFirstName: schema.people.firstName,
      speakerLastName: schema.people.lastName,
      title: schema.sermons.title,
      series: schema.sermons.series,
      bigIdea: schema.sermons.bigIdea,
      transcript: schema.sermons.transcript,
      generatedAt: schema.sermons.generatedAt,
      generationModel: schema.sermons.generationModel,
      generationDurationMs: schema.sermons.generationDurationMs,
      createdAt: schema.sermons.createdAt,
    })
    .from(schema.sermons)
    .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.sermons.serviceTimeId))
    .innerJoin(schema.people, eq(schema.people.id, schema.sermons.speakerPersonId))
    .where(eq(schema.sermons.id, id))
    .get()
}

// Wipe every generated artifact for a sermon. Re-upload and regenerate are both destructive by
// design — see docs/adr/0019 (replacing a transcript invalidates Social Quote offsets).
function clearGenerated(sermonId: number): void {
  db.delete(schema.sermonSocialQuotes).where(eq(schema.sermonSocialQuotes.sermonId, sermonId)).run()
  db.delete(schema.sermonReflections).where(eq(schema.sermonReflections.sermonId, sermonId)).run()
  db.delete(schema.sermonScriptures).where(eq(schema.sermonScriptures.sermonId, sermonId)).run()
}

async function runGeneration(sermonId: number, transcript: string): Promise<{skippedQuotes: number}> {
  const result = await generateSermonSocial(transcript)

  clearGenerated(sermonId)

  if (result.quotes.length > 0) {
    db.insert(schema.sermonSocialQuotes)
      .values(result.quotes.map((q) => ({...q, sermonId})))
      .run()
  }
  if (result.reflections.length > 0) {
    db.insert(schema.sermonReflections)
      .values(result.reflections.map((r) => ({...r, sermonId})))
      .run()
  }
  if (result.scriptures.length > 0) {
    db.insert(schema.sermonScriptures)
      .values(result.scriptures.map((s) => ({...s, sermonId})))
      .run()
  }

  db.update(schema.sermons)
    .set({
      bigIdea: result.bigIdea,
      generatedAt: sql`datetime('now')`,
      generationModel: result.model,
      generationDurationMs: result.durationMs,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(schema.sermons.id, sermonId))
    .run()

  return {skippedQuotes: result.skippedQuotes}
}

// GET / — sermon list with generated counts
sermonsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '25'))))
    const q = String(req.query.q ?? '').trim()
    const series = String(req.query.series ?? '').trim()

    const conditions = []
    if (q) conditions.push(like(schema.sermons.title, `%${q}%`))
    if (series) conditions.push(eq(schema.sermons.series, series))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const totalRow = db
      .select({count: sql<number>`count(*)`})
      .from(schema.sermons)
      .where(where)
      .get()

    const rows = db
      .select({
        id: schema.sermons.id,
        sermonDate: schema.sermons.sermonDate,
        title: schema.sermons.title,
        series: schema.sermons.series,
        bigIdea: schema.sermons.bigIdea,
        generatedAt: schema.sermons.generatedAt,
        serviceTimeName: schema.serviceTimes.name,
        speakerFirstName: schema.people.firstName,
        speakerLastName: schema.people.lastName,
        quoteCount: sql<number>`(SELECT count(*) FROM sermon_social_quotes WHERE sermon_id = ${schema.sermons.id})`,
        reflectionCount: sql<number>`(SELECT count(*) FROM sermon_reflections WHERE sermon_id = ${schema.sermons.id})`,
      })
      .from(schema.sermons)
      .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.sermons.serviceTimeId))
      .innerJoin(schema.people, eq(schema.people.id, schema.sermons.speakerPersonId))
      .where(where)
      .orderBy(desc(schema.sermons.sermonDate), desc(schema.sermons.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all()

    res.json({
      data: rows.map((r) => ({...r, speaker: speakerName(r.speakerFirstName, r.speakerLastName)})),
      total: totalRow?.count ?? 0,
      page,
      pageSize,
    })
  }),
)

// GET /series — distinct series names for the filter dropdown
sermonsRouter.get(
  '/series',
  asyncHandler(async (_req, res) => {
    const rows = db
      .selectDistinct({series: schema.sermons.series})
      .from(schema.sermons)
      .orderBy(asc(schema.sermons.series))
      .all()
    res.json(rows.map((r) => r.series).filter((s): s is string => !!s))
  }),
)

// POST / — create a sermon and generate its social content
sermonsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {serviceTimeId, sermonDate, speakerPersonId, title, series, transcript} = req.body as {
      serviceTimeId: number
      sermonDate: string
      speakerPersonId: number
      title?: string
      series?: string
      transcript: string
    }

    if (!serviceTimeId || !sermonDate || !speakerPersonId || !transcript?.trim()) {
      return void res
        .status(400)
        .json({error: 'serviceTimeId, sermonDate, speakerPersonId and transcript are required'})
    }

    const normalized = normalizeTranscript(transcript)

    let sermonId: number
    try {
      const inserted = db
        .insert(schema.sermons)
        .values({
          serviceTimeId,
          sermonDate,
          speakerPersonId,
          title: title?.trim() || null,
          series: series?.trim() || null,
          transcript: normalized,
        })
        .returning({id: schema.sermons.id})
        .get()
      sermonId = inserted!.id
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return void res.status(409).json({error: 'A sermon already exists for that service time and date'})
      }
      throw error
    }

    const {skippedQuotes} = await runGeneration(sermonId, normalized)
    res.status(201).json({id: sermonId, skippedQuotes})
  }),
)

// GET /:id — sermon plus everything generated from it
sermonsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const sermon = loadSermonRow(id)
    if (!sermon) return void res.status(404).json({error: 'Not found'})

    // Hearted first, then unused before used, then the model's Rank tier (high → low), then its
    // within-batch order. The preacher's pick always outranks the model's.
    const tierRank = (col: string) => sql`CASE ${sql.raw(col)} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`

    const quotes = db
      .select()
      .from(schema.sermonSocialQuotes)
      .where(eq(schema.sermonSocialQuotes.sermonId, id))
      .orderBy(
        desc(schema.sermonSocialQuotes.favorite),
        asc(schema.sermonSocialQuotes.used),
        tierRank('rank_tier'),
        asc(schema.sermonSocialQuotes.rankOrder),
      )
      .all()

    const reflections = db
      .select()
      .from(schema.sermonReflections)
      .where(eq(schema.sermonReflections.sermonId, id))
      .orderBy(
        desc(schema.sermonReflections.favorite),
        asc(schema.sermonReflections.used),
        tierRank('rank_tier'),
        asc(schema.sermonReflections.rankOrder),
      )
      .all()

    const scriptures = db
      .select()
      .from(schema.sermonScriptures)
      .where(eq(schema.sermonScriptures.sermonId, id))
      .orderBy(asc(schema.sermonScriptures.sortOrder))
      .all()

    const {speakerFirstName, speakerLastName, ...rest} = sermon
    res.json({
      ...rest,
      speaker: speakerName(speakerFirstName, speakerLastName),
      quotes,
      reflections,
      scriptures,
    })
  }),
)

// PATCH /:id — metadata only. Transcript changes go through POST /:id/transcript.
sermonsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const {serviceTimeId, sermonDate, speakerPersonId, title, series} = req.body as Record<string, unknown>

    const updates: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
    if (typeof serviceTimeId === 'number') updates.serviceTimeId = serviceTimeId
    if (typeof sermonDate === 'string') updates.sermonDate = sermonDate
    if (typeof speakerPersonId === 'number') updates.speakerPersonId = speakerPersonId
    if (title !== undefined) updates.title = String(title).trim() || null
    if (series !== undefined) updates.series = String(series).trim() || null

    try {
      db.update(schema.sermons).set(updates).where(eq(schema.sermons.id, id)).run()
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return void res.status(409).json({error: 'A sermon already exists for that service time and date'})
      }
      throw error
    }
    res.json({success: true})
  }),
)

// POST /:id/transcript — replace the transcript. Destructive: offsets no longer point anywhere, so
// every generated artifact is discarded and regenerated.
sermonsRouter.post(
  '/:id/transcript',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const {transcript} = req.body as {transcript: string}
    if (!transcript?.trim()) return void res.status(400).json({error: 'transcript is required'})

    const existing = db.select({id: schema.sermons.id}).from(schema.sermons).where(eq(schema.sermons.id, id)).get()
    if (!existing) return void res.status(404).json({error: 'Not found'})

    const normalized = normalizeTranscript(transcript)
    db.update(schema.sermons)
      .set({transcript: normalized, updatedAt: sql`datetime('now')`})
      .where(eq(schema.sermons.id, id))
      .run()

    const {skippedQuotes} = await runGeneration(id, normalized)
    res.json({success: true, skippedQuotes})
  }),
)

// POST /:id/regenerate — destructive re-run against the stored transcript
sermonsRouter.post(
  '/:id/regenerate',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const sermon = db
      .select({transcript: schema.sermons.transcript})
      .from(schema.sermons)
      .where(eq(schema.sermons.id, id))
      .get()
    if (!sermon) return void res.status(404).json({error: 'Not found'})

    const {skippedQuotes} = await runGeneration(id, sermon.transcript)
    res.json({success: true, skippedQuotes})
  }),
)

sermonsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    db.delete(schema.sermons).where(eq(schema.sermons.id, id)).run()
    res.json({success: true})
  }),
)

// GET /:id/quotes/:quoteId/context — Quote Context, derived from offsets, never stored
sermonsRouter.get(
  '/:id/quotes/:quoteId/context',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const quoteId = parseInt(String(req.params.quoteId))

    const sermon = db
      .select({transcript: schema.sermons.transcript})
      .from(schema.sermons)
      .where(eq(schema.sermons.id, id))
      .get()
    const quote = db.select().from(schema.sermonSocialQuotes).where(eq(schema.sermonSocialQuotes.id, quoteId)).get()

    if (!sermon || !quote || quote.sermonId !== id) return void res.status(404).json({error: 'Not found'})
    if (quote.startOffset === null || quote.endOffset === null) {
      return void res.json({available: false, before: '', quote: quote.verbatimText, after: ''})
    }

    res.json({available: true, ...buildQuoteContext(sermon.transcript, quote.startOffset, quote.endOffset)})
  }),
)

// PATCH /:id/quotes/:quoteId — edited_text and used. verbatim_text is never writable.
sermonsRouter.patch(
  '/:id/quotes/:quoteId',
  asyncHandler(async (req, res) => {
    const quoteId = parseInt(String(req.params.quoteId))
    const {editedText, used, favorite} = req.body as {
      editedText?: string | null
      used?: boolean
      favorite?: boolean
    }

    const updates: Record<string, unknown> = {}
    if (editedText !== undefined) updates.editedText = editedText === null ? null : String(editedText).trim() || null
    if (typeof used === 'boolean') updates.used = used
    if (typeof favorite === 'boolean') updates.favorite = favorite
    if (Object.keys(updates).length === 0) return void res.status(400).json({error: 'Nothing to update'})

    db.update(schema.sermonSocialQuotes).set(updates).where(eq(schema.sermonSocialQuotes.id, quoteId)).run()
    res.json({success: true})
  }),
)

// POST /:id/quotes/:quoteId/promote — copy a Social Quote into the sermon-prep Quote corpus.
// author is the speaker, so the existing /api/quotes/authors filter separates his own preaching
// from the Spurgeon / Bob Jones corpus for free.
sermonsRouter.post(
  '/:id/quotes/:quoteId/promote',
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id))
    const quoteId = parseInt(String(req.params.quoteId))

    const sermon = loadSermonRow(id)
    const quote = db.select().from(schema.sermonSocialQuotes).where(eq(schema.sermonSocialQuotes.id, quoteId)).get()
    if (!sermon || !quote || quote.sermonId !== id) return void res.status(404).json({error: 'Not found'})
    if (quote.promotedQuoteId) return void res.status(409).json({error: 'Already added to the quote corpus'})

    const author = speakerName(sermon.speakerFirstName, sermon.speakerLastName)
    const text = quote.editedText || quote.cleanedText
    const title = sermon.title || `${sermon.serviceTimeName} — ${sermon.sermonDate}`

    const inserted = db
      .insert(schema.quotes)
      .values({
        externalId: `sermon-${id}-quote-${quoteId}`,
        title,
        author,
        capturedBy: author,
        capturedAt: sermon.sermonDate,
        dateDisplay: sermon.sermonDate,
        summary: sermon.bigIdea || title,
        quoteText: text,
        tags: JSON.stringify(sermon.series ? ['sermon', sermon.series] : ['sermon']),
        source: 'sermon',
      })
      .returning({id: schema.quotes.id})
      .get()

    db.update(schema.sermonSocialQuotes)
      .set({promotedQuoteId: inserted!.id})
      .where(eq(schema.sermonSocialQuotes.id, quoteId))
      .run()

    res.status(201).json({quoteId: inserted!.id})
  }),
)

// PATCH /:id/reflections/:reflectionId — edited_body and used
sermonsRouter.patch(
  '/:id/reflections/:reflectionId',
  asyncHandler(async (req, res) => {
    const reflectionId = parseInt(String(req.params.reflectionId))
    const {editedBody, used, favorite} = req.body as {
      editedBody?: string | null
      used?: boolean
      favorite?: boolean
    }

    const updates: Record<string, unknown> = {}
    if (editedBody !== undefined) updates.editedBody = editedBody === null ? null : String(editedBody).trim() || null
    if (typeof used === 'boolean') updates.used = used
    if (typeof favorite === 'boolean') updates.favorite = favorite
    if (Object.keys(updates).length === 0) return void res.status(400).json({error: 'Nothing to update'})

    db.update(schema.sermonReflections).set(updates).where(eq(schema.sermonReflections.id, reflectionId)).run()
    res.json({success: true})
  }),
)
