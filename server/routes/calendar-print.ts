import {and, asc, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {type RepeatRule, describeRule, guessRule, parseRule, sameRule} from '../lib/repeat-rules.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {listHistory, recordChange, redo, restoreTo, undo} from '../services/calendar-print-history.js'
import {getOrCreatePage, previewYearCopy, runYearCopy} from '../services/calendar-print-year-copy.js'

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

function upsertDayOverride(
  pageId: number,
  date: string,
  ids: number[],
  flags: {showNoKaya?: boolean; showNormalScheduleLabel?: boolean},
) {
  const existing = db
    .select()
    .from(schema.calendarPrintDayOverrides)
    .where(and(eq(schema.calendarPrintDayOverrides.pageId, pageId), eq(schema.calendarPrintDayOverrides.date, date)))
    .get()
  if (existing) {
    const patch: Record<string, unknown> = {inlineItemIds: JSON.stringify(ids), updatedAt: sql`datetime('now')`}
    if (flags.showNoKaya !== undefined) patch.showNoKaya = flags.showNoKaya
    if (flags.showNormalScheduleLabel !== undefined) patch.showNormalScheduleLabel = flags.showNormalScheduleLabel
    const row = db
      .update(schema.calendarPrintDayOverrides)
      .set(patch)
      .where(eq(schema.calendarPrintDayOverrides.id, existing.id))
      .returning()
      .get()
    return {row, created: false}
  }
  const row = db
    .insert(schema.calendarPrintDayOverrides)
    .values({
      pageId,
      date,
      inlineItemIds: JSON.stringify(ids),
      showNoKaya: flags.showNoKaya ?? false,
      showNormalScheduleLabel: flags.showNormalScheduleLabel ?? true,
    })
    .returning()
    .get()
  return {row, created: true}
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

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Plain words for History entries: "Sat Jan 16".
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function titleLine(title: string): string {
  const first = title.split('\n').find((l) => l.trim()) ?? ''
  return first.trim() || 'NO KAYA or Choir'
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

// The rule a request asks for: explicit (validated), else null so the caller decides.
function requestedRule(body: Record<string, unknown>): RepeatRule | null | 'invalid' {
  if (!('repeatRule' in body) || body.repeatRule == null) return null
  return parseRule(body.repeatRule) ?? 'invalid'
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

// GET /api/calendar-print/history — the Calendar Print History, newest first (docs/adr/0041).
calendarPrintRouter.get(
  '/history',
  asyncHandler(async (_req, res) => {
    res.json(listHistory())
  }),
)

// POST /api/calendar-print/history/undo
calendarPrintRouter.post(
  '/history/undo',
  asyncHandler(async (_req, res) => {
    const done = undo()
    if (!done) {
      res.status(409).json({error: 'Nothing to undo'})
      return
    }
    res.json(done)
  }),
)

// POST /api/calendar-print/history/redo
calendarPrintRouter.post(
  '/history/redo',
  asyncHandler(async (_req, res) => {
    const done = redo()
    if (!done) {
      res.status(409).json({error: 'Nothing to redo'})
      return
    }
    res.json(done)
  }),
)

// POST /api/calendar-print/history/:id/restore — roll back every Change after this one.
calendarPrintRouter.post(
  '/history/:id/restore',
  asyncHandler(async (req, res) => {
    const done = restoreTo(Number(req.params.id))
    if (!done) {
      res.status(404).json({error: 'History entry not found'})
      return
    }
    res.json(done)
  }),
)

function yearCopyYears(source: Record<string, unknown>): {fromYear: number; toYear: number} | null {
  const fromYear = Number(source.from)
  const toYear = Number(source.to)
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || fromYear === toYear) return null
  if (fromYear < 2000 || toYear < 2000 || fromYear > 2200 || toYear > 2200) return null
  return {fromYear, toYear}
}

// GET /api/calendar-print/year-copy/preview?from=2026&to=2027 — what the confirm dialog says.
calendarPrintRouter.get(
  '/year-copy/preview',
  asyncHandler(async (req, res) => {
    const years = yearCopyYears(req.query as Record<string, unknown>)
    if (!years) {
      res.status(400).json({error: 'from and to years required'})
      return
    }
    res.json(previewYearCopy(years.fromYear, years.toYear))
  }),
)

// POST /api/calendar-print/year-copy {from, to} — destructive for the target year; one Change.
calendarPrintRouter.post(
  '/year-copy',
  asyncHandler(async (req, res) => {
    const years = yearCopyYears((req.body ?? {}) as Record<string, unknown>)
    if (!years) {
      res.status(400).json({error: 'from and to years required'})
      return
    }
    res.json(runYearCopy(years.fromYear, years.toYear))
  }),
)

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
    recordChange('Edited the default Normal Schedule', () => writeScheduleItems('default', null, items))
    res.json({items: readScheduleItems(null)})
  }),
)

