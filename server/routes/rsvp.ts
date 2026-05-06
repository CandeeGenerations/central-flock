import {and, eq, inArray, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema, sqlite} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const rsvpRouter = Router()

type Status = 'yes' | 'no' | 'maybe' | 'no_response'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function effectiveDateExpr() {
  // Prefer the calendar event start date (date portion) when linked, otherwise the standalone date.
  return sql<
    string | null
  >`COALESCE(substr(${schema.calendarEvents.startDate}, 1, 10), ${schema.rsvpLists.standaloneDate})`
}

function summaryRows(listIds: number[]) {
  if (listIds.length === 0) return []
  return db
    .select({
      rsvpListId: schema.rsvpEntries.rsvpListId,
      status: schema.rsvpEntries.status,
      headcount: schema.rsvpEntries.headcount,
    })
    .from(schema.rsvpEntries)
    .where(inArray(schema.rsvpEntries.rsvpListId, listIds))
    .all()
}

type Counts = {yes: number; no: number; maybe: number; no_response: number; total: number; expectedAttendees: number}

function buildCounts(rows: {rsvpListId: number; status: Status; headcount: number | null}[]): Map<number, Counts> {
  const map = new Map<number, Counts>()
  for (const row of rows) {
    let c = map.get(row.rsvpListId)
    if (!c) {
      c = {yes: 0, no: 0, maybe: 0, no_response: 0, total: 0, expectedAttendees: 0}
      map.set(row.rsvpListId, c)
    }
    c[row.status as Status]++
    c.total++
    if (row.status === 'yes') c.expectedAttendees += row.headcount ?? 0
  }
  return map
}

// GET /api/rsvp/lists?archived=false|true
rsvpRouter.get(
  '/lists',
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.archived === 'true'
    const today = todayIso()

    const lists = db
      .select({
        id: schema.rsvpLists.id,
        name: schema.rsvpLists.name,
        calendarEventId: schema.rsvpLists.calendarEventId,
        standaloneTitle: schema.rsvpLists.standaloneTitle,
        standaloneDate: schema.rsvpLists.standaloneDate,
        standaloneTime: schema.rsvpLists.standaloneTime,
        createdAt: schema.rsvpLists.createdAt,
        updatedAt: schema.rsvpLists.updatedAt,
        calendarEventTitle: schema.calendarEvents.title,
        calendarEventStartDate: schema.calendarEvents.startDate,
        calendarEventLocation: schema.calendarEvents.location,
        effectiveDate: effectiveDateExpr(),
      })
      .from(schema.rsvpLists)
      .leftJoin(schema.calendarEvents, eq(schema.rsvpLists.calendarEventId, schema.calendarEvents.id))
      .all()

    const filtered = includeArchived ? lists : lists.filter((l) => !l.effectiveDate || l.effectiveDate >= today)

    const counts = buildCounts(
      summaryRows(filtered.map((l) => l.id)).map((r) => ({
        rsvpListId: r.rsvpListId,
        status: r.status as Status,
        headcount: r.headcount,
      })),
    )

    res.json(
      filtered
        .map((l) => ({
          ...l,
          counts: counts.get(l.id) || {yes: 0, no: 0, maybe: 0, no_response: 0, total: 0, expectedAttendees: 0},
        }))
        .sort((a, b) => {
          // Upcoming first by effective date asc; lists without a date sink to the bottom.
          const ad = a.effectiveDate || '9999'
          const bd = b.effectiveDate || '9999'
          if (ad !== bd) return ad < bd ? -1 : 1
          return a.name.localeCompare(b.name)
        }),
    )
  }),
)

// GET /api/rsvp/lists/:id
rsvpRouter.get(
  '/lists/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)

    const list = db
      .select({
        id: schema.rsvpLists.id,
        name: schema.rsvpLists.name,
        calendarEventId: schema.rsvpLists.calendarEventId,
        standaloneTitle: schema.rsvpLists.standaloneTitle,
        standaloneDate: schema.rsvpLists.standaloneDate,
        standaloneTime: schema.rsvpLists.standaloneTime,
        createdAt: schema.rsvpLists.createdAt,
        updatedAt: schema.rsvpLists.updatedAt,
        calendarEventTitle: schema.calendarEvents.title,
        calendarEventStartDate: schema.calendarEvents.startDate,
        calendarEventLocation: schema.calendarEvents.location,
        effectiveDate: effectiveDateExpr(),
      })
      .from(schema.rsvpLists)
      .leftJoin(schema.calendarEvents, eq(schema.rsvpLists.calendarEventId, schema.calendarEvents.id))
      .where(eq(schema.rsvpLists.id, id))
      .get()

    if (!list) {
      res.status(404).json({error: 'RSVP list not found'})
      return
    }

    const entries = db
      .select({
        id: schema.rsvpEntries.id,
        rsvpListId: schema.rsvpEntries.rsvpListId,
        personId: schema.rsvpEntries.personId,
        status: schema.rsvpEntries.status,
        headcount: schema.rsvpEntries.headcount,
        note: schema.rsvpEntries.note,
        respondedAt: schema.rsvpEntries.respondedAt,
        createdAt: schema.rsvpEntries.createdAt,
        updatedAt: schema.rsvpEntries.updatedAt,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
        phoneNumber: schema.people.phoneNumber,
        phoneDisplay: schema.people.phoneDisplay,
      })
      .from(schema.rsvpEntries)
      .innerJoin(schema.people, eq(schema.rsvpEntries.personId, schema.people.id))
      .where(eq(schema.rsvpEntries.rsvpListId, id))
      .orderBy(schema.people.lastName, schema.people.firstName)
      .all()

    const counts = buildCounts(
      entries.map((e) => ({rsvpListId: e.rsvpListId, status: e.status as Status, headcount: e.headcount})),
    ).get(id) || {yes: 0, no: 0, maybe: 0, no_response: 0, total: 0, expectedAttendees: 0}

    res.json({...list, entries, counts})
  }),
)

