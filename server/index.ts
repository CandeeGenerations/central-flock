import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import path from 'path'
import {fileURLToPath} from 'url'

import {sqlite} from './db/index.js'
import {UPLOADS_DIR} from './lib/uploads.js'
import {requireAuth} from './middleware/auth.js'
import {authRouter} from './routes/auth.js'
import {calendarPrintRouter} from './routes/calendar-print.js'
import {calendarRouter} from './routes/calendar.js'
import {contactsRouter} from './routes/contacts.js'
import {cleanupOrphanedScanImages, devotionsRouter} from './routes/devotions.js'
import {draftsRouter} from './routes/drafts.js'
import {globalVariablesRouter} from './routes/global-variables.js'
import {groupsRouter} from './routes/groups.js'
import {gwendolynDevotionsRouter} from './routes/gwendolyn-devotions.js'
import {homeRouter} from './routes/home.js'
import {hymnsRouter} from './routes/hymns.js'
import {importRouter} from './routes/import.js'
import {messagesRouter, processSendJob} from './routes/messages.js'
import {nurserySchedulesRouter} from './routes/nursery-schedules.js'
import {nurseryRouter} from './routes/nursery.js'
import {peopleRouter} from './routes/people.js'
import {quotesRouter} from './routes/quotes.js'
import {rsvpRouter} from './routes/rsvp.js'
import {settingsRouter} from './routes/settings.js'
import {specialsRouter} from './routes/specials.js'
import {statsRouter} from './routes/stats.js'
import {templatesRouter} from './routes/templates.js'
import {webhooksRouter} from './routes/webhooks.js'
import {startBirthdayScheduler} from './services/birthday-scheduler.js'
import {startCalendarSyncScheduler} from './services/calendar-sync.js'
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
app.use('/webhooks', webhooksRouter)

// Auth middleware — before all other /api routes
app.use('/api', requireAuth)

// API routes
app.use('/api/people', peopleRouter)
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
app.use('/api/nursery/schedules', nurserySchedulesRouter)
app.use('/api/nursery', nurseryRouter)
app.use('/api/quotes', quotesRouter)
app.use('/api/hymns', hymnsRouter)
app.use('/api/rsvp', rsvpRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/specials', specialsRouter)

// Serve all uploaded media (scan images, nursery logos, special-music sheets, etc.)
// Root is configurable via UPLOADS_DIR env var; defaults to ./data/.
app.use('/uploads', express.static(UPLOADS_DIR))

// In production, serve the built Vite static files
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  startScheduler(processSendJob)
  startBirthdayScheduler()
  startCalendarSyncScheduler()
  startSpecialsScheduler()
  cleanupOrphanedScanImages()
})
