import {and, asc, desc, eq, like, or, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'
import * as XLSX from 'xlsx'

import {devotionsDb, devotionsSchema} from '../db-devotions/index.js'
import {parseReference, referenceKeys} from '../lib/bible-reference.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'
import {importDevotions, parseSheetRows} from '../services/devotion-import.js'
import {parseDevotionImage} from '../services/devotion-ocr.js'

const __devotionsDir = path.dirname(fileURLToPath(import.meta.url))
const SCAN_IMAGES_DIR = path.join(__devotionsDir, '..', '..', 'data', 'scan-images')

export const devotionsRouter = Router()

export function cleanupOrphanedScanImages(): {deleted: number; kept: number} {
  if (!fs.existsSync(SCAN_IMAGES_DIR)) return {deleted: 0, kept: 0}

  const files = fs.readdirSync(SCAN_IMAGES_DIR)
  const drafts = devotionsDb
    .select({imagePath: devotionsSchema.scanDrafts.imagePath})
    .from(devotionsSchema.scanDrafts)
    .all()

  const activePaths = new Set(drafts.map((d) => d.imagePath).filter(Boolean))

  let deleted = 0
  let kept = 0
  for (const file of files) {
    const relativePath = `/data/scan-images/${file}`
    if (activePaths.has(relativePath)) {
      kept++
    } else {
      try {
        fs.unlinkSync(path.join(SCAN_IMAGES_DIR, file))
        deleted++
      } catch {
        /* ignore */
      }
    }
  }

  if (deleted > 0) console.log(`Cleaned up ${deleted} orphaned scan image(s)`)
  return {deleted, kept}
}

const TOGGLE_FIELDS = ['produced', 'rendered', 'youtube', 'facebookInstagram', 'podcast'] as const
type ToggleField = (typeof TOGGLE_FIELDS)[number]

// GET /api/devotions/audit - Data quality report
devotionsRouter.get(
  '/audit',
  asyncHandler(async (_req, res) => {
    const all = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .orderBy(asc(devotionsSchema.devotions.number))
      .all()

    const numbers = new Set(all.map((d) => d.number))
    const minNum = all.length > 0 ? all[0].number : 0
    const maxNum = all.length > 0 ? all[all.length - 1].number : 0

    // Missing numbers in sequence
    const knownMissing = new Set([644, 645])
    const missingNumbers: number[] = []
    for (let i = 1; i <= maxNum; i++) {
      if (!numbers.has(i) && !knownMissing.has(i)) missingNumbers.push(i)
    }

    // Date gaps
    const dates = all.map((d) => d.date).sort()
    const missingDates: {after: string; before: string; days: number}[] = []
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T12:00:00')
      const curr = new Date(dates[i] + 'T12:00:00')
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays > 1) {
        missingDates.push({after: dates[i - 1], before: dates[i], days: diffDays - 1})
      }
    }

    // Duplicate dates
    const dateCounts = new Map<string, {id: number; number: number}[]>()
    for (const d of all) {
      if (!dateCounts.has(d.date)) dateCounts.set(d.date, [])
      dateCounts.get(d.date)!.push({id: d.id, number: d.number})
    }
    const duplicateDates = [...dateCounts.entries()]
      .filter(([, devos]) => devos.length > 1)
      .map(([date, devotions]) => ({date, devotions}))

    // Missing bible reference (exclude future empty ones)
    const today = new Date().toISOString().slice(0, 10)
    const noReference = all
      .filter((d) => !d.bibleReference && d.date <= today)
      .map((d) => ({
        id: d.id,
        number: d.number,
        date: d.date,
        devotionType: d.devotionType,
        guestSpeaker: d.guestSpeaker,
      }))

    // Guest devotions missing guest number
    const guestsNoNumber = all
      .filter((d) => d.devotionType === 'guest' && d.guestNumber == null)
      .map((d) => ({id: d.id, number: d.number, date: d.date, guestSpeaker: d.guestSpeaker}))

    // Guest devotions missing speaker
    const guestsNoSpeaker = all
      .filter((d) => d.devotionType === 'guest' && !d.guestSpeaker)
      .map((d) => ({id: d.id, number: d.number, date: d.date}))

    // Guest number sequence gaps per speaker
    const speakerGaps: {speaker: string; missing: number[]; duplicates: number[]; range: string}[] = []
    for (const speaker of ['Tyler', 'Gabe', 'Ed']) {
      const speakerDevos = all
        .filter((d) => d.guestSpeaker === speaker && d.guestNumber != null)
        .sort((a, b) => a.guestNumber! - b.guestNumber!)

      if (speakerDevos.length === 0) continue

      const nums = speakerDevos.map((d) => d.guestNumber!)
      const min = nums[0]
      const max = nums[nums.length - 1]
      const numSet = new Set(nums)
      const missing: number[] = []
      for (let i = min; i <= max; i++) {
        if (!numSet.has(i)) missing.push(i)
      }
      const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))]

      speakerGaps.push({
        speaker,
        missing,
        duplicates: dupes,
        range: `#${min} - #${max} (${speakerDevos.length} devotions)`,
      })
    }

    // Duplicate scripture references (original, favorite, guest only — not revisits)
    const refMap = new Map<
      string,
      {
        id: number
        number: number
        date: string
        devotionType: string
        guestSpeaker: string | null
        bibleReference: string
      }[]
    >()
    for (const d of all) {
      if (!d.bibleReference || d.devotionType === 'revisit') continue
      const parsed = parseReference(d.bibleReference)
      for (const ref of parsed) {
        const keys = referenceKeys(ref)
        for (const key of keys) {
          if (!refMap.has(key)) refMap.set(key, [])
          refMap.get(key)!.push({
            id: d.id,
            number: d.number,
            date: d.date,
            devotionType: d.devotionType,
            guestSpeaker: d.guestSpeaker,
            bibleReference: d.bibleReference,
          })
        }
      }
    }
    const duplicateScriptures = [...refMap.entries()]
      .map(([reference, devos]) => {
        // Deduplicate same devotion appearing multiple times (from range expansion)
        const seen = new Set<number>()
        const unique = devos.filter((d) => {
          if (seen.has(d.id)) return false
          seen.add(d.id)
          return true
        })
        return {reference, count: unique.length, devotions: unique}
      })
      .filter((d) => d.count > 1)
      .sort((a, b) => b.count - a.count)

    const issueCount =
      missingNumbers.length +
      missingDates.length +
      duplicateDates.length +
      noReference.length +
      guestsNoNumber.length +
      guestsNoSpeaker.length +
      speakerGaps.reduce((sum, s) => sum + s.missing.length + s.duplicates.length, 0)

    res.json({
      missingNumbers,
      missingDates,
      duplicateDates,
      noReference,
      guestsNoNumber,
      guestsNoSpeaker,
      speakerGaps,
      duplicateScriptures,
      totalDevotions: all.length,
      numberRange: {min: minNum, max: maxNum},
      issueCount,
    })
  }),
)

