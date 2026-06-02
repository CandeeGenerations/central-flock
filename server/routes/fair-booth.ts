import {and, desc, eq, inArray, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import type {FairBoothFairRole, FairBoothShiftRole} from '../db/schema-fair-booth.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const fairBoothRouter = Router()

// ── Helpers ────────────────────────────────────────────────────────────

function isFridayDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getDay() === 5
}

function plusDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
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

function defaultScopeLabel(scopeStart: string): string {
  const scopeEnd = plusDays(scopeStart, 8)
  const [, sm, sd] = scopeStart.split('-').map(Number)
  const [ey, em, ed] = scopeEnd.split('-').map(Number)
  const startMonth = MONTH_NAMES[sm - 1]
  const endMonth = MONTH_NAMES[em - 1]
  if (sm === em) return `${startMonth} ${sd}–${ed}, ${ey}`
  return `${startMonth} ${sd}–${endMonth} ${ed}, ${ey}`
}

const TWO_SLOT_DOW = new Set([0, 2, 6]) // Sun, Tue, Sat

function slotsForDate(date: string): {startMinute: number; endMinute: number}[] {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  if (TWO_SLOT_DOW.has(dow)) {
    return [
      {startMinute: 14 * 60, endMinute: 18 * 60},
      {startMinute: 18 * 60, endMinute: 22 * 60},
    ]
  }
  return [{startMinute: 17 * 60, endMinute: 22 * 60}]
}

function rosterPersonIds(): number[] {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'schedules.fairBooth.rosterGroupIds'))
    .get()
  if (!row) return []
  let ids: number[]
  try {
    ids = JSON.parse(row.value)
  } catch {
    return []
  }
  if (!Array.isArray(ids) || ids.length === 0) return []
  const members = db
    .select({personId: schema.peopleGroups.personId})
    .from(schema.peopleGroups)
    .where(inArray(schema.peopleGroups.groupId, ids))
    .all()
  return Array.from(new Set(members.map((m) => m.personId)))
}

// ── Envelope CRUD ──────────────────────────────────────────────────────

fairBoothRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.scheduleType, 'fair_booth'))
      .orderBy(desc(schema.schedules.scopeStart))
      .all()
    const counts = db
      .select({
        scheduleId: schema.fairBoothSignups.scheduleId,
        n: sql<number>`count(*)`.as('n'),
      })
      .from(schema.fairBoothSignups)
      .groupBy(schema.fairBoothSignups.scheduleId)
      .all()
    const byId = new Map(counts.map((c) => [c.scheduleId, c.n]))
    res.json(rows.map((r) => ({...r, signupCount: byId.get(r.id) ?? 0})))
  }),
)

fairBoothRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body as {scopeStart?: string; scopeLabel?: string}
    if (!b.scopeStart || !isFridayDate(b.scopeStart)) {
      res.status(400).json({error: 'scopeStart must be a Friday (YYYY-MM-DD)'})
      return
    }
    const scopeEnd = plusDays(b.scopeStart, 8)
    const label = b.scopeLabel?.trim() || defaultScopeLabel(b.scopeStart)
    const row = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'fair_booth',
        scopeKind: 'date_range',
        scopeStart: b.scopeStart,
        scopeEnd,
        scopeLabel: label,
      })
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

fairBoothRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const sch = db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get()
    if (!sch || sch.scheduleType !== 'fair_booth') {
      res.status(404).json({error: 'Fair booth schedule not found'})
      return
    }
    const personIds = rosterPersonIds()
    const peopleRows =
      personIds.length === 0 ? [] : db.select().from(schema.people).where(inArray(schema.people.id, personIds)).all()
    const attrs = db
      .select()
      .from(schema.fairBoothRosterAttrs)
      .where(eq(schema.fairBoothRosterAttrs.scheduleId, id))
      .all()
    const signups = db.select().from(schema.fairBoothSignups).where(eq(schema.fairBoothSignups.scheduleId, id)).all()
    // Include people who have signups but are no longer in the live roster
    // Group (preserves their grid presence; UI surfaces soft warning).
    const orphanIds = signups.map((s) => s.personId).filter((pid) => !personIds.includes(pid))
    const orphans =
      orphanIds.length === 0 ? [] : db.select().from(schema.people).where(inArray(schema.people.id, orphanIds)).all()
    res.json({
      schedule: sch,
      people: [...peopleRows, ...orphans],
      rosterPersonIds: personIds,
      rosterAttrs: attrs,
      signups,
    })
  }),
)

fairBoothRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const b = req.body as {scopeStart?: string; scopeLabel?: string}
    const updates: Partial<typeof schema.schedules.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    }
    if (b.scopeStart !== undefined) {
      if (!isFridayDate(b.scopeStart)) {
        res.status(400).json({error: 'scopeStart must be a Friday'})
        return
      }
      updates.scopeStart = b.scopeStart
      updates.scopeEnd = plusDays(b.scopeStart, 8)
    }
    if (typeof b.scopeLabel === 'string') updates.scopeLabel = b.scopeLabel
    const row = db
      .update(schema.schedules)
      .set(updates)
      .where(and(eq(schema.schedules.id, id), eq(schema.schedules.scheduleType, 'fair_booth')))
      .returning()
      .get()
    if (!row) {
      res.status(404).json({error: 'Fair booth schedule not found'})
      return
    }
    res.json(row)
  }),
)

fairBoothRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    db.delete(schema.schedules)
      .where(and(eq(schema.schedules.id, id), eq(schema.schedules.scheduleType, 'fair_booth')))
      .run()
    res.json({success: true})
  }),
)

// ── Roster attrs (sparse per-schedule per-person) ──────────────────────

fairBoothRouter.put(
  '/:id/roster-attrs/:personId',
  asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id)
    const personId = Number(req.params.personId)
    const b = req.body as {fairRole?: FairBoothFairRole; initialsOverride?: string | null; nameOverride?: string | null}
    const existing = db
      .select()
      .from(schema.fairBoothRosterAttrs)
      .where(
        and(eq(schema.fairBoothRosterAttrs.scheduleId, scheduleId), eq(schema.fairBoothRosterAttrs.personId, personId)),
      )
      .get()
    const now = new Date().toISOString()
    if (existing) {
      const updates: Partial<typeof schema.fairBoothRosterAttrs.$inferInsert> = {updatedAt: now}
      if (b.fairRole !== undefined) updates.fairRole = b.fairRole
      if (b.initialsOverride !== undefined)
        updates.initialsOverride =
          b.initialsOverride === null || b.initialsOverride.trim() === '' ? null : b.initialsOverride.trim()
      if (b.nameOverride !== undefined)
        updates.nameOverride = b.nameOverride === null || b.nameOverride.trim() === '' ? null : b.nameOverride.trim()
      const row = db
        .update(schema.fairBoothRosterAttrs)
        .set(updates)
        .where(eq(schema.fairBoothRosterAttrs.id, existing.id))
        .returning()
        .get()
      res.json(row)
    } else {
      const row = db
        .insert(schema.fairBoothRosterAttrs)
        .values({
          scheduleId,
          personId,
          fairRole: b.fairRole ?? 'worker',
          initialsOverride: b.initialsOverride && b.initialsOverride.trim() !== '' ? b.initialsOverride.trim() : null,
          nameOverride: b.nameOverride && b.nameOverride.trim() !== '' ? b.nameOverride.trim() : null,
        })
        .returning()
        .get()
      res.status(201).json(row)
    }
  }),
)

fairBoothRouter.delete(
  '/:id/roster-attrs/:personId',
  asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id)
    const personId = Number(req.params.personId)
    db.delete(schema.fairBoothRosterAttrs)
      .where(
        and(eq(schema.fairBoothRosterAttrs.scheduleId, scheduleId), eq(schema.fairBoothRosterAttrs.personId, personId)),
      )
      .run()
    res.json({success: true})
  }),
)

// ── Signups ────────────────────────────────────────────────────────────

interface SignupBody {
  personId: number
  dayDate: string
  startMinute: number
  endMinute: number
  shiftRole: FairBoothShiftRole
  sortOrder?: number
  displayRowOverride?: number | null
}

