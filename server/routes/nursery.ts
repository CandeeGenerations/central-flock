import * as Sentry from '@sentry/node'
import {eq, inArray} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {sendImageViaUI} from '../services/applescript.js'
import {workerDisplayName} from '../services/nursery-workers.js'

export const nurseryRouter = Router()

// ── Workers ──────────────────────────────────────────────────────────

nurseryRouter.get(
  '/workers',
  asyncHandler(async (_req, res) => {
    const workers = db
      .select({
        worker: schema.nurseryWorkers,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.nurseryWorkers)
      .innerJoin(schema.people, eq(schema.people.id, schema.nurseryWorkers.personId))
      .all()
    const workerServices = db.select().from(schema.nurseryWorkerServices).all()

    const result = workers
      .map(({worker, firstName, lastName}) => ({
        ...worker,
        displayName: workerDisplayName(worker.name, firstName, lastName),
        services: workerServices.filter((ws) => ws.workerId === worker.id),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    res.json(result)
  }),
)

nurseryRouter.post(
  '/workers',
  asyncHandler(async (req, res) => {
    const {personId, name, maxPerMonth, allowMultiplePerDay, services} = req.body
    if (!Number.isInteger(personId)) {
      res.status(400).json({error: 'personId is required — a Nursery Worker is always a contact'})
      return
    }
    const person = db.select().from(schema.people).where(eq(schema.people.id, personId)).get()
    if (!person) {
      res.status(400).json({error: 'Person not found'})
      return
    }
    const existingForPerson = db
      .select()
      .from(schema.nurseryWorkers)
      .where(eq(schema.nurseryWorkers.personId, personId))
      .get()
    if (existingForPerson) {
      res.status(409).json({error: 'That person is already a nursery worker'})
      return
    }

    const worker = db
      .insert(schema.nurseryWorkers)
      .values({
        personId,
        name: name?.trim() ? name.trim() : null,
        maxPerMonth: maxPerMonth ?? 4,
        allowMultiplePerDay: allowMultiplePerDay ?? false,
      })
      .returning()
      .get()

    if (services && Array.isArray(services)) {
      for (const svc of services) {
        db.insert(schema.nurseryWorkerServices)
          .values({workerId: worker.id, serviceTimeId: svc.serviceTimeId, maxPerMonth: svc.maxPerMonth ?? null})
          .run()
      }
    }

    const workerServices = db
      .select()
      .from(schema.nurseryWorkerServices)
      .where(eq(schema.nurseryWorkerServices.workerId, worker.id))
      .all()

    res.json({
      ...worker,
      displayName: workerDisplayName(worker.name, person.firstName, person.lastName),
      services: workerServices,
    })
  }),
)

nurseryRouter.put(
  '/workers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {personId, name, maxPerMonth, allowMultiplePerDay, isActive} = req.body

    const existing = db.select().from(schema.nurseryWorkers).where(eq(schema.nurseryWorkers.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Worker not found'})
      return
    }
    if (personId !== undefined && !Number.isInteger(personId)) {
      res.status(400).json({error: 'personId must be a contact id'})
      return
    }

    const updated = db
      .update(schema.nurseryWorkers)
      .set({
        ...(personId !== undefined && {personId}),
        ...(name !== undefined && {name: name?.trim() ? name.trim() : null}),
        ...(maxPerMonth !== undefined && {maxPerMonth}),
        ...(allowMultiplePerDay !== undefined && {allowMultiplePerDay}),
        ...(isActive !== undefined && {isActive}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.nurseryWorkers.id, id))
      .returning()
      .get()

    const workerServices = db
      .select()
      .from(schema.nurseryWorkerServices)
      .where(eq(schema.nurseryWorkerServices.workerId, id))
      .all()

    const person = db.select().from(schema.people).where(eq(schema.people.id, updated.personId)).get()

    res.json({
      ...updated,
      displayName: workerDisplayName(updated.name, person?.firstName ?? null, person?.lastName ?? null),
      services: workerServices,
    })
  }),
)

nurseryRouter.delete(
  '/workers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    db.delete(schema.nurseryWorkers).where(eq(schema.nurseryWorkers.id, id)).run()
    res.json({success: true})
  }),
)

nurseryRouter.put(
  '/workers/:id/services',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {services} = req.body as {services: {serviceTimeId: number; maxPerMonth: number | null}[]}

    const existing = db.select().from(schema.nurseryWorkers).where(eq(schema.nurseryWorkers.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Worker not found'})
      return
    }

    const validServiceTimeIds = new Set(
      db
        .select({id: schema.serviceTimes.id})
        .from(schema.serviceTimes)
        .all()
        .map((r) => r.id),
    )

    // Delete all existing service rows for this worker, then re-insert
    db.delete(schema.nurseryWorkerServices).where(eq(schema.nurseryWorkerServices.workerId, id)).run()

    for (const svc of services) {
      if (validServiceTimeIds.has(svc.serviceTimeId)) {
        db.insert(schema.nurseryWorkerServices)
          .values({
            workerId: id,
            serviceTimeId: svc.serviceTimeId,
            maxPerMonth: svc.maxPerMonth ?? null,
          })
          .run()
      }
    }

    const workerServices = db
      .select()
      .from(schema.nurseryWorkerServices)
      .where(eq(schema.nurseryWorkerServices.workerId, id))
      .all()

    res.json({...existing, services: workerServices})
  }),
)

// ── Service Config ───────────────────────────────────────────────────

nurseryRouter.get(
  '/service-config',
  asyncHandler(async (_req, res) => {
    const config = db
      .select({
        serviceTimeId: schema.nurseryServiceConfig.serviceTimeId,
        workerCount: schema.nurseryServiceConfig.workerCount,
        label: schema.serviceTimes.name,
        dayOfWeek: schema.serviceTimes.dayOfWeek,
        sortOrder: schema.serviceTimes.sortOrder,
        active: schema.serviceTimes.active,
      })
      .from(schema.nurseryServiceConfig)
      .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.nurseryServiceConfig.serviceTimeId))
      .orderBy(schema.serviceTimes.sortOrder)
      .all()
    res.json(config)
  }),
)

