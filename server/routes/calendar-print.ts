import {and, asc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const calendarPrintRouter = Router()

type ItemInput = {
  id?: number
  type?: 'line' | 'spacer'
  text?: string
  bold?: boolean
  column?: number
  eligibleDays?: string | string[]
  hidden?: boolean
  sortOrder?: number
}

function normalizeEligibleDays(input: unknown): string {
  if (Array.isArray(input)) {
    return input
      .map((d) => String(d).trim().toLowerCase())
      .filter((d) => d === 'sun' || d === 'wed' || d === 'sat')
      .join(',')
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d === 'sun' || d === 'wed' || d === 'sat')
      .join(',')
  }
  return 'sun,wed,sat'
}

function readScheduleItems(pageId: number | null) {
  if (pageId != null) {
    const pageItems = db
      .select()
      .from(schema.normalScheduleItems)
      .where(and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, pageId)))
      .orderBy(asc(schema.normalScheduleItems.sortOrder), asc(schema.normalScheduleItems.id))
      .all()
    if (pageItems.length > 0) return pageItems
  }
  return db
    .select()
    .from(schema.normalScheduleItems)
    .where(eq(schema.normalScheduleItems.scopeType, 'default'))
    .orderBy(asc(schema.normalScheduleItems.sortOrder), asc(schema.normalScheduleItems.id))
    .all()
}

function listDayOverrides(pageId: number) {
  return db
    .select()
    .from(schema.calendarPrintDayOverrides)
    .where(eq(schema.calendarPrintDayOverrides.pageId, pageId))
    .all()
}

function hasPageScheduleItems(pageId: number): boolean {
  const row = db
    .select({id: schema.normalScheduleItems.id})
    .from(schema.normalScheduleItems)
    .where(and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, pageId)))
    .limit(1)
    .get()
  return !!row
}

function clearInlineSelectionsForPage(pageId: number) {
  db.update(schema.calendarPrintDayOverrides)
    .set({inlineItemIds: '[]', updatedAt: sql`datetime('now')`})
    .where(eq(schema.calendarPrintDayOverrides.pageId, pageId))
    .run()
}

function writeScheduleItems(scopeType: 'default' | 'page', scopeId: number | null, items: ItemInput[]) {
  db.transaction((tx) => {
    // Load existing ids in scope so we can UPSERT and prune deleted rows.
    const existing = (
      scopeType === 'default'
        ? tx
            .select({id: schema.normalScheduleItems.id})
            .from(schema.normalScheduleItems)
            .where(eq(schema.normalScheduleItems.scopeType, 'default'))
            .all()
        : tx
            .select({id: schema.normalScheduleItems.id})
            .from(schema.normalScheduleItems)
            .where(
              and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, scopeId!)),
            )
            .all()
    ).map((r) => r.id)
    const existingSet = new Set(existing)
    const keptIds = new Set<number>()

    items.forEach((it, idx) => {
      const type = it.type === 'spacer' ? 'spacer' : 'line'
      const column = it.column === 2 ? 2 : 1
      const sortOrder = typeof it.sortOrder === 'number' ? it.sortOrder : (idx + 1) * 10
      const values = {
        type: type as 'line' | 'spacer',
        text: type === 'spacer' ? '' : String(it.text ?? ''),
        bold: !!it.bold,
        column,
        eligibleDays: normalizeEligibleDays(it.eligibleDays),
        hidden: !!it.hidden,
        sortOrder,
      }
      if (it.id != null && existingSet.has(it.id)) {
        tx.update(schema.normalScheduleItems).set(values).where(eq(schema.normalScheduleItems.id, it.id)).run()
        keptIds.add(it.id)
      } else {
        tx.insert(schema.normalScheduleItems)
          .values({
            ...values,
            scopeType,
            scopeId: scopeType === 'page' ? scopeId : null,
          })
          .run()
      }
    })

    // Prune rows that weren't in the input.
    for (const id of existing) {
      if (!keptIds.has(id)) {
        tx.delete(schema.normalScheduleItems).where(eq(schema.normalScheduleItems.id, id)).run()
      }
    }
  })
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
    res.json({items: readScheduleItems(null)})
  }),
)

