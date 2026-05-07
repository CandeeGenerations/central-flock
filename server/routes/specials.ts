import {and, asc, desc, eq, inArray, like, or, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import path from 'path'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {uploadPath, uploadUrl, urlToDiskPath} from '../lib/uploads.js'
import {computeRepeatWarnings} from '../services/specials-repeat.js'
import {extractFromYoutube} from '../services/youtube-extract.js'

export const specialsRouter = Router()

type ServiceType = 'sunday_am' | 'sunday_pm' | 'wednesday_pm' | 'other'
type SpecialType = 'solo' | 'duet' | 'trio' | 'group' | 'instrumental' | 'other'
type SpecialStatus = 'will_perform' | 'needs_review' | 'performed'

const SHEET_MUSIC_DIR = uploadPath('special-music')

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function deriveStatusFromDate(date: string, prior?: SpecialStatus): SpecialStatus {
  if (date > todayIso()) return 'will_perform'
  // Past date: if we already had a status, keep it (e.g. performed stays performed); otherwise needs_review.
  return prior ?? 'needs_review'
}

function statusOrder() {
  // ORDER BY needs_review first, then will_perform, then performed; date desc within each.
  return sql`CASE ${schema.specialMusic.status}
    WHEN 'needs_review' THEN 0
    WHEN 'will_perform' THEN 1
    WHEN 'performed' THEN 2
    ELSE 3 END`
}

type SpecialRow = typeof schema.specialMusic.$inferSelect

function attachPerformers(rows: SpecialRow[]) {
  if (rows.length === 0) return rows.map((r) => ({...r, performers: [] as PerformerEntry[]}))
  const ids = rows.map((r) => r.id)
  const performerRows = db
    .select({
      specialMusicId: schema.specialMusicPerformers.specialMusicId,
      personId: schema.specialMusicPerformers.personId,
      ordering: schema.specialMusicPerformers.ordering,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.specialMusicPerformers)
    .innerJoin(schema.people, eq(schema.specialMusicPerformers.personId, schema.people.id))
    .where(inArray(schema.specialMusicPerformers.specialMusicId, ids))
    .orderBy(
      asc(schema.specialMusicPerformers.specialMusicId),
      asc(schema.specialMusicPerformers.ordering),
      asc(schema.people.lastName),
      asc(schema.people.firstName),
    )
    .all()
  const byId = new Map<number, PerformerEntry[]>()
  for (const p of performerRows) {
    const list = byId.get(p.specialMusicId) ?? []
    list.push({
      personId: p.personId,
      ordering: p.ordering,
      firstName: p.firstName,
      lastName: p.lastName,
    })
    byId.set(p.specialMusicId, list)
  }
  return rows.map((r) => ({...r, performers: byId.get(r.id) ?? []}))
}

type PerformerEntry = {
  personId: number
  ordering: number
  firstName: string | null
  lastName: string | null
}

// GET /api/specials
specialsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = parseList(req.query.status)
    const serviceType = parseList(req.query.serviceType)
    const type = parseList(req.query.type)
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    const whereClauses = [
      status.length > 0 ? inArray(schema.specialMusic.status, status as SpecialStatus[]) : undefined,
      serviceType.length > 0 ? inArray(schema.specialMusic.serviceType, serviceType as ServiceType[]) : undefined,
      type.length > 0 ? inArray(schema.specialMusic.type, type as SpecialType[]) : undefined,
      q ? like(schema.specialMusic.songTitle, `%${q}%`) : undefined,
    ].filter(Boolean)

    let rows = db
      .select()
      .from(schema.specialMusic)
      .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
      .orderBy(statusOrder(), desc(schema.specialMusic.date))
      .all()

    // If there's a query, also include matches by performer name (post-filter).
    if (q) {
      const lq = q.toLowerCase()
      const matchedByPerformerIds = db
        .select({specialMusicId: schema.specialMusicPerformers.specialMusicId})
        .from(schema.specialMusicPerformers)
        .innerJoin(schema.people, eq(schema.specialMusicPerformers.personId, schema.people.id))
        .where(or(like(schema.people.firstName, `%${q}%`), like(schema.people.lastName, `%${q}%`)))
        .all()
      const performerHitIds = new Set(matchedByPerformerIds.map((r) => r.specialMusicId))
      const guestHits = db
        .select({id: schema.specialMusic.id, guestPerformers: schema.specialMusic.guestPerformers})
        .from(schema.specialMusic)
        .all()
        .filter((r) => {
          try {
            const arr = JSON.parse(r.guestPerformers) as unknown
            return Array.isArray(arr) && arr.some((n) => typeof n === 'string' && n.toLowerCase().includes(lq))
          } catch {
            return false
          }
        })
        .map((r) => r.id)

      const extraIds = new Set([...performerHitIds, ...guestHits])
      // Merge: existing rows already match song_title; add any extra by id.
      const existingIds = new Set(rows.map((r) => r.id))
      const missing = [...extraIds].filter((id) => !existingIds.has(id))
      if (missing.length > 0) {
        const extra = db
          .select()
          .from(schema.specialMusic)
          .where(
            and(
              inArray(schema.specialMusic.id, missing),
              status.length > 0 ? inArray(schema.specialMusic.status, status as SpecialStatus[]) : undefined,
              serviceType.length > 0
                ? inArray(schema.specialMusic.serviceType, serviceType as ServiceType[])
                : undefined,
              type.length > 0 ? inArray(schema.specialMusic.type, type as SpecialType[]) : undefined,
            ),
          )
          .all()
        rows = [...rows, ...extra]
      }
    }

    res.json(attachPerformers(rows))
  }),
)

