import {Router} from 'express'

import {addDays} from '../lib/repeat-rules.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {MAX_DAYS_AHEAD, earliestMinute, zonedNow} from '../services/events-story/post-time.js'
import {
  LateApprovalError,
  RunInputError,
  type RunRow,
  approveRun,
  discardRun,
  draftFromEditing,
  findOpenRun,
  getRun,
  hoursFor,
  listPastRuns,
  loadCandidates,
  prepareRun,
  redraftRun,
  reopenEditing,
  retryRun,
  runLines,
  saveEditing,
  scheduledInWeekOf,
  startEditing,
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

// The one open run (editing → failed), or null.
eventsStoryRouter.get('/runs/open', (_req, res) => {
  const run = findOpenRun()
  res.json(run ? present(run) : null)
})

eventsStoryRouter.get('/runs', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10))
  const {runs, total} = listPastRuns(page, pageSize)
  res.json({runs: runs.map(present), total, page, pageSize})
})

eventsStoryRouter.get('/runs/:id', (req, res) => {
  const run = getRun(Number(req.params.id))
  if (!run) {
    res.status(404).json({error: 'Story Run not found'})
    return
  }
  res.json(present(run))
})

// Picker opened: create the 'editing' run that autosaves it.
eventsStoryRouter.post('/runs', (req, res) => {
  try {
    res.status(201).json(present(startEditing(req.body ?? {})))
  } catch (error) {
    if (!sendInputError(res, error)) throw error
  }
})

// Autosave while editing.
eventsStoryRouter.put('/runs/:id', (req, res) => {
  try {
    res.json(present(saveEditing(Number(req.params.id), req.body ?? {})))
  } catch (error) {
    if (!sendInputError(res, error)) throw error
  }
})

// "Make draft".
eventsStoryRouter.post('/runs/:id/draft', (req, res) => {
  try {
    res.json(present(draftFromEditing(Number(req.params.id), req.body ?? {})))
  } catch (error) {
    if (!sendInputError(res, error)) throw error
  }
})

// "Edit events" from a draft: discard its Canva changes, back to the picker.
eventsStoryRouter.post(
  '/runs/:id/edit',
  asyncHandler(async (req, res) => {
    try {
      res.json(present(await reopenEditing(Number(req.params.id))))
    } catch (error) {
      if (!sendInputError(res, error)) throw error
    }
  }),
)

// Approve. 409 + suggestion when the chosen time has passed (resend with the new postDate/postMinute).
eventsStoryRouter.post(
  '/runs/:id/approve',
  asyncHandler(async (req, res) => {
    try {
      res.json(present(await approveRun(Number(req.params.id), req.body ?? {})))
    } catch (error) {
      if (error instanceof LateApprovalError) {
        res.status(409).json({error: error.message, late: true, suggestion: error.suggestion})
        return
      }
      if (!sendInputError(res, error)) throw error
    }
  }),
)

eventsStoryRouter.post('/runs/:id/retry', (req, res) => {
  try {
    res.json(present(retryRun(Number(req.params.id))))
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
