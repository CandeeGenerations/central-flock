import {eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const settingsRouter = Router()

const DEFAULTS: Record<string, string> = {
  sendMethod: 'api',
  birthdaySendTime: '07:00',
  birthdayPreNotifyDays: '',
  birthdaySendTo: 'self',
  birthdayMyContactId: '',
  anniversarySendTime: '07:00',
  anniversaryPreNotifyDays: '',
  anniversarySendTo: 'self',
}

const VALID_VALUES: Record<string, string[]> = {
  sendMethod: ['api', 'ui'],
  birthdaySendTo: ['self', 'person'],
  anniversarySendTo: ['self', 'person'],
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

    if (typeof value !== 'string') {
      res.status(400).json({error: 'value is required'})
      return
    }

    // Allow empty string for settings that support it
    if (!value && key !== 'birthdayPreNotifyDays' && key !== 'birthdayMyContactId' && key !== 'anniversaryPreNotifyDays') {
      res.status(400).json({error: 'value is required'})
      return
    }

    const allowed = VALID_VALUES[key]
    if (allowed && !allowed.includes(value)) {
      res.status(400).json({error: `Invalid value for ${key}. Must be one of: ${allowed.join(', ')}`})
      return
    }

    if ((key === 'birthdaySendTime' || key === 'anniversarySendTime') && !/^\d{2}:\d{2}$/.test(value)) {
      res.status(400).json({error: `${key} must be in HH:MM format`})
      return
    }

    if ((key === 'birthdayPreNotifyDays' || key === 'anniversaryPreNotifyDays') && value !== '') {
      const validDays = ['3', '7', '10']
      const parts = value.split(',')
      if (!parts.every((p) => validDays.includes(p.trim()))) {
        res.status(400).json({error: 'birthdayPreNotifyDays must be comma-separated values of 3, 7, 10'})
        return
      }
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