// GET /api/devotions/stats - Dashboard statistics
devotionsRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const total = devotionsDb
      .select({count: sql<number>`count(*)`})
      .from(devotionsSchema.devotions)
      .get()!.count

    const byType = devotionsDb
      .select({
        type: devotionsSchema.devotions.devotionType,
        count: sql<number>`count(*)`,
      })
      .from(devotionsSchema.devotions)
      .groupBy(devotionsSchema.devotions.devotionType)
      .all()

    const bySpeaker = devotionsDb
      .select({
        speaker: devotionsSchema.devotions.guestSpeaker,
        count: sql<number>`count(*)`,
      })
      .from(devotionsSchema.devotions)
      .where(eq(devotionsSchema.devotions.devotionType, 'guest'))
      .groupBy(devotionsSchema.devotions.guestSpeaker)
      .all()

    const completionRates = devotionsDb
      .select({
        total: sql<number>`count(*)`,
        produced: sql<number>`sum(case when ${devotionsSchema.devotions.produced} = 1 then 1 else 0 end)`,
        rendered: sql<number>`sum(case when ${devotionsSchema.devotions.rendered} = 1 then 1 else 0 end)`,
        youtube: sql<number>`sum(case when ${devotionsSchema.devotions.youtube} = 1 then 1 else 0 end)`,
        facebookInstagram: sql<number>`sum(case when ${devotionsSchema.devotions.facebookInstagram} = 1 then 1 else 0 end)`,
        podcast: sql<number>`sum(case when ${devotionsSchema.devotions.podcast} = 1 then 1 else 0 end)`,
      })
      .from(devotionsSchema.devotions)
      .get()!

    const byYear = devotionsDb
      .select({
        year: sql<string>`substr(${devotionsSchema.devotions.date}, 1, 4)`,
        count: sql<number>`count(*)`,
      })
      .from(devotionsSchema.devotions)
      .groupBy(sql`substr(${devotionsSchema.devotions.date}, 1, 4)`)
      .orderBy(asc(sql`substr(${devotionsSchema.devotions.date}, 1, 4)`))
      .all()

    const latestNumber =
      devotionsDb
        .select({max: sql<number>`max(${devotionsSchema.devotions.number})`})
        .from(devotionsSchema.devotions)
        .get()?.max || 0

    const recentIncomplete = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(
        or(
          eq(devotionsSchema.devotions.produced, false),
          eq(devotionsSchema.devotions.rendered, false),
          eq(devotionsSchema.devotions.youtube, false),
          eq(devotionsSchema.devotions.facebookInstagram, false),
          eq(devotionsSchema.devotions.podcast, false),
        ),
      )
      .orderBy(desc(devotionsSchema.devotions.date))
      .limit(10)
      .all()

    res.json({
      total,
      byType,
      bySpeaker,
      completionRates: {
        produced: total > 0 ? Math.round((completionRates.produced / total) * 100) : 0,
        rendered: total > 0 ? Math.round((completionRates.rendered / total) * 100) : 0,
        youtube: total > 0 ? Math.round((completionRates.youtube / total) * 100) : 0,
        facebookInstagram: total > 0 ? Math.round((completionRates.facebookInstagram / total) * 100) : 0,
        podcast: total > 0 ? Math.round((completionRates.podcast / total) * 100) : 0,
      },
      byYear,
      latestNumber,
      recentIncomplete,
    })
  }),
)

