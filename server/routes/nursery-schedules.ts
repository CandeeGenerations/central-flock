import {desc, eq} from 'drizzle-orm'
import {Router} from 'express'

import {nurseryDb, nurserySchema} from '../db-nursery/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import type {ServiceConfig, WorkerWithEligibility} from '../services/nursery-scheduler.js'
import {generateSchedule} from '../services/nursery-scheduler.js'

export const nurserySchedulesRouter = Router()

function loadWorkers(): WorkerWithEligibility[] {
  const workers = nurseryDb
    .select()
    .from(nurserySchema.nurseryWorkers)
    .where(eq(nurserySchema.nurseryWorkers.isActive, true))
    .all()
  const allServices = nurseryDb.select().from(nurserySchema.nurseryWorkerServices).all()

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
  return nurseryDb
    .select()
    .from(nurserySchema.nurseryServiceConfig)
    .orderBy(nurserySchema.nurseryServiceConfig.sortOrder)
    .all()
}

function loadScheduleWithAssignments(scheduleId: number) {
  const schedule = nurseryDb
    .select()
    .from(nurserySchema.nurserySchedules)
    .where(eq(nurserySchema.nurserySchedules.id, scheduleId))
    .get()
  if (!schedule) return null

  const assignments = nurseryDb
    .select()
    .from(nurserySchema.nurseryAssignments)
    .where(eq(nurserySchema.nurseryAssignments.scheduleId, scheduleId))
    .all()

  const workers = nurseryDb.select().from(nurserySchema.nurseryWorkers).all()
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
    const schedules = nurseryDb
      .select()
      .from(nurserySchema.nurserySchedules)
      .orderBy(desc(nurserySchema.nurserySchedules.year), desc(nurserySchema.nurserySchedules.month))
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
    const existingDraft = nurseryDb
      .select()
      .from(nurserySchema.nurserySchedules)
      .where(eq(nurserySchema.nurserySchedules.month, month))
      .all()
      .find((s) => s.year === year && s.status === 'draft')

    if (existingDraft) {
      nurseryDb
        .delete(nurserySchema.nurserySchedules)
        .where(eq(nurserySchema.nurserySchedules.id, existingDraft.id))
        .run()
    }

    // Create new schedule
    const schedule = nurseryDb.insert(nurserySchema.nurserySchedules).values({month, year}).returning().get()

    // Bulk insert assignments
    for (const slot of slots) {
      nurseryDb
        .insert(nurserySchema.nurseryAssignments)
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

    const updated = nurseryDb
      .update(nurserySchema.nurserySchedules)
      .set({status, updatedAt: new Date().toISOString()})
      .where(eq(nurserySchema.nurserySchedules.id, id))
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
    nurseryDb.delete(nurserySchema.nurserySchedules).where(eq(nurserySchema.nurserySchedules.id, id)).run()
    res.json({success: true})
  }),
)

// ── Assignment Update (manual edit) ──────────────────────────────────

nurserySchedulesRouter.patch(
  '/assignments/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {workerId} = req.body as {workerId: number | null}

    const assignment = nurseryDb
      .select()
      .from(nurserySchema.nurseryAssignments)
      .where(eq(nurserySchema.nurseryAssignments.id, id))
      .get()

    if (!assignment) {
      res.status(404).json({error: 'Assignment not found'})
      return
    }

    // Check schedule is still a draft
    const schedule = nurseryDb
      .select()
      .from(nurserySchema.nurserySchedules)
      .where(eq(nurserySchema.nurserySchedules.id, assignment.scheduleId))
      .get()

    if (schedule?.status === 'final') {
      res.status(400).json({error: 'Cannot edit a finalized schedule'})
      return
    }

    const updated = nurseryDb
      .update(nurserySchema.nurseryAssignments)
      .set({workerId})
      .where(eq(nurserySchema.nurseryAssignments.id, id))
      .returning()
      .get()

    const workerName = workerId
      ? nurseryDb.select().from(nurserySchema.nurseryWorkers).where(eq(nurserySchema.nurseryWorkers.id, workerId)).get()
          ?.name || null
      : null

    res.json({...updated, workerName})
  }),
)
