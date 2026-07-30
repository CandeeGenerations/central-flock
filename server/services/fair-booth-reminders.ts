// Reminder Runs: the nightly "you're up next at the fair" texts.
//
// A Run is queued as a standing instruction — schedule + target day + template —
// and resolves its recipients and their Shifts WHEN IT FIRES, not when it was
// queued. A fair booth schedule is a live document (ADR 0009: the sheet is
// reprinted weekly during the fair to refill empty slots), so a frozen queue
// would silently skip anyone who signed up after setup. See
// docs/adr/0018-fair-booth-reminder-runs.md.
//
// Deliberately separate from services/scheduler.ts: that scheduler is the hot
// path for every message in the app, and Runs need different semantics (a wide
// grace window instead of its 5-minute past_due rule).
import * as Sentry from '@sentry/node'
import {and, eq, inArray, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import type {FairBoothReminderRunStatus} from '../db/schema-fair-booth.js'
import {computePersonShifts, formatShiftReminderTimeSlot, parseLocalDate} from '../lib/fair-booth-shifts.js'
import {renderTemplate} from '../lib/format.js'
import {getSetting} from '../routes/settings.js'
import {createJob} from './message-queue.js'
import {sendNotifyMeText} from './notify-me.js'

type ProcessSendJobFn = (job: ReturnType<typeof createJob>) => Promise<void>

export const REMINDER_SEND_TIME_KEY = 'schedules.fairBooth.reminderSendTime'
export const DEFAULT_REMINDER_SEND_TIME = '19:00'

// Past this hour it stops being appropriate to text volunteers at all, so a Run
// that missed its slot by this much goes past_due rather than firing at 2 AM.
const LATE_CUTOFF_HOUR = 22

type Run = typeof schema.fairBoothReminderRuns.$inferSelect

export interface ResolvedRecipient {
  personId: number
  name: string
  phoneNumber: string | null
  timeSlot: string
  rendered: string
  skipReason?: 'no_phone' | 'inactive'
}

export interface ResolvedRun {
  recipients: ResolvedRecipient[]
  templateContent: string
  error?: string
}

// ── time helpers ───────────────────────────────────────────────────────
// messages.scheduled_at is stored as UTC 'YYYY-MM-DD HH:MM:SS' (see
// server/routes/messages.ts). Runs use the same convention so both read the
// same way in the DB and both compare against datetime('now').

export function toUtcStamp(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

function parseUtcStamp(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z')
}

export function getReminderSendTime(): string {
  const raw = getSetting(REMINDER_SEND_TIME_KEY) || DEFAULT_REMINDER_SEND_TIME
  return /^\d{2}:\d{2}$/.test(raw) ? raw : DEFAULT_REMINDER_SEND_TIME
}

// The evening before targetDay, at the configured local time, as a UTC stamp.
export function sendAtForTargetDay(targetDay: string, sendTime = getReminderSendTime()): string {
  const [h, m] = sendTime.split(':').map(Number)
  const d = parseLocalDate(targetDay)
  d.setDate(d.getDate() - 1)
  d.setHours(h, m, 0, 0)
  return toUtcStamp(d)
}

// ── resolution ─────────────────────────────────────────────────────────

function fullName(p: {firstName: string | null; lastName: string | null}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unnamed'
}

// The single code path shared by preview and send. Any second implementation
// would let the preview drift from what actually goes out — the exact failure
// this feature exists to prevent.
export function resolveReminderRun(run: Run): ResolvedRun {
  const template = db.select().from(schema.templates).where(eq(schema.templates.id, run.templateId)).get()
  if (!template) {
    return {recipients: [], templateContent: '', error: `Template ${run.templateId} no longer exists`}
  }
  if (!template.content.includes('{{timeSlot}}')) {
    return {
      recipients: [],
      templateContent: template.content,
      error: `Template "${template.name}" no longer contains {{timeSlot}}`,
    }
  }

  const signups = db
    .select()
    .from(schema.fairBoothSignups)
    .where(
      and(eq(schema.fairBoothSignups.scheduleId, run.scheduleId), eq(schema.fairBoothSignups.dayDate, run.targetDay)),
    )
    .all()

  const personIds = [...new Set(signups.map((s) => s.personId))]
  if (personIds.length === 0) return {recipients: [], templateContent: template.content}

  const people = db.select().from(schema.people).where(inArray(schema.people.id, personIds)).all()

  const globals = db.select().from(schema.globalVariables).all()
  const globalVarValues = Object.fromEntries(globals.map((g) => [g.name, g.value]))

  const recipients: ResolvedRecipient[] = people
    .map((person) => {
      // One Shift per contiguous run at one role — two Signups that touch
      // collapse into a single line, so the person gets one text, not two.
      const timeSlot = formatShiftReminderTimeSlot(computePersonShifts(signups, person.id))
      const skipReason =
        person.status !== 'active' ? ('inactive' as const) : !person.phoneNumber ? ('no_phone' as const) : undefined
      return {
        personId: person.id,
        name: fullName(person),
        phoneNumber: person.phoneNumber,
        timeSlot,
        // {{timeSlot}} rides the perRecipientVarValues slot that {{rsvpLink}}
        // already uses; {{signature}} and friends come from global variables.
        rendered: renderTemplate(template.content, person, globalVarValues, {timeSlot}),
        skipReason,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {recipients, templateContent: template.content}
}

// ── firing ─────────────────────────────────────────────────────────────

function setRunStatus(runId: number, status: FairBoothReminderRunStatus, patch: Partial<Run> = {}) {
  db.update(schema.fairBoothReminderRuns)
    .set({status, updatedAt: sql`(datetime('now'))`, ...patch})
    .where(eq(schema.fairBoothReminderRuns.id, runId))
    .run()
}

export interface FireResult {
  status: FairBoothReminderRunStatus
  sent: number
  skipped: number
  messageId?: number
  error?: string
}

// Resolves the Run and, if there is anyone to text, creates an ORDINARY
// fully-rendered messages row and hands it to the normal send queue. The
// standing-instruction weirdness stops here: nothing downstream can tell this
// message apart from one composed by hand.
export async function fireReminderRun(run: Run, processSendJob: ProcessSendJobFn): Promise<FireResult> {
  const {recipients, error} = resolveReminderRun(run)

  if (error) {
    setRunStatus(run.id, 'skipped', {error})
    await notify(`Fair reminder for ${run.targetDay} blocked: ${error}`)
    return {status: 'skipped', sent: 0, skipped: 0, error}
  }

  if (recipients.length === 0) {
    setRunStatus(run.id, 'skipped', {error: 'No signups for this day'})
    return {status: 'skipped', sent: 0, skipped: 0}
  }

  const active = recipients.filter((r) => !r.skipReason)
  const skipped = recipients.filter((r) => r.skipReason)

  if (active.length === 0) {
    const reason = 'Every worker that day is inactive or has no phone number'
    setRunStatus(run.id, 'skipped', {error: reason})
    await notify(`Fair reminder for ${run.targetDay} not sent: ${reason}`)
    return {status: 'skipped', sent: 0, skipped: skipped.length, error: reason}
  }

  setRunStatus(run.id, 'sending')

  const template = db.select().from(schema.templates).where(eq(schema.templates.id, run.templateId)).get()

  const message = db
    .insert(schema.messages)
    .values({
      content: template?.content ?? '',
      renderedPreview: active[0].rendered,
      totalRecipients: active.length,
      skippedCount: skipped.length,
      status: 'pending',
      source: 'fair_booth_reminder',
    })
    .returning()
    .get()

  for (const r of active) {
    db.insert(schema.messageRecipients)
      .values({messageId: message.id, personId: r.personId, renderedContent: r.rendered, status: 'pending'})
      .run()
  }
  for (const r of skipped) {
    db.insert(schema.messageRecipients)
      .values({messageId: message.id, personId: r.personId, renderedContent: r.rendered, status: 'skipped'})
      .run()
  }

  setRunStatus(run.id, 'completed', {messageId: message.id, error: null})

  const job = createJob(message.id)
  void processSendJob(job)

  console.log(
    `Fair booth reminders: run ${run.id} (${run.targetDay}) fired — ${active.length} recipients, ${skipped.length} skipped`,
  )
  return {status: 'completed', sent: active.length, skipped: skipped.length, messageId: message.id}
}

async function notify(message: string) {
  try {
    await sendNotifyMeText(message)
  } catch (e) {
    console.error('Fair booth reminders: notify-me failed:', e)
    Sentry.captureException(e)
  }
}

// ── the poller ─────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null

async function checkDueRuns(processSendJob: ProcessSendJobFn) {
  const due = db
    .select()
    .from(schema.fairBoothReminderRuns)
    .where(
      sql`${schema.fairBoothReminderRuns.status} = 'scheduled' AND ${schema.fairBoothReminderRuns.scheduledAt} <= datetime('now')`,
    )
    .all()

  for (const run of due) {
    // Late is still useful for a "see you tomorrow" reminder — unlike an
    // ordinary message, which services/scheduler.ts kills after 5 minutes.
    // The line is drawn at an hour that's decent to text people, not at a
    // fixed lateness.
    const cutoff = parseUtcStamp(run.scheduledAt)
    cutoff.setHours(LATE_CUTOFF_HOUR, 0, 0, 0)
    if (Date.now() > cutoff.getTime()) {
      setRunStatus(run.id, 'past_due', {error: `Missed its window (past ${LATE_CUTOFF_HOUR}:00)`})
      await notify(`Fair reminders for ${run.targetDay} did not send — the server was down at send time.`)
      console.log(`Fair booth reminders: run ${run.id} (${run.targetDay}) past_due`)
      continue
    }

    try {
      await fireReminderRun(run, processSendJob)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRunStatus(run.id, 'skipped', {error: msg})
      console.error(`Fair booth reminders: run ${run.id} failed:`, e)
      Sentry.captureException(e)
      await notify(`Fair reminders for ${run.targetDay} failed: ${msg}`)
    }
  }
}

export function startFairBoothReminderScheduler(processSendJob: ProcessSendJobFn, pollIntervalMs = 60_000) {
  // No Sentry cron monitor here on purpose: at a 1-minute cadence that's 1440
  // check-ins a day for a table that's empty 11 months of the year. The
  // user-visible failure — a Run that missed its window — is covered by the
  // notify-me in checkDueRuns, and thrown errors still reach Sentry.
  const tick = async () => {
    try {
      await checkDueRuns(processSendJob)
    } catch (e) {
      console.error('Fair booth reminders: check failed:', e)
      Sentry.captureException(e)
    }
  }

  void tick()
  intervalId = setInterval(() => void tick(), pollIntervalMs)
  console.log(`Fair booth reminder scheduler started (polling every ${pollIntervalMs / 1000}s)`)
}

export function stopFairBoothReminderScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('Fair booth reminder scheduler stopped')
  }
}
