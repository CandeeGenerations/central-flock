import {and, desc, eq, inArray} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import type {PriorMonthAssignment, ServiceConfig, WorkerWithEligibility} from '../services/nursery-scheduler.js'
import {generateSchedule, getBorrowedPairDates} from '../services/nursery-scheduler.js'

export const nurserySchedulesRouter = Router()

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

function scopeLabelFor(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function loadWorkers(): WorkerWithEligibility[] {
  const workers = db.select().from(schema.nurseryWorkers).where(eq(schema.nurseryWorkers.isActive, true)).all()
  const allServices = db.select().from(schema.nurseryWorkerServices).all()

  return workers.map((w) => ({
    id: w.id,
    name: w.name,
    maxPerMonth: w.maxPerMonth,
    allowMultiplePerDay: w.allowMultiplePerDay,
    services: allServices
      .filter((s) => s.workerId === w.id)
      .map((s) => ({serviceType: s.serviceType, maxPerMonth: s.maxPerMonth})),
  }))
}

function loadServiceConfig(): ServiceConfig[] {
  return db.select().from(schema.nurseryServiceConfig).orderBy(schema.nurseryServiceConfig.sortOrder).all()
}

// Returns the prior month's "canonical" schedule for overlap lookup:
// prefer status='final', fall back to most-recently-updated 'draft'.
function findPriorMonthSchedule(priorMonth: number, priorYear: number) {
  const candidates = db
    .select()
    .from(schema.schedules)
    .where(
      and(
        eq(schema.schedules.scheduleType, 'nursery'),
        eq(schema.schedules.month, priorMonth),
        eq(schema.schedules.year, priorYear),
      ),
    )
    .all()
  if (candidates.length === 0) return null
  const finalOne = candidates.find((s) => s.status === 'final')
  if (finalOne) return finalOne
  const drafts = candidates.filter((s) => s.status === 'draft').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return drafts[0] ?? null
}

function loadPriorMonthOverlapAssignments(
  month: number,
  year: number,
): {
  borrow: NonNullable<ReturnType<typeof getBorrowedPairDates>>
  priorSchedule: {id: number; status: string} | null
  assignments: PriorMonthAssignment[]
} | null {
  const borrow = getBorrowedPairDates(month, year)
  if (!borrow) return null

  const priorSchedule = findPriorMonthSchedule(borrow.priorMonth, borrow.priorYear)
  if (!priorSchedule) {
    return {borrow, priorSchedule: null, assignments: []}
  }

  const rows = db
    .select()
    .from(schema.nurseryAssignments)
    .where(
      and(
        eq(schema.nurseryAssignments.scheduleId, priorSchedule.id),
        inArray(schema.nurseryAssignments.date, borrow.dates),
      ),
    )
    .all()

  return {
    borrow,
    priorSchedule: {id: priorSchedule.id, status: priorSchedule.status},
    assignments: rows.map((r) => ({date: r.date, serviceType: r.serviceType, slot: r.slot, workerId: r.workerId})),
  }
}

function loadScheduleWithAssignments(scheduleId: number) {
  const schedule = db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.id, scheduleId), eq(schema.schedules.scheduleType, 'nursery')))
    .get()
  if (!schedule || schedule.month == null || schedule.year == null) return null

  const ownAssignments = db
    .select()
    .from(schema.nurseryAssignments)
    .where(eq(schema.nurseryAssignments.scheduleId, scheduleId))
    .all()

  const workers = db.select().from(schema.nurseryWorkers).all()
  const workerMap = new Map(workers.map((w) => [w.id, w]))

  const overlap = loadPriorMonthOverlapAssignments(schedule.month, schedule.year)
  const carryoverDates = new Set(overlap?.borrow.dates ?? [])

  // Defensive: filter out any persisted rows for carryover dates so live-resolve
  // is the single source of truth even if a row leaked through.
  const nativeAssignments = ownAssignments.filter((a) => !carryoverDates.has(a.date))

  let priorRows: (typeof ownAssignments)[number][] = []
  if (overlap?.priorSchedule) {
    priorRows = db
      .select()
      .from(schema.nurseryAssignments)
      .where(
        and(
          eq(schema.nurseryAssignments.scheduleId, overlap.priorSchedule.id),
          inArray(schema.nurseryAssignments.date, overlap.borrow.dates),
        ),
      )
      .all()
  }

  const enrichedNative = nativeAssignments.map((a) => ({
    ...a,
    workerName: a.workerId ? workerMap.get(a.workerId)?.name || null : null,
    isCarryover: false as const,
    sourceScheduleId: null as number | null,
    sourceMonth: null as number | null,
    sourceYear: null as number | null,
  }))

  const enrichedCarryover = priorRows.map((a) => ({
    ...a,
    workerName: a.workerId ? workerMap.get(a.workerId)?.name || null : null,
    isCarryover: true as const,
    sourceScheduleId: overlap!.priorSchedule!.id,
    sourceMonth: overlap!.borrow.priorMonth,
    sourceYear: overlap!.borrow.priorYear,
  }))

  return {
    ...schedule,
    assignments: [...enrichedNative, ...enrichedCarryover],
    overlap: overlap
      ? {
          borrowDates: overlap.borrow.dates,
          priorMonth: overlap.borrow.priorMonth,
          priorYear: overlap.borrow.priorYear,
          priorScheduleId: overlap.priorSchedule?.id ?? null,
          priorScheduleStatus: overlap.priorSchedule?.status ?? null,
          missing: overlap.priorSchedule === null,
        }
      : null,
  }
}