// GET /api/specials/:id
specialsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const row = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()
    if (!row) {
      res.status(404).json({error: 'Special not found'})
      return
    }
    const [withPerf] = attachPerformers([row])
    let hymn: typeof schema.hymns.$inferSelect | null = null
    if (row.hymnId != null) {
      hymn = db.select().from(schema.hymns).where(eq(schema.hymns.id, row.hymnId)).get() ?? null
    }
    res.json({...withPerf, hymn})
  }),
)

type CreateBody = {
  date: string
  serviceType: ServiceType
  serviceLabel?: string | null
  songTitle: string
  hymnId?: number | null
  songArranger?: string | null
  songWriter?: string | null
  type: SpecialType
  occasion?: string | null
  performerIds?: number[]
  guestPerformers?: string[]
  youtubeUrl?: string | null
  notes?: string | null
}

function validateCreate(body: unknown): CreateBody | string {
  if (!body || typeof body !== 'object') return 'Body required'
  const b = body as Record<string, unknown>
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return 'date must be YYYY-MM-DD'
  if (typeof b.serviceType !== 'string') return 'serviceType required'
  if (!['sunday_am', 'sunday_pm', 'wednesday_pm', 'other'].includes(b.serviceType)) return 'invalid serviceType'
  if (typeof b.songTitle !== 'string' || !b.songTitle.trim()) return 'songTitle required'
  if (typeof b.type !== 'string') return 'type required'
  if (!['solo', 'duet', 'trio', 'group', 'instrumental', 'other'].includes(b.type)) return 'invalid type'
  return b as CreateBody
}

// POST /api/specials
specialsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = validateCreate(req.body)
    if (typeof parsed === 'string') {
      res.status(400).json({error: parsed})
      return
    }
    const status = deriveStatusFromDate(parsed.date)
    const guests = parsed.guestPerformers ?? []
    const inserted = db
      .insert(schema.specialMusic)
      .values({
        date: parsed.date,
        serviceType: parsed.serviceType,
        serviceLabel: parsed.serviceLabel ?? null,
        songTitle: parsed.songTitle,
        hymnId: parsed.hymnId ?? null,
        songArranger: parsed.songArranger ?? null,
        songWriter: parsed.songWriter ?? null,
        type: parsed.type,
        status,
        occasion: parsed.occasion ?? null,
        guestPerformers: JSON.stringify(guests),
        youtubeUrl: parsed.youtubeUrl ?? null,
        notes: parsed.notes ?? null,
      })
      .returning()
      .get()

    if (parsed.performerIds && parsed.performerIds.length > 0) {
      db.insert(schema.specialMusicPerformers)
        .values(
          parsed.performerIds.map((pid, idx) => ({
            specialMusicId: inserted.id,
            personId: pid,
            ordering: idx,
          })),
        )
        .run()
    }

    const [withPerf] = attachPerformers([inserted])
    res.status(201).json(withPerf)
  }),
)