nurseryRouter.put(
  '/service-config/:serviceTimeId',
  asyncHandler(async (req, res) => {
    const serviceTimeId = Number(req.params.serviceTimeId)
    const {workerCount} = req.body

    if (!Number.isInteger(serviceTimeId)) {
      res.status(400).json({error: 'Invalid service time id'})
      return
    }
    if (workerCount !== 1 && workerCount !== 2) {
      res.status(400).json({error: 'Worker count must be 1 or 2'})
      return
    }

    const updated = db
      .update(schema.nurseryServiceConfig)
      .set({workerCount})
      .where(eq(schema.nurseryServiceConfig.serviceTimeId, serviceTimeId))
      .returning()
      .get()

    if (!updated) {
      res.status(404).json({error: 'Service not configured for nursery'})
      return
    }

    res.json(updated)
  }),
)

// Settings (logo + footer text + title prefix) moved to /api/schedules.
// See server/routes/schedules.ts and ADR 0006.

// ── Send Schedule as Image ──────────────────────────────────────────
// Accepts a base64 JPEG image and a list of recipient person IDs, then sends
// the image via Messages (using AppleScript clipboard-paste UI automation).
nurseryRouter.post(
  '/send-image',
  asyncHandler(async (req, res) => {
    const {imageData, recipientIds, caption} = req.body as {
      imageData: string
      recipientIds: number[]
      caption?: string
    }

    if (!imageData || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      res.status(400).json({error: 'imageData and recipientIds are required'})
      return
    }

    // Write image to a temp file — AppleScript clipboard needs a POSIX path
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    const tmpPath = path.join(os.tmpdir(), `flock-schedule-${Date.now()}.jpg`)
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'))

    // Look up recipient phone numbers
    const recipients = db
      .select({id: schema.people.id, firstName: schema.people.firstName, phoneNumber: schema.people.phoneNumber})
      .from(schema.people)
      .where(inArray(schema.people.id, recipientIds))
      .all()

    const results: {id: number; name: string; success: boolean; error?: string}[] = []

    try {
      for (const r of recipients) {
        if (!r.phoneNumber) {
          results.push({id: r.id, name: r.firstName || 'Unknown', success: false, error: 'No phone number'})
          continue
        }
        try {
          await sendImageViaUI(r.phoneNumber, tmpPath, caption)
          results.push({id: r.id, name: r.firstName || 'Unknown', success: true})
        } catch (err) {
          console.error(`[nursery/send-image] send to ${r.phoneNumber} failed:`, err)
          Sentry.captureException(err, {tags: {source: 'nursery-send-image'}})
          const cause = err instanceof Error ? (err.cause as unknown) : undefined
          const message =
            err instanceof Error && err.message
              ? err.message
              : typeof err === 'string' && err
                ? err
                : 'Send failed (no error message)'
          const causeMessage = cause instanceof Error ? cause.message : ''
          results.push({
            id: r.id,
            name: r.firstName || 'Unknown',
            success: false,
            error: causeMessage ? `${message} (${causeMessage})` : message,
          })
        }
      }
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpPath)
      } catch {
        // ignore cleanup errors
      }
    }

    res.json({results})
  }),
)
