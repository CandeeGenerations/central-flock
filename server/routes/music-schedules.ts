import {and, asc, desc, eq, gt, like, ne, or, sql} from 'drizzle-orm'
import {Router} from 'express'

import {
  type MusicBoothSlot,
  assignEpisodeNumbers,
  boothLineStale,
  dayOfWeek,
  draftBoothLine,
  serviceDateFor,
  weekBounds,
  weekLabel,
  weekStartFor,
  weekWarnings,
  yearOf,
} from '../../src/lib/music-schedule-core.js'
import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {
  type LineInput,
  WeekExistsError,
  boothLinesFor,
  copyOrder,
  createWeek,
  highestEpisodeByYear,
  insertLines,
  linesFor,
  readDefaultOrders,
  readJson,
  readSetting,
  replaceLines,
  servicesFor,
  touch,
  weekWithSchedule,
} from '../services/music-schedule-store.js'

export const musicSchedulesRouter = Router()

// Mounted at /api/schedules/music, ahead of the generic schedules router (same
// pattern as fair-booth and workers-notes). See CONTEXT.md → Music Schedule.

const BOOTH_SLOTS = new Set<string>(schema.musicBoothSlots)

export interface ServiceHeadings {
  music: string
  booth: string
}

function readHeadings(): Record<string, ServiceHeadings> {
  return readJson<Record<string, ServiceHeadings>>('schedules.musicSchedule.serviceHeadings', {})
}

/** A service by id, only if it belongs to the given week. */
function serviceInWeek(weekId: number, serviceId: number) {
  const service = db
    .select()
    .from(schema.musicScheduleServices)
    .where(eq(schema.musicScheduleServices.id, serviceId))
    .get()
  return service && service.musicScheduleId === weekId ? service : undefined
}

/* ------------------------------------------------------------ hymn picker */

// A thin list for the song picker. Lives here rather than on the hymns router
// so the Music Schedule owns the shape it needs.
musicSchedulesRouter.get(
  '/hymns',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    const base = db
      .select({id: schema.hymns.id, book: schema.hymns.book, number: schema.hymns.number, title: schema.hymns.title})
      .from(schema.hymns)
    res.json(
      q
        ? base
            .where(
              or(
                like(sql`lower(${schema.hymns.title})`, `%${q.toLowerCase()}%`),
                eq(schema.hymns.number, Number.isFinite(Number(q)) ? Number(q) : -1),
              ),
            )
            .orderBy(asc(schema.hymns.book), asc(schema.hymns.number))
            .limit(50)
            .all()
        : base.orderBy(asc(schema.hymns.book), asc(schema.hymns.number)).limit(50).all(),
    )
  }),
)

/** The next Episode Number available in a year (ADR 0024). */
musicSchedulesRouter.get(
  '/episodes/next',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear()
    res.json({year, next: (highestEpisodeByYear()[year] ?? 0) + 1})
  }),
)

/* -------------------------------------------------------------- week list */

musicSchedulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year)
    const rows = db
      .select({week: schema.musicSchedules, schedule: schema.schedules})
      .from(schema.musicSchedules)
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.musicSchedules.scheduleId))
      // Newest week first — the one being planned is the one you want at the top.
      .orderBy(desc(schema.musicSchedules.weekStart))
      .all()
      .filter((r) => !Number.isFinite(year) || yearOf(r.week.weekStart) === year)

    res.json(
      rows.map(({week, schedule}) => {
        const services = servicesFor(week.id)
        const episodes = services
          .map((s) => s.episodeNumber)
          .filter((n): n is number => n != null)
          .sort((a, b) => a - b)
        // The same function the week view uses, so the list can never disagree
        // with what you find when you open the week.
        const warningCount = weekWarnings(
          services.map((s) => ({...s, lines: linesFor(s.id), boothLines: boothLinesFor(s.id)})),
        ).length
        return {
          id: week.id,
          weekStart: week.weekStart,
          label: weekLabel(week.weekStart),
          status: schedule.status,
          scopeLabel: schedule.scopeLabel,
          note: week.note,
          warningCount,
          serviceCount: services.filter((s) => s.meeting).length,
          occasions: services.filter((s) => s.meeting && s.occasion).map((s) => s.occasion),
          episodeFirst: episodes[0] ?? null,
          episodeLast: episodes[episodes.length - 1] ?? null,
          updatedAt: week.updatedAt,
        }
      }),
    )
  }),
)

