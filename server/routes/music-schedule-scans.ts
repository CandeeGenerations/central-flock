import {and, desc, eq} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'node:fs'

import {rowsToLines} from '../../src/lib/music-scan-rows.js'
import type {MusicScan, MusicScanListItem, ScanProposal, ScanServicePatch} from '../../src/lib/music-scan-types.js'
import {type HymnBook, addDays, serviceDateFor} from '../../src/lib/music-schedule-core.js'
import {db, schema} from '../db/index.js'
import {resolveReference} from '../lib/bible-text.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {uploadPath, uploadUrl, urlToDiskPath} from '../lib/uploads.js'
import {
  type ScanContext,
  type UsualLine,
  buildProposal,
  rowsFromSides,
  weekStartOf,
} from '../services/music-schedule-scan-process.js'
import {type ScanPhoto, transcribeSchedulePhotos} from '../services/music-schedule-scan.js'
import {
  WeekExistsError,
  boothLinesFor,
  copyForwardSource,
  createWeek,
  linesFor,
  readDefaultOrders,
  readHeadings,
  replaceLines,
  servicesFor,
} from '../services/music-schedule-store.js'

// Schedule Scan: photos of the pastor's pages in, a reviewable proposal out, and
// the week created only on apply. Mounted at /api/schedules/music/scans, ahead
// of the music-schedules router. See CONTEXT.md → Schedule Scan.

export const musicScheduleScansRouter = Router()

const SCAN_DIR = 'music-scans'
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
/** How long photos stay after the week's Wednesday. */
const KEEP_PHOTOS_DAYS = 30

function scanRow(id: number) {
  return db.select().from(schema.musicScheduleScans).where(eq(schema.musicScheduleScans.id, id)).get()
}

type LegacyService = ScanProposal['services'][number] & {orderMode?: 'scanned' | 'usual'; removedLines?: string[]}

/** Parse a stored proposal, giving one saved before per-row review its rows. */
function readProposal(result: string): ScanProposal {
  const proposal = JSON.parse(result) as ScanProposal
  for (const s of proposal.services as LegacyService[]) {
    if (s.rows) continue
    const active = s.orderMode === 'usual' ? s.usualLines : s.scannedLines
    s.rows = rowsFromSides(s.usualLines, s.scannedLines)
    // Flags pointed into the order that was active; re-point them at the row holding that line.
    for (const f of s.flags) {
      if (f.lineIndex == null) continue
      const line = active[f.lineIndex]
      const at = s.rows.findIndex((r) => r.sheet === line || r.usual === line)
      f.lineIndex = at < 0 ? undefined : at
    }
    delete s.orderMode
    delete s.removedLines
  }
  return proposal
}

function toScan(row: NonNullable<ReturnType<typeof scanRow>>): MusicScan {
  const proposal = readProposal(row.result)
  const headings = readHeadings()
  const existing = proposal.existingWeekId ? servicesFor(proposal.existingWeekId) : []
  for (const s of proposal.services) {
    const configured = headings[String(s.serviceTimeId)]
    s.musicHeading = configured?.music || s.name
    s.boothHeading = configured?.booth || s.name
    const inWeek = existing.find((e) => e.serviceTimeId === s.serviceTimeId)
    const source = inWeek ? null : copyForwardSource(s.serviceTimeId, proposal.weekStart)
    const fromId = inWeek?.id ?? source?.id
    // Create week carries these forward with highlights cleared — see createWeek.
    s.boothLines = fromId ? boothLinesFor(fromId).map((bl) => (inWeek ? bl : {...bl, highlight: false})) : []
  }
  return {
    id: row.id,
    status: row.status,
    photos: JSON.parse(row.photos) as string[],
    musicScheduleId: row.musicScheduleId,
    proposal,
  }
}

function lookupHymn(book: HymnBook, number: number) {
  return (
    db
      .select({id: schema.hymns.id, title: schema.hymns.title})
      .from(schema.hymns)
      .where(and(eq(schema.hymns.book, book), eq(schema.hymns.number, number)))
      .get() ?? null
  )
}

function stripLine(l: ReturnType<typeof linesFor>[number]): UsualLine {
  const {id: _id, sortOrder: _s, highlight: _h, boothHighlight: _b, ...rest} = l
  return rest
}

