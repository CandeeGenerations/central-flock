import {sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {parseSqliteUtc, visitWeight} from '../lib/frecency.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {parsePath, resolveEntity} from '../services/usage-entity-resolver.js'

export const usageRouter = Router()

const RECENTS_LIMIT = 50

// "Recently" has to mean recently. An entity untouched for longer than this is
// dropped outright, however heavily it was used before that — a three-week
// August push on one Fair Booth schedule otherwise outranks September's work
// well into October. See docs/adr/0038-recents-forget-stale-entities.md.
const RECENTS_MAX_AGE_DAYS = 21
const DAY_MS = 86_400_000

function pruneOld(): void {
  db.delete(schema.routeVisits)
    .where(sql`${schema.routeVisits.visitedAt} < datetime('now', '-12 months')`)
    .run()
}

// POST /api/usage/visit - log one navigation
usageRouter.post(
  '/visit',
  asyncHandler(async (req, res) => {
    const path = typeof req.body?.path === 'string' ? req.body.path : ''
    if (!path.startsWith('/')) {
      res.status(400).json({error: 'path required'})
      return
    }
    db.insert(schema.routeVisits).values({path}).run()
    res.json({ok: true})
  }),
)

// GET /api/usage/sections - frecency score per section (drives nav reorder)
usageRouter.get(
  '/sections',
  asyncHandler(async (_req, res) => {
    pruneOld()
    const rows = db
      .select({path: schema.routeVisits.path, visitedAt: schema.routeVisits.visitedAt})
      .from(schema.routeVisits)
      .all()
    const now = Date.now()
    const scores: Record<string, number> = {}
    for (const r of rows) {
      const {section} = parsePath(r.path)
      scores[section] = (scores[section] ?? 0) + visitWeight(parseSqliteUtc(r.visitedAt), now)
    }
    res.json(scores)
  }),
)

// GET /api/usage/recents - frecent entity deep-links with live labels
usageRouter.get(
  '/recents',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select({path: schema.routeVisits.path, visitedAt: schema.routeVisits.visitedAt})
      .from(schema.routeVisits)
      .all()
    const now = Date.now()

    // Aggregate per ENTITY, not per path. Sub-routes of one entity
    // (/schedules/fair-booth/22, /schedules/fair-booth/22/day/2026-08-01, ...)
    // all parse to the same (section, id) and so resolve to the same label —
    // keying by raw path listed the same schedule once per day page visited.
    //
    // One visit per entity per DAY counts, not one per click. Editing a fair
    // booth schedule is hundreds of navigations between its day pages over a
    // fortnight; a devotion is opened once. Summing raw clicks made the first
    // kind of work permanently outrank the second, so the score asks "how many
    // days did you work on this" instead.
    interface Agg {
      section: string
      entityId: number
      score: number
      lastVisitMs: number
      byPath: Map<string, number>
      countedDays: Set<string>
    }
    const agg = new Map<string, Agg>()
    for (const r of rows) {
      const {section, entityId} = parsePath(r.path)
      if (entityId == null) continue
      const key = `${section}/${entityId}`
      const visitedMs = parseSqliteUtc(r.visitedAt)
      const w = visitWeight(visitedMs, now)
      const day = r.visitedAt.slice(0, 10)
      let a = agg.get(key)
      if (!a) {
        a = {section, entityId, score: 0, lastVisitMs: visitedMs, byPath: new Map(), countedDays: new Set()}
        agg.set(key, a)
      }
      if (!a.countedDays.has(day)) {
        a.countedDays.add(day)
        a.score += w
      }
      a.lastVisitMs = Math.max(a.lastVisitMs, visitedMs)
      // Which path to link to is still decided by raw traffic — every visit
      // votes, even the ones that did not add to the score.
      a.byPath.set(r.path, (a.byPath.get(r.path) ?? 0) + w)
    }

    const freshEnough = now - RECENTS_MAX_AGE_DAYS * DAY_MS
    const ranked = [...agg.entries()]
      .filter(([, a]) => a.lastVisitMs >= freshEnough)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, RECENTS_LIMIT)

    const items = []
    for (const [canonical, {section, entityId, score, byPath}] of ranked) {
      // Link to the entity's own page when it's actually been visited — a chip
      // labelled "2026 Fair Booth" landing on a single day editor reads as a
      // bug. Entities only ever reached through a sub-route fall back to their
      // most-used one.
      const path = byPath.has(canonical) ? canonical : [...byPath.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const resolved = resolveEntity(section, entityId)
      if (!resolved) continue // deleted entity -> drop
      items.push({path, entityType: resolved.entityType, typeLabel: resolved.typeLabel, label: resolved.label, score})
    }
    res.json(items)
  }),
)