/** The distinct years that have weeks, for the list page's filter. */
musicSchedulesRouter.get(
  '/years',
  asyncHandler(async (_req, res) => {
    const years = new Set(
      db
        .select({weekStart: schema.musicSchedules.weekStart})
        .from(schema.musicSchedules)
        .all()
        .map((r) => yearOf(r.weekStart)),
    )
    res.json([...years].sort((a, b) => b - a))
  }),
)

/**
 * Earlier services to copy an order from, Standalone first and newest first —
 * last year's Thanksgiving Eve is what you are looking for, not 50 Wednesdays.
 */
musicSchedulesRouter.get(
  '/copy-sources',
  asyncHandler(async (req, res) => {
    const exclude = Number(req.query.exclude)
    const rows = db
      .select({service: schema.musicScheduleServices, weekStart: schema.musicSchedules.weekStart})
      .from(schema.musicScheduleServices)
      .innerJoin(schema.musicSchedules, eq(schema.musicSchedules.id, schema.musicScheduleServices.musicScheduleId))
      .where(Number.isFinite(exclude) ? ne(schema.musicScheduleServices.id, exclude) : undefined)
      .orderBy(desc(schema.musicScheduleServices.standalone), desc(schema.musicScheduleServices.date))
      .limit(300)
      .all()
    res.json(
      rows.map(({service: s, weekStart}) => ({
        id: s.id,
        weekId: s.musicScheduleId,
        weekStart,
        date: s.date,
        name: s.name,
        serviceTimeId: s.serviceTimeId,
        occasion: s.occasion,
        musicHeading: s.musicHeading,
        standalone: s.standalone,
        title: s.title,
        lineCount: db
          .select({n: sql<number>`count(*)`})
          .from(schema.musicScheduleLines)
          .where(eq(schema.musicScheduleLines.serviceId, s.id))
          .get()!.n,
      })),
    )
  }),
)

/* ------------------------------------------------------------ create week */

musicSchedulesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = String((req.body as {weekStart?: string}).weekStart ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      res.status(400).json({error: 'weekStart (YYYY-MM-DD) is required'})
      return
    }
    const weekStart = weekStartFor(raw)
    try {
      const {weekId, status} = createWeek(weekStart)
      res.status(201).json({id: weekId, weekStart, status})
    } catch (err) {
      if (err instanceof WeekExistsError) {
        res.status(409).json({error: err.message, weekId: err.weekId})
        return
      }
      throw err
    }
  }),
)

/* -------------------------------------------------------------- copy week */

/**
 * Duplicate a week onto another Sunday, verbatim. Where POST / builds the next
 * week from the last one and deliberately clears what is specific to it (songs,
 * highlights, titles), a copy keeps everything and only moves the dates — it is
 * for "this week runs like that one", not for starting the next week.
 *
 * Episode Numbers are the exception: they are published identifiers and are
 * reassigned for the new dates rather than duplicated (ADR 0024).
 */
