import {and, gte, inArray, lte} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {syncCalendarEvents} from '../services/calendar-sync.js'
import {fetchAvailableCalendars} from '../services/calendar.js'
import {getSetting} from './settings.js'

export const calendarRouter = Router()

// GET /api/calendar/calendars — live list of Calendar.app calendars with colors (used by Settings)
calendarRouter.get(
  '/calendars',
  asyncHandler(async (_req, res) => {
    try {
      const calendars = await fetchAvailableCalendars()
      res.json({calendars})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error fetching available calendars:', message)
      res.status(500).json({error: message})
    }
  }),
)

// GET /api/calendar/events?days=30 — fetch synced events from DB
calendarRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)

    const rawNames = getSetting('churchCalendarNames')
    let calendarNames: string[]
    try {
      calendarNames = rawNames ? JSON.parse(rawNames) : []
    } catch {
      calendarNames = []
    }

    if (calendarNames.length === 0) {
      res.status(400).json({
        error: 'No calendars configured. Select calendars in Settings → Church Calendars.',
        unconfigured: true,
      })
      return
    }

    const nowIso = new Date().toISOString()
    const futureIso = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const rows = db
      .select()
      .from(schema.calendarEvents)
      .where(
        and(
          inArray(schema.calendarEvents.calendarName, calendarNames),
          gte(schema.calendarEvents.startDate, nowIso),
          lte(schema.calendarEvents.startDate, futureIso),
        ),
      )
      .orderBy(schema.calendarEvents.startDate)
      .all()

    const events = rows.map((r) => ({
      id: r.eventUid,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate,
      allDay: r.allDay,
      location: r.location,
      calendarName: r.calendarName,
      recurring: r.recurring,
    }))

    let missing: string[]
    try {
      const rawMissing = getSetting('calendarSyncMissing')
      missing = rawMissing ? JSON.parse(rawMissing) : []
    } catch {
      missing = []
    }

    let calendarColors: Record<string, string>
    try {
      const rawColors = getSetting('calendarColors')
      calendarColors = rawColors ? JSON.parse(rawColors) : {}
    } catch {
      calendarColors = {}
    }

    const lastSyncedAt = getSetting('calendarLastSyncedAt') || null
    const lastSyncError = getSetting('calendarLastSyncError') || null

    res.json({events, calendarNames, missing, calendarColors, lastSyncedAt, lastSyncError})
  }),
)

// POST /api/calendar/sync — trigger a sync manually
calendarRouter.post(
  '/sync',
  asyncHandler(async (_req, res) => {
    const result = await syncCalendarEvents()
    if (result.ok) {
      res.json({
        ...result,
        lastSyncedAt: getSetting('calendarLastSyncedAt') || null,
      })
    } else {
      res.status(500).json(result)
    }
  }),
)
