// Sentry init runs first (kept here via .prettierrc importOrder) so its instrumentation
// can patch http/express before those modules are first used.
// Sentry is preloaded via Node's --import flag (see package.json scripts +
// the launchd plist's ProgramArguments). That ensures Sentry.init runs before
// http/express modules load, which lets Sentry's instrumentation hook
// them. Importing './lib/sentry.js' here would be a no-op fallback at
// best and is omitted intentionally.
import * as Sentry from '@sentry/node'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, {type NextFunction, type Request, type Response} from 'express'
import path from 'path'
import {fileURLToPath} from 'url'

import {sqlite} from './db/index.js'
import {UPLOADS_DIR} from './lib/uploads.js'
import {requireAuth} from './middleware/auth.js'
import {webhooksRateLimit} from './middleware/require-internal-secret.js'
import {attendanceRouter} from './routes/attendance.js'
import {authRouter} from './routes/auth.js'
import {calendarPrintRouter} from './routes/calendar-print.js'
import {calendarRouter} from './routes/calendar.js'
import {connectionsCallbackRouter, connectionsRouter} from './routes/connections.js'
import {contactsRouter} from './routes/contacts.js'
import {cleanupOrphanedScanImages, devotionsRouter} from './routes/devotions.js'
import {draftsRouter} from './routes/drafts.js'
import {eventsStoryRouter} from './routes/events-story.js'
import {fairBoothRouter} from './routes/fair-booth.js'
import {fillAmericaRouter} from './routes/fill-america.js'
import {globalVariablesRouter} from './routes/global-variables.js'
import {groupsRouter} from './routes/groups.js'
import {gwendolynDevotionsRouter} from './routes/gwendolyn-devotions.js'
import {homeRouter} from './routes/home.js'
import {hymnsRouter} from './routes/hymns.js'
import {importRouter} from './routes/import.js'
import {messagesRouter, processSendJob} from './routes/messages.js'
import {musicScheduleScansRouter} from './routes/music-schedule-scans.js'
import {musicSchedulesRouter} from './routes/music-schedules.js'
import {nurserySchedulesRouter} from './routes/nursery-schedules.js'
import {nurseryRouter} from './routes/nursery.js'
import {peopleRouter} from './routes/people.js'
import {prayerSheetRouter} from './routes/prayer-sheet.js'
import {quotesRouter} from './routes/quotes.js'
import {rsvpRouter} from './routes/rsvp.js'
import {schedulesRouter} from './routes/schedules.js'
import {recoverUngeneratedSermons} from './routes/sermons-webhook.js'
import {sermonsRouter} from './routes/sermons.js'
import {settingsRouter} from './routes/settings.js'
import {specialsRouter} from './routes/specials.js'
import {statsRouter} from './routes/stats.js'
import {sundaySchoolRollsRouter} from './routes/sunday-school-rolls.js'
import {sundaySchoolStatsRouter} from './routes/sunday-school-stats.js'
import {templatesRouter} from './routes/templates.js'
import {usageRouter} from './routes/usage.js'
import {webhooksRouter} from './routes/webhooks.js'
import {workersNotesRouter} from './routes/workers-notes.js'
import {startBirthdayScheduler} from './services/birthday-scheduler.js'
import {backfillRepeatRules} from './services/calendar-print-year-copy.js'
import {startCalendarSyncScheduler} from './services/calendar-sync.js'
import {recoverInterruptedRuns} from './services/events-story/run.js'
import {startFairBoothReminderScheduler} from './services/fair-booth-reminders.js'
import {startMusicScanCleanup} from './services/music-scan-cleanup.js'
import {startScheduler} from './services/scheduler.js'
import {startSpecialsScheduler} from './services/specials-scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5172

app.use(cors({origin: true, credentials: true}))
app.use(express.json({limit: '20mb'}))
app.use(cookieParser())

// Auth routes (unprotected)
app.use('/api/auth', authRouter)

// Internal webhooks (unprotected by session auth; gated by X-Internal-Secret)
app.use('/webhooks', webhooksRateLimit, webhooksRouter)

// OAuth redirects for Connections (unprotected; authenticated by single-use `state`)
app.use('/api/connections', connectionsCallbackRouter)

// Auth middleware — before all other /api routes
app.use('/api', requireAuth)

