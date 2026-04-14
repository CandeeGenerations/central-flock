import {eq, inArray} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {fileURLToPath} from 'url'

import {db, schema} from '../db/index.js'
import {nurseryDb, nurserySchema} from '../db-nursery/index.js'
import {serviceTypes} from '../db-nursery/schema.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {sendImageViaUI} from '../services/applescript.js'

const __nurseryDir = path.dirname(fileURLToPath(import.meta.url))
const LOGOS_DIR = path.join(__nurseryDir, '..', '..', 'data', 'nursery-logos')

export const nurseryRouter = Router()

// ── Workers ──────────────────────────────────────────────────────────

nurseryRouter.get(
  '/workers',
  asyncHandler(async (_req, res) => {
    const workers = nurseryDb
      .select()
      .from(nurserySchema.nurseryWorkers)
      .orderBy(nurserySchema.nurseryWorkers.name)
      .all()
    const workerServices = nurseryDb.select().from(nurserySchema.nurseryWorkerServices).all()

    const result = workers.map((w) => ({
      ...w,
      services: workerServices.filter((ws) => ws.workerId === w.id),
    }))

    res.json(result)
  }),
)

nurseryRouter.post(
  '/workers',
  asyncHandler(async (req, res) => {
    const {name, maxPerMonth, allowMultiplePerDay, services} = req.body
    if (!name?.trim()) {
      res.status(400).json({error: 'Name is required'})
      return
    }

    const worker = nurseryDb
      .insert(nurserySchema.nurseryWorkers)
      .values({
        name: name.trim(),
        maxPerMonth: maxPerMonth ?? 4,
        allowMultiplePerDay: allowMultiplePerDay ?? false,
      })
      .returning()
      .get()

    if (services && Array.isArray(services)) {
      for (const svc of services) {
        nurseryDb
          .insert(nurserySchema.nurseryWorkerServices)
          .values({workerId: worker.id, serviceType: svc.serviceType, maxPerMonth: svc.maxPerMonth ?? null})
          .run()
      }
    }

    const workerServices = nurseryDb
      .select()
      .from(nurserySchema.nurseryWorkerServices)
      .where(eq(nurserySchema.nurseryWorkerServices.workerId, worker.id))
      .all()

    res.json({...worker, services: workerServices})
  }),
)

nurseryRouter.put(
  '/workers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {name, maxPerMonth, allowMultiplePerDay, isActive} = req.body

    const existing = nurseryDb
      .select()
      .from(nurserySchema.nurseryWorkers)
      .where(eq(nurserySchema.nurseryWorkers.id, id))
      .get()
    if (!existing) {
      res.status(404).json({error: 'Worker not found'})
      return
    }

    const updated = nurseryDb
      .update(nurserySchema.nurseryWorkers)
      .set({
        ...(name !== undefined && {name: name.trim()}),
        ...(maxPerMonth !== undefined && {maxPerMonth}),
        ...(allowMultiplePerDay !== undefined && {allowMultiplePerDay}),
        ...(isActive !== undefined && {isActive}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(nurserySchema.nurseryWorkers.id, id))
      .returning()
      .get()

    const workerServices = nurseryDb
      .select()
      .from(nurserySchema.nurseryWorkerServices)
      .where(eq(nurserySchema.nurseryWorkerServices.workerId, id))
      .all()

    res.json({...updated, services: workerServices})
  }),
)

nurseryRouter.delete(
  '/workers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    nurseryDb.delete(nurserySchema.nurseryWorkers).where(eq(nurserySchema.nurseryWorkers.id, id)).run()
    res.json({success: true})
  }),
)

