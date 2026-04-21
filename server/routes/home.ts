import {and, eq, gte, inArray, lte, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema, sqlite} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {getSetting} from './settings.js'

export const homeRouter = Router()

function getUpcomingDate(month: number, day: number): {daysUntil: number; year: number} {
  const now = new Date()
  const thisYear = now.getFullYear()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()

  let target = new Date(thisYear, month - 1, day)
  const today = new Date(thisYear, todayMonth - 1, todayDay)

  let targetYear = thisYear
  if (target < today) {
    target = new Date(thisYear + 1, month - 1, day)
    targetYear = thisYear + 1
  }

  const diff = target.getTime() - today.getTime()
  return {daysUntil: Math.round(diff / (1000 * 60 * 60 * 24)), year: targetYear}
}

function formatName(person: {firstName: string | null; lastName: string | null}): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown'
}

// GET /api/home
homeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const allPeople = db.select().from(schema.people).all()

    // Upcoming birthdays (next 14 days)
    const upcomingBirthdays = allPeople
      .filter((p) => p.birthMonth != null && p.birthDay != null)
      .map((p) => {
        const {daysUntil, year} = getUpcomingDate(p.birthMonth!, p.birthDay!)
        return {
          personId: p.id,
          name: formatName(p),
          daysUntil,
          month: p.birthMonth!,
          day: p.birthDay!,
          turningAge: p.birthYear ? year - p.birthYear : null,
        }
      })
      .filter((p) => p.daysUntil >= 0 && p.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Upcoming anniversaries (next 14 days)
    const upcomingAnniversaries = allPeople
      .filter((p) => p.anniversaryMonth != null && p.anniversaryDay != null)
      .map((p) => {
        const {daysUntil, year} = getUpcomingDate(p.anniversaryMonth!, p.anniversaryDay!)
        return {
          personId: p.id,
          name: formatName(p),
          daysUntil,
          month: p.anniversaryMonth!,
          day: p.anniversaryDay!,
          years: p.anniversaryYear ? year - p.anniversaryYear : null,
        }
      })
      .filter((p) => p.daysUntil >= 0 && p.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Stats
    const peopleTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.people)
      .get()!.total
    const groupsTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.groups)
      .get()!.total
    const templatesTotal = db
      .select({total: sql<number>`count(*)`})
      .from(schema.templates)
      .get()!.total

    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const messagesSentThisMonth = db
      .select({
        total: sql<number>`coalesce(sum(${schema.messages.sentCount}), 0)`,
      })
      .from(schema.messages)
      .where(and(sql`${schema.messages.status} != 'cancelled'`, sql`${schema.messages.createdAt} >= ${monthStart}`))
      .get()!.total

    // Quotes stats (from separate DB)
    const quotesTotal = (sqlite.prepare(`SELECT count(*) AS count FROM quotes`).get() as {count: number}).count

    // Devotion stats (from separate DB)
    const devotionsTotal = db
      .select({count: sql<number>`count(*)`})
      .from(schema.devotions)
      .get()!.count

    const devotionsLatestNumber =
      db
        .select({max: sql<number>`max(${schema.devotions.number})`})
        .from(schema.devotions)
        .get()?.max || 0

    const completionRaw = db
      .select({
        total: sql<number>`count(*)`,
        produced: sql<number>`sum(case when ${schema.devotions.produced} = 1 then 1 else 0 end)`,
        rendered: sql<number>`sum(case when ${schema.devotions.rendered} = 1 then 1 else 0 end)`,
        youtube: sql<number>`sum(case when ${schema.devotions.youtube} = 1 then 1 else 0 end)`,
        facebookInstagram: sql<number>`sum(case when ${schema.devotions.facebookInstagram} = 1 then 1 else 0 end)`,
        podcast: sql<number>`sum(case when ${schema.devotions.podcast} = 1 then 1 else 0 end)`,
      })
      .from(schema.devotions)
      .get()!

    const devotionsCompletionRate =
      completionRaw.total > 0
        ? Math.round(
            ((completionRaw.produced +
              completionRaw.rendered +
              completionRaw.youtube +
              completionRaw.facebookInstagram +
              completionRaw.podcast) /
              (completionRaw.total * 5)) *
              100,
          )
        : 0

    // Upcoming church events (next 14 days, max 6) — served from synced cache
    let upcomingChurchEvents: {
      id: string
      title: string
      startDate: string
      endDate: string
      allDay: boolean
      location: string | null
      calendarName: string
      recurring: boolean
    }[] = []
    let upcomingChurchEventsTotal = 0
    let calendarColors: Record<string, string> = {}
    try {
      const rawNames = getSetting('churchCalendarNames')
      const calendarNames: string[] = rawNames ? JSON.parse(rawNames) : []
      if (calendarNames.length > 0) {
        const nowIso = new Date().toISOString()
        const futureIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        const rows = db
          .select()
          .from(schema.calendarEvents)
          .where(
            and(
              inArray(schema.calendarEvents.calendarName, calendarNames),
              gte(schema.calendarEvents.startDate, nowIso),
              lte(schema.calendarEvents.startDate, futureIso),
            ),
          )
          .orderBy(schema.calendarEvents.startDate)
          .limit(6)
          .all()
        upcomingChurchEvents = rows.map((r) => ({
          id: r.eventUid,
          title: r.title,
          startDate: r.startDate,
          endDate: r.endDate,
          allDay: r.allDay,
          location: r.location,
          calendarName: r.calendarName,
          recurring: r.recurring,
        }))

        const thirtyDayIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        upcomingChurchEventsTotal = db
          .select({total: sql<number>`count(*)`})
          .from(schema.calendarEvents)
          .where(
            and(
              inArray(schema.calendarEvents.calendarName, calendarNames),
              gte(schema.calendarEvents.startDate, nowIso),
              lte(schema.calendarEvents.startDate, thirtyDayIso),
            ),
          )
          .get()!.total
      }

      const rawColors = getSetting('calendarColors')
      calendarColors = rawColors ? JSON.parse(rawColors) : {}
    } catch {
      // Never break the home page if anything goes wrong
    }

    // Pinned items
    const pins = db.select().from(schema.pinnedItems).orderBy(schema.pinnedItems.position).all()

    const pinnedItems = pins
      .map((pin) => {
        if (pin.type === 'person') {
          const person = db.select().from(schema.people).where(eq(schema.people.id, pin.itemId)).get()
          if (!person) return null
          return {
            id: pin.id,
            type: pin.type,
            itemId: pin.itemId,
            name: formatName(person),
            subtitle: person.phoneDisplay || '',
          }
        } else if (pin.type === 'group') {
          const group = db.select().from(schema.groups).where(eq(schema.groups.id, pin.itemId)).get()
          if (!group) return null
          const count = db
            .select({total: sql<number>`count(*)`})
            .from(schema.peopleGroups)
            .where(eq(schema.peopleGroups.groupId, pin.itemId))
            .get()!.total
          return {
            id: pin.id,
            type: pin.type,
            itemId: pin.itemId,
            name: group.name,
            subtitle: `${count} member${count !== 1 ? 's' : ''}`,
          }
        } else if (pin.type === 'template') {
          const template = db.select().from(schema.templates).where(eq(schema.templates.id, pin.itemId)).get()
          if (!template) return null
          return {
            id: pin.id,
            type: pin.type,
            itemId: pin.itemId,
            name: template.name,
            subtitle: template.content.substring(0, 60) + (template.content.length > 60 ? '...' : ''),
          }
        }
        return null
      })
      .filter(Boolean)

    res.json({
      upcomingBirthdays,
      upcomingAnniversaries,
      upcomingChurchEvents,
      calendarColors,
      stats: {
        people: peopleTotal,
        groups: groupsTotal,
        templates: templatesTotal,
        messagesSentThisMonth,
        devotionsTotal,
        devotionsLatestNumber,
        devotionsCompletionRate,
        quotesTotal,
        upcomingChurchEventsTotal,
      },
      pinnedItems,
    })
  }),
)