// API routes
app.use('/api/people', peopleRouter)
app.use('/api/prayer-sheet', prayerSheetRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/drafts', draftsRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/global-variables', globalVariablesRouter)
app.use('/api/import', importRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/calendar-print', calendarPrintRouter)
app.use('/api/stats', statsRouter)
app.use('/api/home', homeRouter)
app.use('/api/devotions', devotionsRouter)
app.use('/api/gwendolyn-devotions', gwendolynDevotionsRouter)
app.use('/api/schedules/fair-booth', fairBoothRouter)
// Before the music-schedules router, whose GET '/:id' would otherwise take '/scans'.
app.use('/api/schedules/music/scans', musicScheduleScansRouter)
app.use('/api/schedules/music', musicSchedulesRouter)
app.use('/api/schedules/workers-notes', workersNotesRouter)
app.use('/api/schedules/sunday-school-rolls', sundaySchoolRollsRouter)
app.use('/api/schedules', schedulesRouter)
app.use('/api/nursery/schedules', nurserySchedulesRouter)
app.use('/api/nursery', nurseryRouter)
app.use('/api/quotes', quotesRouter)
app.use('/api/hymns', hymnsRouter)
app.use('/api/sermons', sermonsRouter)
app.use('/api/rsvp', rsvpRouter)
app.use('/api/attendance', attendanceRouter)
app.use('/api/sunday-school-stats', sundaySchoolStatsRouter)
app.use('/api/fill-america', fillAmericaRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/events-story', eventsStoryRouter)
app.use('/api/specials', specialsRouter)
app.use('/api/usage', usageRouter)

// Serve all uploaded media (scan images, nursery logos, special-music sheets, etc.)
// Root is configurable via UPLOADS_DIR env var; defaults to ./data/.
app.use('/uploads', express.static(UPLOADS_DIR))

// In production, serve the built Vite static files
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// Sentry error handler — must come after all route registrations.
// Captures any error passed via next(err) or thrown in an async route that propagates.
Sentry.setupExpressErrorHandler(app)

// Final JSON error responder — replaces Express's default HTML error page.
// Sentry has already captured the exception by this point.
// Four args required for Express to recognize this as an error handler.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({error: 'Internal server error'})
})

// Idempotent boot-time migration: rename devotionAiModel → defaultAiModel
sqlite
  .prepare(
    `UPDATE settings SET key='defaultAiModel' WHERE key='devotionAiModel' AND NOT EXISTS (SELECT 1 FROM settings WHERE key='defaultAiModel')`,
  )
  .run()
sqlite.prepare(`DELETE FROM settings WHERE key='devotionAiModel'`).run()

// Idempotent boot-time migration: rewrite stored upload URLs from /data/<subdir>/ → /uploads/<subdir>/
// (one-time path-prefix flip introduced when uploads moved under UPLOADS_DIR; safe to re-run)
sqlite
  .prepare(
    `UPDATE scan_drafts SET image_path = '/uploads/' || substr(image_path, length('/data/') + 1) WHERE image_path LIKE '/data/%'`,
  )
  .run()
sqlite
  .prepare(
    `UPDATE nursery_settings SET value = '/uploads/' || substr(value, length('/data/') + 1) WHERE key = 'logoPath' AND value LIKE '/data/%'`,
  )
  .run()

// Idempotent boot-time backfill: guess a Repeat Rule for every Calendar Print Event that predates
// Repeat Rules. Recorded as one History Change so it can be undone (docs/adr/0040, 0041).
try {
  const guessed = backfillRepeatRules()
  if (guessed) console.log(`Calendar Print: guessed Repeat Rules for ${guessed} Events`)
} catch (err) {
  console.error('Calendar Print Repeat Rule backfill failed:', err)
}

// A Story Run left mid-step by a restart can never finish; mark it failed so it can be retried.
try {
  const interrupted = recoverInterruptedRuns()
  if (interrupted) console.log(`Events Story: marked ${interrupted} interrupted run(s) failed`)
} catch (err) {
  console.error('Events Story run recovery failed:', err)
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  // A sandbox runs against a DB copy: no texts, calendar writes or AI calls may leave it.
  if (process.env.CENTRAL_FLOCK_SANDBOX === '1') {
    console.log('Sandbox: background jobs disabled')
    return
  }
  startScheduler(processSendJob)
  startBirthdayScheduler()
  startFairBoothReminderScheduler(processSendJob)
  startCalendarSyncScheduler()
  startSpecialsScheduler()
  cleanupOrphanedScanImages()
  startMusicScanCleanup()
  recoverUngeneratedSermons().catch((err) => console.error('[sermons-webhook] boot recovery failed:', err))
})
