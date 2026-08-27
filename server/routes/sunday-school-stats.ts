import {and, asc, eq, gte, lte, sql} from 'drizzle-orm'
import {Router} from 'express'

import {type Quarter, isQuarter, sundaysInQuarter} from '../../src/lib/sunday-school-roll-core.js'
import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const sundaySchoolStatsRouter = Router()

// Mounted at /api/sunday-school-stats. Modelled on the attendance router's
// /series and /summary, but records a different thing entirely: this is the
// per-Department children's count, never the usher's whole-room Service Record.
// The two are never joined and never shown together. See ADR 0031.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
type Metric = 'girls' | 'boys' | 'total'

const isMetric = (v: unknown): v is Metric => v === 'girls' || v === 'boys' || v === 'total'

function metricExpr(metric: Metric) {
  const g = schema.sundaySchoolDepartmentCounts.girls
  const b = schema.sundaySchoolDepartmentCounts.boys
  if (metric === 'girls') return sql<number>`${g}`
  if (metric === 'boys') return sql<number>`${b}`
  return sql<number>`coalesce(${g}, 0) + coalesce(${b}, 0)`
}

// Blank is not zero, so a row only counts toward a metric it actually carries.
// For total, either column being present is enough.
function metricPresent(metric: Metric) {
  const g = schema.sundaySchoolDepartmentCounts.girls
  const b = schema.sundaySchoolDepartmentCounts.boys
  if (metric === 'girls') return sql`${g} is not null`
  if (metric === 'boys') return sql`${b} is not null`
  return sql`(${g} is not null or ${b} is not null)`
}

/** `departmentId` query param -> a numeric id, or null for "all combined". */
function departmentFilter(raw: unknown): number | null {
  const s = String(raw ?? 'all')
  if (s === 'all') return null
  const id = Number(s)
  return Number.isInteger(id) ? id : null
}

// --- Departments ------------------------------------------------------------

sundaySchoolStatsRouter.get(
  '/departments',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true'
    const rows = db
      .select({
        id: schema.sundaySchoolDepartments.id,
        name: schema.sundaySchoolDepartments.name,
        active: schema.sundaySchoolDepartments.active,
        sortOrder: schema.sundaySchoolDepartments.sortOrder,
        // Written out rather than interpolated: drizzle's sql template renders a
        // column as a bare `"id"`, which inside a subquery binds to the INNER
        // table and silently counts the wrong thing.
        countCount: sql<number>`(
          select count(*) from sunday_school_department_counts c
          where c.department_id = sunday_school_departments.id
        )`,
      })
      .from(schema.sundaySchoolDepartments)
      .all()
    const filtered = includeInactive ? rows : rows.filter((r) => r.active)
    filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    res.json(filtered)
  }),
)

sundaySchoolStatsRouter.post(
  '/departments',
  asyncHandler(async (req, res) => {
    const {name} = req.body as {name?: string}
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({error: 'name required'})
      return
    }
    const maxOrder =
      db
        .select({n: sql<number>`coalesce(max(${schema.sundaySchoolDepartments.sortOrder}), -1)`})
        .from(schema.sundaySchoolDepartments)
        .get()?.n ?? -1
    const row = db
      .insert(schema.sundaySchoolDepartments)
      .values({name: name.trim(), sortOrder: maxOrder + 1})
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

sundaySchoolStatsRouter.patch(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const {name, active, sortOrder} = req.body as {name?: string; active?: boolean; sortOrder?: number}
    const patch: Record<string, unknown> = {updatedAt: sql`(datetime('now'))`}
    if (typeof name === 'string') {
      if (!name.trim()) {
        res.status(400).json({error: 'name cannot be blank'})
        return
      }
      patch.name = name.trim()
    }
    if (typeof active === 'boolean') patch.active = active
    if (Number.isInteger(sortOrder)) patch.sortOrder = sortOrder
    const row = db
      .update(schema.sundaySchoolDepartments)
      .set(patch)
      .where(eq(schema.sundaySchoolDepartments.id, id))
      .returning()
      .get()
    if (!row) {
      res.status(404).json({error: 'not found'})
      return
    }
    res.json(row)
  }),
)

sundaySchoolStatsRouter.post(
  '/departments/reorder',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids?: number[]}
    if (!Array.isArray(ids)) {
      res.status(400).json({error: 'ids array required'})
      return
    }
    db.transaction((tx) => {
      ids.forEach((id, i) => {
        tx.update(schema.sundaySchoolDepartments)
          .set({sortOrder: i})
          .where(eq(schema.sundaySchoolDepartments.id, id))
          .run()
      })
    })
    res.json({ok: true})
  }),
)

