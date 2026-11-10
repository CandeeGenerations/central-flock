import * as Sentry from '@sentry/node'
import {and, eq, lt, ne, sql} from 'drizzle-orm'
import fs from 'node:fs'

import {db, schema} from '../db/index.js'
import {urlToDiskPath} from '../lib/uploads.js'

// Schedule Scan photos are kept to check against while reviewing and editing,
// for about a month after the week, then removed. The week is never touched.

let timeoutId: ReturnType<typeof setTimeout> | null = null

export function cleanupMusicScanPhotos(): {photosDeleted: number; scansDeleted: number} {
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
  const expired = db
    .select()
    .from(schema.musicScheduleScans)
    .where(and(lt(schema.musicScheduleScans.photosExpireOn, today), ne(schema.musicScheduleScans.photos, '[]')))
    .all()

  let photosDeleted = 0
  for (const row of expired) {
    for (const url of JSON.parse(row.photos) as string[]) {
      try {
        fs.unlinkSync(urlToDiskPath(url))
        photosDeleted++
      } catch {
        /* already gone */
      }
    }
    db.update(schema.musicScheduleScans).set({photos: '[]'}).where(eq(schema.musicScheduleScans.id, row.id)).run()
  }

  const scansDeleted = db
    .delete(schema.musicScheduleScans)
    .where(
      and(
        eq(schema.musicScheduleScans.status, 'discarded'),
        lt(schema.musicScheduleScans.updatedAt, sql`datetime('now', '-1 day')`),
      ),
    )
    .run().changes

  if (photosDeleted || scansDeleted)
    console.log(`Music scan cleanup: ${photosDeleted} photo(s), ${scansDeleted} discarded scan(s) removed`)
  return {photosDeleted, scansDeleted}
}

function scheduleNext() {
  const now = new Date()
  // Daily at 03:15 local.
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 15, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  const delay = next.getTime() - now.getTime()

  if (timeoutId) clearTimeout(timeoutId)
  timeoutId = setTimeout(async () => {
    try {
      await Sentry.withMonitor('music-scan-cleanup', async () => cleanupMusicScanPhotos(), {
        schedule: {type: 'crontab', value: '15 3 * * *'},
      })
    } catch (error) {
      console.error('Music scan cleanup failed:', error)
    }
    scheduleNext()
  }, delay)
}

export function startMusicScanCleanup() {
  // Safety-net pass on startup — covers downtime across 03:15.
  try {
    cleanupMusicScanPhotos()
  } catch (error) {
    console.error('Music scan cleanup: startup pass failed:', error)
  }
  scheduleNext()
}
