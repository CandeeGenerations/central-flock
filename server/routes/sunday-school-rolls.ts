import {and, asc, eq} from 'drizzle-orm'
import {Router} from 'express'

import {
  DEFAULT_SHEET_LABELS,
  type Quarter,
  isQuarter,
  quarterTitleLabel,
  scopeBounds,
} from '../../src/lib/sunday-school-roll-core.js'
import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const sundaySchoolRollsRouter = Router()

// Mounted at /api/schedules/sunday-school-rolls, ahead of the generic schedules
// router (same pattern as fair-booth and workers-notes).
// See CONTEXT.md → Sunday School Roll.

function rollWithSchedule(id: number) {
  return db
    .select({roll: schema.sundaySchoolRolls, schedule: schema.schedules})
    .from(schema.sundaySchoolRolls)
    .innerJoin(schema.schedules, eq(schema.schedules.id, schema.sundaySchoolRolls.scheduleId))
    .where(eq(schema.sundaySchoolRolls.id, id))
    .get()
}

function sheetsFor(rollId: number) {
  return db
    .select()
    .from(schema.sundaySchoolRollSheets)
    .where(eq(schema.sundaySchoolRollSheets.rollId, rollId))
    .orderBy(asc(schema.sundaySchoolRollSheets.sortOrder))
    .all()
}

function touch(rollId: number, scheduleId: number) {
  const now = new Date().toISOString()
  db.update(schema.sundaySchoolRolls).set({updatedAt: now}).where(eq(schema.sundaySchoolRolls.id, rollId)).run()
  db.update(schema.schedules).set({updatedAt: now}).where(eq(schema.schedules.id, scheduleId)).run()
}

sundaySchoolRollsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select({roll: schema.sundaySchoolRolls, schedule: schema.schedules})
      .from(schema.sundaySchoolRolls)
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.sundaySchoolRolls.scheduleId))
      .all()
    rows.sort((a, b) => (a.roll.year !== b.roll.year ? b.roll.year - a.roll.year : b.roll.quarter - a.roll.quarter))
    res.json(
      rows.map((r) => {
        const sheets = sheetsFor(r.roll.id)
        return {
          ...r.roll,
          scopeLabel: r.schedule.scopeLabel,
          status: r.schedule.status,
          sheetCount: sheets.length,
          scholarCount: sheets.reduce((n, s) => n + s.scholars.split('\n').filter((l) => l.trim() !== '').length, 0),
        }
      }),
    )
  }),
)

/**
 * Create a Roll for (year, quarter), cloning the most recent Roll's sheets —
 * labels and rosters both. Dates are never copied; they are derived from the
 * new quarter at render time. The first-ever Roll has nothing to copy, so it
 * seeds the five current class labels from a constant. See ADR 0030.
 */
sundaySchoolRollsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body as {year?: number; quarter?: number}
    const year = Number(b.year)
    const quarter = Number(b.quarter)
    if (!Number.isInteger(year) || year < 1900 || year > 2200 || !isQuarter(quarter)) {
      res.status(400).json({error: 'year and quarter (1-4) are required'})
      return
    }
    const clash = db
      .select()
      .from(schema.sundaySchoolRolls)
      .where(and(eq(schema.sundaySchoolRolls.year, year), eq(schema.sundaySchoolRolls.quarter, quarter)))
      .get()
    if (clash) {
      res.status(409).json({error: 'A roll already exists for that year and quarter', rollId: clash.id})
      return
    }

    const {scopeStart, scopeEnd} = scopeBounds(year, quarter as Quarter)
    const schedule = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'sunday_school_roll',
        scopeKind: 'date_range',
        scopeStart,
        scopeEnd,
        scopeLabel: quarterTitleLabel(year, quarter as Quarter),
      })
      .returning()
      .get()
    const roll = db.insert(schema.sundaySchoolRolls).values({scheduleId: schedule.id, year, quarter}).returning().get()

    // The latest Roll overall, not the latest *earlier* one: back-filling an
    // old quarter should still start from the roster you have today.
    const prior = db
      .select()
      .from(schema.sundaySchoolRolls)
      .all()
      .filter((r) => r.id !== roll.id)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.quarter - b.quarter))
      .pop()
    const seed = prior
      ? sheetsFor(prior.id).map((s) => ({label: s.label, scholars: s.scholars}))
      : DEFAULT_SHEET_LABELS.map((label) => ({label, scholars: ''}))
    seed.forEach((s, i) =>
      db
        .insert(schema.sundaySchoolRollSheets)
        .values({rollId: roll.id, label: s.label, scholars: s.scholars, sortOrder: i})
        .run(),
    )

    res.status(201).json({...roll, scopeLabel: schedule.scopeLabel, status: schedule.status})
  }),
)

sundaySchoolRollsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = rollWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Roll not found'})
      return
    }
    res.json({
      ...found.roll,
      scopeLabel: found.schedule.scopeLabel,
      status: found.schedule.status,
      sheets: sheetsFor(id),
    })
  }),
)

sundaySchoolRollsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = rollWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Roll not found'})
      return
    }
    const b = req.body as {status?: 'draft' | 'final'}
    if (b.status === 'draft' || b.status === 'final') {
      db.update(schema.schedules)
        .set({status: b.status, updatedAt: new Date().toISOString()})
        .where(eq(schema.schedules.id, found.schedule.id))
        .run()
    }
    res.json({ok: true})
  }),
)

sundaySchoolRollsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const found = rollWithSchedule(Number(req.params.id))
    if (!found) {
      res.status(404).json({error: 'Roll not found'})
      return
    }
    // Cascades to the roll and its sheets.
    db.delete(schema.schedules).where(eq(schema.schedules.id, found.schedule.id)).run()
    res.status(204).end()
  }),
)

/**
 * Replace the whole sheet list. Small, ordered, and always edited as a set —
 * the same wholesale-replace the Workers' Notes body lists use, so sort_order
 * (which is also the PDF page order) stays consistent with no per-row diffing.
 */
sundaySchoolRollsRouter.put(
  '/:id/sheets',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = rollWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Roll not found'})
      return
    }
    const incoming = (req.body as {sheets?: {label?: string; scholars?: string}[]}).sheets ?? []
    db.delete(schema.sundaySchoolRollSheets).where(eq(schema.sundaySchoolRollSheets.rollId, id)).run()
    incoming.forEach((s, i) =>
      db
        .insert(schema.sundaySchoolRollSheets)
        .values({rollId: id, label: String(s.label ?? ''), scholars: String(s.scholars ?? ''), sortOrder: i})
        .run(),
    )
    touch(id, found.schedule.id)
    res.json(sheetsFor(id))
  }),
)