// Hard-delete only when the department has zero counts; otherwise retire it via
// PATCH active=false, which keeps its history in every past quarter.
sundaySchoolStatsRouter.delete(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const countCount = db
      .select({n: sql<number>`count(*)`})
      .from(schema.sundaySchoolDepartmentCounts)
      .where(eq(schema.sundaySchoolDepartmentCounts.departmentId, id))
      .get()!.n
    if (countCount > 0) {
      res.status(409).json({error: `has ${countCount} recorded weeks — retire it instead`, countCount})
      return
    }
    db.delete(schema.sundaySchoolDepartments).where(eq(schema.sundaySchoolDepartments.id, id)).run()
    res.json({ok: true})
  }),
)

// --- Years ------------------------------------------------------------------

// Which years the year picker offers: every year that actually has counts,
// plus this year and next so a new quarter can be started before it has data.
// Derived rather than a rolling window off the current year, which would both
// offer empty years below the first record and drop real ones off the bottom
// as time passes.
sundaySchoolStatsRouter.get(
  '/years',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select({year: sql<string>`substr(${schema.sundaySchoolDepartmentCounts.weekOf}, 1, 4)`})
      .from(schema.sundaySchoolDepartmentCounts)
      .groupBy(sql`substr(${schema.sundaySchoolDepartmentCounts.weekOf}, 1, 4)`)
      .all()
    const now = new Date().getUTCFullYear()
    const years = new Set<number>([now, now + 1])
    for (const r of rows) {
      const y = Number(r.year)
      if (Number.isInteger(y)) years.add(y)
    }
    res.json([...years].sort((a, b) => b - a))
  }),
)

// --- Quarter grid -----------------------------------------------------------

// Every Sunday in the quarter crossed with every department, blanks included.
// The Sundays come from sundaysInQuarter() — the same helper the Roll uses to
// derive its date columns — so there is exactly one copy of that arithmetic.
sundaySchoolStatsRouter.get(
  '/grid',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year)
    const quarterRaw = Number(req.query.quarter)
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !isQuarter(quarterRaw)) {
      res.status(400).json({error: 'year and quarter (1-4) required'})
      return
    }
    const quarter = quarterRaw as Quarter
    const weeks = sundaysInQuarter(year, quarter)

    const departments = db
      .select({
        id: schema.sundaySchoolDepartments.id,
        name: schema.sundaySchoolDepartments.name,
        active: schema.sundaySchoolDepartments.active,
        sortOrder: schema.sundaySchoolDepartments.sortOrder,
      })
      .from(schema.sundaySchoolDepartments)
      .all()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

    const counts = db
      .select({
        weekOf: schema.sundaySchoolDepartmentCounts.weekOf,
        departmentId: schema.sundaySchoolDepartmentCounts.departmentId,
        girls: schema.sundaySchoolDepartmentCounts.girls,
        boys: schema.sundaySchoolDepartmentCounts.boys,
      })
      .from(schema.sundaySchoolDepartmentCounts)
      .where(
        and(
          gte(schema.sundaySchoolDepartmentCounts.weekOf, weeks[0]),
          lte(schema.sundaySchoolDepartmentCounts.weekOf, weeks[weeks.length - 1]),
        ),
      )
      .all()

    // A retired department still renders when the quarter has data for it, so a
    // past quarter reads the way it was recorded.
    const used = new Set(counts.map((c) => c.departmentId))
    res.json({
      year,
      quarter,
      weeks,
      departments: departments.filter((d) => d.active || used.has(d.id)),
      counts,
    })
  }),
)

