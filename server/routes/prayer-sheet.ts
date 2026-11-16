import {and, asc, desc, eq, ne, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'node:fs'
import path from 'node:path'

import {db, schema} from '../db/index.js'
import {requireAnthropicKey} from '../lib/anthropic-client.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {uploadPath, uploadUrl, urlToDiskPath} from '../lib/uploads.js'
import {parsePrayerSheetPhoto} from '../services/prayer-sheet-ocr.js'

export const prayerSheetRouter = Router()

const PHOTOS_DIR = uploadPath('prayer-sheets')

// ─── Color assignment ─────────────────────────────────────────────────────────

function sundayOrdinal(dateStr: string): 1 | 2 | 3 | 4 | 5 {
  const d = new Date(dateStr + 'T12:00:00')
  return (Math.ceil(d.getDate() / 7) as 1 | 2 | 3 | 4 | 5) || 1
}

function colorForDate(settings: typeof schema.prayerSheetSettings.$inferSelect, dateStr: string): string {
  const ord = sundayOrdinal(dateStr)
  const map: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: settings.colorSunday1,
    2: settings.colorSunday2,
    3: settings.colorSunday3,
    4: settings.colorSunday4,
    5: settings.colorSunday5,
  }
  return map[ord]
}

function getSettings() {
  return db.select().from(schema.prayerSheetSettings).where(eq(schema.prayerSheetSettings.id, 1)).get()
}

// Editions are ordered by their newest Sunday, not by id: back-filled sheets get
// high ids but old dates, and must not become the one a new week carries forward.
const latestSundayDate = sql<string>`max(${schema.prayerSheetSundays.sundayDate})`

function latestEdition(excludeId?: number) {
  return db
    .select({editionId: schema.prayerSheetSundays.editionId, latestDate: latestSundayDate})
    .from(schema.prayerSheetSundays)
    .where(excludeId === undefined ? undefined : ne(schema.prayerSheetSundays.editionId, excludeId))
    .groupBy(schema.prayerSheetSundays.editionId)
    .orderBy(desc(latestSundayDate), desc(schema.prayerSheetSundays.editionId))
    .limit(1)
    .get()
}

function editionEndingOn(date: string) {
  return db
    .select({editionId: schema.prayerSheetSundays.editionId})
    .from(schema.prayerSheetSundays)
    .groupBy(schema.prayerSheetSundays.editionId)
    .having(sql`${latestSundayDate} = ${date}`)
    .limit(1)
    .get()
}

// ─── Editions list ────────────────────────────────────────────────────────────

prayerSheetRouter.get(
  '/editions',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = 25
    const offset = (page - 1) * limit
    const year = req.query.year ? Number(req.query.year) : null
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    // Get all editions with sunday date info
    const editionRows = db
      .select({
        id: schema.prayerSheetEditions.id,
        themeColor: schema.prayerSheetEditions.themeColor,
        columnSplit: schema.prayerSheetEditions.columnSplit,
        createdAt: schema.prayerSheetEditions.createdAt,
        updatedAt: schema.prayerSheetEditions.updatedAt,
      })
      .from(schema.prayerSheetEditions)
      .orderBy(desc(schema.prayerSheetEditions.id))
      .all()

    // Attach sunday dates summary to each edition for display / filtering
    const enriched = editionRows.map((edition) => {
      const sundays = db
        .select()
        .from(schema.prayerSheetSundays)
        .where(eq(schema.prayerSheetSundays.editionId, edition.id))
        .orderBy(asc(schema.prayerSheetSundays.sortOrder))
        .all()
      const latestDate = sundays.at(-1)?.sundayDate ?? null
      const sundayCount = sundays.length
      const entryCount = sundays.reduce((sum, s) => {
        const c = db
          .select({count: sql<number>`count(*)`})
          .from(schema.prayerSheetEntries)
          .where(eq(schema.prayerSheetEntries.sundayId, s.id))
          .get()
        return sum + (c?.count ?? 0)
      }, 0)
      return {...edition, latestDate, sundayCount, entryCount}
    })

    enriched.sort((a, b) => (b.latestDate ?? '').localeCompare(a.latestDate ?? '') || b.id - a.id)

    // Filter
    let filtered = enriched
    if (year) filtered = filtered.filter((e) => e.latestDate?.startsWith(String(year)))
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((e) => e.latestDate?.toLowerCase().includes(q))
    }

    const total = filtered.length
    const items = filtered.slice(offset, offset + limit)
    res.json({items, total, page, limit})
  }),
)

// ─── Edition years (for filter dropdown) ────────────────────────────────────

