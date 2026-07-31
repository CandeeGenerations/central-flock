import {sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {parseSqliteUtc, visitWeight} from '../lib/frecency.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {parsePath, resolveEntity} from '../services/usage-entity-resolver.js'

export const usageRouter = Router()

const RECENTS_LIMIT = 50

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
    const agg = new Map<string, {section: string; entityId: number; score: number; byPath: Map<string, number>}>()
    for (const r of rows) {
      const {section, entityId} = parsePath(r.path)
      if (entityId == null) continue
      const key = `${section}/${entityId}`
      const w = visitWeight(parseSqliteUtc(r.visitedAt), now)
      const prev = agg.get(key)
      if (prev) {
        prev.score += w
        prev.byPath.set(r.path, (prev.byPath.get(r.path) ?? 0) + w)
      } else {
        agg.set(key, {section, entityId, score: w, byPath: new Map([[r.path, w]])})
      }
    }

    const ranked = [...agg.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, RECENTS_LIMIT)

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