sundaySchoolStatsRouter.put(
  '/counts',
  asyncHandler(async (req, res) => {
    const {weekOf, departmentId, girls, boys} = req.body as {
      weekOf?: string
      departmentId?: number
      girls?: number | null
      boys?: number | null
    }
    if (typeof weekOf !== 'string' || !DATE_RE.test(weekOf)) {
      res.status(400).json({error: 'weekOf must be YYYY-MM-DD'})
      return
    }
    if (new Date(weekOf + 'T12:00:00Z').getUTCDay() !== 0) {
      res.status(400).json({error: 'weekOf must be a Sunday'})
      return
    }
    if (!Number.isInteger(departmentId)) {
      res.status(400).json({error: 'departmentId required'})
      return
    }
    const clean = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isInteger(n) && n >= 0 ? n : null
    }
    const g = clean(girls)
    const b = clean(boys)

    // Both blank means the cell was cleared — drop the row rather than storing
    // a pair of nulls, so "no row" and "no data" stay the same thing.
    if (g === null && b === null) {
      db.delete(schema.sundaySchoolDepartmentCounts)
        .where(
          and(
            eq(schema.sundaySchoolDepartmentCounts.weekOf, weekOf),
            eq(schema.sundaySchoolDepartmentCounts.departmentId, departmentId!),
          ),
        )
        .run()
      res.json({weekOf, departmentId, girls: null, boys: null})
      return
    }

    const row = db
      .insert(schema.sundaySchoolDepartmentCounts)
      .values({weekOf, departmentId: departmentId!, girls: g, boys: b})
      .onConflictDoUpdate({
        target: [schema.sundaySchoolDepartmentCounts.weekOf, schema.sundaySchoolDepartmentCounts.departmentId],
        set: {girls: g, boys: b, updatedAt: sql`(datetime('now'))`},
      })
      .returning()
      .get()
    res.json(row)
  }),
)

// --- Chart series -----------------------------------------------------------

// One point per Sunday. Already weekly, so nothing buckets these downstream.
sundaySchoolStatsRouter.get(
  '/series',
  asyncHandler(async (req, res) => {
    const metric: Metric = isMetric(req.query.metric) ? req.query.metric : 'total'
    const deptParam = String(req.query.departmentId ?? 'all')
    const deptId = departmentFilter(req.query.departmentId)
    const from = typeof req.query.from === 'string' && DATE_RE.test(req.query.from) ? req.query.from : null
    const to = typeof req.query.to === 'string' && DATE_RE.test(req.query.to) ? req.query.to : null

    const conds = [metricPresent(metric)]
    if (deptId !== null) conds.push(eq(schema.sundaySchoolDepartmentCounts.departmentId, deptId))
    if (from) conds.push(gte(schema.sundaySchoolDepartmentCounts.weekOf, from))
    if (to) conds.push(lte(schema.sundaySchoolDepartmentCounts.weekOf, to))

    const rows = db
      .select({
        date: schema.sundaySchoolDepartmentCounts.weekOf,
        value: sql<number>`sum(${metricExpr(metric)})`,
      })
      .from(schema.sundaySchoolDepartmentCounts)
      .where(and(...conds))
      .groupBy(schema.sundaySchoolDepartmentCounts.weekOf)
      .orderBy(asc(schema.sundaySchoolDepartmentCounts.weekOf))
      .all()
    res.json({metric, departmentId: deptParam, points: rows})
  }),
)

// --- Summary tiles ----------------------------------------------------------

// This-quarter and this-year totals, averages and week counts, per metric.
sundaySchoolStatsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const deptId = departmentFilter(req.query.departmentId)

    const now = new Date()
    const y = now.getUTCFullYear()
    const quarter = (Math.floor(now.getUTCMonth() / 3) + 1) as Quarter
    const quarterWeeks = sundaysInQuarter(y, quarter)
    const quarterStart = quarterWeeks[0]
    const yearStart = `${y}-01-01`

    function agg(metric: Metric, from: string) {
      const conds = [metricPresent(metric), gte(schema.sundaySchoolDepartmentCounts.weekOf, from)]
      if (deptId !== null) conds.push(eq(schema.sundaySchoolDepartmentCounts.departmentId, deptId))
      const r = db
        .select({
          total: sql<number>`coalesce(sum(${metricExpr(metric)}), 0)`,
          // Weeks, not rows: three departments on one Sunday is one week.
          count: sql<number>`count(distinct ${schema.sundaySchoolDepartmentCounts.weekOf})`,
        })
        .from(schema.sundaySchoolDepartmentCounts)
        .where(and(...conds))
        .get()!
      return {total: r.total, count: r.count, avg: r.count ? Math.round(r.total / r.count) : 0}
    }

    const metrics: Metric[] = ['girls', 'boys', 'total']
    const out: Record<string, {quarter: ReturnType<typeof agg>; year: ReturnType<typeof agg>}> = {}
    for (const m of metrics) out[m] = {quarter: agg(m, quarterStart), year: agg(m, yearStart)}
    res.json({quarterStart, yearStart, year: y, quarter, metrics: out})
  }),
)