// PATCH /api/specials/:id
specialsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Special not found'})
      return
    }

    const b = (req.body ?? {}) as Record<string, unknown>
    const updates: Partial<typeof schema.specialMusic.$inferInsert> = {}

    if (typeof b.date === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
        res.status(400).json({error: 'date must be YYYY-MM-DD'})
        return
      }
      updates.date = b.date
      // If the new date is in the future, force will_perform regardless of prior status.
      if (b.date > todayIso()) updates.status = 'will_perform'
    }
    if (typeof b.serviceType === 'string') updates.serviceType = b.serviceType as ServiceType
    if ('serviceLabel' in b) updates.serviceLabel = (b.serviceLabel as string | null) ?? null
    if (typeof b.songTitle === 'string') updates.songTitle = b.songTitle
    if ('hymnId' in b) updates.hymnId = (b.hymnId as number | null) ?? null
    if ('songArranger' in b) updates.songArranger = (b.songArranger as string | null) ?? null
    if ('songWriter' in b) updates.songWriter = (b.songWriter as string | null) ?? null
    if (typeof b.type === 'string') updates.type = b.type as SpecialType
    if (typeof b.status === 'string') updates.status = b.status as SpecialStatus
    if ('occasion' in b) updates.occasion = (b.occasion as string | null) ?? null
    if (Array.isArray(b.guestPerformers)) updates.guestPerformers = JSON.stringify(b.guestPerformers)
    if ('youtubeUrl' in b) updates.youtubeUrl = (b.youtubeUrl as string | null) ?? null
    if ('notes' in b) updates.notes = (b.notes as string | null) ?? null

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = sql`(datetime('now'))` as unknown as string
      db.update(schema.specialMusic).set(updates).where(eq(schema.specialMusic.id, id)).run()
    }

    if (Array.isArray(b.performerIds)) {
      const ids = b.performerIds as unknown[]
      const cleanIds = ids.filter((x): x is number => typeof x === 'number')
      db.delete(schema.specialMusicPerformers).where(eq(schema.specialMusicPerformers.specialMusicId, id)).run()
      if (cleanIds.length > 0) {
        db.insert(schema.specialMusicPerformers)
          .values(
            cleanIds.map((pid, idx) => ({
              specialMusicId: id,
              personId: pid,
              ordering: idx,
            })),
          )
          .run()
      }
    }

    const refreshed = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()!
    const [withPerf] = attachPerformers([refreshed])
    res.json(withPerf)
  }),
)

// POST /api/specials/:id/mark-reviewed
specialsRouter.post(
  '/:id/mark-reviewed',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Special not found'})
      return
    }
    if (existing.status !== 'needs_review') {
      res.status(409).json({error: `Cannot mark reviewed from status '${existing.status}'`})
      return
    }
    db.update(schema.specialMusic)
      .set({status: 'performed', updatedAt: sql`(datetime('now'))`})
      .where(eq(schema.specialMusic.id, id))
      .run()
    const refreshed = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()!
    const [withPerf] = attachPerformers([refreshed])
    res.json(withPerf)
  }),
)

// DELETE /api/specials/:id
specialsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Special not found'})
      return
    }
    // Drop the sheet music file from disk if present.
    if (existing.sheetMusicPath) {
      try {
        fs.unlinkSync(urlToDiskPath(existing.sheetMusicPath))
      } catch {
        /* ignore */
      }
    }
    db.delete(schema.specialMusic).where(eq(schema.specialMusic.id, id)).run()
    res.json({success: true})
  }),
)