type CreateBody = {
  name: string
  calendarEventId?: number | null
  standaloneTitle?: string | null
  standaloneDate?: string | null
  standaloneTime?: string | null
  seedGroupIds?: number[]
  seedPersonIds?: number[]
}

// POST /api/rsvp/lists
rsvpRouter.post(
  '/lists',
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBody
    if (!body.name || typeof body.name !== 'string') {
      res.status(400).json({error: 'name is required'})
      return
    }

    const created = sqlite.transaction(() => {
      const list = db
        .insert(schema.rsvpLists)
        .values({
          name: body.name.trim(),
          calendarEventId: body.calendarEventId ?? null,
          standaloneTitle: body.calendarEventId ? null : body.standaloneTitle?.trim() || null,
          standaloneDate: body.calendarEventId ? null : body.standaloneDate || null,
          standaloneTime: body.calendarEventId ? null : body.standaloneTime || null,
        })
        .returning()
        .get()

      const personIds = new Set<number>()

      if (body.seedGroupIds?.length) {
        const groupMembers = db
          .select({personId: schema.peopleGroups.personId})
          .from(schema.peopleGroups)
          .where(inArray(schema.peopleGroups.groupId, body.seedGroupIds))
          .all()
        for (const m of groupMembers) personIds.add(m.personId)
      }

      if (body.seedPersonIds?.length) {
        for (const pid of body.seedPersonIds) personIds.add(pid)
      }

      if (personIds.size > 0) {
        db.insert(schema.rsvpEntries)
          .values([...personIds].map((personId) => ({rsvpListId: list.id, personId})))
          .run()
      }

      return list
    })()

    res.status(201).json(created)
  }),
)

// PATCH /api/rsvp/lists/:id
rsvpRouter.patch(
  '/lists/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {name, calendarEventId, standaloneTitle, standaloneDate, standaloneTime} = req.body as Partial<CreateBody>

    const update: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
    if (name !== undefined) update.name = String(name).trim()
    if (calendarEventId !== undefined) {
      update.calendarEventId = calendarEventId
      // When linking to a calendar event, clear standalone fields.
      if (calendarEventId !== null) {
        update.standaloneTitle = null
        update.standaloneDate = null
        update.standaloneTime = null
      }
    }
    if (standaloneTitle !== undefined) update.standaloneTitle = standaloneTitle
    if (standaloneDate !== undefined) update.standaloneDate = standaloneDate
    if (standaloneTime !== undefined) update.standaloneTime = standaloneTime

    const result = db.update(schema.rsvpLists).set(update).where(eq(schema.rsvpLists.id, id)).returning().get()
    if (!result) {
      res.status(404).json({error: 'RSVP list not found'})
      return
    }
    res.json(result)
  }),
)

// DELETE /api/rsvp/lists/:id
rsvpRouter.delete(
  '/lists/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const result = db.delete(schema.rsvpLists).where(eq(schema.rsvpLists.id, id)).returning().get()
    if (!result) {
      res.status(404).json({error: 'RSVP list not found'})
      return
    }
    res.json({success: true})
  }),
)

// POST /api/rsvp/lists/:id/entries — add people (skip duplicates)
rsvpRouter.post(
  '/lists/:id/entries',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {personIds} = req.body as {personIds: number[]}

    const list = db.select().from(schema.rsvpLists).where(eq(schema.rsvpLists.id, id)).get()
    if (!list) {
      res.status(404).json({error: 'RSVP list not found'})
      return
    }
    if (!Array.isArray(personIds) || personIds.length === 0) {
      res.json({added: 0, alreadyOnList: 0})
      return
    }

    const existing = db
      .select({personId: schema.rsvpEntries.personId})
      .from(schema.rsvpEntries)
      .where(and(eq(schema.rsvpEntries.rsvpListId, id), inArray(schema.rsvpEntries.personId, personIds)))
      .all()
    const existingIds = new Set(existing.map((e) => e.personId))
    const newIds = personIds.filter((pid) => !existingIds.has(pid))

    if (newIds.length > 0) {
      db.insert(schema.rsvpEntries)
        .values(newIds.map((personId) => ({rsvpListId: id, personId})))
        .run()
    }

    res.json({added: newIds.length, alreadyOnList: existingIds.size})
  }),
)

