import {and, eq, inArray, sql} from 'drizzle-orm'
import {Router} from 'express'
import {randomBytes} from 'node:crypto'

import {db, schema, sqlite} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

function newPublicToken(): string {
  return randomBytes(24).toString('base64url')
}

export const rsvpRouter = Router()

type Status = 'yes' | 'no' | 'maybe' | 'no_response'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function effectiveDateExpr() {
  // Prefer an explicit override; fall back to the linked calendar event's start date.
  return sql<
    string | null
  >`COALESCE(${schema.rsvpLists.standaloneDate}, substr(${schema.calendarEvents.startDate}, 1, 10))`
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
        standaloneEndTime: schema.rsvpLists.standaloneEndTime,
        createdAt: schema.rsvpLists.createdAt,
        updatedAt: schema.rsvpLists.updatedAt,
        calendarEventTitle: schema.calendarEvents.title,
        calendarEventStartDate: schema.calendarEvents.startDate,
        calendarEventEndDate: schema.calendarEvents.endDate,
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
        standaloneEndTime: schema.rsvpLists.standaloneEndTime,
        createdAt: schema.rsvpLists.createdAt,
        updatedAt: schema.rsvpLists.updatedAt,
        calendarEventTitle: schema.calendarEvents.title,
        calendarEventStartDate: schema.calendarEvents.startDate,
        calendarEventEndDate: schema.calendarEvents.endDate,
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
        publicToken: schema.rsvpEntries.publicToken,
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

    res.json({...list, entries, counts, rsvpPublicUrlBase: process.env.RSVP_PUBLIC_URL_BASE ?? ''})
  }),
)