/** The order each service would get — this week's current lines, or what copy-forward would produce. */
function usualLinesResolver(weekStart: string, existingWeekId: number | null): ScanContext['usualLinesFor'] {
  const existing = existingWeekId != null ? servicesFor(existingWeekId) : []
  const defaults = readDefaultOrders()
  return (serviceTimeId) => {
    if (existingWeekId != null) {
      const s = existing.find((e) => e.serviceTimeId === serviceTimeId)
      return s ? linesFor(s.id).map(stripLine) : []
    }
    const source = copyForwardSource(serviceTimeId, weekStart)
    if (source) {
      // Copy-forward clears songs unless sticky (ADR 0022).
      return linesFor(source.id).map((l) =>
        l.sticky
          ? stripLine(l)
          : {...stripLine(l), hymnId: null, hymnBook: null, hymnNumber: null, hymnTitle: null, freeSongTitle: null},
      )
    }
    return (defaults[String(serviceTimeId)] ?? []).map((t): UsualLine => ({
      kind: (t.kind as UsualLine['kind']) ?? 'prose',
      role: (t.role as UsualLine['role']) ?? 'plain',
      hymnId: null,
      hymnBook: null,
      hymnNumber: null,
      hymnTitle: null,
      freeSongTitle: null,
      suffix: t.suffix ?? '',
      leftText: t.leftText ?? '',
      text: t.text ?? '',
      merged: t.merged ?? null,
      align: (t.align as UsualLine['align']) ?? null,
      bold: t.bold ?? null,
      italic: !!t.italic,
      sticky: !!t.sticky,
      booth: (t.booth as UsualLine['booth']) ?? 'auto',
      boothLabel: t.boothLabel ?? '',
      boothNote: t.boothNote ?? '',
      musicSheet: t.musicSheet ?? true,
      noteColumn: (t.noteColumn as UsualLine['noteColumn']) ?? 'all',
      boothOneLine: !!t.boothOneLine,
    }))
  }
}

function deletePhotos(urls: string[]) {
  for (const url of urls) {
    try {
      fs.unlinkSync(urlToDiskPath(url))
    } catch {
      /* already gone */
    }
  }
}

/* ------------------------------------------------------------------ scan */

musicScheduleScansRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = (req.body as {photos?: unknown}).photos
    if (!Array.isArray(raw) || !raw.length || raw.length > 6) {
      res.status(400).json({error: 'photos must be 1–6 image data URLs'})
      return
    }
    const photos: ScanPhoto[] = []
    for (const p of raw) {
      const m = String(p).match(/^data:(image\/[a-z]+);base64,(.+)$/)
      if (!m || !MEDIA_TYPES.has(m[1])) {
        res.status(400).json({error: 'Each photo must be a JPEG, PNG, GIF or WebP data URL'})
        return
      }
      photos.push({mediaType: m[1] as ScanPhoto['mediaType'], data: m[2]})
    }

    // Save first, so a failed read still leaves the photos to retry from.
    fs.mkdirSync(uploadPath(SCAN_DIR), {recursive: true})
    const stamp = Date.now()
    const urls = photos.map((p, i) => {
      const ext = p.mediaType.split('/')[1].replace('jpeg', 'jpg')
      const file = `scan-${stamp}-${i + 1}.${ext}`
      fs.writeFileSync(uploadPath(SCAN_DIR, file), Buffer.from(p.data, 'base64'))
      return uploadUrl(SCAN_DIR, file)
    })

    let transcription
    try {
      transcription = await transcribeSchedulePhotos(photos, new Date().toISOString().slice(0, 10))
    } catch (err) {
      deletePhotos(urls)
      res.status(502).json({error: `Couldn’t read the photos: ${err instanceof Error ? err.message : String(err)}`})
      return
    }

    const weekStart = weekStartOf(transcription)
    if (!weekStart) {
      deletePhotos(urls)
      res.status(422).json({error: 'Couldn’t read a date on the pages — retake the photos with the dates in view'})
      return
    }

    const existingWeekId =
      db.select().from(schema.musicSchedules).where(eq(schema.musicSchedules.weekStart, weekStart)).get()?.id ?? null
    const proposal = buildProposal(
      transcription,
      {
        serviceTimes: db.select().from(schema.serviceTimes).where(eq(schema.serviceTimes.active, true)).all(),
        usualLinesFor: usualLinesResolver(weekStart, existingWeekId),
        lookupHymn,
        checkReference: (ref) => {
          const r = resolveReference(ref)
          return r.ok ? {ok: true, canonical: r.canonical} : {ok: false}
        },
        existingWeekId,
      },
      weekStart,
    )

    const row = db
      .insert(schema.musicScheduleScans)
      .values({
        weekStart,
        status: 'unfinished',
        photos: JSON.stringify(urls),
        result: JSON.stringify(proposal),
        photosExpireOn: addDays(serviceDateFor(weekStart, 3), KEEP_PHOTOS_DAYS),
      })
      .returning()
      .get()

    res.status(201).json({id: row.id, weekStart, summary: proposal.summary})
  }),
)

musicScheduleScansRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select()
      .from(schema.musicScheduleScans)
      .where(eq(schema.musicScheduleScans.status, 'unfinished'))
      .orderBy(desc(schema.musicScheduleScans.createdAt), desc(schema.musicScheduleScans.id))
      .all()
    res.json(
      rows.map((r): MusicScanListItem => {
        const proposal = JSON.parse(r.result) as Partial<ScanProposal>
        return {
          id: r.id,
          status: r.status,
          weekStart: r.weekStart,
          createdAt: r.createdAt,
          photos: JSON.parse(r.photos) as string[],
          summary: proposal.summary ?? null,
        }
      }),
    )
  }),
)

musicScheduleScansRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = scanRow(Number(req.params.id))
    if (!row) {
      res.status(404).json({error: 'Scan not found'})
      return
    }
    res.json(toScan(row))
  }),
)

/** Store the reviewer's choices on the proposal. */
musicScheduleScansRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = scanRow(Number(req.params.id))
    if (!row) {
      res.status(404).json({error: 'Scan not found'})
      return
    }
    if (row.status !== 'unfinished') {
      res.status(409).json({error: 'This scan has already been applied or discarded'})
      return
    }
    const patches = (req.body as {services?: ScanServicePatch[]}).services
    if (!Array.isArray(patches)) {
      res.status(400).json({error: 'services[] is required'})
      return
    }
    const proposal = readProposal(row.result)
    for (const p of patches) {
      const s = proposal.services.find((x) => x.serviceTimeId === Number(p.serviceTimeId))
      if (!s) continue
      if (p.standalone !== undefined) s.standalone = Boolean(p.standalone)
      if (p.occasion !== undefined) s.occasion = String(p.occasion)
      if (p.title !== undefined) s.title = String(p.title)
      if (p.text !== undefined) s.text = String(p.text)
      if (Array.isArray(p.rows)) s.rows = p.rows
    }
    proposal.summary.toCheck = proposal.services.reduce((n, s) => n + s.flags.length, 0)
    db.update(schema.musicScheduleScans)
      .set({result: JSON.stringify(proposal), updatedAt: new Date().toISOString()})
      .where(eq(schema.musicScheduleScans.id, row.id))
      .run()
    res.json(toScan(scanRow(row.id)!))
  }),
)

/** Create the week (or use the existing one) and write the reviewed proposal into it. */
musicScheduleScansRouter.post(
  '/:id/apply',
  asyncHandler(async (req, res) => {
    const row = scanRow(Number(req.params.id))
    if (!row) {
      res.status(404).json({error: 'Scan not found'})
      return
    }
    if (row.status !== 'unfinished') {
      res.status(409).json({error: 'This scan has already been applied or discarded', weekId: row.musicScheduleId})
      return
    }
    const proposal = readProposal(row.result)

    try {
      const weekId = db.transaction(() => {
        const weekId = proposal.existingWeekId ?? createWeek(proposal.weekStart).weekId
        const services = servicesFor(weekId)
        for (const p of proposal.services) {
          const target = services.find((s) => s.serviceTimeId === p.serviceTimeId)
          if (!target) continue
          replaceLines(
            target.id,
            rowsToLines(p.rows).map(({status: _status, hymnBook: _b, hymnNumber: _n, hymnTitle: _t, ...l}) => l),
          )
          db.update(schema.musicScheduleServices)
            .set({title: p.title, scripture: p.text, occasion: p.occasion, standalone: p.standalone})
            .where(eq(schema.musicScheduleServices.id, target.id))
            .run()
        }
        db.update(schema.musicScheduleScans)
          .set({musicScheduleId: weekId, status: 'applied', updatedAt: new Date().toISOString()})
          .where(eq(schema.musicScheduleScans.id, row.id))
          .run()
        return weekId
      })
      res.json({weekId})
    } catch (err) {
      if (err instanceof WeekExistsError) {
        res
          .status(409)
          .json({error: 'That week was created after this scan — open it and scan again', weekId: err.weekId})
        return
      }
      throw err
    }
  }),
)

musicScheduleScansRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = scanRow(Number(req.params.id))
    if (!row) {
      res.status(404).json({error: 'Scan not found'})
      return
    }
    if (row.status === 'applied') {
      res.status(409).json({error: 'An applied scan belongs to its week'})
      return
    }
    deletePhotos(JSON.parse(row.photos) as string[])
    db.update(schema.musicScheduleScans)
      .set({status: 'discarded', photos: '[]', updatedAt: new Date().toISOString()})
      .where(eq(schema.musicScheduleScans.id, row.id))
      .run()
    res.status(204).end()
  }),
)