// PUT /api/calendar-print/default-schedule
calendarPrintRouter.put(
  '/default-schedule',
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? (req.body.items as ItemInput[]) : []
    writeScheduleItems('default', null, items)
    res.json({items: readScheduleItems(null)})
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
    const scheduleItems = readScheduleItems(page.id)
    const dayOverrides = listDayOverrides(page.id)
    res.json({page, events, scheduleItems, dayOverrides})
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
    const body = req.body ?? {}
    const {scheduleItems} = body

    // Only update page fields that were explicitly included in the request body — avoids
    // wiping theme/verse when a caller only wants to update scheduleItems.
    const patch: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
    if ('theme' in body) patch.theme = body.theme ?? null
    if ('themeColor' in body) patch.themeColor = body.themeColor ?? null
    if ('themePlacement' in body) patch.themePlacement = body.themePlacement ?? null
    if ('versePlacement' in body) patch.versePlacement = body.versePlacement ?? null
    if ('verseText' in body) patch.verseText = body.verseText ?? null
    if ('verseReference' in body) patch.verseReference = body.verseReference ?? null
    if ('hideNormalScheduleFooter' in body) patch.hideNormalScheduleFooter = !!body.hideNormalScheduleFooter

    const updated = db
      .update(schema.calendarPrintPages)
      .set(patch)
      .where(eq(schema.calendarPrintPages.id, page.id))
      .returning()
      .get()

    // scheduleItems handling: null/undefined → no change (or revert override if explicit null)
    if (scheduleItems === null) {
      // Revert to default — drop any page items + clear inline selections (scope change).
      const had = hasPageScheduleItems(page.id)
      if (had) {
        db.delete(schema.normalScheduleItems)
          .where(and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, page.id)))
          .run()
        clearInlineSelectionsForPage(page.id)
      }
    } else if (Array.isArray(scheduleItems)) {
      const had = hasPageScheduleItems(page.id)
      writeScheduleItems('page', page.id, scheduleItems as ItemInput[])
      if (!had) {
        // Scope changed default → override. Inline selections referenced default ids; clear.
        clearInlineSelectionsForPage(page.id)
      }
    }

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

    if (!date || title === undefined || title === null || !style) {
      res.status(400).json({error: 'date, title, and style are required'})
      return
    }
    if (style !== 'bold' && style !== 'regular') {
      res.status(400).json({error: 'Invalid style'})
      return
    }
    if (!String(title).trim()) {
      res.status(400).json({error: 'Title is required'})
      return
    }

    const page = getOrCreatePage(year, month)
    const created = db
      .insert(schema.calendarPrintEvents)
      .values({
        pageId: page.id,
        date,
        title,
        style,
        sortOrder: sortOrder ?? 0,
      })
      .returning()
      .get()

    res.status(201).json(created)
  }),
)

// POST /api/calendar-print/:year/:month/day-overrides
calendarPrintRouter.post(
  '/:year/:month/day-overrides',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const body = req.body ?? {}
    const {date, inlineItemIds} = body
    if (!date || !Array.isArray(inlineItemIds)) {
      res.status(400).json({error: 'date and inlineItemIds[] required'})
      return
    }
    const page = getOrCreatePage(year, month)
    const ids = (inlineItemIds as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n))
    const showNoKayaProvided = 'showNoKaya' in body
    const showNoKaya = !!body.showNoKaya
    const showLabelProvided = 'showNormalScheduleLabel' in body
    const showNormalScheduleLabel = showLabelProvided ? !!body.showNormalScheduleLabel : true
    const existing = db
      .select()
      .from(schema.calendarPrintDayOverrides)
      .where(and(eq(schema.calendarPrintDayOverrides.pageId, page.id), eq(schema.calendarPrintDayOverrides.date, date)))
      .get()
    if (existing) {
      const patch: Record<string, unknown> = {
        inlineItemIds: JSON.stringify(ids),
        updatedAt: sql`datetime('now')`,
      }
      if (showNoKayaProvided) patch.showNoKaya = showNoKaya
      if (showLabelProvided) patch.showNormalScheduleLabel = showNormalScheduleLabel
      const updated = db
        .update(schema.calendarPrintDayOverrides)
        .set(patch)
        .where(eq(schema.calendarPrintDayOverrides.id, existing.id))
        .returning()
        .get()
      res.json(updated)
      return
    }
    const created = db
      .insert(schema.calendarPrintDayOverrides)
      .values({pageId: page.id, date, inlineItemIds: JSON.stringify(ids), showNoKaya, showNormalScheduleLabel})
      .returning()
      .get()
    res.status(201).json(created)
  }),
)

// DELETE /api/calendar-print/day-overrides/:id
calendarPrintRouter.delete(
  '/day-overrides/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const result = db
      .delete(schema.calendarPrintDayOverrides)
      .where(eq(schema.calendarPrintDayOverrides.id, id))
      .returning()
      .get()
    if (!result) {
      res.status(404).json({error: 'Day override not found'})
      return
    }
    res.json({success: true})
  }),
)
