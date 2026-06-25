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

    // Aggregate frecency per distinct entity path.
    const agg = new Map<string, {section: string; entityId: number; score: number}>()
    for (const r of rows) {
      const {section, entityId} = parsePath(r.path)
      if (entityId == null) continue
      const key = r.path
      const prev = agg.get(key)
      const w = visitWeight(parseSqliteUtc(r.visitedAt), now)
      if (prev) prev.score += w
      else agg.set(key, {section, entityId, score: w})
    }

    const ranked = [...agg.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, RECENTS_LIMIT)

    const items = []
    for (const [path, {section, entityId, score}] of ranked) {
      const resolved = resolveEntity(section, entityId)
      if (!resolved) continue // deleted entity -> drop
      items.push({path, entityType: resolved.entityType, typeLabel: resolved.typeLabel, label: resolved.label, score})
    }
    res.json(items)
  }),
)
