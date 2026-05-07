import {and, eq, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

let timeoutId: ReturnType<typeof setTimeout> | null = null

// Roll any will_perform Specials whose date has passed into needs_review.
// Idempotent: safe to run on boot and on every tick.
export function rollWillPerformToReview(): {rolled: number} {
  const before = db
    .select({id: schema.specialMusic.id})
    .from(schema.specialMusic)
    .where(
      and(eq(schema.specialMusic.status, 'will_perform'), sql`${schema.specialMusic.date} < date('now', 'localtime')`),
    )
    .all()

  if (before.length === 0) return {rolled: 0}

  db.update(schema.specialMusic)
    .set({status: 'needs_review', updatedAt: sql`(datetime('now'))`})
    .where(
      and(eq(schema.specialMusic.status, 'will_perform'), sql`${schema.specialMusic.date} < date('now', 'localtime')`),
    )
    .run()

  console.log(`Specials scheduler: rolled ${before.length} will_perform → needs_review`)
  return {rolled: before.length}
}

function scheduleNext() {
  const now = new Date()
  // Run daily at 03:00 local.
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  const delay = next.getTime() - now.getTime()

  if (timeoutId) clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    try {
      rollWillPerformToReview()
    } catch (error) {
      console.error('Specials scheduler: error during roll:', error)
    }
    scheduleNext()
  }, delay)

  console.log(`Specials scheduler: next roll at ${next.toLocaleString()} (in ${Math.round(delay / 60000)}m)`)
}

export function startSpecialsScheduler() {
  // Safety-net pass on startup — covers any downtime that crossed 03:00.
  try {
    rollWillPerformToReview()
  } catch (error) {
    console.error('Specials scheduler: startup roll failed:', error)
  }
  scheduleNext()
}

export function stopSpecialsScheduler() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
}
