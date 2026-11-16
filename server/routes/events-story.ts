import {Router} from 'express'

import {addDays} from '../lib/repeat-rules.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {MAX_DAYS_AHEAD, earliestMinute, zonedNow} from '../services/events-story/post-time.js'
import {
  RunInputError,
  type RunRow,
  createRun,
  discardRun,
  getRun,
  hoursFor,
  listRuns,
  loadCandidates,
  prepareRun,
  redraftRun,
  runLines,
  scheduledInWeekOf,
} from '../services/events-story/run.js'

export const eventsStoryRouter = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function present(run: RunRow) {
  const {linesJson: _linesJson, ...rest} = run
  return {...rest, lines: runLines(run)}
}

function sendInputError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof RunInputError) {
    res.status(400).json({error: error.message})
    return true
  }
  return false
}

// New Story screen: connection check, default post day/time, the 10 candidates, any open run.
eventsStoryRouter.get(
  '/prepare',
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' && DATE_RE.test(req.query.date) ? req.query.date : undefined
    res.json(await prepareRun(date))
  }),
)

// Re-pick for a chosen date (override): best hours + candidates for that day.
eventsStoryRouter.get(
  '/day',
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : ''
    const now = zonedNow(new Date())
    if (!DATE_RE.test(date) || date < now.date || date > addDays(now.date, MAX_DAYS_AHEAD)) {
      res.status(400).json({error: `Pick a date between today and ${MAX_DAYS_AHEAD} days ahead`})
      return
    }
    const {hours, source} = await hoursFor(date, now)
    res.json({
      postDate: date,
      earliestMinute: earliestMinute(date, now),
      hours,
      hoursSource: source,
      candidates: loadCandidates(date),
      scheduledThatWeek: scheduledInWeekOf(date),
    })
  }),
)

eventsStoryRouter.get('/runs', (_req, res) => {
  res.json(listRuns().map(present))
})

eventsStoryRouter.get('/runs/:id', (req, res) => {
  const run = getRun(Number(req.params.id))
  if (!run) {
    res.status(404).json({error: 'Story Run not found'})
    return
  }
  res.json(present(run))
})

eventsStoryRouter.post('/runs', (req, res) => {
  try {
    res.status(201).json(present(createRun(req.body ?? {})))
  } catch (error) {
    if (!sendInputError(res, error)) throw error
  }
})

eventsStoryRouter.post(
  '/runs/:id/discard',
  asyncHandler(async (req, res) => {
    try {
      res.json(present(await discardRun(Number(req.params.id))))
    } catch (error) {
      if (!sendInputError(res, error)) throw error
    }
  }),
)

eventsStoryRouter.post('/runs/:id/redraft', (req, res) => {
  try {
    res.json(present(redraftRun(Number(req.params.id))))
  } catch (error) {
    if (!sendInputError(res, error)) throw error
  }
})