// GET /api/devotions/stats/scriptures - Most used scriptures (parsed + normalized)
devotionsRouter.get(
  '/stats/scriptures',
  asyncHandler(async (req, res) => {
    const {search, limit = '50'} = req.query

    const all = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(
        and(
          sql`${devotionsSchema.devotions.bibleReference} IS NOT NULL`,
          sql`${devotionsSchema.devotions.devotionType} != 'revisit'`,
        ),
      )
      .all()

    const refMap = new Map<string, Set<number>>()
    for (const d of all) {
      if (!d.bibleReference) continue
      const parsed = parseReference(d.bibleReference)
      for (const ref of parsed) {
        const keys = referenceKeys(ref)
        for (const key of keys) {
          if (!refMap.has(key)) refMap.set(key, new Set())
          refMap.get(key)!.add(d.id)
        }
      }
    }

    let results = [...refMap.entries()]
      .map(([reference, ids]) => ({reference, count: ids.size}))
      .filter((r) => r.count > 1)
      .sort((a, b) => b.count - a.count)

    if (search && typeof search === 'string') {
      const s = search.toLowerCase()
      results = results.filter((r) => r.reference.toLowerCase().includes(s))
    }

    res.json(results.slice(0, Number(limit)))
  }),
)

// GET /api/devotions/scriptures/duplicates - All duplicate scripture references
devotionsRouter.get(
  '/scriptures/duplicates',
  asyncHandler(async (_req, res) => {
    const all = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(
        and(
          sql`${devotionsSchema.devotions.bibleReference} IS NOT NULL`,
          sql`${devotionsSchema.devotions.devotionType} != 'revisit'`,
        ),
      )
      .orderBy(asc(devotionsSchema.devotions.number))
      .all()

    const refMap = new Map<
      string,
      {
        id: number
        number: number
        date: string
        devotionType: string
        guestSpeaker: string | null
        bibleReference: string
      }[]
    >()
    for (const d of all) {
      if (!d.bibleReference) continue
      const parsed = parseReference(d.bibleReference)
      for (const ref of parsed) {
        const keys = referenceKeys(ref)
        for (const key of keys) {
          if (!refMap.has(key)) refMap.set(key, [])
          const group = refMap.get(key)!
          if (!group.some((e) => e.id === d.id)) {
            group.push({
              id: d.id,
              number: d.number,
              date: d.date,
              devotionType: d.devotionType,
              guestSpeaker: d.guestSpeaker,
              bibleReference: d.bibleReference,
            })
          }
        }
      }
    }

    const results = [...refMap.entries()]
      .filter(([, devos]) => devos.length > 1)
      .map(([reference, devotions]) => ({reference, count: devotions.length, devotions}))
      .sort((a, b) => b.count - a.count)

    res.json(results)
  }),
)

// GET /api/devotions/scriptures/lookup - Search for verse usage with parsed matching
devotionsRouter.get(
  '/scriptures/lookup',
  asyncHandler(async (req, res) => {
    const {search} = req.query
    if (!search || typeof search !== 'string' || search.length < 2) {
      res.json([])
      return
    }

    // Get all non-revisit devotions with references
    const all = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(
        and(
          sql`${devotionsSchema.devotions.bibleReference} IS NOT NULL`,
          sql`${devotionsSchema.devotions.devotionType} != 'revisit'`,
        ),
      )
      .orderBy(asc(devotionsSchema.devotions.number))
      .all()

    // Parse the search term into reference keys
    const searchRefs = parseReference(search)
    const searchKeys = new Set(searchRefs.flatMap((r) => referenceKeys(r)))

    // Also do a simple text match as fallback
    const searchLower = search.toLowerCase()

    // Build matches: group by normalized verse key
    const groups = new Map<
      string,
      {
        id: number
        number: number
        date: string
        devotionType: string
        guestSpeaker: string | null
        bibleReference: string
      }[]
    >()

    for (const d of all) {
      if (!d.bibleReference) continue

      const refs = parseReference(d.bibleReference)
      const devoKeys = refs.flatMap((r) => referenceKeys(r))
      const matchedKeys = devoKeys.filter((k) => searchKeys.has(k))

      // Also check text match
      const textMatch = d.bibleReference.toLowerCase().includes(searchLower)

      if (matchedKeys.length > 0 || textMatch) {
        const groupKey = matchedKeys.length > 0 ? matchedKeys[0] : d.bibleReference
        if (!groups.has(groupKey)) groups.set(groupKey, [])
        const entry = {
          id: d.id,
          number: d.number,
          date: d.date,
          devotionType: d.devotionType,
          guestSpeaker: d.guestSpeaker,
          bibleReference: d.bibleReference,
        }
        // Avoid duplicate entries in the same group
        const existing = groups.get(groupKey)!
        if (!existing.some((e) => e.id === d.id)) {
          existing.push(entry)
        }
      }
    }

    const results = [...groups.entries()]
      .map(([reference, devotions]) => ({reference, count: devotions.length, devotions}))
      .sort((a, b) => b.count - a.count)

    res.json(results)
  }),
)