prayerSheetRouter.get(
  '/editions/years',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select({sundayDate: schema.prayerSheetSundays.sundayDate})
      .from(schema.prayerSheetSundays)
      .orderBy(desc(schema.prayerSheetSundays.sundayDate))
      .all()
    const years = [...new Set(rows.map((r) => r.sundayDate.slice(0, 4)))].sort((a, b) => Number(b) - Number(a))
    res.json(years)
  }),
)

// ─── Create edition ───────────────────────────────────────────────────────────

prayerSheetRouter.post(
  '/editions',
  asyncHandler(async (req, res) => {
    const {newSundayDate} = req.body as {newSundayDate: string}
    if (!newSundayDate || !/^\d{4}-\d{2}-\d{2}$/.test(newSundayDate)) {
      return void res.status(400).json({error: 'newSundayDate (YYYY-MM-DD) required'})
    }

    const settings = getSettings()
    if (!settings) return void res.status(500).json({error: 'Settings not found'})

    const themeColor = colorForDate(settings, newSundayDate)

    const edition = db.insert(schema.prayerSheetEditions).values({themeColor, columnSplit: null}).returning().get()

    // Carry forward all sundays from the latest previous edition
    const prevEdition = latestEdition(edition.id)

    if (prevEdition) {
      const prevSundays = db
        .select()
        .from(schema.prayerSheetSundays)
        .where(eq(schema.prayerSheetSundays.editionId, prevEdition.editionId))
        .orderBy(asc(schema.prayerSheetSundays.sortOrder))
        .all()

      for (const prevSunday of prevSundays) {
        const newSunday = db
          .insert(schema.prayerSheetSundays)
          .values({editionId: edition.id, sundayDate: prevSunday.sundayDate, sortOrder: prevSunday.sortOrder})
          .returning()
          .get()

        const prevEntries = db
          .select()
          .from(schema.prayerSheetEntries)
          .where(eq(schema.prayerSheetEntries.sundayId, prevSunday.id))
          .orderBy(asc(schema.prayerSheetEntries.sortOrder))
          .all()

        for (const entry of prevEntries) {
          db.insert(schema.prayerSheetEntries)
            .values({sundayId: newSunday.id, text: entry.text, sortOrder: entry.sortOrder})
            .run()
        }
      }
    }

    // Add the new empty Sunday at the end
    const nextSortOrder = prevEdition
      ? (db
          .select({max: sql<number>`max(sort_order)`})
          .from(schema.prayerSheetSundays)
          .where(eq(schema.prayerSheetSundays.editionId, edition.id))
          .get()?.max ?? -1) + 1
      : 0

    db.insert(schema.prayerSheetSundays)
      .values({editionId: edition.id, sundayDate: newSundayDate, sortOrder: nextSortOrder})
      .run()

    res.json(getFullEdition(edition.id))
  }),
)

// ─── Import edition from a photo of a printed sheet ──────────────────────────

prayerSheetRouter.post(
  '/editions/import-photo',
  asyncHandler(async (req, res) => {
    requireAnthropicKey()
    const {imageData, mediaType} = req.body as {imageData?: string; mediaType?: string}
    if (!imageData || !mediaType) return void res.status(400).json({error: 'imageData and mediaType required'})

    const settings = getSettings()
    if (!settings) return void res.status(500).json({error: 'Settings not found'})

    const today = new Date().toISOString().slice(0, 10)
    const {sundays} = await parsePrayerSheetPhoto(imageData, mediaType, today)
    if (sundays.length === 0) {
      return void res.status(422).json({error: 'No Sundays found on that photo. Try a clearer shot of the front side.'})
    }

    const latestDate = sundays[sundays.length - 1].date
    if (editionEndingOn(latestDate)) {
      return void res.status(409).json({error: `An edition ending on Sunday ${latestDate} already exists.`})
    }

    const editionId = db.transaction((tx) => {
      const edition = tx
        .insert(schema.prayerSheetEditions)
        .values({themeColor: colorForDate(settings, latestDate), columnSplit: null})
        .returning()
        .get()
      sundays.forEach((s, sundayIdx) => {
        const sunday = tx
          .insert(schema.prayerSheetSundays)
          .values({editionId: edition.id, sundayDate: s.date, sortOrder: sundayIdx})
          .returning()
          .get()
        if (s.entries.length > 0) {
          tx.insert(schema.prayerSheetEntries)
            .values(s.entries.map((text, entryIdx) => ({sundayId: sunday.id, text, sortOrder: entryIdx})))
            .run()
        }
      })
      return edition.id
    })

    fs.mkdirSync(PHOTOS_DIR, {recursive: true})
    const filename = `edition-${editionId}-${Date.now()}.jpg`
    fs.writeFileSync(path.join(PHOTOS_DIR, filename), Buffer.from(imageData, 'base64'))
    db.update(schema.prayerSheetEditions)
      .set({sourcePhotoPath: uploadUrl('prayer-sheets', filename)})
      .where(eq(schema.prayerSheetEditions.id, editionId))
      .run()

    res.json(getFullEdition(editionId))
  }),
)

