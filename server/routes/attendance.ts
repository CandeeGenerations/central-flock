import {and, asc, desc, eq, gte, lte, sql} from 'drizzle-orm'
import {Router} from 'express'
import {randomBytes} from 'node:crypto'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const attendanceRouter = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const newToken = () => randomBytes(24).toString('base64url')
type Metric = 'attendance' | 'streaming' | 'total'

function metricExpr(metric: Metric) {
  const a = schema.serviceRecords.attendance
  const s = schema.serviceRecords.streaming
  if (metric === 'attendance') return sql<number>`${a}`
  if (metric === 'streaming') return sql<number>`${s}`
  return sql<number>`coalesce(${a}, 0) + coalesce(${s}, 0)`
}

// Records must have the metric present (blank != 0). For total, either field present.
function metricPresent(metric: Metric) {
  const a = schema.serviceRecords.attendance
  const s = schema.serviceRecords.streaming
  if (metric === 'attendance') return sql`${a} is not null`
  if (metric === 'streaming') return sql`${s} is not null`
  return sql`(${a} is not null or ${s} is not null)`
}

// --- Service Times ----------------------------------------------------------

attendanceRouter.get(
  '/service-times',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true'
    const rows = db
      .select({
        id: schema.serviceTimes.id,
        name: schema.serviceTimes.name,
        dayOfWeek: schema.serviceTimes.dayOfWeek,
        time: schema.serviceTimes.time,
        active: schema.serviceTimes.active,
        sortOrder: schema.serviceTimes.sortOrder,
        recordCount: sql<number>`(select count(*) from ${schema.serviceRecords} where ${schema.serviceRecords.serviceTimeId} = ${schema.serviceTimes.id})`,
      })
      .from(schema.serviceTimes)
      .all()
    const filtered = includeInactive ? rows : rows.filter((r) => r.active)
    filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.time.localeCompare(b.time))
    res.json(filtered)
  }),
)

attendanceRouter.post(
  '/service-times',
  asyncHandler(async (req, res) => {
    const {name, dayOfWeek, time} = req.body as {name?: string; dayOfWeek?: number; time?: string}
    if (
      !name?.trim() ||
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek! < 0 ||
      dayOfWeek! > 6 ||
      !/^\d{2}:\d{2}$/.test(time ?? '')
    ) {
      res.status(400).json({error: 'name, dayOfWeek (0–6), time (HH:MM) required'})
      return
    }
    const maxSort =
      db
        .select({m: sql<number>`coalesce(max(${schema.serviceTimes.sortOrder}), 0)`})
        .from(schema.serviceTimes)
        .get()?.m ?? 0
    const row = db
      .insert(schema.serviceTimes)
      .values({name: name.trim(), dayOfWeek: dayOfWeek!, time: time!, sortOrder: maxSort + 1})
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

attendanceRouter.patch(
  '/service-times/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const b = req.body as {name?: string; dayOfWeek?: number; time?: string; active?: boolean; sortOrder?: number}
    const set: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
    if (b.name !== undefined) set.name = String(b.name).trim()
    if (b.dayOfWeek !== undefined) set.dayOfWeek = b.dayOfWeek
    if (b.time !== undefined) set.time = b.time
    if (b.active !== undefined) set.active = b.active
    if (b.sortOrder !== undefined) set.sortOrder = b.sortOrder
    const row = db.update(schema.serviceTimes).set(set).where(eq(schema.serviceTimes.id, id)).returning().get()
    if (!row) {
      res.status(404).json({error: 'not found'})
      return
    }
    res.json(row)
  }),
)

attendanceRouter.post(
  '/service-times/reorder',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids?: number[]}
    if (!Array.isArray(ids)) {
      res.status(400).json({error: 'ids array required'})
      return
    }
    db.transaction((tx) => {
      ids.forEach((id, i) => {
        tx.update(schema.serviceTimes)
          .set({sortOrder: i + 1})
          .where(eq(schema.serviceTimes.id, id))
          .run()
      })
    })
    res.json({ok: true})
  }),
)

// Hard-delete only when the service time has zero records; otherwise soft-retire via active=false.
attendanceRouter.delete(
  '/service-times/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const count = db
      .select({n: sql<number>`count(*)`})
      .from(schema.serviceRecords)
      .where(eq(schema.serviceRecords.serviceTimeId, id))
      .get()!.n
    if (count > 0) {
      res.status(409).json({error: `has ${count} records — retire it instead`, recordCount: count})
      return
    }
    db.delete(schema.serviceTimes).where(eq(schema.serviceTimes.id, id)).run()
    res.json({ok: true})
  }),
)

// --- Records ----------------------------------------------------------------