// PUT /api/calendar-print/events/:id
calendarPrintRouter.put(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = (req.body ?? {}) as Record<string, unknown>
    const {date, title, style, sortOrder} = body as {date?: string; title?: string; style?: string; sortOrder?: number}

    const existing = db.select().from(schema.calendarPrintEvents).where(eq(schema.calendarPrintEvents.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Event not found'})
      return
    }
    if (date != null && !isIsoDate(date)) {
      res.status(400).json({error: 'Invalid date'})
      return
    }
    const asked = requestedRule(body)
    if (asked === 'invalid') {
      res.status(400).json({error: 'Invalid repeatRule'})
      return
    }

    const nextDate = date ?? existing.date
    const nextTitle = title ?? existing.title
    const oldRule = parseRule(existing.repeatRule)
    // Moving an Event re-guesses its rule unless the form sent the one it showed.
    const nextRule = asked ?? (nextDate !== existing.date ? guessRule(nextTitle, nextDate) : oldRule)

    const parts: string[] = []
    if (nextDate !== existing.date) parts.push(`moved from ${shortDate(existing.date)} to ${shortDate(nextDate)}`)
    if (nextTitle !== existing.title) parts.push(`renamed from “${titleLine(existing.title)}”`)
    if (style != null && style !== existing.style) parts.push(`made ${style}`)
    if (nextRule && (!oldRule || !sameRule(nextRule, oldRule))) parts.push(`repeats: ${describeRule(nextRule)}`)
    const description = `Edited “${titleLine(nextTitle)}”${parts.length ? ` — ${parts.join('; ')}` : ''}`

    const result = recordChange(description, () => {
      // A date in another month belongs on that month's page.
      const [y, m] = nextDate.split('-').map(Number)
      const page = getOrCreatePage(y, m)
      return db
        .update(schema.calendarPrintEvents)
        .set({
          pageId: page.id,
          date: nextDate,
          title: title ?? undefined,
          style: (style as 'bold' | 'regular' | undefined) ?? undefined,
          sortOrder: sortOrder ?? undefined,
          repeatRule: nextRule ? JSON.stringify(nextRule) : undefined,
        })
        .where(eq(schema.calendarPrintEvents.id, id))
        .returning()
        .get()
    })
    res.json(result)
  }),
)

// DELETE /api/calendar-print/events/:id
calendarPrintRouter.delete(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db.select().from(schema.calendarPrintEvents).where(eq(schema.calendarPrintEvents.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Event not found'})
      return
    }
    recordChange(`Deleted “${titleLine(existing.title)}” from ${shortDate(existing.date)}`, () =>
      db.delete(schema.calendarPrintEvents).where(eq(schema.calendarPrintEvents.id, id)).run(),
    )
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
    if ('schedulePlacement' in body) patch.schedulePlacement = body.schedulePlacement ?? null
    if ('verseText' in body) patch.verseText = body.verseText ?? null
    if ('verseReference' in body) patch.verseReference = body.verseReference ?? null
    if ('hideNormalScheduleFooter' in body) patch.hideNormalScheduleFooter = !!body.hideNormalScheduleFooter

    const label = monthLabel(year, month)
    const description =
      scheduleItems === null
        ? `Put ${label} back on the default schedule`
        : Array.isArray(scheduleItems)
          ? `Edited ${label}'s schedule override`
          : `Edited ${label} page details`

    const updated = recordChange(description, () => {
      const row = db
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
            .where(
              and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, page.id)),
            )
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
      return row
    })

    res.json(updated)
  }),
)