type EntryUpdate = {status?: Status; headcount?: number | null; note?: string | null}

function applyEntryUpdate(entryId: number, update: EntryUpdate) {
  const current = db.select().from(schema.rsvpEntries).where(eq(schema.rsvpEntries.id, entryId)).get()
  if (!current) return null

  const next: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
  if (update.status !== undefined) {
    next.status = update.status
    // Auto-set respondedAt on transition out of no_response.
    if (current.status === 'no_response' && update.status !== 'no_response') {
      next.respondedAt = sql`datetime('now')`
    }
    // Auto-default headcount = 1 when transitioning to yes/maybe and headcount is null.
    if (
      (update.status === 'yes' || update.status === 'maybe') &&
      (current.headcount === null || current.headcount === undefined) &&
      update.headcount === undefined
    ) {
      next.headcount = 1
    }
  }
  if (update.headcount !== undefined) next.headcount = update.headcount
  if (update.note !== undefined) next.note = update.note

  return db.update(schema.rsvpEntries).set(next).where(eq(schema.rsvpEntries.id, entryId)).returning().get()
}

// PATCH /api/rsvp/entries/:id
rsvpRouter.patch(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const result = applyEntryUpdate(id, req.body as EntryUpdate)
    if (!result) {
      res.status(404).json({error: 'Entry not found'})
      return
    }
    res.json(result)
  }),
)

// POST /api/rsvp/entries/bulk — bulk update or remove
rsvpRouter.post(
  '/entries/bulk',
  asyncHandler(async (req, res) => {
    const {ids, status, removeFromList} = req.body as {
      ids: number[]
      status?: Status
      removeFromList?: boolean
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({error: 'ids[] required'})
      return
    }

    if (removeFromList) {
      db.delete(schema.rsvpEntries).where(inArray(schema.rsvpEntries.id, ids)).run()
      res.json({removed: ids.length})
      return
    }

    if (status === undefined) {
      res.status(400).json({error: 'status or removeFromList required'})
      return
    }

    const updated = sqlite.transaction(() => {
      let n = 0
      for (const id of ids) {
        const r = applyEntryUpdate(id, {status})
        if (r) n++
      }
      return n
    })()

    res.json({updated})
  }),
)

// DELETE /api/rsvp/entries/:id
rsvpRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const result = db.delete(schema.rsvpEntries).where(eq(schema.rsvpEntries.id, id)).returning().get()
    if (!result) {
      res.status(404).json({error: 'Entry not found'})
      return
    }
    res.json({success: true})
  }),
)

// GET /api/rsvp/lists/:id/non-entries — people not on this list, for the add-person dialog
rsvpRouter.get(
  '/lists/:id/non-entries',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {search, page = '1', limit = '30'} = req.query
    const offset = (Number(page) - 1) * Number(limit)

    const memberIds = db
      .select({personId: schema.rsvpEntries.personId})
      .from(schema.rsvpEntries)
      .where(eq(schema.rsvpEntries.rsvpListId, id))

    const conditions = [sql`${schema.people.id} NOT IN ${memberIds}`, sql`${schema.people.phoneNumber} IS NOT NULL`]

    if (search && typeof search === 'string') {
      conditions.push(
        sql`(${schema.people.firstName} LIKE ${'%' + search + '%'} OR ${schema.people.lastName} LIKE ${'%' + search + '%'} OR ${schema.people.phoneDisplay} LIKE ${'%' + search + '%'} OR (COALESCE(${schema.people.firstName}, '') || ' ' || COALESCE(${schema.people.lastName}, '')) LIKE ${'%' + search + '%'})`,
      )
    }

    const where = and(...conditions)

    const [nonMembers, countResult] = await Promise.all([
      db
        .select()
        .from(schema.people)
        .where(where)
        .orderBy(schema.people.lastName, schema.people.firstName)
        .limit(Number(limit))
        .offset(offset),
      db
        .select({count: sql<number>`count(*)`})
        .from(schema.people)
        .where(where),
    ])

    res.json({
      data: nonMembers,
      total: countResult[0]?.count || 0,
      page: Number(page),
      limit: Number(limit),
    })
  }),
)

// GET /api/rsvp/calendar-events?days=120 — synced calendar events for the create dialog picker
rsvpRouter.get(
  '/calendar-events',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 120, 1), 365)
    const today = todayIso()
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const events = db
      .select({
        id: schema.calendarEvents.id,
        eventUid: schema.calendarEvents.eventUid,
        title: schema.calendarEvents.title,
        startDate: schema.calendarEvents.startDate,
        endDate: schema.calendarEvents.endDate,
        allDay: schema.calendarEvents.allDay,
        location: schema.calendarEvents.location,
        calendarName: schema.calendarEvents.calendarName,
      })
      .from(schema.calendarEvents)
      .where(
        and(
          sql`substr(${schema.calendarEvents.startDate}, 1, 10) >= ${today}`,
          sql`substr(${schema.calendarEvents.startDate}, 1, 10) <= ${future}`,
        ),
      )
      .orderBy(schema.calendarEvents.startDate)
      .all()

    res.json(events)
  }),
)