// ─── Full edition (with sundays + entries) ────────────────────────────────────

function getFullEdition(id: number) {
  const edition = db.select().from(schema.prayerSheetEditions).where(eq(schema.prayerSheetEditions.id, id)).get()
  if (!edition) return null
  const sundays = db
    .select()
    .from(schema.prayerSheetSundays)
    .where(eq(schema.prayerSheetSundays.editionId, id))
    .orderBy(asc(schema.prayerSheetSundays.sortOrder))
    .all()
  const sundaysWithEntries = sundays.map((s) => {
    const entries = db
      .select()
      .from(schema.prayerSheetEntries)
      .where(eq(schema.prayerSheetEntries.sundayId, s.id))
      .orderBy(asc(schema.prayerSheetEntries.sortOrder))
      .all()
    return {...s, entries}
  })
  return {...edition, sundays: sundaysWithEntries}
}

prayerSheetRouter.get(
  '/editions/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const result = getFullEdition(id)
    if (!result) return void res.status(404).json({error: 'Edition not found'})
    res.json(result)
  }),
)

// ─── Update edition ───────────────────────────────────────────────────────────

prayerSheetRouter.patch(
  '/editions/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {themeColor, columnSplit} = req.body as {themeColor?: string; columnSplit?: number | null}
    const updates: Partial<typeof schema.prayerSheetEditions.$inferInsert> = {
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    }
    if (themeColor !== undefined) updates.themeColor = themeColor
    if (columnSplit !== undefined) updates.columnSplit = columnSplit
    db.update(schema.prayerSheetEditions).set(updates).where(eq(schema.prayerSheetEditions.id, id)).run()
    res.json(getFullEdition(id))
  }),
)

// ─── Delete edition ───────────────────────────────────────────────────────────

prayerSheetRouter.delete(
  '/editions/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const deleted = db
      .delete(schema.prayerSheetEditions)
      .where(eq(schema.prayerSheetEditions.id, id))
      .returning({sourcePhotoPath: schema.prayerSheetEditions.sourcePhotoPath})
      .get()
    if (deleted?.sourcePhotoPath) fs.rmSync(urlToDiskPath(deleted.sourcePhotoPath), {force: true})
    res.json({ok: true})
  }),
)

// ─── Add Sunday to edition ────────────────────────────────────────────────────

prayerSheetRouter.post(
  '/editions/:id/sundays',
  asyncHandler(async (req, res) => {
    const editionId = Number(req.params.id)
    const {sundayDate} = req.body as {sundayDate: string}
    if (!sundayDate || !/^\d{4}-\d{2}-\d{2}$/.test(sundayDate)) {
      return void res.status(400).json({error: 'sundayDate (YYYY-MM-DD) required'})
    }
    const maxSort =
      (db
        .select({max: sql<number>`max(sort_order)`})
        .from(schema.prayerSheetSundays)
        .where(eq(schema.prayerSheetSundays.editionId, editionId))
        .get()?.max ?? -1) + 1

    const sunday = db
      .insert(schema.prayerSheetSundays)
      .values({editionId, sundayDate, sortOrder: maxSort})
      .returning()
      .get()
    res.json({...sunday, entries: []})
  }),
)

// ─── Delete Sunday ────────────────────────────────────────────────────────────

prayerSheetRouter.delete(
  '/sundays/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    db.delete(schema.prayerSheetSundays).where(eq(schema.prayerSheetSundays.id, id)).run()
    res.json({ok: true})
  }),
)

// ─── Add entry ────────────────────────────────────────────────────────────────

prayerSheetRouter.post(
  '/sundays/:id/entries',
  asyncHandler(async (req, res) => {
    const sundayId = Number(req.params.id)
    const {text, sortOrder} = req.body as {text?: string; sortOrder?: number}
    const maxSort =
      sortOrder ??
      (db
        .select({max: sql<number>`max(sort_order)`})
        .from(schema.prayerSheetEntries)
        .where(eq(schema.prayerSheetEntries.sundayId, sundayId))
        .get()?.max ?? -1) + 1

    const entry = db
      .insert(schema.prayerSheetEntries)
      .values({sundayId, text: text ?? '', sortOrder: maxSort})
      .returning()
      .get()
    res.json(entry)
  }),
)

// ─── Update entry ─────────────────────────────────────────────────────────────