// POST /api/calendar-print/:year/:month/events
calendarPrintRouter.post(
  '/:year/:month/events',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const body = (req.body ?? {}) as Record<string, unknown>
    const {date, title, style, sortOrder} = body as {date?: string; title?: string; style?: string; sortOrder?: number}

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
    if (!isIsoDate(date)) {
      res.status(400).json({error: 'Invalid date'})
      return
    }
    const asked = requestedRule(body)
    if (asked === 'invalid') {
      res.status(400).json({error: 'Invalid repeatRule'})
      return
    }
    const rule = asked ?? guessRule(String(title), date)

    const created = recordChange(`Added “${titleLine(String(title))}” on ${shortDate(date)}`, () => {
      const page = getOrCreatePage(year, month)
      return db
        .insert(schema.calendarPrintEvents)
        .values({
          pageId: page.id,
          date,
          title: String(title),
          style: style as 'bold' | 'regular',
          sortOrder: sortOrder ?? 0,
          repeatRule: JSON.stringify(rule),
        })
        .returning()
        .get()
    })

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
    const ids = (inlineItemIds as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n))
    const showNoKayaProvided = 'showNoKaya' in body
    const showNoKaya = !!body.showNoKaya
    const showLabelProvided = 'showNormalScheduleLabel' in body
    const showNormalScheduleLabel = showLabelProvided ? !!body.showNormalScheduleLabel : true
    const {row, created} = recordChange(`Changed what ${shortDate(date)} shows`, () => {
      const page = getOrCreatePage(year, month)
      return upsertDayOverride(page.id, date, ids, {
        showNoKaya: showNoKayaProvided ? showNoKaya : undefined,
        showNormalScheduleLabel: showLabelProvided ? showNormalScheduleLabel : undefined,
      })
    })
    res.status(created ? 201 : 200).json(row)
  }),
)

// POST /api/calendar-print/:year/:month/day-overrides/apply — "Apply to all Sundays in May"
// as one Change. Empty ids + no No Kaya clears the override (back to the default label).
calendarPrintRouter.post(
  '/:year/:month/day-overrides/apply',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const body = req.body ?? {}
    const {dates, inlineItemIds, sourceDate} = body
    if (!Array.isArray(dates) || !dates.every(isIsoDate) || !Array.isArray(inlineItemIds)) {
      res.status(400).json({error: 'dates[] and inlineItemIds[] required'})
      return
    }
    const ids = (inlineItemIds as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n))
    const showNoKaya = !!body.showNoKaya
    const showNormalScheduleLabel = 'showNormalScheduleLabel' in body ? !!body.showNormalScheduleLabel : true
    const weekday = isIsoDate(sourceDate)
      ? new Date(`${sourceDate}T00:00:00Z`).toLocaleDateString('en-US', {weekday: 'long', timeZone: 'UTC'})
      : 'day'
    recordChange(`Applied one schedule to every ${weekday} in ${monthLabel(year, month)}`, () => {
      const page = getOrCreatePage(year, month)
      for (const date of dates as string[]) {
        if (ids.length === 0 && !showNoKaya) {
          db.delete(schema.calendarPrintDayOverrides)
            .where(
              and(
                eq(schema.calendarPrintDayOverrides.pageId, page.id),
                eq(schema.calendarPrintDayOverrides.date, date),
              ),
            )
            .run()
        } else {
          upsertDayOverride(page.id, date, ids, {showNoKaya, showNormalScheduleLabel})
        }
      }
    })
    res.json({success: true, count: dates.length})
  }),
)

// DELETE /api/calendar-print/day-overrides/:id
calendarPrintRouter.delete(
  '/day-overrides/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const existing = db
      .select()
      .from(schema.calendarPrintDayOverrides)
      .where(eq(schema.calendarPrintDayOverrides.id, id))
      .get()
    if (!existing) {
      res.status(404).json({error: 'Day override not found'})
      return
    }
    recordChange(`Put ${shortDate(existing.date)} back on the Normal Schedule label`, () =>
      db.delete(schema.calendarPrintDayOverrides).where(eq(schema.calendarPrintDayOverrides.id, id)).run(),
    )
    res.json({success: true})
  }),
)
