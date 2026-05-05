import {and, asc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const calendarPrintRouter = Router()

const DEFAULT_SCHEDULE_KEY = 'calendar_print_default_schedule'

const DEFAULT_SCHEDULE_SEED = `Men's Prayer Time – **9:30 am**
Sunday School – **9:45 am**
Sunday Morning – **11:00 am**
Kids & Youth ALIVE – **5:00 pm**
Choir Practice – **5:30 pm**
Sunday Evening – **6:30 pm**
---
Wednesday Evening Bible Study & Prayer Time – **7:30 pm**

Saturday Cleaning – **9:00 am**
Saturday Visitation & Outreach – **10:00 am**`

function readDefaultSchedule(): string {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, DEFAULT_SCHEDULE_KEY)).get()
  return row?.value ?? DEFAULT_SCHEDULE_SEED
}

function writeDefaultSchedule(value: string): string {
  db.insert(schema.settings)
    .values({key: DEFAULT_SCHEDULE_KEY, value})
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {value, updatedAt: sql`datetime('now')`},
    })
    .run()
  return value
}

function getOrCreatePage(year: number, month: number) {
  const existing = db
    .select()
    .from(schema.calendarPrintPages)
    .where(and(eq(schema.calendarPrintPages.year, year), eq(schema.calendarPrintPages.month, month)))
    .get()

  if (existing) return existing

  const created = db.insert(schema.calendarPrintPages).values({year, month}).returning().get()
  return created
}

function listEvents(pageId: number) {
  return db
    .select()
    .from(schema.calendarPrintEvents)
    .where(eq(schema.calendarPrintEvents.pageId, pageId))
    .orderBy(
      asc(schema.calendarPrintEvents.date),
      asc(schema.calendarPrintEvents.sortOrder),
      asc(schema.calendarPrintEvents.id),
    )
    .all()
}

// GET /api/calendar-print/default-schedule
calendarPrintRouter.get(
  '/default-schedule',
  asyncHandler(async (_req, res) => {
    res.json({value: readDefaultSchedule()})
  }),
)

// PUT /api/calendar-print/default-schedule
calendarPrintRouter.put(
  '/default-schedule',
  asyncHandler(async (req, res) => {
    const value = String(req.body?.value ?? '')
    res.json({value: writeDefaultSchedule(value)})
  }),
)

// PUT /api/calendar-print/events/:id
calendarPrintRouter.put(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {date, title, style, sortOrder} = req.body ?? {}

    const result = db
      .update(schema.calendarPrintEvents)
      .set({
        date: date ?? undefined,
        title: title ?? undefined,
        style: style ?? undefined,
        sortOrder: sortOrder ?? undefined,
      })
      .where(eq(schema.calendarPrintEvents.id, id))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Event not found'})
      return
    }
    res.json(result)
  }),
)

// DELETE /api/calendar-print/events/:id
calendarPrintRouter.delete(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const result = db
      .delete(schema.calendarPrintEvents)
      .where(eq(schema.calendarPrintEvents.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Event not found'})
      return
    }
    res.json({success: true})
  }),
)

// GET /api/calendar-print/:year/:month
calendarPrintRouter.get(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({error: 'Invalid year or month'})
      return
    }

    const page = getOrCreatePage(year, month)
    const events = listEvents(page.id)
    res.json({page, events, defaultSchedule: readDefaultSchedule()})
  }),
)

// PUT /api/calendar-print/:year/:month
calendarPrintRouter.put(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({error: 'Invalid year or month'})
      return
    }

    const page = getOrCreatePage(year, month)
    const {theme, themeColor, verseText, verseReference, normalScheduleText} = req.body ?? {}

    const updated = db
      .update(schema.calendarPrintPages)
      .set({
        theme: theme ?? null,
        themeColor: themeColor ?? null,
        verseText: verseText ?? null,
        verseReference: verseReference ?? null,
        normalScheduleText: normalScheduleText ?? null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.calendarPrintPages.id, page.id))
      .returning()
      .get()

    res.json(updated)
  }),
)

// POST /api/calendar-print/:year/:month/events
calendarPrintRouter.post(
  '/:year/:month/events',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const {date, title, style, sortOrder} = req.body ?? {}

    if (!date || !title || !style) {
      res.status(400).json({error: 'date, title, and style are required'})
      return
    }
    if (style !== 'bold' && style !== 'no_kaya' && style !== 'regular') {
      res.status(400).json({error: 'Invalid style'})
      return
    }

    const page = getOrCreatePage(year, month)
    const created = db
      .insert(schema.calendarPrintEvents)
      .values({pageId: page.id, date, title, style, sortOrder: sortOrder ?? 0})
      .returning()
      .get()

    res.status(201).json(created)
  }),
)