musicSchedulesRouter.post(
  '/:id/copy',
  asyncHandler(async (req, res) => {
    const sourceId = Number(req.params.id)
    const source = weekWithSchedule(sourceId)
    if (!source) {
      res.status(404).json({error: 'Week not found'})
      return
    }
    const raw = String((req.body as {weekStart?: string}).weekStart ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      res.status(400).json({error: 'weekStart (YYYY-MM-DD) is required'})
      return
    }
    const weekStart = weekStartFor(raw)
    if (weekStart === source.week.weekStart) {
      res.status(409).json({error: 'That is the week being copied'})
      return
    }
    const clash = db.select().from(schema.musicSchedules).where(eq(schema.musicSchedules.weekStart, weekStart)).get()
    if (clash) {
      res.status(409).json({error: 'A week already exists for that Sunday', weekId: clash.id})
      return
    }

    const {scopeStart, scopeEnd} = weekBounds(weekStart)
    const schedule = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'music_schedule',
        scopeKind: 'date_range',
        scopeStart,
        scopeEnd,
        scopeLabel: weekLabel(weekStart),
      })
      .returning()
      .get()

    const week = db
      .insert(schema.musicSchedules)
      .values({scheduleId: schedule.id, weekStart, note: source.week.note})
      .returning()
      .get()

    const created: {id: number; date: string; meeting: boolean; uploaded: boolean}[] = []

    servicesFor(sourceId).forEach((src, i) => {
      // The service keeps its weekday; only the week moves.
      const date = serviceDateFor(weekStart, dayOfWeek(src.date))
      const service = db
        .insert(schema.musicScheduleServices)
        .values({
          musicScheduleId: week.id,
          serviceTimeId: src.serviceTimeId,
          name: src.name,
          musicHeading: src.musicHeading,
          boothHeading: src.boothHeading,
          date,
          time: src.time,
          meeting: src.meeting,
          uploaded: src.uploaded,
          standalone: src.standalone,
          occasion: src.occasion,
          title: src.title,
          titleNote: src.titleNote,
          titleHighlight: src.titleHighlight,
          scripture: src.scripture,
          scriptureNote: src.scriptureNote,
          scriptureHighlight: src.scriptureHighlight,
          sortOrder: i,
        })
        .returning()
        .get()
      created.push({id: service.id, date, meeting: service.meeting, uploaded: service.uploaded})

      insertLines(
        service.id,
        linesFor(src.id).map((l) => ({
          kind: l.kind,
          role: l.role,
          text: l.text,
          suffix: l.suffix,
          leftText: l.leftText,
          merged: l.merged,
          align: l.align,
          bold: l.bold,
          italic: l.italic,
          highlight: l.highlight,
          boothHighlight: l.boothHighlight,
          booth: l.booth,
          boothLabel: l.boothLabel,
          boothNote: l.boothNote,
          sticky: l.sticky,
          hymnId: l.hymnId,
          freeSongTitle: l.freeSongTitle,
        })),
      )

      boothLinesFor(src.id).forEach((bl, idx) =>
        db
          .insert(schema.musicScheduleBoothLines)
          .values({
            serviceId: service.id,
            slot: bl.slot,
            text: bl.text,
            highlight: bl.highlight,
            draftedFrom: bl.draftedFrom,
            sortOrder: idx,
          })
          .run(),
      )
    })

    const numbers = assignEpisodeNumbers(created, highestEpisodeByYear(week.id))
    for (const [id, n] of Object.entries(numbers)) {
      db.update(schema.musicScheduleServices)
        .set({episodeNumber: n})
        .where(eq(schema.musicScheduleServices.id, Number(id)))
        .run()
    }

    res.status(201).json({id: week.id, weekStart, status: schedule.status})
  }),
)

/* -------------------------------------------------------------- week read */

/** Everything all three pages need, in one request. */
musicSchedulesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = weekWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Week not found'})
      return
    }
    const {week, schedule} = found
    const headings = readHeadings()

    const services = servicesFor(id).map((s) => {
      const lines = linesFor(s.id)
      const booth = boothLinesFor(s.id)
      const time = db
        .select()
        .from(schema.serviceTimes)
        .where(eq(schema.serviceTimes.id, s.serviceTimeId ?? -1))
        .get()
      const configured = s.serviceTimeId != null ? headings[String(s.serviceTimeId)] : undefined
      const nameDefault = time?.name ?? ''
      return {
        ...s,
        time: s.time ?? time?.time ?? null,
        dayOfWeek: dayOfWeek(s.date),
        name: s.name || nameDefault,
        musicHeading: s.musicHeading || configured?.music || s.name || nameDefault,
        boothHeading: s.boothHeading || configured?.booth || s.name || nameDefault,
        // What is actually stored on the row, and what it would fall back to.
        // The editor needs both so it can show an override as an override.
        nameOverride: s.name,
        timeOverride: s.time,
        musicHeadingOverride: s.musicHeading,
        boothHeadingOverride: s.boothHeading,
        nameDefault,
        timeDefault: time?.time ?? null,
        musicHeadingDefault: configured?.music || nameDefault,
        boothHeadingDefault: configured?.booth || nameDefault,
        lines,
        boothLines: booth.map((bl) => ({...bl, stale: boothLineStale(bl, lines)})),
      }
    })

    // A Standalone service marked after the next week was built: that week copied
    // from it and is left alone, so the editor points it out instead.
    const laterWeekExists = !!db
      .select({id: schema.musicSchedules.id})
      .from(schema.musicSchedules)
      .where(gt(schema.musicSchedules.weekStart, week.weekStart))
      .get()

    const scanPhotos = db
      .select({photos: schema.musicScheduleScans.photos})
      .from(schema.musicScheduleScans)
      .where(and(eq(schema.musicScheduleScans.musicScheduleId, id), eq(schema.musicScheduleScans.status, 'applied')))
      .all()
      .flatMap((r) => JSON.parse(r.photos) as string[])

    res.json({
      id: week.id,
      weekStart: week.weekStart,
      label: weekLabel(week.weekStart),
      note: week.note,
      status: schedule.status,
      scopeLabel: schedule.scopeLabel,
      updatedAt: week.updatedAt,
      laterWeekExists,
      scanPhotos,
      services,
      footer: {
        blocks: readJson<unknown[]>('schedules.musicSchedule.footerBlocks', []),
        imagePath: readSetting('schedules.musicSchedule.footerImagePath'),
        placement: readSetting('schedules.musicSchedule.footerPlacement') ?? 'last',
      },
    })
  }),
)

musicSchedulesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = weekWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Week not found'})
      return
    }
    const b = req.body as {status?: string; note?: string}
    if (b.status !== undefined && b.status !== 'draft' && b.status !== 'final') {
      res.status(400).json({error: "status must be 'draft' or 'final'"})
      return
    }
    if (b.status !== undefined) {
      db.update(schema.schedules)
        .set({status: b.status, updatedAt: new Date().toISOString()})
        .where(eq(schema.schedules.id, found.schedule.id))
        .run()
    }
    if (b.note !== undefined) {
      db.update(schema.musicSchedules)
        .set({note: String(b.note), updatedAt: new Date().toISOString()})
        .where(eq(schema.musicSchedules.id, id))
        .run()
    }
    res.json({id, status: b.status ?? found.schedule.status, note: b.note ?? found.week.note})
  }),
)

musicSchedulesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const found = weekWithSchedule(Number(req.params.id))
    if (!found) {
      res.status(404).json({error: 'Week not found'})
      return
    }
    // Cascades to the week, its services, lines and booth lines.
    db.delete(schema.schedules).where(eq(schema.schedules.id, found.schedule.id)).run()
    res.status(204).end()
  }),
)

/* ----------------------------------------------------------- one service */

/** Add a one-off service (a revival night) with no Service Time behind it. */
musicSchedulesRouter.post(
  '/:id/services',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = weekWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Week not found'})
      return
    }
    const b = req.body as {name?: string; date?: string; time?: string}
    const date = String(b.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({error: 'date (YYYY-MM-DD) is required'})
      return
    }
    const existing = servicesFor(id)
    const service = db
      .insert(schema.musicScheduleServices)
      .values({
        musicScheduleId: id,
        serviceTimeId: null,
        name: String(b.name ?? 'Service'),
        date,
        time: b.time ? String(b.time) : null,
        sortOrder: existing.length,
      })
      .returning()
      .get()
    touch(id, found.schedule.id)
    res.status(201).json(service)
  }),
)

musicSchedulesRouter.patch(
  '/:id/services/:serviceId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const serviceId = Number(req.params.serviceId)
    const found = weekWithSchedule(id)
    const service = db
      .select()
      .from(schema.musicScheduleServices)
      .where(eq(schema.musicScheduleServices.id, serviceId))
      .get()
    if (!found || !service || service.musicScheduleId !== id) {
      res.status(404).json({error: 'Service not found'})
      return
    }
    const b = req.body as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    const strings = [
      'name',
      'musicHeading',
      'boothHeading',
      'title',
      'titleNote',
      'scripture',
      'scriptureNote',
      'occasion',
    ] as const
    for (const k of strings) if (b[k] !== undefined) patch[k] = String(b[k] ?? '')
    for (const k of ['meeting', 'uploaded', 'titleHighlight', 'scriptureHighlight', 'standalone'] as const)
      if (b[k] !== undefined) patch[k] = Boolean(b[k])
    if (b.time !== undefined) patch.time = b.time ? String(b.time) : null
    if (b.serviceTimeId !== undefined) {
      const n = Number(b.serviceTimeId)
      patch.serviceTimeId = Number.isInteger(n) && n > 0 ? n : null
    }
    if (b.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) patch.date = String(b.date)
    if (b.episodeNumber !== undefined) {
      const n = Number(b.episodeNumber)
      patch.episodeNumber = Number.isInteger(n) && n > 0 ? n : null
    }
    if (Object.keys(patch).length) {
      db.update(schema.musicScheduleServices).set(patch).where(eq(schema.musicScheduleServices.id, serviceId)).run()
    }
    touch(id, found.schedule.id)
    res.json({...service, ...patch})
  }),
)