// GET /api/devotions/stats/speakers - Speaker breakdown
devotionsRouter.get(
  '/stats/speakers',
  asyncHandler(async (_req, res) => {
    const speakers = devotionsDb
      .select({
        speaker: sql<string>`COALESCE(${devotionsSchema.devotions.guestSpeaker}, 'Main')`,
        count: sql<number>`count(*)`,
      })
      .from(devotionsSchema.devotions)
      .groupBy(sql`COALESCE(${devotionsSchema.devotions.guestSpeaker}, 'Main')`)
      .orderBy(desc(sql`count(*)`))
      .all()

    // Per-year breakdown
    const byYear = devotionsDb
      .select({
        speaker: sql<string>`COALESCE(${devotionsSchema.devotions.guestSpeaker}, 'Main')`,
        year: sql<string>`substr(${devotionsSchema.devotions.date}, 1, 4)`,
        count: sql<number>`count(*)`,
      })
      .from(devotionsSchema.devotions)
      .groupBy(
        sql`COALESCE(${devotionsSchema.devotions.guestSpeaker}, 'Main')`,
        sql`substr(${devotionsSchema.devotions.date}, 1, 4)`,
      )
      .orderBy(asc(sql`substr(${devotionsSchema.devotions.date}, 1, 4)`))
      .all()

    res.json({speakers, byYear})
  }),
)

// GET /api/devotions/months - Distinct months with data
devotionsRouter.get(
  '/months',
  asyncHandler(async (_req, res) => {
    const months = devotionsDb
      .select({month: sql<string>`substr(${devotionsSchema.devotions.date}, 1, 7)`})
      .from(devotionsSchema.devotions)
      .groupBy(sql`substr(${devotionsSchema.devotions.date}, 1, 7)`)
      .orderBy(desc(sql`substr(${devotionsSchema.devotions.date}, 1, 7)`))
      .all()

    res.json(months.map((m) => m.month))
  }),
)

// GET /api/devotions/next-number - Next sequential number
devotionsRouter.get(
  '/next-number',
  asyncHandler(async (_req, res) => {
    const result = devotionsDb
      .select({max: sql<number>`max(${devotionsSchema.devotions.number})`})
      .from(devotionsSchema.devotions)
      .get()

    res.json({next: (result?.max || 0) + 1})
  }),
)

// GET /api/devotions - List with pagination, filtering, sorting
devotionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      search,
      dateFrom,
      dateTo,
      devotionType,
      guestSpeaker,
      status,
      page = '1',
      limit = '50',
      sort = 'date',
      sortDir = 'desc',
    } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const conditions = []

    if (search && typeof search === 'string') {
      const searchNum = search.replace(/^#/, '')
      const isNumber = /^\d+$/.test(searchNum)
      conditions.push(
        or(
          like(devotionsSchema.devotions.songName, `%${search}%`),
          like(devotionsSchema.devotions.bibleReference, `%${search}%`),
          like(devotionsSchema.devotions.notes, `%${search}%`),
          like(devotionsSchema.devotions.title, `%${search}%`),
          ...(isNumber ? [eq(devotionsSchema.devotions.number, Number(searchNum))] : []),
        ),
      )
    }

    if (dateFrom && typeof dateFrom === 'string') {
      conditions.push(sql`${devotionsSchema.devotions.date} >= ${dateFrom}`)
    }
    if (dateTo && typeof dateTo === 'string') {
      conditions.push(sql`${devotionsSchema.devotions.date} <= ${dateTo}`)
    }
    if (devotionType && typeof devotionType === 'string') {
      conditions.push(
        eq(devotionsSchema.devotions.devotionType, devotionType as 'original' | 'favorite' | 'guest' | 'revisit'),
      )
    }
    if (guestSpeaker && typeof guestSpeaker === 'string') {
      conditions.push(eq(devotionsSchema.devotions.guestSpeaker, guestSpeaker))
    }
    if (status && typeof status === 'string') {
      if (status === 'complete') {
        conditions.push(
          and(
            eq(devotionsSchema.devotions.produced, true),
            eq(devotionsSchema.devotions.rendered, true),
            eq(devotionsSchema.devotions.youtube, true),
            eq(devotionsSchema.devotions.facebookInstagram, true),
            eq(devotionsSchema.devotions.podcast, true),
          ),
        )
      } else if (status === 'incomplete') {
        conditions.push(
          or(
            eq(devotionsSchema.devotions.produced, false),
            eq(devotionsSchema.devotions.rendered, false),
            eq(devotionsSchema.devotions.youtube, false),
            eq(devotionsSchema.devotions.facebookInstagram, false),
            eq(devotionsSchema.devotions.podcast, false),
          ),
        )
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const getOrderBy = () => {
      const dir = sortDir === 'asc' ? asc : desc
      switch (sort) {
        case 'number':
          return [dir(devotionsSchema.devotions.number)]
        case 'date':
          return [dir(devotionsSchema.devotions.date)]
        case 'devotionType':
          return [dir(devotionsSchema.devotions.devotionType)]
        default:
          return [dir(devotionsSchema.devotions.date)]
      }
    }

    const [data, countResult] = await Promise.all([
      devotionsDb
        .select()
        .from(devotionsSchema.devotions)
        .where(where)
        .limit(Number(limit))
        .offset(offset)
        .orderBy(...getOrderBy()),
      devotionsDb
        .select({count: sql<number>`count(*)`})
        .from(devotionsSchema.devotions)
        .where(where),
    ])

    res.json({
      data,
      total: countResult[0].count,
      page: Number(page),
      limit: Number(limit),
    })
  }),
)

