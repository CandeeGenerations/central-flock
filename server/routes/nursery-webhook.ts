import {Router} from 'express'

import {isIsoDate, loadNurseryDay, nextSunday} from '../services/nursery-day.js'

// Read-only Nursery schedule for cgen-api's /api/nursery/day (the reminder bot). Behind the
// shared internal secret like every /webhooks/* route.
export const nurseryWebhookRouter = Router()

// GET /webhooks/nursery/day?date=YYYY-MM-DD — defaults to the coming Sunday (Eastern).
nurseryWebhookRouter.get('/day', (req, res) => {
  const raw = typeof req.query.date === 'string' ? req.query.date.trim() : ''
  if (raw && !isIsoDate(raw)) {
    res.status(400).json({error: 'date must be YYYY-MM-DD'})
    return
  }
  res.json(loadNurseryDay(raw || nextSunday(new Date())))
})