// POST /api/specials/:id/sheet-music
specialsRouter.post(
  '/:id/sheet-music',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Special not found'})
      return
    }
    const {fileName, fileData} = (req.body ?? {}) as {fileName?: string; fileData?: string}
    if (!fileName || !fileData) {
      res.status(400).json({error: 'fileName and fileData are required'})
      return
    }
    // Drop existing file if any.
    if (existing.sheetMusicPath) {
      try {
        fs.unlinkSync(urlToDiskPath(existing.sheetMusicPath))
      } catch {
        /* ignore */
      }
    }
    fs.mkdirSync(SHEET_MUSIC_DIR, {recursive: true})
    const ext = path.extname(fileName) || ''
    const safeStem = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]+/g, '_')
    const finalName = `${id}-${Date.now()}-${safeStem}${ext}`
    const fullPath = path.join(SHEET_MUSIC_DIR, finalName)
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData
    fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'))
    const url = uploadUrl('special-music', finalName)
    db.update(schema.specialMusic)
      .set({sheetMusicPath: url, updatedAt: sql`(datetime('now'))`})
      .where(eq(schema.specialMusic.id, id))
      .run()
    res.json({sheetMusicPath: url})
  }),
)

// DELETE /api/specials/:id/sheet-music
specialsRouter.delete(
  '/:id/sheet-music',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db.select().from(schema.specialMusic).where(eq(schema.specialMusic.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Special not found'})
      return
    }
    if (existing.sheetMusicPath) {
      try {
        fs.unlinkSync(urlToDiskPath(existing.sheetMusicPath))
      } catch {
        /* ignore */
      }
    }
    db.update(schema.specialMusic)
      .set({sheetMusicPath: null, updatedAt: sql`(datetime('now'))`})
      .where(eq(schema.specialMusic.id, id))
      .run()
    res.json({success: true})
  }),
)

// POST /api/specials/from-youtube — pure extraction; does not write to DB
specialsRouter.post(
  '/from-youtube',
  asyncHandler(async (req, res) => {
    const {url} = (req.body ?? {}) as {url?: string}
    if (!url || typeof url !== 'string') {
      res.status(400).json({error: 'url is required'})
      return
    }
    try {
      const result = await extractFromYoutube(url)
      res.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed'
      res.status(400).json({error: msg})
    }
  }),
)

// GET /api/specials/repeat-warnings
specialsRouter.get(
  '/repeat-warnings/check',
  asyncHandler(async (req, res) => {
    const songTitle = typeof req.query.songTitle === 'string' ? req.query.songTitle : undefined
    const hymnIdRaw = req.query.hymnId
    const hymnId = typeof hymnIdRaw === 'string' && hymnIdRaw ? Number(hymnIdRaw) : null
    const performerIds = parseList(req.query.performerIds).map(Number).filter(Number.isFinite) as number[]
    const excludeRaw = req.query.excludeSpecialId
    const excludeSpecialId = typeof excludeRaw === 'string' && excludeRaw ? Number(excludeRaw) : undefined
    const result = computeRepeatWarnings({songTitle, hymnId, performerIds, excludeSpecialId})
    res.json(result)
  }),
)

// GET /api/specials/by-person/:personId — used for the Person detail cross-link
specialsRouter.get(
  '/by-person/:personId',
  asyncHandler(async (req, res) => {
    const personId = Number(req.params.personId)
    const ids = db
      .select({id: schema.specialMusicPerformers.specialMusicId})
      .from(schema.specialMusicPerformers)
      .where(eq(schema.specialMusicPerformers.personId, personId))
      .all()
      .map((r) => r.id)
    if (ids.length === 0) {
      res.json([])
      return
    }
    const rows = db
      .select()
      .from(schema.specialMusic)
      .where(inArray(schema.specialMusic.id, ids))
      .orderBy(desc(schema.specialMusic.date))
      .all()
    res.json(attachPerformers(rows))
  }),
)

// GET /api/specials/by-hymn/:hymnId — used for the Hymn detail cross-link
specialsRouter.get(
  '/by-hymn/:hymnId',
  asyncHandler(async (req, res) => {
    const hymnId = Number(req.params.hymnId)
    const rows = db
      .select()
      .from(schema.specialMusic)
      .where(eq(schema.specialMusic.hymnId, hymnId))
      .orderBy(desc(schema.specialMusic.date))
      .all()
    res.json(attachPerformers(rows))
  }),
)

function parseList(value: unknown): string[] {
  if (typeof value === 'string') return value.split(',').filter(Boolean)
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return []
}
