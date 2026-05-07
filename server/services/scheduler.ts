import {eq, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {createJob} from './message-queue.js'

type ProcessSendJobFn = (job: ReturnType<typeof createJob>) => Promise<void>

let intervalId: ReturnType<typeof setInterval> | null = null
let initialTimeoutId: ReturnType<typeof setTimeout> | null = null

export function startScheduler(processSendJob: ProcessSendJobFn, pollIntervalMs = 300_000, offsetMs = 60_000) {
  // Run once immediately so a freshly-restarted server picks up due jobs without waiting.
  checkScheduledMessages(processSendJob)

  // Align ticks to (period boundary + offset). 5-min epoch boundaries land on :00/:05/:10/...,
  // so a 60s offset gives :01/:06/:11/... — picking up messages scheduled at e.g. 5:40 by 5:41.
  const now = Date.now()
  const periodBoundary = Math.floor(now / pollIntervalMs) * pollIntervalMs
  let nextTick = periodBoundary + offsetMs
  if (nextTick <= now) nextTick += pollIntervalMs

  initialTimeoutId = setTimeout(() => {
    checkScheduledMessages(processSendJob)
    intervalId = setInterval(() => checkScheduledMessages(processSendJob), pollIntervalMs)
  }, nextTick - now)

  console.log(
    `Scheduler started (polling every ${pollIntervalMs / 1000}s, ` +
      `next tick at ${new Date(nextTick).toISOString()})`,
  )
}

export function stopScheduler() {
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId)
    initialTimeoutId = null
  }
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('Scheduler stopped')
  }
}

function checkScheduledMessages(processSendJob: ProcessSendJobFn) {
  const dueMessages = db
    .select()
    .from(schema.messages)
    .where(sql`${schema.messages.status} = 'scheduled' AND ${schema.messages.scheduledAt} <= datetime('now')`)
    .all()

  for (const msg of dueMessages) {
    const scheduledTime = new Date(msg.scheduledAt + 'Z').getTime()
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

    if (scheduledTime >= fiveMinutesAgo) {
      // On time — transition to pending and send
      db.update(schema.messages).set({status: 'pending'}).where(eq(schema.messages.id, msg.id)).run()

      const job = createJob(msg.id)
      processSendJob(job)
      console.log(`Scheduler: message ${msg.id} triggered for sending`)
    } else {
      // Past due — mark as past_due, do NOT send
      db.update(schema.messages).set({status: 'past_due'}).where(eq(schema.messages.id, msg.id)).run()
      console.log(`Scheduler: message ${msg.id} marked as past_due`)
    }
  }
}