function validateSignup(scheduleId: number, b: SignupBody, ignoreId?: number): string | null {
  if (!b.dayDate || !/^\d{4}-\d{2}-\d{2}$/.test(b.dayDate)) return 'dayDate required (YYYY-MM-DD)'
  if (b.startMinute % 30 !== 0 || b.endMinute % 30 !== 0) return 'start/end minute must be 30-min aligned'
  if (b.endMinute <= b.startMinute) return 'endMinute must be > startMinute'
  if (b.shiftRole !== 'worker' && b.shiftRole !== 'asst_unit' && b.shiftRole !== 'unit_leader')
    return 'invalid shiftRole'
  if (b.shiftRole === 'unit_leader' || b.shiftRole === 'asst_unit') {
    const slots = slotsForDate(b.dayDate)
    // Find which slot this signup primarily occupies.
    let mySlot: {startMinute: number; endMinute: number} | null = null
    let best = -1
    for (const s of slots) {
      const a = Math.max(b.startMinute, s.startMinute)
      const c = Math.min(b.endMinute, s.endMinute)
      const overlap = Math.max(0, c - a)
      if (overlap > best) {
        best = overlap
        mySlot = s
      }
    }
    if (mySlot) {
      const same = db
        .select()
        .from(schema.fairBoothSignups)
        .where(
          and(
            eq(schema.fairBoothSignups.scheduleId, scheduleId),
            eq(schema.fairBoothSignups.dayDate, b.dayDate),
            eq(schema.fairBoothSignups.shiftRole, b.shiftRole),
          ),
        )
        .all()
      for (const other of same) {
        if (ignoreId !== undefined && other.id === ignoreId) continue
        // Same slot match?
        let otherSlot: {startMinute: number; endMinute: number} | null = null
        let otherBest = -1
        for (const s of slots) {
          const a = Math.max(other.startMinute, s.startMinute)
          const c = Math.min(other.endMinute, s.endMinute)
          const overlap = Math.max(0, c - a)
          if (overlap > otherBest) {
            otherBest = overlap
            otherSlot = s
          }
        }
        if (otherSlot && otherSlot.startMinute === mySlot.startMinute) {
          return `Slot already has a ${b.shiftRole}`
        }
      }
    }
  }
  return null
}

fairBoothRouter.get(
  '/:id/signups',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const day = typeof req.query.day === 'string' ? req.query.day : undefined
    let where: ReturnType<typeof and> = eq(schema.fairBoothSignups.scheduleId, id)
    if (day) where = and(where, eq(schema.fairBoothSignups.dayDate, day))
    const rows = db.select().from(schema.fairBoothSignups).where(where).all()
    res.json(rows)
  }),
)

fairBoothRouter.post(
  '/:id/signups',
  asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id)
    const b = req.body as SignupBody
    const err = validateSignup(scheduleId, b)
    if (err) {
      res.status(400).json({error: err})
      return
    }
    const row = db
      .insert(schema.fairBoothSignups)
      .values({
        scheduleId,
        personId: b.personId,
        dayDate: b.dayDate,
        startMinute: b.startMinute,
        endMinute: b.endMinute,
        shiftRole: b.shiftRole,
        sortOrder: b.sortOrder ?? 0,
        displayRowOverride: b.displayRowOverride ?? null,
      })
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

fairBoothRouter.put(
  '/:id/signups/:signupId',
  asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id)
    const signupId = Number(req.params.signupId)
    const existing = db.select().from(schema.fairBoothSignups).where(eq(schema.fairBoothSignups.id, signupId)).get()
    if (!existing || existing.scheduleId !== scheduleId) {
      res.status(404).json({error: 'Signup not found'})
      return
    }
    const b = req.body as Partial<SignupBody>
    const merged: SignupBody = {
      personId: b.personId ?? existing.personId,
      dayDate: b.dayDate ?? existing.dayDate,
      startMinute: b.startMinute ?? existing.startMinute,
      endMinute: b.endMinute ?? existing.endMinute,
      shiftRole: (b.shiftRole ?? existing.shiftRole) as FairBoothShiftRole,
      sortOrder: b.sortOrder ?? existing.sortOrder,
      displayRowOverride: b.displayRowOverride === undefined ? existing.displayRowOverride : b.displayRowOverride,
    }
    const err = validateSignup(scheduleId, merged, signupId)
    if (err) {
      res.status(400).json({error: err})
      return
    }
    const row = db
      .update(schema.fairBoothSignups)
      .set({
        personId: merged.personId,
        dayDate: merged.dayDate,
        startMinute: merged.startMinute,
        endMinute: merged.endMinute,
        shiftRole: merged.shiftRole,
        sortOrder: merged.sortOrder ?? 0,
        displayRowOverride: merged.displayRowOverride ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.fairBoothSignups.id, signupId))
      .returning()
      .get()
    res.json(row)
  }),
)