type CreateBody = {
  name: string
  calendarEventId?: number | null
  standaloneTitle?: string | null
  standaloneDate?: string | null
  standaloneTime?: string | null
  standaloneEndTime?: string | null
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
          standaloneTitle: body.standaloneTitle?.trim() || null,
          standaloneDate: body.standaloneDate || null,
          standaloneTime: body.standaloneTime || null,
          standaloneEndTime: body.standaloneEndTime || null,
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
          .values([...personIds].map((personId) => ({rsvpListId: list.id, personId, publicToken: newPublicToken()})))
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
    const {name, calendarEventId, standaloneTitle, standaloneDate, standaloneTime, standaloneEndTime} =
      req.body as Partial<CreateBody>

    const update: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
    if (name !== undefined) update.name = String(name).trim()
    if (calendarEventId !== undefined) {
      update.calendarEventId = calendarEventId
    }
    if (standaloneTitle !== undefined) update.standaloneTitle = standaloneTitle
    if (standaloneDate !== undefined) update.standaloneDate = standaloneDate
    if (standaloneTime !== undefined) update.standaloneTime = standaloneTime
    if (standaloneEndTime !== undefined) update.standaloneEndTime = standaloneEndTime

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
        .values(newIds.map((personId) => ({rsvpListId: id, personId, publicToken: newPublicToken()})))
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

// GET /api/rsvp/lists/:id/context — compose-page context (event meta + first token + URL base)
rsvpRouter.get(
  '/lists/:id/context',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const list = db
      .select({
        id: schema.rsvpLists.id,
        name: schema.rsvpLists.name,
        standaloneTitle: schema.rsvpLists.standaloneTitle,
        standaloneDate: schema.rsvpLists.standaloneDate,
        standaloneTime: schema.rsvpLists.standaloneTime,
        standaloneEndTime: schema.rsvpLists.standaloneEndTime,
        calendarEventTitle: schema.calendarEvents.title,
        calendarEventStartDate: schema.calendarEvents.startDate,
        calendarEventEndDate: schema.calendarEvents.endDate,
      })
      .from(schema.rsvpLists)
      .leftJoin(schema.calendarEvents, eq(schema.rsvpLists.calendarEventId, schema.calendarEvents.id))
      .where(eq(schema.rsvpLists.id, id))
      .get()

    if (!list) {
      res.status(404).json({error: 'RSVP list not found'})
      return
    }

    // Standalone title (when set) acts as an override on top of the linked calendar event's title.
    const eventTitle = list.standaloneTitle ?? list.calendarEventTitle ?? list.name
    // Calendar event datetimes are stored as UTC ISO; convert to server-local for display.
    const localDate = (utc: string) => {
      const d = new Date(utc)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const localTime = (utc: string) => {
      const d = new Date(utc)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    // Standalone fields act as overrides; fall back to the linked calendar event.
    const eventDate =
      list.standaloneDate ?? (list.calendarEventStartDate ? localDate(list.calendarEventStartDate) : null)
    const eventTime =
      list.standaloneTime ?? (list.calendarEventStartDate ? localTime(list.calendarEventStartDate) : null)
    const eventEndTime =
      list.standaloneEndTime ?? (list.calendarEventEndDate ? localTime(list.calendarEventEndDate) : null)

    const firstEntry = db
      .select({publicToken: schema.rsvpEntries.publicToken})
      .from(schema.rsvpEntries)
      .where(eq(schema.rsvpEntries.rsvpListId, id))
      .limit(1)
      .get()

    res.json({
      id: list.id,
      name: list.name,
      eventTitle,
      eventDate,
      eventTime,
      eventEndTime,
      firstEntryPublicToken: firstEntry?.publicToken ?? null,
      rsvpPublicUrlBase: process.env.RSVP_PUBLIC_URL_BASE ?? '',
      missingEntryCount: 0,
    })
  }),
)

// POST /api/rsvp/lists/:id/missing-entries — given recipient IDs, return which are not on the list
rsvpRouter.post(
  '/lists/:id/missing-entries',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {personIds} = req.body as {personIds?: number[]}
    if (!Array.isArray(personIds) || personIds.length === 0) {
      res.json({missingPersonIds: []})
      return
    }
    const present = db
      .select({personId: schema.rsvpEntries.personId})
      .from(schema.rsvpEntries)
      .where(and(eq(schema.rsvpEntries.rsvpListId, id), inArray(schema.rsvpEntries.personId, personIds)))
      .all()
    const presentSet = new Set(present.map((p) => p.personId))
    res.json({missingPersonIds: personIds.filter((pid) => !presentSet.has(pid))})
  }),
)

type MergeListMeta = {
  id: number
  name: string
  calendarEventId: number | null
  calendarEventTitle: string | null
  calendarEventStartDate: string | null
  standaloneTitle: string | null
  standaloneDate: string | null
  standaloneTime: string | null
}

function loadMergeListsMeta(ids: number[]): MergeListMeta[] {
  if (ids.length === 0) return []
  return db
    .select({
      id: schema.rsvpLists.id,
      name: schema.rsvpLists.name,
      calendarEventId: schema.rsvpLists.calendarEventId,
      calendarEventTitle: schema.calendarEvents.title,
      calendarEventStartDate: schema.calendarEvents.startDate,
      standaloneTitle: schema.rsvpLists.standaloneTitle,
      standaloneDate: schema.rsvpLists.standaloneDate,
      standaloneTime: schema.rsvpLists.standaloneTime,
    })
    .from(schema.rsvpLists)
    .leftJoin(schema.calendarEvents, eq(schema.rsvpLists.calendarEventId, schema.calendarEvents.id))
    .where(inArray(schema.rsvpLists.id, ids))
    .all()
}

function eventLabel(meta: MergeListMeta): string {
  const title = meta.standaloneTitle ?? meta.calendarEventTitle ?? meta.name
  const dateStr = meta.standaloneDate ?? (meta.calendarEventStartDate ? meta.calendarEventStartDate.slice(0, 10) : null)
  return dateStr ? `${title} — ${dateStr}` : title
}

