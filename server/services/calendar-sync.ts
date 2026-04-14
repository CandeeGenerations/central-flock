import {db, schema, sqlite} from '../db/index.js'
import {getSetting, setSetting} from '../routes/settings.js'
import {fetchAvailableCalendars, fetchUpcomingEvents} from './calendar.js'

const SYNC_WINDOW_DAYS = 180

export interface SyncResult {
  ok: boolean
  events: number
  missing: string[]
  error?: string
}

let inFlight: Promise<SyncResult> | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function parseCalendarNames(): string[] {
  const raw = getSetting('churchCalendarNames')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

async function doSync(): Promise<SyncResult> {
  const names = parseCalendarNames()

  if (names.length === 0) {
    db.delete(schema.calendarEvents).run()
    setSetting('calendarLastSyncedAt', new Date().toISOString())
    setSetting('calendarLastSyncError', '')
    setSetting('calendarSyncMissing', '[]')
    return {ok: true, events: 0, missing: []}
  }

  try {
    const [{events, missing}, allCals] = await Promise.all([
      fetchUpcomingEvents(names, SYNC_WINDOW_DAYS),
      fetchAvailableCalendars().catch((err) => {
        console.warn('[calendar-sync] Could not fetch calendar colors:', err instanceof Error ? err.message : err)
        return [] as {name: string; color: string}[]
      }),
    ])

    const colors: Record<string, string> = {}
    for (const cal of allCals) colors[cal.name] = cal.color

    const now = new Date().toISOString()

    sqlite.transaction(() => {
      db.delete(schema.calendarEvents).run()
      for (const event of events) {
        db.insert(schema.calendarEvents)
          .values({
            eventUid: event.id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            allDay: event.allDay,
            location: event.location,
            calendarName: event.calendarName,
            recurring: event.recurring,
          })
          .run()
      }
    })()

    setSetting('calendarLastSyncedAt', now)
    setSetting('calendarLastSyncError', '')
    setSetting('calendarSyncMissing', JSON.stringify(missing))
    if (Object.keys(colors).length > 0) setSetting('calendarColors', JSON.stringify(colors))

    return {ok: true, events: events.length, missing}
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[calendar-sync] Sync failed:', msg)
    setSetting('calendarLastSyncError', msg)
    return {ok: false, events: 0, missing: [], error: msg}
  }
}

export function syncCalendarEvents(): Promise<SyncResult> {
  // Dedupe concurrent calls — if a sync is already running, return its promise
  if (inFlight) return inFlight
  inFlight = doSync().finally(() => {
    inFlight = null
  })
  return inFlight
}

export function startCalendarSyncScheduler(intervalMs = 60 * 60_000) {
  // Kick off initial sync in the background
  syncCalendarEvents()
    .then((r) => {
      if (r.ok)
        console.log(`[calendar-sync] Initial sync: ${r.events} events (missing: ${r.missing.join(', ') || 'none'})`)
    })
    .catch((err) => console.error('[calendar-sync] Initial sync error:', err))

  intervalId = setInterval(() => {
    syncCalendarEvents()
      .then((r) => {
        if (r.ok) console.log(`[calendar-sync] Synced ${r.events} events`)
      })
      .catch((err) => console.error('[calendar-sync] Scheduled sync error:', err))
  }, intervalMs)

  console.log(`Calendar sync scheduler started (every ${Math.round(intervalMs / 60_000)}m)`)
}

export function stopCalendarSyncScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
