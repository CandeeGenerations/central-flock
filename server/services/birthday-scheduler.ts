import * as Sentry from '@sentry/node'
import {and, eq, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {getSetting, setSetting} from '../routes/settings.js'
import {sendMessageViaUI} from './applescript.js'
import {sendNotifyMeText} from './notify-me.js'
import {
  type DigestItem,
  type Occasion,
  type OccasionKind,
  collectOccasions,
  formatDigest,
  formatDigestLine,
  formatPersonName,
  ordinal,
  startOfDay,
} from './occasion-digest.js'

type SentType = (typeof schema.birthdayMessagesSent.$inferInsert)['type']

// Date (YYYY-MM-DD) of the last Sunday "this week" list, so a re-run that day doesn't resend it.
const WEEKLY_DIGEST_SENT_KEY = 'birthdayWeeklyDigestSentOn'
const PRE_NOTIFY_OPTIONS = [3, 7, 10]

let timeoutId: ReturnType<typeof setTimeout> | null = null

function wasSent(personId: number, type: SentType, year: number): boolean {
  const row = db
    .select()
    .from(schema.birthdayMessagesSent)
    .where(
      and(
        eq(schema.birthdayMessagesSent.personId, personId),
        eq(schema.birthdayMessagesSent.type, type),
        eq(schema.birthdayMessagesSent.year, year),
      ),
    )
    .get()
  return !!row
}

function recordSent(personId: number, type: SentType, year: number) {
  db.insert(schema.birthdayMessagesSent).values({personId, type, year}).run()
}

function recordMessageInHistory(personId: number, content: string) {
  const message = db
    .insert(schema.messages)
    .values({
      content,
      renderedPreview: content,
      totalRecipients: 1,
      sentCount: 1,
      status: 'completed',
      completedAt: sql`(datetime('now'))`,
      source: 'birthday_scheduler',
    })
    .returning()
    .get()

  db.insert(schema.messageRecipients)
    .values({
      messageId: message.id,
      personId,
      renderedContent: content,
      status: 'sent',
      sentAt: sql`(datetime('now'))`,
    })
    .run()
}

function parsePreNotifyDays(key: string): Set<number> {
  const value = getSetting(key)
  return new Set(value ? value.split(',').map((d) => Number(d.trim())) : [])
}

function preNotifyType(kind: OccasionKind, days: number): SentType {
  return (kind === 'birthday' ? `pre_${days}` : `anniversary_pre_${days}`) as SentType
}

function greeting(occasion: Occasion): string {
  const milestone = occasion.milestone ? ` ${ordinal(occasion.milestone)}` : ''
  return occasion.kind === 'birthday' ? `Happy${milestone} birthday to you!` : `Happy${milestone} anniversary!`
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Daily run: text each person on their birthday/anniversary, then send me ONE text covering
 * everything I need to know today — pre-notifications, day-of occasions that couldn't be
 * auto-texted (no phone number, or the send failed), and on Sundays the full Sun–Sat list.
 */
export async function checkOccasions(now = new Date()) {
  const today = startOfDay(now)
  const year = today.getFullYear()
  const todayKey = toDateKey(today)
  const sendWeekly = today.getDay() === 0 && getSetting(WEEKLY_DIGEST_SENT_KEY) !== todayKey
  const preNotifyDays: Record<OccasionKind, Set<number>> = {
    birthday: parsePreNotifyDays('birthdayPreNotifyDays'),
    anniversary: parsePreNotifyDays('anniversaryPreNotifyDays'),
  }

  const people = db.select().from(schema.people).all()
  const occasions = collectOccasions(people, today, Math.max(...PRE_NOTIFY_OPTIONS))

  // Day-of: text the person directly. Anything I have to handle myself gets a note for my digest.
  const dayOfNotes = new Map<Occasion, string>()
  const recordAfterDigest: {occasion: Occasion; type: SentType}[] = []
  for (const occasion of occasions) {
    if (occasion.daysUntil !== 0 || wasSent(occasion.person.id, occasion.kind, year)) continue
    const name = formatPersonName(occasion.person)

    if (!occasion.person.phoneNumber) {
      dayOfNotes.set(occasion, 'no phone #, not texted')
      recordAfterDigest.push({occasion, type: occasion.kind})
      continue
    }

    const message = greeting(occasion)
    try {
      await sendMessageViaUI(occasion.person.phoneNumber, message)
      recordSent(occasion.person.id, occasion.kind, year)
      recordMessageInHistory(occasion.person.id, message)
      console.log(`Birthday scheduler: sent ${occasion.kind} message to ${name}`)
    } catch (error) {
      // Not recorded as sent, so a manual re-run retries the text.
      console.error(`Birthday scheduler: failed to send ${occasion.kind} message to ${name}:`, error)
      Sentry.captureException(error, {tags: {source: 'birthday-scheduler'}})
      dayOfNotes.set(occasion, 'auto-text failed')
    }
  }

  const noteFor = (occasion: Occasion) =>
    dayOfNotes.get(occasion) ?? (occasion.person.phoneNumber ? undefined : 'no phone #')

  let reminders: DigestItem[] = []
  for (const occasion of occasions) {
    if (occasion.daysUntil === 0) {
      if (dayOfNotes.has(occasion)) reminders.push({occasion, note: dayOfNotes.get(occasion)})
      continue
    }
    if (!preNotifyDays[occasion.kind].has(occasion.daysUntil)) continue
    const type = preNotifyType(occasion.kind, occasion.daysUntil)
    if (wasSent(occasion.person.id, type, year)) continue
    reminders.push({occasion, note: noteFor(occasion)})
    recordAfterDigest.push({occasion, type})
  }

  let week: DigestItem[] | null = null
  if (sendWeekly) {
    week = occasions.filter((o) => o.daysUntil <= 6).map((occasion) => ({occasion, note: noteFor(occasion)}))
    // Anything inside the week is already on the weekly list; only list what's further out.
    reminders = reminders.filter((r) => r.occasion.daysUntil > 6)
  }

  const digest = formatDigest({week, reminders})
  if (!digest) return

  await sendNotifyMeText(digest)
  if (sendWeekly) setSetting(WEEKLY_DIGEST_SENT_KEY, todayKey)
  for (const {occasion, type} of recordAfterDigest) {
    recordSent(occasion.person.id, type, year)
    recordMessageInHistory(occasion.person.id, formatDigestLine({occasion, note: noteFor(occasion)}))
  }
  console.log(`Birthday scheduler: sent digest via notify-me${sendWeekly ? ' (with weekly list)' : ''}`)
}

function scheduleNext() {
  const sendTime = getSetting('birthdaySendTime') || '07:00'
  const [hours, minutes] = sendTime.split(':').map(Number)

  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)

  // If the time has already passed today, schedule for tomorrow
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }

  const delay = next.getTime() - now.getTime()

  if (timeoutId) clearTimeout(timeoutId)

  timeoutId = setTimeout(async () => {
    await Sentry.withMonitor(
      'birthday-scheduler',
      async () => {
        try {
          await checkOccasions()
        } catch (error) {
          console.error('Birthday scheduler: error during check:', error)
          Sentry.captureException(error)
        }
      },
      {schedule: {type: 'crontab', value: `${minutes} ${hours} * * *`}},
    )
    scheduleNext()
  }, delay)

  console.log(`Birthday scheduler: next check at ${next.toLocaleString()} (in ${Math.round(delay / 60000)}m)`)
}

export function startBirthdayScheduler() {
  scheduleNext()
}

export function stopBirthdayScheduler() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
    console.log('Birthday scheduler stopped')
  }
}