// GET /api/devotions/scan-drafts - List saved scan drafts
devotionsRouter.get(
  '/scan-drafts',
  asyncHandler(async (_req, res) => {
    const drafts = devotionsDb
      .select({
        id: devotionsSchema.scanDrafts.id,
        month: devotionsSchema.scanDrafts.month,
        year: devotionsSchema.scanDrafts.year,
        createdAt: devotionsSchema.scanDrafts.createdAt,
        count: sql<number>`json_array_length(json_extract(${devotionsSchema.scanDrafts.data}, '$.devotions'))`,
      })
      .from(devotionsSchema.scanDrafts)
      .orderBy(desc(devotionsSchema.scanDrafts.createdAt))
      .all()

    res.json(drafts)
  }),
)

// GET /api/devotions/scan-drafts/:id - Get a saved scan draft
devotionsRouter.get(
  '/scan-drafts/:id',
  asyncHandler(async (req, res) => {
    const draft = devotionsDb
      .select()
      .from(devotionsSchema.scanDrafts)
      .where(eq(devotionsSchema.scanDrafts.id, Number(req.params.id)))
      .get()

    if (!draft) {
      res.status(404).json({error: 'Draft not found'})
      return
    }
    res.json({...draft, data: JSON.parse(draft.data)})
  }),
)

// POST /api/devotions/scan-drafts - Save a scan draft
devotionsRouter.post(
  '/scan-drafts',
  asyncHandler(async (req, res) => {
    const {month, year, devotions, image} = req.body

    let imagePath: string | null = null
    if (image) {
      fs.mkdirSync(SCAN_IMAGES_DIR, {recursive: true})
      const filename = `scan-${Date.now()}.jpg`
      imagePath = path.join(SCAN_IMAGES_DIR, filename)
      // Strip data URL prefix if present
      const base64 = image.includes(',') ? image.split(',')[1] : image
      fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'))
      imagePath = `/data/scan-images/${filename}`
    }

    const result = devotionsDb
      .insert(devotionsSchema.scanDrafts)
      .values({
        month,
        year,
        data: JSON.stringify({devotions}),
        imagePath,
      })
      .returning()
      .get()

    res.status(201).json(result)
  }),
)

// PUT /api/devotions/scan-drafts/:id - Update a scan draft
devotionsRouter.put(
  '/scan-drafts/:id',
  asyncHandler(async (req, res) => {
    const {month, year, devotions, image} = req.body
    const id = Number(req.params.id)

    // Handle image: if new image provided, save it and remove old one
    let imagePath: string | undefined
    if (image) {
      const existing = devotionsDb
        .select({imagePath: devotionsSchema.scanDrafts.imagePath})
        .from(devotionsSchema.scanDrafts)
        .where(eq(devotionsSchema.scanDrafts.id, id))
        .get()

      if (existing?.imagePath) {
        const oldPath = path.join(__devotionsDir, '..', '..', existing.imagePath)
        try {
          fs.unlinkSync(oldPath)
        } catch {
          /* ignore */
        }
      }

      fs.mkdirSync(SCAN_IMAGES_DIR, {recursive: true})
      const filename = `scan-${Date.now()}.jpg`
      const fullPath = path.join(SCAN_IMAGES_DIR, filename)
      const base64 = image.includes(',') ? image.split(',')[1] : image
      fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'))
      imagePath = `/data/scan-images/${filename}`
    }

    const updates: Record<string, unknown> = {
      month,
      year,
      data: JSON.stringify({devotions}),
    }
    if (imagePath) updates.imagePath = imagePath

    devotionsDb.update(devotionsSchema.scanDrafts).set(updates).where(eq(devotionsSchema.scanDrafts.id, id)).run()

    res.json({id})
  }),
)