nurseryRouter.put(
  '/workers/:id/services',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {services} = req.body as {services: {serviceType: string; maxPerMonth: number | null}[]}

    const existing = nurseryDb
      .select()
      .from(nurserySchema.nurseryWorkers)
      .where(eq(nurserySchema.nurseryWorkers.id, id))
      .get()
    if (!existing) {
      res.status(404).json({error: 'Worker not found'})
      return
    }

    // Delete all existing service rows for this worker, then re-insert
    nurseryDb
      .delete(nurserySchema.nurseryWorkerServices)
      .where(eq(nurserySchema.nurseryWorkerServices.workerId, id))
      .run()

    for (const svc of services) {
      if (serviceTypes.includes(svc.serviceType as (typeof serviceTypes)[number])) {
        nurseryDb
          .insert(nurserySchema.nurseryWorkerServices)
          .values({
            workerId: id,
            serviceType: svc.serviceType as (typeof serviceTypes)[number],
            maxPerMonth: svc.maxPerMonth ?? null,
          })
          .run()
      }
    }

    const workerServices = nurseryDb
      .select()
      .from(nurserySchema.nurseryWorkerServices)
      .where(eq(nurserySchema.nurseryWorkerServices.workerId, id))
      .all()

    res.json({...existing, services: workerServices})
  }),
)

// ── Service Config ───────────────────────────────────────────────────

nurseryRouter.get(
  '/service-config',
  asyncHandler(async (_req, res) => {
    const config = nurseryDb
      .select()
      .from(nurserySchema.nurseryServiceConfig)
      .orderBy(nurserySchema.nurseryServiceConfig.sortOrder)
      .all()
    res.json(config)
  }),
)

nurseryRouter.put(
  '/service-config/:type',
  asyncHandler(async (req, res) => {
    const type = req.params.type
    const {workerCount} = req.body

    if (!serviceTypes.includes(type as (typeof serviceTypes)[number])) {
      res.status(400).json({error: 'Invalid service type'})
      return
    }
    if (workerCount !== 1 && workerCount !== 2) {
      res.status(400).json({error: 'Worker count must be 1 or 2'})
      return
    }

    const updated = nurseryDb
      .update(nurserySchema.nurseryServiceConfig)
      .set({workerCount})
      .where(eq(nurserySchema.nurseryServiceConfig.serviceType, type as (typeof serviceTypes)[number]))
      .returning()
      .get()

    res.json(updated)
  }),
)

// ── Settings ─────────────────────────────────────────────────────────

nurseryRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = nurseryDb.select().from(nurserySchema.nurserySettings).all()
    const result: Record<string, string> = {}
    for (const s of settings) {
      result[s.key] = s.value
    }
    res.json(result)
  }),
)

nurseryRouter.put(
  '/settings/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key)
    const {value} = req.body

    nurseryDb
      .insert(nurserySchema.nurserySettings)
      .values({key, value, updatedAt: new Date().toISOString()})
      .onConflictDoUpdate({
        target: nurserySchema.nurserySettings.key,
        set: {value, updatedAt: new Date().toISOString()},
      })
      .run()

    res.json({key, value})
  }),
)

nurseryRouter.post(
  '/settings/logo',
  asyncHandler(async (req, res) => {
    const {imageData} = req.body as {imageData: string}
    if (!imageData) {
      res.status(400).json({error: 'Image data is required'})
      return
    }

    if (!fs.existsSync(LOGOS_DIR)) {
      fs.mkdirSync(LOGOS_DIR, {recursive: true})
    }

    const filename = `logo-${Date.now()}.png`
    const filePath = path.join(LOGOS_DIR, filename)

    // Remove base64 prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))

    const logoPath = `/data/nursery-logos/${filename}`

    // Clean up old logo
    const oldLogo = nurseryDb
      .select()
      .from(nurserySchema.nurserySettings)
      .where(eq(nurserySchema.nurserySettings.key, 'logoPath'))
      .get()
    if (oldLogo) {
      const oldFullPath = path.join(LOGOS_DIR, path.basename(oldLogo.value))
      if (fs.existsSync(oldFullPath)) {
        fs.unlinkSync(oldFullPath)
      }
    }

    nurseryDb
      .insert(nurserySchema.nurserySettings)
      .values({key: 'logoPath', value: logoPath, updatedAt: new Date().toISOString()})
      .onConflictDoUpdate({
        target: nurserySchema.nurserySettings.key,
        set: {value: logoPath, updatedAt: new Date().toISOString()},
      })
      .run()

    res.json({logoPath})
  }),
)

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
          results.push({
            id: r.id,
            name: r.firstName || 'Unknown',
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
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
