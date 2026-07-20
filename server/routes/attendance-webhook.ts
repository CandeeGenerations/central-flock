import {and, eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

// Public attendance entry, proxied through cgen-api. Per-recorder token is the gate (ADR-0015).
export const attendanceWebhookRouter = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// weekday of a YYYY-MM-DD date, 0=Sun..6=Sat (UTC-safe, no TZ drift)
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function coerceCount(v: unknown): number | null | undefined {
  if (v === null) return null
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100000) return NaN as unknown as number
  return v
}

function loadRecorder(token: string) {
  return db
    .select({id: schema.recorders.id, name: schema.recorders.name, active: schema.recorders.active})
    .from(schema.recorders)
    .where(eq(schema.recorders.token, token))
    .get()
}

function activeServiceTimes() {
  const rows = db
    .select({
      id: schema.serviceTimes.id,
      name: schema.serviceTimes.name,
      dayOfWeek: schema.serviceTimes.dayOfWeek,
      time: schema.serviceTimes.time,
      sortOrder: schema.serviceTimes.sortOrder,
    })
    .from(schema.serviceTimes)
    .where(eq(schema.serviceTimes.active, true))
    .all()
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.time.localeCompare(b.time))
  return rows
}

// GET /webhooks/attendance/:token — session bootstrap: recorder name + service times.
attendanceWebhookRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const rec = loadRecorder(String(req.params.token))
    if (!rec || !rec.active) {
      res.status(404).json({error: 'invalid or retired link'})
      return
    }
    res.json({recorderName: rec.name, serviceTimes: activeServiceTimes()})
  }),
)

// GET /webhooks/attendance/:token/record/:serviceTimeId/:date — existing values.
attendanceWebhookRouter.get(
  '/:token/record/:serviceTimeId/:date',
  asyncHandler(async (req, res) => {
    const rec = loadRecorder(String(req.params.token))
    if (!rec || !rec.active) {
      res.status(404).json({error: 'invalid or retired link'})
      return
    }
    const serviceTimeId = Number(req.params.serviceTimeId)
    const date = String(req.params.date)
    if (!Number.isInteger(serviceTimeId) || !DATE_RE.test(date)) {
      res.status(400).json({error: 'bad serviceTimeId or date'})
      return
    }
    const record = db
      .select({attendance: schema.serviceRecords.attendance, streaming: schema.serviceRecords.streaming})
      .from(schema.serviceRecords)
      .where(and(eq(schema.serviceRecords.serviceTimeId, serviceTimeId), eq(schema.serviceRecords.serviceDate, date)))
      .get()
    res.json({serviceTimeId, date, attendance: record?.attendance ?? null, streaming: record?.streaming ?? null})
  }),
)

// POST /webhooks/attendance/:token/record — upsert + append change-log edit.
attendanceWebhookRouter.post(
  '/:token/record',
  asyncHandler(async (req, res) => {
    const rec = loadRecorder(String(req.params.token))
    if (!rec || !rec.active) {
      res.status(404).json({error: 'invalid or retired link'})
      return
    }
    const body = req.body as {serviceTimeId?: number; date?: string; attendance?: unknown; streaming?: unknown}
    const serviceTimeId = Number(body.serviceTimeId)
    const date = String(body.date ?? '')
    if (!Number.isInteger(serviceTimeId) || !DATE_RE.test(date)) {
      res.status(400).json({error: 'serviceTimeId and date (YYYY-MM-DD) required'})
      return
    }
    const st = db
      .select({
        id: schema.serviceTimes.id,
        dayOfWeek: schema.serviceTimes.dayOfWeek,
        active: schema.serviceTimes.active,
      })
      .from(schema.serviceTimes)
      .where(eq(schema.serviceTimes.id, serviceTimeId))
      .get()
    if (!st || !st.active) {
      res.status(404).json({error: 'unknown or retired service time'})
      return
    }
    if (weekdayOf(date) !== st.dayOfWeek) {
      res.status(400).json({error: 'date does not fall on this service time’s day of week'})
      return
    }
    const attendance = coerceCount(body.attendance)
    const streaming = coerceCount(body.streaming)
    if (Number.isNaN(attendance) || Number.isNaN(streaming)) {
      res.status(400).json({error: 'attendance/streaming must be integers 0–100000 or null'})
      return
    }
    const att = attendance === undefined ? null : attendance
    const strm = streaming === undefined ? null : streaming
    if (att === null && strm === null) {
      res.status(400).json({error: 'enter at least one of attendance or streaming'})
      return
    }

    db.transaction((tx) => {
      const record = tx
        .insert(schema.serviceRecords)
        .values({
          serviceTimeId,
          serviceDate: date,
          attendance: att,
          streaming: strm,
          latestRecorderId: rec.id,
          latestRecorderName: rec.name,
          latestEnteredAt: sql`datetime('now')`,
        })
        .onConflictDoUpdate({
          target: [schema.serviceRecords.serviceTimeId, schema.serviceRecords.serviceDate],
          set: {
            attendance: att,
            streaming: strm,
            latestRecorderId: rec.id,
            latestRecorderName: rec.name,
            latestEnteredAt: sql`datetime('now')`,
            updatedAt: sql`datetime('now')`,
          },
        })
        .returning({id: schema.serviceRecords.id})
        .get()
      tx.insert(schema.serviceRecordEdits)
        .values({
          serviceRecordId: record.id,
          recorderId: rec.id,
          recorderName: rec.name,
          attendance: att,
          streaming: strm,
        })
        .run()
    })

    res.json({serviceTimeId, date, attendance: att, streaming: strm, saved: true})
  }),
)
