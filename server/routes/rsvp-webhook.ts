import {eq, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {sendNotifyMeText} from '../services/notify-me.js'

export const rsvpWebhookRouter = Router()

type Status = 'yes' | 'no' | 'maybe' | 'no_response'

type GetResponse = {
  personFirstName: string | null
  eventTitle: string
  eventDate: string | null
  eventTime: string | null
  eventEndTime: string | null
  status: Status
  headcount: number | null
  note: string | null
  isPast: boolean
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadEntryByToken(token: string) {
  return db
    .select({
      entryId: schema.rsvpEntries.id,
      rsvpListId: schema.rsvpEntries.rsvpListId,
      status: schema.rsvpEntries.status,
      headcount: schema.rsvpEntries.headcount,
      note: schema.rsvpEntries.note,
      personId: schema.rsvpEntries.personId,
      personFirstName: schema.people.firstName,
      personLastName: schema.people.lastName,
      listName: schema.rsvpLists.name,
      standaloneTitle: schema.rsvpLists.standaloneTitle,
      standaloneDate: schema.rsvpLists.standaloneDate,
      standaloneTime: schema.rsvpLists.standaloneTime,
      standaloneEndTime: schema.rsvpLists.standaloneEndTime,
      calendarEventTitle: schema.calendarEvents.title,
      calendarEventStartDate: schema.calendarEvents.startDate,
      calendarEventEndDate: schema.calendarEvents.endDate,
    })
    .from(schema.rsvpEntries)
    .innerJoin(schema.people, eq(schema.rsvpEntries.personId, schema.people.id))
    .innerJoin(schema.rsvpLists, eq(schema.rsvpEntries.rsvpListId, schema.rsvpLists.id))
    .leftJoin(schema.calendarEvents, eq(schema.rsvpLists.calendarEventId, schema.calendarEvents.id))
    .where(eq(schema.rsvpEntries.publicToken, token))
    .get()
}

function buildResponse(entry: NonNullable<ReturnType<typeof loadEntryByToken>>): GetResponse {
  // Calendar event datetimes are stored as UTC ISO; convert to server-local for display.
  const localDate = (utc: string) => {
    const d = new Date(utc)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const localTime = (utc: string) => {
    const d = new Date(utc)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  // Standalone fields act as overrides; fall back to the linked calendar event.
  const eventTitle = entry.standaloneTitle ?? entry.calendarEventTitle ?? entry.listName
  const eventDate =
    entry.standaloneDate ?? (entry.calendarEventStartDate ? localDate(entry.calendarEventStartDate) : null)
  const eventTime =
    entry.standaloneTime ?? (entry.calendarEventStartDate ? localTime(entry.calendarEventStartDate) : null)
  const eventEndTime =
    entry.standaloneEndTime ?? (entry.calendarEventEndDate ? localTime(entry.calendarEventEndDate) : null)
  const isPast = eventDate ? eventDate < todayIso() : false
  return {
    personFirstName: entry.personFirstName,
    eventTitle,
    eventDate,
    eventTime,
    eventEndTime,
    status: entry.status as Status,
    headcount: entry.headcount,
    note: entry.note,
    isPast,
  }
}

function formatPersonName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ') || 'Someone'
}

function formatEventDateLabel(date: string | null): string {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const dt = new Date(Date.UTC(y, m - 1, d))
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[dt.getUTCDay()]} ${months[dt.getUTCMonth()]} ${dt.getUTCDate()}`
}

function statusLabel(s: Status): string {
  if (s === 'yes') return 'Yes'
  if (s === 'no') return 'No'
  if (s === 'maybe') return 'Maybe'
  return 'No response'
}

function buildDiffMessage(opts: {
  personName: string
  eventTitle: string
  eventDateLabel: string
  prev: {status: Status; headcount: number | null; note: string | null}
  next: {status: Status; headcount: number | null; note: string | null}
}): string | null {
  const {personName, eventTitle, eventDateLabel, prev, next} = opts
  const eventLabel = eventDateLabel ? `${eventTitle} · ${eventDateLabel}` : eventTitle

  const statusChanged = prev.status !== next.status
  const headcountChanged = (prev.headcount ?? null) !== (next.headcount ?? null)
  const prevNote = prev.note ?? ''
  const nextNote = next.note ?? ''
  const noteChanged = prevNote !== nextNote

  if (!statusChanged && !headcountChanged && !noteChanged) return null

  // First response: prev was no_response.
  if (prev.status === 'no_response') {
    const head = next.status === 'yes' && next.headcount ? ` (party of ${next.headcount})` : ''
    const noteFragment = nextNote ? `, note: "${nextNote}"` : ''
    return `${personName} RSVPed ${statusLabel(next.status)}${head} to ${eventLabel}${noteFragment}`
  }

  // Multi-field change.
  const changes = [statusChanged, headcountChanged, noteChanged].filter(Boolean).length
  if (changes >= 2) {
    const prevPart = `${statusLabel(prev.status)}${prev.headcount ? `/${prev.headcount}` : ''}`
    const nextPart = `${statusLabel(next.status)}${next.headcount ? `/${next.headcount}` : ''}`
    const noteFragment = noteChanged && nextNote ? `, note: "${nextNote}"` : ''
    return `${personName} updated ${eventLabel}: ${prevPart} → ${nextPart}${noteFragment}`
  }

  if (statusChanged) {
    return `${personName} changed ${statusLabel(prev.status)} → ${statusLabel(next.status)} for ${eventLabel}`
  }
  if (headcountChanged) {
    return `${personName} updated headcount: ${prev.headcount ?? 0} → ${next.headcount ?? 0} for ${eventLabel}`
  }
  // Note-only.
  if (nextNote) {
    return `${personName} ${prevNote ? 'updated' : 'added'} note on ${eventTitle}: "${nextNote}"`
  }
  return `${personName} cleared note on ${eventTitle}`
}

// GET /webhooks/rsvp/:token
rsvpWebhookRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const entry = loadEntryByToken(String(req.params.token))
    if (!entry) {
      res.status(404).json({error: 'invalid token'})
      return
    }
    res.json(buildResponse(entry))
  }),
)

// POST /webhooks/rsvp/:token
rsvpWebhookRouter.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const token = String(req.params.token)
    const entry = loadEntryByToken(token)
    if (!entry) {
      res.status(404).json({error: 'invalid token'})
      return
    }

    const built = buildResponse(entry)
    if (built.isPast) {
      res.status(410).json({error: 'event has passed'})
      return
    }

    const body = req.body as {status?: string; headcount?: number | null; note?: string | null}
    const rawStatus = body.status
    if (rawStatus !== 'yes' && rawStatus !== 'no' && rawStatus !== 'maybe') {
      res.status(400).json({error: 'status must be yes, no, or maybe'})
      return
    }
    const status: 'yes' | 'no' | 'maybe' = rawStatus

    let headcount: number | null
    if (status === 'yes') {
      const incoming = body.headcount
      if (incoming === undefined || incoming === null || incoming === 0) {
        headcount = 1
      } else if (!Number.isInteger(incoming) || incoming < 1 || incoming > 99) {
        res.status(400).json({error: 'headcount must be a positive integer ≤ 99'})
        return
      } else {
        headcount = incoming
      }
    } else if (status === 'maybe' && body.headcount !== undefined && body.headcount !== null) {
      const hc = body.headcount
      if (!Number.isInteger(hc) || hc < 1 || hc > 99) {
        res.status(400).json({error: 'headcount must be a positive integer ≤ 99'})
        return
      }
      headcount = hc
    } else {
      headcount = null
    }

    let note: string | null = null
    if (typeof body.note === 'string') {
      const trimmed = body.note.trim()
      note = trimmed.length > 0 ? trimmed.slice(0, 280) : null
    }

    const prev = {status: entry.status as Status, headcount: entry.headcount, note: entry.note}
    const next = {status, headcount, note}

    db.update(schema.rsvpEntries)
      .set({
        status,
        headcount,
        note,
        respondedAt: sql`datetime('now')`,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.rsvpEntries.id, entry.entryId))
      .run()

    const diff = buildDiffMessage({
      personName: formatPersonName(entry.personFirstName, entry.personLastName),
      eventTitle: entry.standaloneTitle ?? entry.calendarEventTitle ?? entry.listName,
      eventDateLabel: formatEventDateLabel(built.eventDate),
      prev,
      next,
    })
    if (diff) {
      // Fire-and-forget — don't block the response on n8n.
      sendNotifyMeText(diff).catch((err) => console.error('rsvp-webhook: notify-me failed', err))
    }

    const reloaded = loadEntryByToken(token)
    res.json(reloaded ? buildResponse(reloaded) : built)
  }),
)