fairBoothRouter.delete(
  '/:id/signups/:signupId',
  asyncHandler(async (req, res) => {
    const scheduleId = Number(req.params.id)
    const signupId = Number(req.params.signupId)
    db.delete(schema.fairBoothSignups)
      .where(and(eq(schema.fairBoothSignups.scheduleId, scheduleId), eq(schema.fairBoothSignups.id, signupId)))
      .run()
    res.json({success: true})
  }),
)

function slotIdxFor(signupStart: number, signupEnd: number, slots: {startMinute: number; endMinute: number}[]): number {
  if (slots.length === 1) return 0
  let bestIdx = 0
  let bestOverlap = -1
  for (let i = 0; i < slots.length; i++) {
    const a = Math.max(signupStart, slots[i].startMinute)
    const b = Math.min(signupEnd, slots[i].endMinute)
    const ov = Math.max(0, b - a)
    if (ov > bestOverlap) {
      bestOverlap = ov
      bestIdx = i
    }
  }
  return bestIdx
}

fairBoothRouter.post(
  '/:id/signups/:signupId/move',
  asyncHandler(async (req, res) => {
    const signupId = Number(req.params.signupId)
    const {direction} = req.body as {direction: 'up' | 'down'}
    const me = db.select().from(schema.fairBoothSignups).where(eq(schema.fairBoothSignups.id, signupId)).get()
    if (!me) {
      res.status(404).json({error: 'Signup not found'})
      return
    }
    const slots = slotsForDate(me.dayDate)
    const mySlotIdx = slotIdxFor(me.startMinute, me.endMinute, slots)
    // Peers: same schedule, day, shift_role, AND same slot.
    const peers = db
      .select()
      .from(schema.fairBoothSignups)
      .where(
        and(
          eq(schema.fairBoothSignups.scheduleId, me.scheduleId),
          eq(schema.fairBoothSignups.dayDate, me.dayDate),
          eq(schema.fairBoothSignups.shiftRole, me.shiftRole),
        ),
      )
      .all()
      .filter((p) => slotIdxFor(p.startMinute, p.endMinute, slots) === mySlotIdx)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    // Normalize: rewrite sequential sort_order 0..N-1 in case ties existed.
    for (let i = 0; i < peers.length; i++) {
      if (peers[i].sortOrder !== i) {
        db.update(schema.fairBoothSignups)
          .set({sortOrder: i, updatedAt: new Date().toISOString()})
          .where(eq(schema.fairBoothSignups.id, peers[i].id))
          .run()
        peers[i].sortOrder = i
      }
    }
    const idx = peers.findIndex((p) => p.id === signupId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= peers.length) {
      res.json({success: true})
      return
    }
    const other = peers[swapIdx]
    db.update(schema.fairBoothSignups)
      .set({sortOrder: other.sortOrder, updatedAt: new Date().toISOString()})
      .where(eq(schema.fairBoothSignups.id, me.id))
      .run()
    db.update(schema.fairBoothSignups)
      .set({sortOrder: me.sortOrder, updatedAt: new Date().toISOString()})
      .where(eq(schema.fairBoothSignups.id, other.id))
      .run()
    res.json({success: true})
  }),
)

fairBoothRouter.post(
  '/:id/signups/:signupId/row',
  asyncHandler(async (req, res) => {
    const signupId = Number(req.params.signupId)
    const {direction} = req.body as {direction: 'up' | 'down' | 'reset'}
    const me = db.select().from(schema.fairBoothSignups).where(eq(schema.fairBoothSignups.id, signupId)).get()
    if (!me) {
      res.status(404).json({error: 'Signup not found'})
      return
    }
    let next: number | null = me.displayRowOverride
    if (direction === 'reset') {
      next = null
    } else if (direction === 'up') {
      next = (next ?? 0) - 1
      if (next < 0) next = 0
    } else if (direction === 'down') {
      next = (next ?? 0) + 1
    }
    db.update(schema.fairBoothSignups)
      .set({displayRowOverride: next, updatedAt: new Date().toISOString()})
      .where(eq(schema.fairBoothSignups.id, signupId))
      .run()
    res.json({displayRowOverride: next})
  }),
)