attendanceRouter.get(
  '/records',
  asyncHandler(async (req, res) => {
    const serviceTimeId = req.query.serviceTimeId ? Number(req.query.serviceTimeId) : null
    const from = typeof req.query.from === 'string' && DATE_RE.test(req.query.from) ? req.query.from : null
    const to = typeof req.query.to === 'string' && DATE_RE.test(req.query.to) ? req.query.to : null
    const limit = Math.min(Number(req.query.limit) || 100, 1000)
    const conds = []
    if (serviceTimeId) conds.push(eq(schema.serviceRecords.serviceTimeId, serviceTimeId))
    if (from) conds.push(gte(schema.serviceRecords.serviceDate, from))
    if (to) conds.push(lte(schema.serviceRecords.serviceDate, to))
    const rows = db
      .select({
        id: schema.serviceRecords.id,
        serviceTimeId: schema.serviceRecords.serviceTimeId,
        serviceTimeName: schema.serviceTimes.name,
        serviceDate: schema.serviceRecords.serviceDate,
        attendance: schema.serviceRecords.attendance,
        streaming: schema.serviceRecords.streaming,
        enteredBy: schema.serviceRecords.latestRecorderName,
        enteredAt: schema.serviceRecords.latestEnteredAt,
      })
      .from(schema.serviceRecords)
      .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.serviceRecords.serviceTimeId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.serviceRecords.serviceDate))
      .limit(limit)
      .all()
    res.json(rows)
  }),
)

attendanceRouter.patch(
  '/records/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const b = req.body as {attendance?: number | null; streaming?: number | null}
    const clean = (v: number | null | undefined) => {
      if (v === undefined) return undefined
      if (v === null) return null
      if (!Number.isInteger(v) || v < 0 || v > 100000) return NaN
      return v
    }
    const att = clean(b.attendance)
    const strm = clean(b.streaming)
    if (Number.isNaN(att) || Number.isNaN(strm)) {
      res.status(400).json({error: 'attendance/streaming must be integers 0–100000 or null'})
      return
    }
    const existing = db
      .select({attendance: schema.serviceRecords.attendance, streaming: schema.serviceRecords.streaming})
      .from(schema.serviceRecords)
      .where(eq(schema.serviceRecords.id, id))
      .get()
    if (!existing) {
      res.status(404).json({error: 'not found'})
      return
    }
    const finalAtt = att === undefined ? existing.attendance : att
    const finalStrm = strm === undefined ? existing.streaming : strm

    // Admin edit: overwrite values, attribute latest to "Admin", append to the change log.
    db.transaction((tx) => {
      tx.update(schema.serviceRecords)
        .set({
          attendance: finalAtt,
          streaming: finalStrm,
          latestRecorderId: null,
          latestRecorderName: 'Admin',
          latestEnteredAt: sql`datetime('now')`,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(schema.serviceRecords.id, id))
        .run()
      tx.insert(schema.serviceRecordEdits)
        .values({
          serviceRecordId: id,
          recorderId: null,
          recorderName: 'Admin',
          attendance: finalAtt,
          streaming: finalStrm,
        })
        .run()
    })
    res.json({id, attendance: finalAtt, streaming: finalStrm, enteredBy: 'Admin'})
  }),
)

// GET /records/:id/history — full change log for a record, newest first.
attendanceRouter.get(
  '/records/:id/history',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const rows = db
      .select({
        id: schema.serviceRecordEdits.id,
        recorderName: schema.serviceRecordEdits.recorderName,
        attendance: schema.serviceRecordEdits.attendance,
        streaming: schema.serviceRecordEdits.streaming,
        createdAt: schema.serviceRecordEdits.createdAt,
      })
      .from(schema.serviceRecordEdits)
      .where(eq(schema.serviceRecordEdits.serviceRecordId, id))
      .orderBy(desc(schema.serviceRecordEdits.id))
      .all()
    res.json(rows)
  }),
)

// --- Recorders --------------------------------------------------------------

// Public entry link base for building recorder copy-links (e.g. https://attendance.cgen.cc).
attendanceRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({publicUrlBase: process.env.ATTENDANCE_PUBLIC_URL_BASE || ''})
  }),
)

attendanceRouter.get(
  '/recorders',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select({
        id: schema.recorders.id,
        name: schema.recorders.name,
        token: schema.recorders.token,
        active: schema.recorders.active,
        editCount: sql<number>`(select count(*) from ${schema.serviceRecordEdits} where ${schema.serviceRecordEdits.recorderId} = ${schema.recorders.id})`,
      })
      .from(schema.recorders)
      .orderBy(asc(schema.recorders.name))
      .all()
    res.json(rows)
  }),
)