musicSchedulesRouter.delete(
  '/:id/services/:serviceId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = weekWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Week not found'})
      return
    }
    db.delete(schema.musicScheduleServices)
      .where(
        and(
          eq(schema.musicScheduleServices.id, Number(req.params.serviceId)),
          eq(schema.musicScheduleServices.musicScheduleId, id),
        ),
      )
      .run()
    touch(id, found.schedule.id)
    res.status(204).end()
  }),
)

/** Replace a Service Order wholesale — the list is small and strictly ordered. */
musicSchedulesRouter.put(
  '/:id/services/:serviceId/lines',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const serviceId = Number(req.params.serviceId)
    const found = weekWithSchedule(id)
    const service = db
      .select()
      .from(schema.musicScheduleServices)
      .where(eq(schema.musicScheduleServices.id, serviceId))
      .get()
    if (!found || !service || service.musicScheduleId !== id) {
      res.status(404).json({error: 'Service not found'})
      return
    }
    const lines = (req.body as {lines?: LineInput[]}).lines
    if (!Array.isArray(lines)) {
      res.status(400).json({error: 'lines[] is required'})
      return
    }
    replaceLines(serviceId, lines)
    touch(id, found.schedule.id)
    res.json({lines: linesFor(serviceId)})
  }),
)

/** Replace this service's order with an earlier service's (decision: Copy order from…). */
musicSchedulesRouter.post(
  '/:id/services/:serviceId/copy-order',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const serviceId = Number(req.params.serviceId)
    const found = weekWithSchedule(id)
    const service = serviceInWeek(id, serviceId)
    if (!found || !service) {
      res.status(404).json({error: 'Service not found'})
      return
    }
    const fromServiceId = Number((req.body as {fromServiceId?: number}).fromServiceId)
    if (!Number.isInteger(fromServiceId) || fromServiceId === serviceId) {
      res.status(400).json({error: 'fromServiceId must be another service'})
      return
    }
    try {
      copyOrder(serviceId, fromServiceId)
    } catch {
      res.status(404).json({error: 'Source service not found'})
      return
    }
    touch(id, found.schedule.id)
    res.json({ok: true})
  }),
)

/**
 * Replace the condensed Sound Booth lines. `draftedFrom` is stamped with the
 * draft that was current at save time, which is how staleness is detected
 * later — see docs/adr/0022-sound-booth-sheet-projection.md.
 */
musicSchedulesRouter.put(
  '/:id/services/:serviceId/booth-lines',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const serviceId = Number(req.params.serviceId)
    const found = weekWithSchedule(id)
    const service = db
      .select()
      .from(schema.musicScheduleServices)
      .where(eq(schema.musicScheduleServices.id, serviceId))
      .get()
    if (!found || !service || service.musicScheduleId !== id) {
      res.status(404).json({error: 'Service not found'})
      return
    }
    const body = (req.body as {boothLines?: {slot?: string; text?: string; highlight?: boolean}[]}).boothLines
    if (!Array.isArray(body)) {
      res.status(400).json({error: 'boothLines[] is required'})
      return
    }
    const lines = linesFor(serviceId)
    db.transaction(() => {
      db.delete(schema.musicScheduleBoothLines).where(eq(schema.musicScheduleBoothLines.serviceId, serviceId)).run()
      body
        .filter((bl) => BOOTH_SLOTS.has(String(bl.slot)))
        .forEach((bl, i) => {
          const slot = bl.slot as MusicBoothSlot
          db.insert(schema.musicScheduleBoothLines)
            .values({
              serviceId,
              slot,
              text: String(bl.text ?? ''),
              highlight: Boolean(bl.highlight),
              draftedFrom: draftBoothLine(slot, lines)?.text ?? '',
              sortOrder: i,
            })
            .run()
        })
    })
    touch(id, found.schedule.id)
    res.json({boothLines: boothLinesFor(serviceId).map((bl) => ({...bl, stale: boothLineStale(bl, lines)}))})
  }),
)