prayerSheetRouter.patch(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {text, sortOrder} = req.body as {text?: string; sortOrder?: number}
    const updates: Partial<typeof schema.prayerSheetEntries.$inferInsert> = {}
    if (text !== undefined) updates.text = text
    if (sortOrder !== undefined) updates.sortOrder = sortOrder
    const entry = db
      .update(schema.prayerSheetEntries)
      .set(updates)
      .where(eq(schema.prayerSheetEntries.id, id))
      .returning()
      .get()
    res.json(entry)
  }),
)

// ─── Delete entry ─────────────────────────────────────────────────────────────

prayerSheetRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    db.delete(schema.prayerSheetEntries).where(eq(schema.prayerSheetEntries.id, id)).run()
    res.json({ok: true})
  }),
)

// ─── Reorder sundays ─────────────────────────────────────────────────────────

prayerSheetRouter.patch(
  '/editions/:id/sundays/reorder',
  asyncHandler(async (req, res) => {
    const editionId = Number(req.params.id)
    const {orderedIds} = req.body as {orderedIds: number[]}
    for (let i = 0; i < orderedIds.length; i++) {
      db.update(schema.prayerSheetSundays)
        .set({sortOrder: i})
        .where(eq(schema.prayerSheetSundays.id, orderedIds[i]))
        .run()
    }
    res.json(getFullEdition(editionId))
  }),
)

// ─── Reorder entries within a Sunday (e.g. "Sort A–Z") ───────────────────────

prayerSheetRouter.patch(
  '/sundays/:id/entries/reorder',
  asyncHandler(async (req, res) => {
    const sundayId = Number(req.params.id)
    const {orderedIds} = req.body as {orderedIds: number[]}
    if (!Array.isArray(orderedIds) || !orderedIds.every(Number.isInteger)) {
      res.status(400).json({error: 'orderedIds must be a list of entry ids'})
      return
    }
    db.transaction((tx) => {
      orderedIds.forEach((id, i) => {
        tx.update(schema.prayerSheetEntries)
          .set({sortOrder: i})
          .where(and(eq(schema.prayerSheetEntries.id, id), eq(schema.prayerSheetEntries.sundayId, sundayId)))
          .run()
      })
    })
    res.json({ok: true})
  }),
)

// ─── Settings ─────────────────────────────────────────────────────────────────

prayerSheetRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = getSettings()
    if (!settings) return void res.status(500).json({error: 'Settings row missing'})
    res.json(settings)
  }),
)

prayerSheetRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const {
      title,
      scriptureText,
      scriptureReference,
      colorSunday1,
      colorSunday2,
      colorSunday3,
      colorSunday4,
      colorSunday5,
    } = req.body as Partial<typeof schema.prayerSheetSettings.$inferInsert>
    const updates: Partial<typeof schema.prayerSheetSettings.$inferInsert> = {
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    }
    if (title !== undefined) updates.title = title
    if (scriptureText !== undefined) updates.scriptureText = scriptureText
    if (scriptureReference !== undefined) updates.scriptureReference = scriptureReference
    if (colorSunday1 !== undefined) updates.colorSunday1 = colorSunday1
    if (colorSunday2 !== undefined) updates.colorSunday2 = colorSunday2
    if (colorSunday3 !== undefined) updates.colorSunday3 = colorSunday3
    if (colorSunday4 !== undefined) updates.colorSunday4 = colorSunday4
    if (colorSunday5 !== undefined) updates.colorSunday5 = colorSunday5
    db.update(schema.prayerSheetSettings).set(updates).where(eq(schema.prayerSheetSettings.id, 1)).run()
    res.json(getSettings())
  }),
)

// ─── Ministry items ───────────────────────────────────────────────────────────

prayerSheetRouter.get(
  '/ministry-items',
  asyncHandler(async (_req, res) => {
    const items = db
      .select()
      .from(schema.prayerSheetMinistryItems)
      .orderBy(asc(schema.prayerSheetMinistryItems.sortOrder))
      .all()
    res.json(items)
  }),
)

prayerSheetRouter.put(
  '/ministry-items',
  asyncHandler(async (req, res) => {
    const items = req.body as Array<{id?: number; text: string; bold: boolean; sortOrder: number}>
    db.delete(schema.prayerSheetMinistryItems).run()
    if (items.length > 0) {
      db.insert(schema.prayerSheetMinistryItems)
        .values(items.map((item, i) => ({text: item.text, bold: item.bold, sortOrder: item.sortOrder ?? i})))
        .run()
    }
    res.json(
      db.select().from(schema.prayerSheetMinistryItems).orderBy(asc(schema.prayerSheetMinistryItems.sortOrder)).all(),
    )
  }),
)