attendanceRouter.post(
  '/recorders',
  asyncHandler(async (req, res) => {
    const name = String((req.body as {name?: string}).name ?? '').trim()
    if (!name) {
      res.status(400).json({error: 'name required'})
      return
    }
    const row = db.insert(schema.recorders).values({name, token: newToken()}).returning().get()
    res.status(201).json(row)
  }),
)

attendanceRouter.patch(
  '/recorders/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const b = req.body as {name?: string; active?: boolean}
    const set: Record<string, unknown> = {updatedAt: sql`datetime('now')`}
    if (b.name !== undefined) set.name = String(b.name).trim()
    if (b.active !== undefined) set.active = b.active
    const row = db.update(schema.recorders).set(set).where(eq(schema.recorders.id, id)).returning().get()
    if (!row) {
      res.status(404).json({error: 'not found'})
      return
    }
    res.json(row)
  }),
)

// Regenerate token — invalidates the old link, keeps history.
attendanceRouter.post(
  '/recorders/:id/regenerate',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const row = db
      .update(schema.recorders)
      .set({token: newToken(), updatedAt: sql`datetime('now')`})
      .where(eq(schema.recorders.id, id))
      .returning()
      .get()
    if (!row) {
      res.status(404).json({error: 'not found'})
      return
    }
    res.json(row)
  }),
)

// Hard-delete only when the recorder has zero edits; otherwise retire via active=false.
attendanceRouter.delete(
  '/recorders/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const count = db
      .select({n: sql<number>`count(*)`})
      .from(schema.serviceRecordEdits)
      .where(eq(schema.serviceRecordEdits.recorderId, id))
      .get()!.n
    if (count > 0) {
      res.status(409).json({error: `has ${count} edits — retire it instead`, editCount: count})
      return
    }
    db.delete(schema.recorders).where(eq(schema.recorders.id, id)).run()
    res.json({ok: true})
  }),
)

// --- Chart series -----------------------------------------------------------
// GET /series?metric=&serviceTimeId=all|<id>&from=&to=
// Returns [{date, value}] ascending. serviceTimeId=all sums the metric per date.
attendanceRouter.get(
  '/series',
  asyncHandler(async (req, res) => {
    const metric = (
      ['attendance', 'streaming', 'total'].includes(String(req.query.metric)) ? req.query.metric : 'attendance'
    ) as Metric
    const stParam = String(req.query.serviceTimeId ?? 'all')
    const from = typeof req.query.from === 'string' && DATE_RE.test(req.query.from) ? req.query.from : null
    const to = typeof req.query.to === 'string' && DATE_RE.test(req.query.to) ? req.query.to : null

    const conds = [metricPresent(metric)]
    if (stParam !== 'all') {
      const id = Number(stParam)
      if (Number.isInteger(id)) conds.push(eq(schema.serviceRecords.serviceTimeId, id))
    }
    if (from) conds.push(gte(schema.serviceRecords.serviceDate, from))
    if (to) conds.push(lte(schema.serviceRecords.serviceDate, to))

    const rows = db
      .select({
        date: schema.serviceRecords.serviceDate,
        value: sql<number>`sum(${metricExpr(metric)})`,
      })
      .from(schema.serviceRecords)
      .where(and(...conds))
      .groupBy(schema.serviceRecords.serviceDate)
      .orderBy(asc(schema.serviceRecords.serviceDate))
      .all()
    res.json({metric, serviceTimeId: stParam, points: rows})
  }),
)

// --- Summary tiles ----------------------------------------------------------
// This-month & this-year totals + averages, per metric. serviceTimeId optional.
attendanceRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const stParam = String(req.query.serviceTimeId ?? 'all')
    const stId = stParam !== 'all' && Number.isInteger(Number(stParam)) ? Number(stParam) : null

    const now = new Date()
    const y = now.getUTCFullYear()
    const monthStart = `${y}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
    const yearStart = `${y}-01-01`

    function agg(metric: Metric, from: string) {
      const conds = [metricPresent(metric), gte(schema.serviceRecords.serviceDate, from)]
      if (stId) conds.push(eq(schema.serviceRecords.serviceTimeId, stId))
      const r = db
        .select({
          total: sql<number>`coalesce(sum(${metricExpr(metric)}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(schema.serviceRecords)
        .where(and(...conds))
        .get()!
      return {total: r.total, count: r.count, avg: r.count ? Math.round(r.total / r.count) : 0}
    }

    const metrics: Metric[] = ['attendance', 'streaming', 'total']
    const out: Record<string, {month: ReturnType<typeof agg>; year: ReturnType<typeof agg>}> = {}
    for (const m of metrics) out[m] = {month: agg(m, monthStart), year: agg(m, yearStart)}
    res.json({monthStart, yearStart, metrics: out})
  }),
)
