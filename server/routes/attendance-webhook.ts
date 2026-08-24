import {and, desc, eq, inArray, sql} from 'drizzle-orm'
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

// date + n days, as a plain calendar date (no TZ involved)
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d))
  x.setUTCDate(x.getUTCDate() + days)
  return x.toISOString().slice(0, 10)
}

// SQLite writes datetime('now') as 'YYYY-MM-DD HH:MM:SS' in UTC; a client sends an ISO instant.
// Normalising to the former makes the two string-comparable, which is all the ordering needs.
function sqliteTime(iso: string): string | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ')
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

// GET /webhooks/attendance/:token/week/:weekStart — every record for one week, in one response.
// The entry app polls this while a screen is visible so a count entered on one device shows up on
// another (ADR-0028). One request instead of one per service time, which is what keeps a
// three-second poll inside the public rate limit.
attendanceWebhookRouter.get(
  '/:token/week/:weekStart',
  asyncHandler(async (req, res) => {
    const rec = loadRecorder(String(req.params.token))
    if (!rec || !rec.active) {
      res.status(404).json({error: 'invalid or retired link'})
      return
    }
    const weekStart = String(req.params.weekStart)
    if (!DATE_RE.test(weekStart) || weekdayOf(weekStart) !== 0) {
      res.status(400).json({error: 'weekStart must be a Sunday (YYYY-MM-DD)'})
      return
    }

    const times = activeServiceTimes()
    const dateOf = new Map(times.map((st) => [st.id, addDays(weekStart, st.dayOfWeek)]))
    const dates = [...new Set(dateOf.values())]
    const rows = dates.length
      ? db
          .select({
            serviceTimeId: schema.serviceRecords.serviceTimeId,
            serviceDate: schema.serviceRecords.serviceDate,
            attendance: schema.serviceRecords.attendance,
            streaming: schema.serviceRecords.streaming,
            latestEnteredAt: schema.serviceRecords.latestEnteredAt,
          })
          .from(schema.serviceRecords)
          .where(inArray(schema.serviceRecords.serviceDate, dates))
          .all()
      : []
    const byKey = new Map(rows.map((r) => [`${r.serviceTimeId}|${r.serviceDate}`, r]))

    // A record is returned for every active service time, present or not, so the client never has
    // to distinguish "not fetched" from "nothing entered yet".
    res.json({
      weekStart,
      records: times.map((st) => {
        const date = dateOf.get(st.id) as string
        const row = byKey.get(`${st.id}|${date}`)
        return {
          serviceTimeId: st.id,
          date,
          attendance: row?.attendance ?? null,
          streaming: row?.streaming ?? null,
          latestEnteredAt: row?.latestEnteredAt ?? null,
        }
      }),
    })
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
    const body = req.body as {
      serviceTimeId?: number
      date?: string
      attendance?: unknown
      streaming?: unknown
      field?: unknown
      adjustment?: unknown
      tappedAt?: unknown
    }
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
    // A Tally adjusts one field; a Correction replaces both. See ADR-0027.
    if (body.adjustment !== undefined || body.field !== undefined) {
      applyTally(res, {recorderId: rec.id, recorderName: rec.name}, serviceTimeId, date, body)
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
          kind: 'correction',
          attendance: att,
          streaming: strm,
        })
        .run()
    })

    res.json({serviceTimeId, date, attendance: att, streaming: strm, saved: true})
  }),
)

// A Tally: ±1 against one field of one record (ADR-0027).
//
// Adjustments commute, so a phone that was offline for twenty minutes can drain whenever it
// reconnects without overwriting what another device counted meanwhile. The one thing that does
// override a Tally is a **Correction** made after it was tapped — typing a number is a statement
// about the true count, and a tap from before that statement is stale intent, however late it
// arrives.
function applyTally(
  res: import('express').Response,
  rec: {recorderId: number; recorderName: string},
  serviceTimeId: number,
  date: string,
  body: {field?: unknown; adjustment?: unknown; tappedAt?: unknown},
): void {
  const field = body.field
  if (field !== 'attendance' && field !== 'streaming') {
    res.status(400).json({error: "field must be 'attendance' or 'streaming'"})
    return
  }
  const adjustment = body.adjustment
  if (
    typeof adjustment !== 'number' ||
    !Number.isInteger(adjustment) ||
    adjustment === 0 ||
    Math.abs(adjustment) > 100000
  ) {
    res.status(400).json({error: 'adjustment must be a non-zero integer'})
    return
  }
  const tappedAt = typeof body.tappedAt === 'string' ? sqliteTime(body.tappedAt) : null
  if (!tappedAt) {
    res.status(400).json({error: 'tappedAt must be an ISO timestamp'})
    return
  }

  const result = db.transaction((tx) => {
    const existing = tx
      .select({
        id: schema.serviceRecords.id,
        attendance: schema.serviceRecords.attendance,
        streaming: schema.serviceRecords.streaming,
      })
      .from(schema.serviceRecords)
      .where(and(eq(schema.serviceRecords.serviceTimeId, serviceTimeId), eq(schema.serviceRecords.serviceDate, date)))
      .get()

    if (existing) {
      const lastCorrection = tx
        .select({createdAt: schema.serviceRecordEdits.createdAt})
        .from(schema.serviceRecordEdits)
        .where(
          and(
            eq(schema.serviceRecordEdits.serviceRecordId, existing.id),
            eq(schema.serviceRecordEdits.kind, 'correction'),
          ),
        )
        .orderBy(desc(schema.serviceRecordEdits.id))
        .limit(1)
        .get()
      // Tapped before the count was last declared: the declaration already accounts for it.
      if (lastCorrection && tappedAt <= lastCorrection.createdAt) {
        return {applied: false, attendance: existing.attendance, streaming: existing.streaming}
      }
    }

    const before = existing ?? {attendance: null, streaming: null}
    // A Tally may not take a count below zero.
    const next = Math.max(0, (before[field] ?? 0) + adjustment)
    const values = {
      attendance: field === 'attendance' ? next : before.attendance,
      streaming: field === 'streaming' ? next : before.streaming,
    }

    const record = tx
      .insert(schema.serviceRecords)
      .values({
        serviceTimeId,
        serviceDate: date,
        ...values,
        latestRecorderId: rec.recorderId,
        latestRecorderName: rec.recorderName,
        latestEnteredAt: sql`datetime('now')`,
      })
      .onConflictDoUpdate({
        target: [schema.serviceRecords.serviceTimeId, schema.serviceRecords.serviceDate],
        set: {
          ...values,
          latestRecorderId: rec.recorderId,
          latestRecorderName: rec.recorderName,
          latestEnteredAt: sql`datetime('now')`,
          updatedAt: sql`datetime('now')`,
        },
      })
      .returning({id: schema.serviceRecords.id})
      .get()

    tx.insert(schema.serviceRecordEdits)
      .values({
        serviceRecordId: record.id,
        recorderId: rec.recorderId,
        recorderName: rec.recorderName,
        kind: 'tally',
        adjustment,
        ...values,
      })
      .run()

    return {applied: true, ...values}
  })

  res.json({serviceTimeId, date, ...result, saved: true})
}