function sameEvent(a: MergeListMeta, b: MergeListMeta): boolean {
  if (a.calendarEventId !== null && b.calendarEventId !== null) {
    return a.calendarEventId === b.calendarEventId
  }
  if (a.calendarEventId === null && b.calendarEventId === null) {
    return (
      (a.standaloneTitle ?? '') === (b.standaloneTitle ?? '') && (a.standaloneDate ?? '') === (b.standaloneDate ?? '')
    )
  }
  return false
}

type EntryRow = {
  id: number
  rsvpListId: number
  personId: number
  status: Status
  headcount: number | null
  note: string | null
  respondedAt: string | null
  firstName: string | null
  lastName: string | null
}

function loadEntries(listIds: number[]): EntryRow[] {
  if (listIds.length === 0) return []
  return db
    .select({
      id: schema.rsvpEntries.id,
      rsvpListId: schema.rsvpEntries.rsvpListId,
      personId: schema.rsvpEntries.personId,
      status: schema.rsvpEntries.status,
      headcount: schema.rsvpEntries.headcount,
      note: schema.rsvpEntries.note,
      respondedAt: schema.rsvpEntries.respondedAt,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.rsvpEntries)
    .innerJoin(schema.people, eq(schema.rsvpEntries.personId, schema.people.id))
    .where(inArray(schema.rsvpEntries.rsvpListId, listIds))
    .all() as EntryRow[]
}

function scoreEntry(e: EntryRow): number {
  return (e.status !== 'no_response' ? 2 : 0) + (e.headcount != null ? 1 : 0) + (e.note ? 1 : 0)
}

type Resolution = {kind: 'target'} | {kind: 'source'; sourceListId: number}

function computeDefaultKeep(targetEntry: EntryRow | null, sourceEntries: EntryRow[]): Resolution {
  const candidates: {res: Resolution; entry: EntryRow}[] = []
  if (targetEntry) candidates.push({res: {kind: 'target'}, entry: targetEntry})
  for (const s of sourceEntries) candidates.push({res: {kind: 'source', sourceListId: s.rsvpListId}, entry: s})
  candidates.sort((a, b) => {
    const sd = scoreEntry(b.entry) - scoreEntry(a.entry)
    if (sd !== 0) return sd
    // Tie: target wins if present.
    if (a.res.kind === 'target') return -1
    if (b.res.kind === 'target') return 1
    return a.res.kind === 'source' && b.res.kind === 'source' ? a.res.sourceListId - b.res.sourceListId : 0
  })
  return candidates[0]!.res
}

function validateMergeIds(targetId: number, sourceIds: number[]): string | null {
  if (!Number.isFinite(targetId)) return 'targetId is required'
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return 'sourceIds must be a non-empty array'
  if (sourceIds.some((id) => !Number.isFinite(id))) return 'sourceIds must be numbers'
  if (sourceIds.includes(targetId)) return 'targetId cannot be in sourceIds'
  const set = new Set(sourceIds)
  if (set.size !== sourceIds.length) return 'sourceIds contains duplicates'
  return null
}

// POST /api/rsvp/lists/merge/preview
rsvpRouter.post(
  '/lists/merge/preview',
  asyncHandler(async (req, res) => {
    const {targetId, sourceIds} = req.body as {targetId: number; sourceIds: number[]}
    const err = validateMergeIds(targetId, sourceIds)
    if (err) {
      res.status(400).json({error: err})
      return
    }

    const allIds = [targetId, ...sourceIds]
    const metas = loadMergeListsMeta(allIds)
    const metaById = new Map(metas.map((m) => [m.id, m]))
    for (const id of allIds) {
      if (!metaById.has(id)) {
        res.status(404).json({error: `RSVP list ${id} not found`})
        return
      }
    }
    const target = metaById.get(targetId)!

    const entries = loadEntries(allIds)
    const byPerson = new Map<number, EntryRow[]>()
    for (const e of entries) {
      const arr = byPerson.get(e.personId) ?? []
      arr.push(e)
      byPerson.set(e.personId, arr)
    }

    const conflicts: {
      personId: number
      firstName: string | null
      lastName: string | null
      target: object | null
      sources: object[]
      defaultKeep: Resolution
    }[] = []
    let tokenLossDefault = 0
    let totalEntriesAfter = 0

    for (const [personId, rows] of byPerson) {
      if (rows.length === 1) {
        totalEntriesAfter++
        continue
      }
      totalEntriesAfter++
      const targetEntry = rows.find((r) => r.rsvpListId === targetId) ?? null
      const sourceEntries = rows.filter((r) => r.rsvpListId !== targetId)
      const defaultKeep = computeDefaultKeep(targetEntry, sourceEntries)
      // Loss = all rows minus the surviving one.
      tokenLossDefault += rows.length - 1
      const summarize = (e: EntryRow) => ({
        entryId: e.id,
        status: e.status,
        headcount: e.headcount,
        note: e.note,
        respondedAt: e.respondedAt,
      })
      conflicts.push({
        personId,
        firstName: rows[0]!.firstName,
        lastName: rows[0]!.lastName,
        target: targetEntry ? summarize(targetEntry) : null,
        sources: sourceEntries.map((s) => {
          const sourceMeta = metaById.get(s.rsvpListId)!
          return {...summarize(s), sourceListId: s.rsvpListId, sourceListName: sourceMeta.name}
        }),
        defaultKeep,
      })
    }

    const sourceMetas = sourceIds.map((id) => metaById.get(id)!)
    const sourceEntryCounts = new Map<number, number>()
    for (const e of entries) {
      if (e.rsvpListId === targetId) continue
      sourceEntryCounts.set(e.rsvpListId, (sourceEntryCounts.get(e.rsvpListId) ?? 0) + 1)
    }
    const sourcesWithDifferentEvent = sourceMetas
      .filter((sm) => !sameEvent(target, sm))
      .map((sm) => ({
        sourceListId: sm.id,
        sourceListName: sm.name,
        sourceEventLabel: eventLabel(sm),
        sourceEntryCount: sourceEntryCounts.get(sm.id) ?? 0,
      }))

    conflicts.sort(
      (a, b) =>
        (a.lastName ?? '').localeCompare(b.lastName ?? '') || (a.firstName ?? '').localeCompare(b.firstName ?? ''),
    )

    res.json({
      targetId,
      targetName: target.name,
      targetEventLabel: eventLabel(target),
      sourceCount: sourceIds.length,
      sourceNames: sourceMetas.map((sm) => ({id: sm.id, name: sm.name, entryCount: sourceEntryCounts.get(sm.id) ?? 0})),
      totalEntriesAfter,
      conflicts,
      sourcesWithDifferentEvent,
      tokenLossDefault,
    })
  }),
)

// POST /api/rsvp/lists/merge
rsvpRouter.post(
  '/lists/merge',
  asyncHandler(async (req, res) => {
    const {targetId, sourceIds, resolutions} = req.body as {
      targetId: number
      sourceIds: number[]
      resolutions: {personId: number; keep: Resolution}[]
    }
    const err = validateMergeIds(targetId, sourceIds)
    if (err) {
      res.status(400).json({error: err})
      return
    }

    const allIds = [targetId, ...sourceIds]
    const metas = loadMergeListsMeta(allIds)
    const metaById = new Map(metas.map((m) => [m.id, m]))
    for (const id of allIds) {
      if (!metaById.has(id)) {
        res.status(409).json({error: 'One of the selected lists was deleted; reload and try again'})
        return
      }
    }

    const resolutionByPerson = new Map<number, Resolution>(
      (resolutions ?? []).map((r) => [r.personId, r.keep] as const),
    )

    const result = sqlite.transaction(() => {
      const entries = loadEntries(allIds)
      const entriesBefore = entries.filter((e) => e.rsvpListId === targetId).length
      const byPerson = new Map<number, EntryRow[]>()
      for (const e of entries) {
        const arr = byPerson.get(e.personId) ?? []
        arr.push(e)
        byPerson.set(e.personId, arr)
      }

      let keepTarget = 0
      let keepSource = 0
      let tokensLost = 0

      for (const [personId, rows] of byPerson) {
        if (rows.length === 1) {
          const only = rows[0]!
          if (only.rsvpListId !== targetId) {
            db.update(schema.rsvpEntries)
              .set({rsvpListId: targetId, updatedAt: sql`datetime('now')`})
              .where(eq(schema.rsvpEntries.id, only.id))
              .run()
          }
          continue
        }

        const targetEntry = rows.find((r) => r.rsvpListId === targetId) ?? null
        const sourceEntries = rows.filter((r) => r.rsvpListId !== targetId)
        const fallback = computeDefaultKeep(targetEntry, sourceEntries)
        let chosen = resolutionByPerson.get(personId) ?? fallback

        // Defensive: if a resolution names a source that's no longer present (e.g. concurrent
        // delete of that entry), fall back to the default.
        if (chosen.kind === 'source') {
          const sid = chosen.sourceListId
          if (!sourceEntries.some((s) => s.rsvpListId === sid)) {
            chosen = fallback
          }
        }
        // Defensive: if resolution says "target" but target has no entry, fall back.
        if (chosen.kind === 'target' && !targetEntry) {
          chosen = fallback
        }

        if (chosen.kind === 'target') {
          keepTarget++
          // Delete all source-side rows for this person.
          const sourceIdsToDelete = sourceEntries.map((s) => s.id)
          if (sourceIdsToDelete.length > 0) {
            db.delete(schema.rsvpEntries).where(inArray(schema.rsvpEntries.id, sourceIdsToDelete)).run()
            tokensLost += sourceIdsToDelete.length
          }
        } else {
          keepSource++
          const chosenSourceListId = chosen.sourceListId
          const winner = sourceEntries.find((s) => s.rsvpListId === chosenSourceListId)!
          // Delete target's row first to free the (rsvp_list_id, person_id) unique index slot.
          if (targetEntry) {
            db.delete(schema.rsvpEntries).where(eq(schema.rsvpEntries.id, targetEntry.id)).run()
            tokensLost++
          }
          // Delete the other losing source rows.
          const otherLosers = sourceEntries.filter((s) => s.id !== winner.id).map((s) => s.id)
          if (otherLosers.length > 0) {
            db.delete(schema.rsvpEntries).where(inArray(schema.rsvpEntries.id, otherLosers)).run()
            tokensLost += otherLosers.length
          }
          // Re-parent the winner to the target list. Token rides along.
          db.update(schema.rsvpEntries)
            .set({rsvpListId: targetId, updatedAt: sql`datetime('now')`})
            .where(eq(schema.rsvpEntries.id, winner.id))
            .run()
        }
      }

      // Any remaining source rows (defensive — shouldn't exist; non-conflicted source rows were
      // re-parented above) get hard-deleted with the source list.
      db.delete(schema.rsvpLists).where(inArray(schema.rsvpLists.id, sourceIds)).run()

      const entriesAfter =
        db
          .select({count: sql<number>`count(*)`})
          .from(schema.rsvpEntries)
          .where(eq(schema.rsvpEntries.rsvpListId, targetId))
          .get()?.count ?? 0

      return {
        targetId,
        entriesBefore,
        entriesAfter,
        conflictsResolved: {keepTarget, keepSource},
        sourcesDeleted: sourceIds.length,
        tokensLost,
      }
    })()

    res.json(result)
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
          eq(schema.calendarEvents.recurring, false),
        ),
      )
      .orderBy(schema.calendarEvents.startDate)
      .all()

    res.json(events)
  }),
)