// DELETE /api/devotions/scan-drafts/:id - Delete a scan draft
devotionsRouter.delete(
  '/scan-drafts/:id',
  asyncHandler(async (req, res) => {
    const draft = devotionsDb
      .select({imagePath: devotionsSchema.scanDrafts.imagePath})
      .from(devotionsSchema.scanDrafts)
      .where(eq(devotionsSchema.scanDrafts.id, Number(req.params.id)))
      .get()

    if (draft?.imagePath) {
      const fullPath = path.join(__devotionsDir, '..', '..', draft.imagePath)
      try {
        fs.unlinkSync(fullPath)
      } catch {
        /* file may not exist */
      }
    }

    devotionsDb
      .delete(devotionsSchema.scanDrafts)
      .where(eq(devotionsSchema.scanDrafts.id, Number(req.params.id)))
      .run()
    res.json({success: true})
  }),
)

// POST /api/devotions/scan-drafts/cleanup - Remove orphaned scan images
devotionsRouter.post(
  '/scan-drafts/cleanup',
  asyncHandler(async (_req, res) => {
    const cleaned = cleanupOrphanedScanImages()
    res.json(cleaned)
  }),
)

// GET /api/devotions/:id - Single devotion
devotionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const devotion = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(eq(devotionsSchema.devotions.id, Number(req.params.id)))
      .get()

    if (!devotion) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    res.json(devotion)
  }),
)

// POST /api/devotions - Create devotion
devotionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const result = devotionsDb
        .insert(devotionsSchema.devotions)
        .values({
          date: req.body.date,
          number: req.body.number,
          devotionType: req.body.devotionType,
          subcode: req.body.subcode || null,
          guestSpeaker: req.body.guestSpeaker || null,
          guestNumber: req.body.guestNumber ?? null,
          referencedDevotions: req.body.referencedDevotions || null,
          bibleReference: req.body.bibleReference || null,
          songName: req.body.songName || null,
          title: req.body.title || null,
          youtubeDescription: req.body.youtubeDescription || null,
          facebookDescription: req.body.facebookDescription || null,
          podcastDescription: req.body.podcastDescription || null,
          produced: req.body.produced ?? false,
          rendered: req.body.rendered ?? false,
          youtube: req.body.youtube ?? false,
          facebookInstagram: req.body.facebookInstagram ?? false,
          podcast: req.body.podcast ?? false,
          notes: req.body.notes || null,
        })
        .returning()
        .get()

      res.status(201).json(result)
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({error: 'A devotion with this number already exists'})
        return
      }
      throw error
    }
  }),
)

// PUT /api/devotions/:id - Update devotion
devotionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = devotionsDb
      .update(devotionsSchema.devotions)
      .set({
        date: req.body.date ?? undefined,
        number: req.body.number ?? undefined,
        devotionType: req.body.devotionType ?? undefined,
        subcode: req.body.subcode !== undefined ? req.body.subcode || null : undefined,
        guestSpeaker: req.body.guestSpeaker !== undefined ? req.body.guestSpeaker || null : undefined,
        guestNumber: req.body.guestNumber !== undefined ? (req.body.guestNumber ?? null) : undefined,
        referencedDevotions:
          req.body.referencedDevotions !== undefined ? req.body.referencedDevotions || null : undefined,
        bibleReference: req.body.bibleReference !== undefined ? req.body.bibleReference || null : undefined,
        songName: req.body.songName !== undefined ? req.body.songName || null : undefined,
        title: req.body.title !== undefined ? req.body.title || null : undefined,
        youtubeDescription: req.body.youtubeDescription !== undefined ? req.body.youtubeDescription || null : undefined,
        facebookDescription:
          req.body.facebookDescription !== undefined ? req.body.facebookDescription || null : undefined,
        podcastDescription: req.body.podcastDescription !== undefined ? req.body.podcastDescription || null : undefined,
        produced: req.body.produced ?? undefined,
        rendered: req.body.rendered ?? undefined,
        youtube: req.body.youtube ?? undefined,
        facebookInstagram: req.body.facebookInstagram ?? undefined,
        podcast: req.body.podcast ?? undefined,
        notes: req.body.notes !== undefined ? req.body.notes || null : undefined,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(devotionsSchema.devotions.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    res.json(result)
  }),
)

// POST /api/devotions/timestamps - Add timestamps to a devotion's YouTube description
devotionsRouter.post(
  '/timestamps',
  asyncHandler(async (req, res) => {
    const {number, timestamp} = req.body
    if (!number || !timestamp) {
      res.status(400).json({error: 'number and timestamp are required'})
      return
    }

    const devotion = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(eq(devotionsSchema.devotions.number, Number(number)))
      .get()

    if (!devotion) {
      res.status(404).json({error: `Devotion #${number} not found`})
      return
    }

    const isTyler = devotion.devotionType === 'guest' && devotion.guestSpeaker === 'Tyler'
    if (!isTyler) {
      res.status(400).json({error: `Devotion #${number} is not a Tyler devotion`})
      return
    }

    const [y, m, d] = devotion.date.split('-').map(Number)
    const formattedDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const year = devotion.date.split('-')[0]

    const youtubeDescription = [
      'From the Shepherd to the Sheep',
      `#${String(devotion.number).padStart(3, '0')} - ${formattedDate}`,
      `Timestamps:\n0:00 Intro by Pastor Weniger\n0:59 Devotional by Pastor Candee\n${timestamp.trim()} Conclusion by Pastor Weniger`,
      "Join Pastor Candee for this morning's devotional!",
      '#cbc #cbcwoodbridge #dailydevotional',
      'CBC - Central Baptist Church (Woodbridge, VA)',
      `Copyright \u00A9 ${year}`,
    ].join('\n\n')

    const result = devotionsDb
      .update(devotionsSchema.devotions)
      .set({youtubeDescription, updatedAt: sql`datetime('now')`})
      .where(eq(devotionsSchema.devotions.id, devotion.id))
      .returning()
      .get()

    res.json(result)
  }),
)

