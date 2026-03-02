import {eq, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {createJob} from './message-queue.js'

type ProcessSendJobFn = (job: ReturnType<typeof createJob>) => Promise<void>

let intervalId: ReturnType<typeof setInterval> | null = null

export function startScheduler(processSendJob: ProcessSendJobFn, pollIntervalMs = 60_000) {
  checkScheduledMessages(processSendJob)
  intervalId = setInterval(() => checkScheduledMessages(processSendJob), pollIntervalMs)
  console.log(`Scheduler started (polling every ${pollIntervalMs / 1000}s)`)
}

export function stopScheduler() {
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

      const job = createJob(msg.id, msg.batchSize, msg.batchDelayMs)
      processSendJob(job)
      console.log(`Scheduler: message ${msg.id} triggered for sending`)
    } else {
      // Past due — mark as past_due, do NOT send
      db.update(schema.messages).set({status: 'past_due'}).where(eq(schema.messages.id, msg.id)).run()
      console.log(`Scheduler: message ${msg.id} marked as past_due`)
    }
  }
}