// POST /api/home/pin
homeRouter.post(
  '/pin',
  asyncHandler(async (req, res) => {
    const {type, itemId} = req.body as {type: string; itemId: number}

    if (!['person', 'group', 'template'].includes(type) || !itemId) {
      res.status(400).json({error: 'type and itemId are required'})
      return
    }

    // Check if already pinned
    const existing = db
      .select()
      .from(schema.pinnedItems)
      .where(
        and(
          eq(schema.pinnedItems.type, type as 'person' | 'group' | 'template'),
          eq(schema.pinnedItems.itemId, itemId),
        ),
      )
      .get()

    if (existing) {
      res.status(409).json({error: 'Item is already pinned'})
      return
    }

    const maxPos = db
      .select({max: sql<number>`coalesce(max(${schema.pinnedItems.position}), 0)`})
      .from(schema.pinnedItems)
      .get()!.max

    const pin = db
      .insert(schema.pinnedItems)
      .values({
        type: type as 'person' | 'group' | 'template',
        itemId,
        position: maxPos + 1,
      })
      .returning()
      .get()

    res.json(pin)
  }),
)

// DELETE /api/home/pin/:id
homeRouter.delete(
  '/pin/:id',
  asyncHandler(async (req, res) => {
    db.delete(schema.pinnedItems)
      .where(eq(schema.pinnedItems.id, Number(req.params.id)))
      .run()
    res.json({success: true})
  }),
)