// DELETE /api/devotions/:id - Delete devotion
devotionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = devotionsDb
      .delete(devotionsSchema.devotions)
      .where(eq(devotionsSchema.devotions.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    res.json({success: true})
  }),
)

// PATCH /api/devotions/:id/toggle/:field - Quick-toggle a boolean field
devotionsRouter.patch(
  '/:id/toggle/:field',
  asyncHandler(async (req, res) => {
    const field = req.params.field as ToggleField
    if (!TOGGLE_FIELDS.includes(field)) {
      res.status(400).json({error: `Invalid field: ${field}. Must be one of: ${TOGGLE_FIELDS.join(', ')}`})
      return
    }

    const devotion = devotionsDb
      .select()
      .from(devotionsSchema.devotions)
      .where(eq(devotionsSchema.devotions.id, Number(req.params.id)))
      .get()

    if (!devotion) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }

    const result = devotionsDb
      .update(devotionsSchema.devotions)
      .set({
        [field]: !devotion[field],
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(devotionsSchema.devotions.id, Number(req.params.id)))
      .returning()
      .get()

    res.json(result)
  }),
)

// POST /api/devotions/import - Import from xlsx
devotionsRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const {data, filename, year: yearOverride} = req.body as {data: string; filename: string; year?: number}

    if (!data) {
      res.status(400).json({error: 'base64-encoded xlsx data is required'})
      return
    }

    const buffer = Buffer.from(data, 'base64')
    const workbook = XLSX.read(buffer, {type: 'buffer', cellDates: true, raw: true})

    // Extract year from filename like "Devotional Log (2026).xlsx"
    const yearMatch = filename?.match(/\((\d{4})\)/)
    const fileYear = yearMatch ? parseInt(yearMatch[1]) : yearOverride || new Date().getFullYear()

    const monthNames: Record<string, number> = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    }

    const allDevotions: ReturnType<typeof parseSheetRows>['devotions'] = []
    const allWarnings: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const month = monthNames[sheetName.toLowerCase()]
      if (!month) {
        allWarnings.push(`Skipping unknown sheet: ${sheetName}`)
        continue
      }

      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, {header: 1}) as unknown[][]

      const {devotions, warnings} = parseSheetRows(rows, fileYear, month)
      allDevotions.push(...devotions)
      allWarnings.push(...warnings.map((w) => `[${sheetName}] ${w}`))
    }

    const result = importDevotions(allDevotions)

    res.json({
      ...result,
      total: allDevotions.length,
      warnings: allWarnings,
    })
  }),
)