/** Discard the stored edit and take a fresh draft. Never automatic (ADR 0022). */
musicSchedulesRouter.post(
  '/:id/services/:serviceId/booth-lines/:slot/rewrite',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const serviceId = Number(req.params.serviceId)
    const slot = String(req.params.slot)
    const found = weekWithSchedule(id)
    if (!found || !BOOTH_SLOTS.has(slot)) {
      res.status(404).json({error: 'Not found'})
      return
    }
    const lines = linesFor(serviceId)
    const draft = draftBoothLine(slot as MusicBoothSlot, lines)
    if (!draft) {
      db.delete(schema.musicScheduleBoothLines)
        .where(
          and(
            eq(schema.musicScheduleBoothLines.serviceId, serviceId),
            eq(schema.musicScheduleBoothLines.slot, slot as MusicBoothSlot),
          ),
        )
        .run()
      touch(id, found.schedule.id)
      res.json({boothLines: boothLinesFor(serviceId)})
      return
    }
    const existing = db
      .select()
      .from(schema.musicScheduleBoothLines)
      .where(
        and(
          eq(schema.musicScheduleBoothLines.serviceId, serviceId),
          eq(schema.musicScheduleBoothLines.slot, slot as MusicBoothSlot),
        ),
      )
      .get()
    if (existing) {
      db.update(schema.musicScheduleBoothLines)
        .set({text: draft.text, highlight: draft.highlight, draftedFrom: draft.text})
        .where(eq(schema.musicScheduleBoothLines.id, existing.id))
        .run()
    } else {
      db.insert(schema.musicScheduleBoothLines)
        .values({
          serviceId,
          slot: slot as MusicBoothSlot,
          text: draft.text,
          highlight: draft.highlight,
          draftedFrom: draft.text,
        })
        .run()
    }
    touch(id, found.schedule.id)
    res.json({boothLines: boothLinesFor(serviceId).map((bl) => ({...bl, stale: boothLineStale(bl, lines)}))})
  }),
)

/**
 * Store this service's line structure as the default for its Service Time —
 * what a first week with no predecessor is built from. Songs and highlights are
 * stripped: a default is a skeleton, not last week's content.
 */
musicSchedulesRouter.post(
  '/:id/services/:serviceId/save-as-default',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const serviceId = Number(req.params.serviceId)
    const found = weekWithSchedule(id)
    const service = db
      .select()
      .from(schema.musicScheduleServices)
      .where(eq(schema.musicScheduleServices.id, serviceId))
      .get()
    if (!found || !service || service.musicScheduleId !== id) {
      res.status(404).json({error: 'Service not found'})
      return
    }
    if (service.serviceTimeId == null) {
      res.status(400).json({error: 'A one-off service has no Service Time to be the default for'})
      return
    }
    if (service.standalone) {
      res.status(400).json({error: 'A Standalone order is never saved as the default'})
      return
    }
    const orders = readDefaultOrders()
    orders[String(service.serviceTimeId)] = linesFor(serviceId).map((l) => ({
      kind: l.kind,
      role: l.role,
      text: l.text,
      suffix: l.suffix,
      leftText: l.leftText,
      merged: l.merged,
      align: l.align,
      bold: l.bold,
      italic: l.italic,
      booth: l.booth,
      boothLabel: l.boothLabel,
      boothNote: l.boothNote,
      sticky: l.sticky,
    }))
    db.insert(schema.settings)
      .values({
        key: 'schedules.musicSchedule.defaultOrders',
        value: JSON.stringify(orders),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: {value: JSON.stringify(orders), updatedAt: new Date().toISOString()},
      })
      .run()
    res.json({serviceTimeId: service.serviceTimeId, lines: orders[String(service.serviceTimeId)].length})
  }),
)
