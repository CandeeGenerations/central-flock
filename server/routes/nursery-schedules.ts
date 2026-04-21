import {desc, eq} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import type {ServiceConfig, WorkerWithEligibility} from '../services/nursery-scheduler.js'
import {generateSchedule} from '../services/nursery-scheduler.js'

export const nurserySchedulesRouter = Router()

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

function loadScheduleWithAssignments(scheduleId: number) {
  const schedule = db.select().from(schema.nurserySchedules).where(eq(schema.nurserySchedules.id, scheduleId)).get()
  if (!schedule) return null

  const assignments = db
    .select()
    .from(schema.nurseryAssignments)
    .where(eq(schema.nurseryAssignments.scheduleId, scheduleId))
    .all()

  const workers = db.select().from(schema.nurseryWorkers).all()
  const workerMap = new Map(workers.map((w) => [w.id, w]))

  const enrichedAssignments = assignments.map((a) => ({
    ...a,
    workerName: a.workerId ? workerMap.get(a.workerId)?.name || null : null,
  }))

  return {...schedule, assignments: enrichedAssignments}
}

// ── Schedule CRUD ────────────────────────────────────────────────────

nurserySchedulesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const schedules = db
      .select()
      .from(schema.nurserySchedules)
      .orderBy(desc(schema.nurserySchedules.year), desc(schema.nurserySchedules.month))
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
    const slots = generateSchedule(month, year, workers, serviceConfig)

    // Delete existing draft for this month if one exists
    const existingDraft = db
      .select()
      .from(schema.nurserySchedules)
      .where(eq(schema.nurserySchedules.month, month))
      .all()
      .find((s) => s.year === year && s.status === 'draft')

    if (existingDraft) {
      db.delete(schema.nurserySchedules).where(eq(schema.nurserySchedules.id, existingDraft.id)).run()
    }

    // Create new schedule
    const schedule = db.insert(schema.nurserySchedules).values({month, year}).returning().get()

    // Bulk insert assignments
    for (const slot of slots) {
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
      .update(schema.nurserySchedules)
      .set({status, updatedAt: new Date().toISOString()})
      .where(eq(schema.nurserySchedules.id, id))
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
    db.delete(schema.nurserySchedules).where(eq(schema.nurserySchedules.id, id)).run()
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
    const schedule = db
      .select()
      .from(schema.nurserySchedules)
      .where(eq(schema.nurserySchedules.id, assignment.scheduleId))
      .get()

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
