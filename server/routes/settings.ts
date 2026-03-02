import {eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const settingsRouter = Router()

const DEFAULTS: Record<string, string> = {
  sendMethod: 'api',
}

const VALID_VALUES: Record<string, string[]> = {
  sendMethod: ['api', 'ui'],
}

// GET /api/settings - Get all settings
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db.select().from(schema.settings).all()
    const result: Record<string, string> = {...DEFAULTS}
    for (const row of rows) {
      result[row.key] = row.value
    }
    res.json(result)
  }),
)

// PUT /api/settings/:key - Upsert a setting
settingsRouter.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key)
    const {value} = req.body as {value: string}

    if (!value || typeof value !== 'string') {
      res.status(400).json({error: 'value is required'})
      return
    }

    const allowed = VALID_VALUES[key]
    if (allowed && !allowed.includes(value)) {
      res.status(400).json({error: `Invalid value for ${key}. Must be one of: ${allowed.join(', ')}`})
      return
    }

    db.insert(schema.settings)
      .values({key, value})
      .onConflictDoUpdate({target: schema.settings.key, set: {value, updatedAt: sql`datetime('now')`}})
      .run()

    res.json({key, value})
  }),
)

export function getSetting(key: string): string {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return row?.value ?? DEFAULTS[key] ?? ''
}