// POST /api/devotions/import-guide - Import publishing guide JSON
devotionsRouter.post(
  '/import-guide',
  asyncHandler(async (req, res) => {
    const {entries} = req.body as {
      entries: Array<{
        number: number
        title?: string
        youtubeDescription?: string
        facebookDescription?: string
        podcastDescription?: string
      }>
    }

    if (!entries || !Array.isArray(entries)) {
      res.status(400).json({error: 'entries array is required'})
      return
    }

    let updated = 0
    let notFound = 0

    for (const entry of entries) {
      const result = devotionsDb
        .update(devotionsSchema.devotions)
        .set({
          title: entry.title || undefined,
          youtubeDescription: entry.youtubeDescription || undefined,
          facebookDescription: entry.facebookDescription || undefined,
          podcastDescription: entry.podcastDescription || undefined,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(devotionsSchema.devotions.number, entry.number))
        .returning()
        .get()

      if (result) updated++
      else notFound++
    }

    res.json({updated, notFound, total: entries.length})
  }),
)

// POST /api/devotions/parse-image - Parse handwritten sheet via Claude Vision
devotionsRouter.post(
  '/parse-image',
  asyncHandler(async (req, res) => {
    const {image, mediaType} = req.body as {image: string; mediaType: string}

    if (!image || !mediaType) {
      res.status(400).json({error: 'image (base64) and mediaType are required'})
      return
    }

    try {
      const result = await parseDevotionImage(image, mediaType)
      res.json(result)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('OCR error:', msg)
      res.status(500).json({error: msg})
    }
  }),
)

// POST /api/devotions/check-existing - Check which devotion numbers already exist
devotionsRouter.post(
  '/check-existing',
  asyncHandler(async (req, res) => {
    const {numbers} = req.body as {numbers: number[]}
    if (!numbers || !Array.isArray(numbers)) {
      res.json({existing: []})
      return
    }

    const existing = devotionsDb
      .select({number: devotionsSchema.devotions.number})
      .from(devotionsSchema.devotions)
      .where(
        sql`${devotionsSchema.devotions.number} IN (${sql.join(
          numbers.map((n) => sql`${n}`),
          sql`, `,
        )})`,
      )
      .all()

    res.json({existing: existing.map((e) => e.number)})
  }),
)

// POST /api/devotions/import-parsed - Import reviewed/approved parsed devotions
devotionsRouter.post(
  '/import-parsed',
  asyncHandler(async (req, res) => {
    const {devotions} = req.body as {
      devotions: Array<{
        date: string
        number: number
        devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
        subcode?: string | null
        guestSpeaker?: string | null
        guestNumber?: number | null
        referencedDevotions?: number[]
        bibleReference?: string | null
        songName?: string | null
      }>
    }

    if (!devotions || !Array.isArray(devotions)) {
      res.status(400).json({error: 'devotions array is required'})
      return
    }

    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (const d of devotions) {
      const refsJson = d.referencedDevotions?.length ? JSON.stringify(d.referencedDevotions) : null

      try {
        const existing = devotionsDb
          .select({id: devotionsSchema.devotions.id})
          .from(devotionsSchema.devotions)
          .where(eq(devotionsSchema.devotions.number, d.number))
          .get()

        if (existing) {
          devotionsDb
            .update(devotionsSchema.devotions)
            .set({
              date: d.date,
              devotionType: d.devotionType,
              subcode: d.subcode || null,
              guestSpeaker: d.guestSpeaker || null,
              guestNumber: d.guestNumber ?? null,
              referencedDevotions: refsJson,
              bibleReference: d.bibleReference || null,
              songName: d.songName || null,
              updatedAt: sql`datetime('now')`,
            })
            .where(eq(devotionsSchema.devotions.id, existing.id))
            .run()
          updated++
        } else {
          devotionsDb
            .insert(devotionsSchema.devotions)
            .values({
              date: d.date,
              number: d.number,
              devotionType: d.devotionType,
              subcode: d.subcode || null,
              guestSpeaker: d.guestSpeaker || null,
              guestNumber: d.guestNumber ?? null,
              referencedDevotions: refsJson,
              bibleReference: d.bibleReference || null,
              songName: d.songName || null,
            })
            .run()
          inserted++
        }
      } catch (error: unknown) {
        errors.push(`#${d.number}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    res.json({inserted, updated, errors, total: devotions.length})
  }),
)

// POST /api/devotions/enrich-parsed - Backtrack revisit chains + verify verses
devotionsRouter.post(
  '/enrich-parsed',
  asyncHandler(async (req, res) => {
    const {devotions} = req.body as {
      devotions: Array<{
        number: number
        devotionType: string
        referencedDevotions: number[]
        bibleReference: string | null
      }>
    }

    if (!devotions || !Array.isArray(devotions)) {
      res.status(400).json({error: 'devotions array is required'})
      return
    }

    const results: Array<{
      number: number
      fullChain: number[]
      originalNumber: number | null
      originalReference: string | null
      verseMatch: boolean | null
    }> = []

    for (const d of devotions) {
      if (d.devotionType !== 'revisit' || !d.referencedDevotions?.length) {
        results.push({number: d.number, fullChain: [], originalNumber: null, originalReference: null, verseMatch: null})
        continue
      }

      // Backtrack the chain — always start from just the first reference
      let current = d.referencedDevotions[0]
      const chain: number[] = [current]
      const visited = new Set<number>([current])
      let originalRef: string | null = null
      let originalNum: number | null = null

      for (let depth = 0; depth < 20; depth++) {
        const devo = devotionsDb
          .select()
          .from(devotionsSchema.devotions)
          .where(eq(devotionsSchema.devotions.number, current))
          .get()

        if (!devo) break

        if (devo.devotionType !== 'revisit' || !devo.referencedDevotions) {
          // Found the original
          originalNum = devo.number
          originalRef = devo.bibleReference
          break
        }

        // It's another revisit — follow the chain
        const refs: number[] = JSON.parse(devo.referencedDevotions)
        if (refs.length === 0) break

        const next = refs[0]
        if (visited.has(next)) break
        visited.add(next)
        chain.push(next)
        current = next
      }

      // Verify verse matches
      let verseMatch: boolean | null = null
      if (originalRef && d.bibleReference) {
        verseMatch = originalRef.trim().toLowerCase() === d.bibleReference.trim().toLowerCase()
      }

      results.push({
        number: d.number,
        fullChain: chain,
        originalNumber: originalNum,
        originalReference: originalRef,
        verseMatch,
      })
    }

    res.json(results)
  }),
)