// ── Schedule CRUD ────────────────────────────────────────────────────

nurserySchedulesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const schedules = db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.scheduleType, 'nursery'))
      .orderBy(desc(schema.schedules.year), desc(schema.schedules.month))
      .all()
    res.json(schedules)
  }),
)

nurserySchedulesRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const {month, year} = req.body as {month: number; year: number}
    if (!month || !year || month < 1 || month > 12) {
      res.status(400).json({error: 'Valid month (1-12) and year are required'})
      return
    }

    const workers = loadWorkers()
    const serviceConfig = loadServiceConfig()
    const overlap = loadPriorMonthOverlapAssignments(month, year)
    const slots = generateSchedule(month, year, workers, serviceConfig, overlap?.assignments ?? [])

    // Delete existing draft for this month if one exists
    const existingDraft = db
      .select()
      .from(schema.schedules)
      .where(and(eq(schema.schedules.scheduleType, 'nursery'), eq(schema.schedules.month, month)))
      .all()
      .find((s) => s.year === year && s.status === 'draft')

    if (existingDraft) {
      db.delete(schema.schedules).where(eq(schema.schedules.id, existingDraft.id)).run()
    }

    // Create new schedule envelope
    const schedule = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'nursery',
        scopeKind: 'monthly',
        month,
        year,
        scopeLabel: scopeLabelFor(month, year),
      })
      .returning()
      .get()

    // Bulk insert assignments — skip carryover slots; they're live-resolved at view time.
    for (const slot of slots) {
      if (slot.isCarryover) continue
      db.insert(schema.nurseryAssignments)
        .values({
          scheduleId: schedule.id,
          date: slot.date,
          serviceType: slot.serviceType,
          slot: slot.slot,
          workerId: slot.workerId,
        })
        .run()
    }

    const result = loadScheduleWithAssignments(schedule.id)
    res.json(result)
  }),
)

nurserySchedulesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const result = loadScheduleWithAssignments(id)
    if (!result) {
      res.status(404).json({error: 'Schedule not found'})
      return
    }
    res.json(result)
  }),
)

nurserySchedulesRouter.put(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {status} = req.body as {status: 'draft' | 'final'}

    if (status !== 'draft' && status !== 'final') {
      res.status(400).json({error: 'Status must be draft or final'})
      return
    }

    const updated = db
      .update(schema.schedules)
      .set({status, updatedAt: new Date().toISOString()})
      .where(and(eq(schema.schedules.id, id), eq(schema.schedules.scheduleType, 'nursery')))
      .returning()
      .get()

    if (!updated) {
      res.status(404).json({error: 'Schedule not found'})
      return
    }

    res.json(updated)
  }),
)

nurserySchedulesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    db.delete(schema.schedules)
      .where(and(eq(schema.schedules.id, id), eq(schema.schedules.scheduleType, 'nursery')))
      .run()
    res.json({success: true})
  }),
)

// ── Assignment Update (manual edit) ──────────────────────────────────

nurserySchedulesRouter.patch(
  '/assignments/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {workerId} = req.body as {workerId: number | null}

    const assignment = db.select().from(schema.nurseryAssignments).where(eq(schema.nurseryAssignments.id, id)).get()

    if (!assignment) {
      res.status(404).json({error: 'Assignment not found'})
      return
    }

    // Check schedule is still a draft
    const schedule = db.select().from(schema.schedules).where(eq(schema.schedules.id, assignment.scheduleId)).get()

    if (schedule?.status === 'final') {
      res.status(400).json({error: 'Cannot edit a finalized schedule'})
      return
    }

    const updated = db
      .update(schema.nurseryAssignments)
      .set({workerId})
      .where(eq(schema.nurseryAssignments.id, id))
      .returning()
      .get()

    const workerName = workerId
      ? db.select().from(schema.nurseryWorkers).where(eq(schema.nurseryWorkers.id, workerId)).get()?.name || null
      : null

    res.json({...updated, workerName})
  }),
)
