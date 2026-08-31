import {and, asc, desc, eq, gte, lte, sql} from 'drizzle-orm'
import {Router} from 'express'

import {
  type RosterLike,
  type Season,
  campaignUniqueParticipants,
  campaignWeekDates,
  defaultSeason,
  defaultTitle,
  entryTotal,
  isSeason,
  weeklyTracts,
  weeklyUniqueParticipants,
} from '../../src/lib/fill-america-core.js'
import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const fillAmericaRouter = Router()

/** The handle drizzle hands a `db.transaction` callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Mounted at /api/fill-america. Unique Participants and Tracts are computed on
// every read from the roster and never stored — there is no column for either.
// See docs/adr/0032-fill-america-unique-participants-is-derived.md.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const cleanInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

// --- Households -------------------------------------------------------------

fillAmericaRouter.get(
  '/households',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true'
    const rows = db
      .select({
        id: schema.fillAmericaHouseholds.id,
        name: schema.fillAmericaHouseholds.name,
        active: schema.fillAmericaHouseholds.active,
        sortOrder: schema.fillAmericaHouseholds.sortOrder,
        // Written out rather than interpolated: drizzle's sql template renders a
        // column as a bare `"id"`, which inside these subqueries is ambiguous
        // across the joined tables (and silently wrong where it is not).
        campaignCount: sql<number>`(
          select count(*) from fill_america_roster_entries re
          where re.household_id = fill_america_households.id
        )`,
        totalTracts: sql<number>`(
          select coalesce(sum(tr.tracts), 0)
          from fill_america_tract_reports tr
          join fill_america_roster_entries re on re.id = tr.roster_entry_id
          where re.household_id = fill_america_households.id
        )`,
      })
      .from(schema.fillAmericaHouseholds)
      .all()
    const filtered = includeInactive ? rows : rows.filter((r) => r.active)
    filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    res.json(filtered)
  }),
)

fillAmericaRouter.post(
  '/households',
  asyncHandler(async (req, res) => {
    const {name} = req.body as {name?: string}
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({error: 'name required'})
      return
    }
    const existing = db
      .select()
      .from(schema.fillAmericaHouseholds)
      .where(eq(schema.fillAmericaHouseholds.name, name.trim()))
      .get()
    if (existing) {
      res.status(409).json({error: `"${name.trim()}" already exists`})
      return
    }
    const maxOrder =
      db
        .select({n: sql<number>`coalesce(max(${schema.fillAmericaHouseholds.sortOrder}), -1)`})
        .from(schema.fillAmericaHouseholds)
        .get()?.n ?? -1
    const row = db
      .insert(schema.fillAmericaHouseholds)
      .values({name: name.trim(), sortOrder: maxOrder + 1})
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

fillAmericaRouter.patch(
  '/households/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const {name, active, sortOrder} = req.body as {name?: string; active?: boolean; sortOrder?: number}
    const patch: Record<string, unknown> = {updatedAt: sql`(datetime('now'))`}
    if (typeof name === 'string') {
      if (!name.trim()) {
        res.status(400).json({error: 'name cannot be blank'})
        return
      }
      patch.name = name.trim()
    }
    if (typeof active === 'boolean') patch.active = active
    if (Number.isInteger(sortOrder)) patch.sortOrder = sortOrder
    const row = db
      .update(schema.fillAmericaHouseholds)
      .set(patch)
      .where(eq(schema.fillAmericaHouseholds.id, id))
      .returning()
      .get()
    if (!row) {
      res.status(404).json({error: 'not found'})
      return
    }
    res.json(row)
  }),
)

fillAmericaRouter.post(
  '/households/reorder',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids?: number[]}
    if (!Array.isArray(ids)) {
      res.status(400).json({error: 'ids array required'})
      return
    }
    db.transaction((tx) => {
      ids.forEach((id, i) => {
        tx.update(schema.fillAmericaHouseholds).set({sortOrder: i}).where(eq(schema.fillAmericaHouseholds.id, id)).run()
      })
    })
    res.json({ok: true})
  }),
)

// Hard-delete only when the household has never been on a roster; otherwise
// retire it, which keeps four years of history intact.
fillAmericaRouter.delete(
  '/households/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const n = db
      .select({n: sql<number>`count(*)`})
      .from(schema.fillAmericaRosterEntries)
      .where(eq(schema.fillAmericaRosterEntries.householdId, id))
      .get()!.n
    if (n > 0) {
      res.status(409).json({error: `is on ${n} campaign roster(s) — retire it instead`, campaignCount: n})
      return
    }
    db.delete(schema.fillAmericaHouseholds).where(eq(schema.fillAmericaHouseholds.id, id)).run()
    res.json({ok: true})
  }),
)

// --- Campaign reading -------------------------------------------------------

/** Weeks of one campaign, in order. */
function weeksOf(campaignId: number) {
  return db
    .select()
    .from(schema.fillAmericaCampaignWeeks)
    .where(eq(schema.fillAmericaCampaignWeeks.campaignId, campaignId))
    .orderBy(asc(schema.fillAmericaCampaignWeeks.weekNo))
    .all()
}

/**
 * The roster of one campaign as the derivation rules want it: each entry with
 * its tracts laid out in week order, nulls included.
 */
function rosterOf(campaignId: number, weekIds: number[]) {
  const entries = db
    .select({
      id: schema.fillAmericaRosterEntries.id,
      householdId: schema.fillAmericaRosterEntries.householdId,
      householdName: schema.fillAmericaHouseholds.name,
      householdActive: schema.fillAmericaHouseholds.active,
      size: schema.fillAmericaRosterEntries.size,
      goal: schema.fillAmericaRosterEntries.goal,
      sortOrder: schema.fillAmericaRosterEntries.sortOrder,
    })
    .from(schema.fillAmericaRosterEntries)
    .innerJoin(
      schema.fillAmericaHouseholds,
      eq(schema.fillAmericaHouseholds.id, schema.fillAmericaRosterEntries.householdId),
    )
    .where(eq(schema.fillAmericaRosterEntries.campaignId, campaignId))
    .all()

  const reports = entries.length
    ? db
        .select({
          rosterEntryId: schema.fillAmericaTractReports.rosterEntryId,
          weekId: schema.fillAmericaTractReports.weekId,
          tracts: schema.fillAmericaTractReports.tracts,
        })
        .from(schema.fillAmericaTractReports)
        .innerJoin(
          schema.fillAmericaRosterEntries,
          eq(schema.fillAmericaRosterEntries.id, schema.fillAmericaTractReports.rosterEntryId),
        )
        .where(eq(schema.fillAmericaRosterEntries.campaignId, campaignId))
        .all()
    : []

  const byEntry = new Map<number, Map<number, number | null>>()
  for (const r of reports) {
    let m = byEntry.get(r.rosterEntryId)
    if (!m) byEntry.set(r.rosterEntryId, (m = new Map()))
    m.set(r.weekId, r.tracts)
  }

  const out = entries.map((e) => {
    const m = byEntry.get(e.id)
    const tracts = weekIds.map((wid) => m?.get(wid) ?? null)
    return {...e, tracts, total: entryTotal({size: e.size, tracts})}
  })
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.householdName.localeCompare(b.householdName))
  return out
}

/** Everything derived for one campaign, from its roster. */
function derive(weeks: ReturnType<typeof weeksOf>, roster: ReturnType<typeof rosterOf>) {
  const like: RosterLike[] = roster.map((r) => ({size: r.size, tracts: r.tracts}))
  const tracts = weeklyTracts(like, weeks.length)
  const unique = weeklyUniqueParticipants(like, weeks.length)
  return {
    weeks: weeks.map((w, i) => ({
      id: w.id,
      weekNo: w.weekNo,
      weekDate: w.weekDate,
      doorHangers: w.doorHangers,
      tracts: tracts[i],
      uniqueParticipants: unique[i],
    })),
    totals: {
      uniqueParticipants: campaignUniqueParticipants(like),
      tracts: tracts.reduce((a, b) => a + b, 0),
      doorHangers: weeks.reduce((a, w) => a + (w.doorHangers ?? 0), 0),
      // The roster's goals added up. The Campaign's own goal is a separate,
      // typed number and lives on the campaign row.
      rosterGoal: roster.reduce((a, r) => a + (r.goal ?? 0), 0),
    },
  }
}

fillAmericaRouter.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    const campaigns = db
      .select()
      .from(schema.fillAmericaCampaigns)
      .orderBy(desc(schema.fillAmericaCampaigns.startDate))
      .all()
    const out = campaigns.map((c) => {
      const weeks = weeksOf(c.id)
      const roster = rosterOf(
        c.id,
        weeks.map((w) => w.id),
      )
      const d = derive(weeks, roster)
      return {...c, weekCount: weeks.length, householdCount: roster.length, ...d.totals}
    })
    res.json(out)
  }),
)

fillAmericaRouter.get(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const campaign = db.select().from(schema.fillAmericaCampaigns).where(eq(schema.fillAmericaCampaigns.id, id)).get()
    if (!campaign) {
      res.status(404).json({error: 'not found'})
      return
    }
    const weeks = weeksOf(id)
    const roster = rosterOf(
      id,
      weeks.map((w) => w.id),
    )
    const d = derive(weeks, roster)
    res.json({campaign, weeks: d.weeks, roster, totals: d.totals})
  }),
)

// --- Campaign writing -------------------------------------------------------

/** Creates the week rows a (start, end) pair implies. */
function syncWeeks(campaignId: number, startDate: string, endDate: string, tx: Tx) {
  const dates = campaignWeekDates(startDate, endDate)
  const existing = tx
    .select()
    .from(schema.fillAmericaCampaignWeeks)
    .where(eq(schema.fillAmericaCampaignWeeks.campaignId, campaignId))
    .all()

  for (let i = 0; i < dates.length; i++) {
    const weekNo = i + 1
    const found = existing.find((w) => w.weekNo === weekNo)
    if (found) {
      if (found.weekDate !== dates[i]) {
        tx.update(schema.fillAmericaCampaignWeeks)
          .set({weekDate: dates[i]})
          .where(eq(schema.fillAmericaCampaignWeeks.id, found.id))
          .run()
      }
    } else {
      tx.insert(schema.fillAmericaCampaignWeeks).values({campaignId, weekNo, weekDate: dates[i]}).run()
    }
  }
  return existing.filter((w) => w.weekNo > dates.length)
}

fillAmericaRouter.post(
  '/campaigns',
  asyncHandler(async (req, res) => {
    const {startDate, endDate, season, title, doorHangerGoal} = req.body as {
      startDate?: string
      endDate?: string
      season?: string
      title?: string
      doorHangerGoal?: unknown
    }
    if (typeof startDate !== 'string' || !DATE_RE.test(startDate)) {
      res.status(400).json({error: 'startDate must be YYYY-MM-DD'})
      return
    }
    if (typeof endDate !== 'string' || !DATE_RE.test(endDate) || endDate < startDate) {
      res.status(400).json({error: 'endDate must be YYYY-MM-DD and on or after startDate'})
      return
    }
    const clash = db
      .select()
      .from(schema.fillAmericaCampaigns)
      .where(eq(schema.fillAmericaCampaigns.startDate, startDate))
      .get()
    if (clash) {
      res.status(409).json({error: `a campaign already starts on ${startDate}`})
      return
    }

    const row = db.transaction((tx) => {
      const created = tx
        .insert(schema.fillAmericaCampaigns)
        .values({
          title: title?.trim() || defaultTitle(startDate, endDate),
          startDate,
          endDate,
          season: (isSeason(season) ? season : defaultSeason(startDate)) as Season,
          doorHangerGoal: cleanInt(doorHangerGoal),
        })
        .returning()
        .get()

      syncWeeks(created.id, startDate, endDate, tx)

      // Copy the previous campaign's roster forward — households and their
      // sizes and goals, never their tract reports.
      const prev = tx
        .select()
        .from(schema.fillAmericaCampaigns)
        .where(sql`${schema.fillAmericaCampaigns.startDate} < ${startDate}`)
        .orderBy(desc(schema.fillAmericaCampaigns.startDate))
        .limit(1)
        .get()
      if (prev) {
        const prevRoster = tx
          .select()
          .from(schema.fillAmericaRosterEntries)
          .where(eq(schema.fillAmericaRosterEntries.campaignId, prev.id))
          .all()
        for (const e of prevRoster) {
          tx.insert(schema.fillAmericaRosterEntries)
            .values({
              campaignId: created.id,
              householdId: e.householdId,
              size: e.size,
              goal: e.goal,
              sortOrder: e.sortOrder,
            })
            .run()
        }
      }
      return created
    })
    res.status(201).json(row)
  }),
)

fillAmericaRouter.patch(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const campaign = db.select().from(schema.fillAmericaCampaigns).where(eq(schema.fillAmericaCampaigns.id, id)).get()
    if (!campaign) {
      res.status(404).json({error: 'not found'})
      return
    }
    const {startDate, endDate, season, title, doorHangerGoal} = req.body as {
      startDate?: string
      endDate?: string
      season?: string
      title?: string
      doorHangerGoal?: unknown
    }
    const nextStart = typeof startDate === 'string' ? startDate : campaign.startDate
    const nextEnd = typeof endDate === 'string' ? endDate : campaign.endDate
    if (!DATE_RE.test(nextStart) || !DATE_RE.test(nextEnd) || nextEnd < nextStart) {
      res.status(400).json({error: 'dates must be YYYY-MM-DD with end on or after start'})
      return
    }

    // Shortening a campaign must never silently discard what was recorded in
    // the weeks it drops.
    if (nextStart !== campaign.startDate || nextEnd !== campaign.endDate) {
      const keep = campaignWeekDates(nextStart, nextEnd).length
      const doomed = weeksOf(id).filter((w) => w.weekNo > keep)
      for (const w of doomed) {
        const used =
          db
            .select({n: sql<number>`count(*)`})
            .from(schema.fillAmericaTractReports)
            .where(
              and(
                eq(schema.fillAmericaTractReports.weekId, w.id),
                sql`${schema.fillAmericaTractReports.tracts} is not null`,
              ),
            )
            .get()!.n > 0 || w.doorHangers !== null
        if (used) {
          res.status(409).json({error: `week ${w.weekNo} (${w.weekDate}) has recorded data — clear it first`})
          return
        }
      }
    }

    const patch: Record<string, unknown> = {updatedAt: sql`(datetime('now'))`}
    if (typeof title === 'string' && title.trim()) patch.title = title.trim()
    if (isSeason(season)) patch.season = season
    if ('doorHangerGoal' in (req.body as object)) patch.doorHangerGoal = cleanInt(doorHangerGoal)
    patch.startDate = nextStart
    patch.endDate = nextEnd

    const row = db.transaction((tx) => {
      const updated = tx
        .update(schema.fillAmericaCampaigns)
        .set(patch)
        .where(eq(schema.fillAmericaCampaigns.id, id))
        .returning()
        .get()
      const drop = syncWeeks(id, nextStart, nextEnd, tx)
      for (const w of drop) {
        tx.delete(schema.fillAmericaCampaignWeeks).where(eq(schema.fillAmericaCampaignWeeks.id, w.id)).run()
      }
      return updated
    })
    res.json(row)
  }),
)

fillAmericaRouter.delete(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    db.delete(schema.fillAmericaCampaigns).where(eq(schema.fillAmericaCampaigns.id, id)).run()
    res.json({ok: true})
  }),
)

// --- Week + roster + tract writing ------------------------------------------

fillAmericaRouter.put(
  '/campaigns/:id/weeks/:weekNo',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const weekNo = Number(req.params.weekNo)
    const week = db
      .select()
      .from(schema.fillAmericaCampaignWeeks)
      .where(
        and(eq(schema.fillAmericaCampaignWeeks.campaignId, id), eq(schema.fillAmericaCampaignWeeks.weekNo, weekNo)),
      )
      .get()
    if (!week) {
      res.status(404).json({error: 'week not found'})
      return
    }
    const row = db
      .update(schema.fillAmericaCampaignWeeks)
      .set({doorHangers: cleanInt((req.body as {doorHangers?: unknown}).doorHangers)})
      .where(eq(schema.fillAmericaCampaignWeeks.id, week.id))
      .returning()
      .get()
    res.json(row)
  }),
)

fillAmericaRouter.put(
  '/campaigns/:id/roster/:householdId',
  asyncHandler(async (req, res) => {
    const campaignId = Number(req.params.id)
    const householdId = Number(req.params.householdId)
    if (!Number.isInteger(campaignId) || !Number.isInteger(householdId)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    const {size, goal} = req.body as {size?: unknown; goal?: unknown}
    const cleanSize = Math.max(1, cleanInt(size) ?? 1)
    const cleanGoal = cleanInt(goal)

    const existing = db
      .select()
      .from(schema.fillAmericaRosterEntries)
      .where(
        and(
          eq(schema.fillAmericaRosterEntries.campaignId, campaignId),
          eq(schema.fillAmericaRosterEntries.householdId, householdId),
        ),
      )
      .get()

    if (existing) {
      const row = db
        .update(schema.fillAmericaRosterEntries)
        .set({size: cleanSize, goal: cleanGoal})
        .where(eq(schema.fillAmericaRosterEntries.id, existing.id))
        .returning()
        .get()
      res.json(row)
      return
    }
    const maxOrder =
      db
        .select({n: sql<number>`coalesce(max(${schema.fillAmericaRosterEntries.sortOrder}), -1)`})
        .from(schema.fillAmericaRosterEntries)
        .where(eq(schema.fillAmericaRosterEntries.campaignId, campaignId))
        .get()?.n ?? -1
    const row = db
      .insert(schema.fillAmericaRosterEntries)
      .values({campaignId, householdId, size: cleanSize, goal: cleanGoal, sortOrder: maxOrder + 1})
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

// Repoint an existing roster row at a different Household, keeping its size,
// goal and every Tract Report — those hang off the roster entry, so they follow
// the row rather than the household. For fixing a row entered against the wrong
// family without retyping three weeks of numbers.
fillAmericaRouter.put(
  '/campaigns/:id/roster/:householdId/household',
  asyncHandler(async (req, res) => {
    const campaignId = Number(req.params.id)
    const fromId = Number(req.params.householdId)
    const {householdId: toId} = req.body as {householdId?: number}
    if (!Number.isInteger(campaignId) || !Number.isInteger(fromId) || !Number.isInteger(toId)) {
      res.status(400).json({error: 'bad id'})
      return
    }
    if (fromId === toId) {
      res.json({ok: true})
      return
    }
    const entry = db
      .select()
      .from(schema.fillAmericaRosterEntries)
      .where(
        and(
          eq(schema.fillAmericaRosterEntries.campaignId, campaignId),
          eq(schema.fillAmericaRosterEntries.householdId, fromId),
        ),
      )
      .get()
    if (!entry) {
      res.status(404).json({error: 'household is not on this campaign roster'})
      return
    }
    const target = db
      .select()
      .from(schema.fillAmericaHouseholds)
      .where(eq(schema.fillAmericaHouseholds.id, toId!))
      .get()
    if (!target) {
      res.status(404).json({error: 'household not found'})
      return
    }
    // One row per household per campaign: merging two rows would have to decide
    // what happens to two sets of tract reports, which is a different feature.
    const clash = db
      .select()
      .from(schema.fillAmericaRosterEntries)
      .where(
        and(
          eq(schema.fillAmericaRosterEntries.campaignId, campaignId),
          eq(schema.fillAmericaRosterEntries.householdId, toId!),
        ),
      )
      .get()
    if (clash) {
      res.status(409).json({error: `${target.name} is already on this campaign`})
      return
    }
    const row = db
      .update(schema.fillAmericaRosterEntries)
      .set({householdId: toId!})
      .where(eq(schema.fillAmericaRosterEntries.id, entry.id))
      .returning()
      .get()
    res.json(row)
  }),
)

fillAmericaRouter.delete(
  '/campaigns/:id/roster/:householdId',
  asyncHandler(async (req, res) => {
    const campaignId = Number(req.params.id)
    const householdId = Number(req.params.householdId)
    db.delete(schema.fillAmericaRosterEntries)
      .where(
        and(
          eq(schema.fillAmericaRosterEntries.campaignId, campaignId),
          eq(schema.fillAmericaRosterEntries.householdId, householdId),
        ),
      )
      .run()
    res.json({ok: true})
  }),
)

fillAmericaRouter.put(
  '/campaigns/:id/tracts',
  asyncHandler(async (req, res) => {
    const campaignId = Number(req.params.id)
    const {householdId, weekNo, tracts} = req.body as {householdId?: number; weekNo?: number; tracts?: unknown}
    if (!Number.isInteger(householdId) || !Number.isInteger(weekNo)) {
      res.status(400).json({error: 'householdId and weekNo required'})
      return
    }
    const entry = db
      .select()
      .from(schema.fillAmericaRosterEntries)
      .where(
        and(
          eq(schema.fillAmericaRosterEntries.campaignId, campaignId),
          eq(schema.fillAmericaRosterEntries.householdId, householdId!),
        ),
      )
      .get()
    if (!entry) {
      res.status(404).json({error: 'household is not on this campaign roster'})
      return
    }
    const week = db
      .select()
      .from(schema.fillAmericaCampaignWeeks)
      .where(
        and(
          eq(schema.fillAmericaCampaignWeeks.campaignId, campaignId),
          eq(schema.fillAmericaCampaignWeeks.weekNo, weekNo!),
        ),
      )
      .get()
    if (!week) {
      res.status(404).json({error: 'week not found'})
      return
    }

    const value = cleanInt(tracts)
    // Blank clears the cell outright, so "no row" and "nothing reported" stay
    // the same thing — the participant rules read a missing report as absence.
    if (value === null) {
      db.delete(schema.fillAmericaTractReports)
        .where(
          and(
            eq(schema.fillAmericaTractReports.rosterEntryId, entry.id),
            eq(schema.fillAmericaTractReports.weekId, week.id),
          ),
        )
        .run()
      res.json({rosterEntryId: entry.id, weekId: week.id, tracts: null})
      return
    }
    const row = db
      .insert(schema.fillAmericaTractReports)
      .values({rosterEntryId: entry.id, weekId: week.id, tracts: value})
      .onConflictDoUpdate({
        target: [schema.fillAmericaTractReports.rosterEntryId, schema.fillAmericaTractReports.weekId],
        set: {tracts: value},
      })
      .returning()
      .get()
    res.json(row)
  }),
)

// --- Dashboard: series, summary, leaderboards -------------------------------

// Fill America has nothing continuous to plot: eighteen three-week campaigns
// over four years, separated by two-to-three-month gaps. So the x-axis is the
// Campaign, not the date, and every endpoint below returns one row per
// campaign rather than one per week.

type Metric = 'tracts' | 'doorHangers' | 'uniqueParticipants'

const METRICS: Metric[] = ['tracts', 'doorHangers', 'uniqueParticipants']

const isMetric = (v: unknown): v is Metric => METRICS.includes(v as Metric)

/** `householdId` query param -> a numeric id, or null for "all combined". */
function householdFilter(raw: unknown): number | null {
  const s = String(raw ?? 'all')
  if (s === 'all') return null
  const id = Number(s)
  return Number.isInteger(id) ? id : null
}

const dateParam = (raw: unknown): string | null => (typeof raw === 'string' && DATE_RE.test(raw) ? raw : null)

/** `season` query param -> a Season, or null for "all". */
const seasonFilter = (raw: unknown): Season | null => (isSeason(raw) ? raw : null)

interface CampaignPoint {
  campaignId: number
  title: string
  startDate: string
  season: Season
  tracts: number
  // Both null when a single Household is selected. Door Hangers are recorded on
  // the Campaign Week and never attributed to a family, and Unique Participants
  // is a whole-campaign headcount — reporting either under a household filter
  // would hand back the entire church's number as if it were one family's.
  doorHangers: number | null
  uniqueParticipants: number | null
}

/**
 * Every campaign as one point, ascending by start date. Tracts and Unique
 * Participants are derived from the roster on every read, per ADR 0032 — there
 * is no column for either.
 */
function campaignPoints(householdId: number | null): CampaignPoint[] {
  const campaigns = db
    .select()
    .from(schema.fillAmericaCampaigns)
    .orderBy(asc(schema.fillAmericaCampaigns.startDate))
    .all()

  // Every roster entry in the database with its tracts laid out by week number,
  // in one pass — eighteen campaigns is not worth eighteen round trips.
  const rows = db
    .select({
      campaignId: schema.fillAmericaRosterEntries.campaignId,
      entryId: schema.fillAmericaRosterEntries.id,
      size: schema.fillAmericaRosterEntries.size,
      weekNo: schema.fillAmericaCampaignWeeks.weekNo,
      tracts: schema.fillAmericaTractReports.tracts,
    })
    .from(schema.fillAmericaRosterEntries)
    .leftJoin(
      schema.fillAmericaTractReports,
      eq(schema.fillAmericaTractReports.rosterEntryId, schema.fillAmericaRosterEntries.id),
    )
    .leftJoin(
      schema.fillAmericaCampaignWeeks,
      eq(schema.fillAmericaCampaignWeeks.id, schema.fillAmericaTractReports.weekId),
    )
    .where(householdId === null ? undefined : eq(schema.fillAmericaRosterEntries.householdId, householdId))
    .all()

  const byCampaign = new Map<number, Map<number, RosterLike>>()
  for (const r of rows) {
    let entries = byCampaign.get(r.campaignId)
    if (!entries) byCampaign.set(r.campaignId, (entries = new Map()))
    let entry = entries.get(r.entryId)
    if (!entry) entries.set(r.entryId, (entry = {size: r.size, tracts: []}))
    // A left join with no report leaves weekNo null: nothing to place, and the
    // hole it leaves reads as "not reported", which is exactly what it is.
    if (r.weekNo !== null) entry.tracts[r.weekNo - 1] = r.tracts
  }

  const hangers = new Map<number, number>()
  for (const h of db
    .select({
      campaignId: schema.fillAmericaCampaignWeeks.campaignId,
      total: sql<number>`coalesce(sum(fill_america_campaign_weeks.door_hangers), 0)`,
    })
    .from(schema.fillAmericaCampaignWeeks)
    .groupBy(schema.fillAmericaCampaignWeeks.campaignId)
    .all()) {
    hangers.set(h.campaignId, h.total)
  }

  return campaigns.map((c) => {
    const entries = [...(byCampaign.get(c.id)?.values() ?? [])]
    return {
      campaignId: c.id,
      title: c.title,
      startDate: c.startDate,
      season: c.season,
      tracts: entries.reduce((a, e) => a + entryTotal(e), 0),
      doorHangers: householdId === null ? (hangers.get(c.id) ?? 0) : null,
      uniqueParticipants: householdId === null ? campaignUniqueParticipants(entries) : null,
    }
  })
}

/** The Season and start-date window every dashboard endpoint shares. */
function inWindow(
  p: {startDate: string; season: Season},
  season: Season | null,
  from: string | null,
  to: string | null,
) {
  if (season && p.season !== season) return false
  if (from && p.startDate < from) return false
  if (to && p.startDate > to) return false
  return true
}

fillAmericaRouter.get(
  '/series',
  asyncHandler(async (req, res) => {
    const metric: Metric = isMetric(req.query.metric) ? req.query.metric : 'tracts'
    const householdParam = String(req.query.householdId ?? 'all')
    const seasonParam = String(req.query.season ?? 'all')
    const season = seasonFilter(req.query.season)
    const from = dateParam(req.query.from)
    const to = dateParam(req.query.to)

    const points = campaignPoints(householdFilter(req.query.householdId))
      .filter((p) => inWindow(p, season, from, to))
      .map((p) => ({
        campaignId: p.campaignId,
        title: p.title,
        startDate: p.startDate,
        season: p.season,
        value: p[metric],
      }))
    res.json({metric, householdId: householdParam, season: seasonParam, points})
  }),
)

// --- Summary tiles ----------------------------------------------------------

/**
 * Totals over a set of campaigns. `campaigns` counts only the ones that
 * actually recorded something, so a campaign created this morning does not drag
 * the average down before anybody has reported.
 */
function agg(points: CampaignPoint[], metric: Metric) {
  const values = points.map((p) => p[metric]).filter((v): v is number => v !== null)
  const withData = values.filter((v) => v > 0)
  const total = values.reduce((a, b) => a + b, 0)
  return {
    total: values.length ? total : null,
    campaigns: withData.length,
    avg: withData.length ? Math.round(total / withData.length) : 0,
  }
}

fillAmericaRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const householdParam = String(req.query.householdId ?? 'all')
    const points = campaignPoints(householdFilter(req.query.householdId))

    const year = new Date().getUTCFullYear()
    const thisYear = points.filter((p) => p.startDate.slice(0, 4) === String(year))
    // The most recent campaign outright, not the most recent one with data — a
    // tile called "Latest Campaign" that quietly names an older one is worse
    // than one reading zero next to today's title.
    const latest = points.at(-1) ?? null

    const metrics: Record<string, unknown> = {}
    for (const m of METRICS) {
      metrics[m] = {
        latest: latest ? latest[m] : null,
        year: agg(thisYear, m),
        allTime: agg(points, m),
      }
    }

    res.json({
      householdId: householdParam,
      year,
      latest: latest
        ? {campaignId: latest.campaignId, title: latest.title, startDate: latest.startDate, season: latest.season}
        : null,
      metrics,
    })
  }),
)

// --- Leaderboards -----------------------------------------------------------

// `scope=household` totals a family across every campaign; `scope=effort` ranks
// single campaigns. Both count a campaign as participated in only where tracts
// above zero were reported, which is the same test the Unique Participants rule
// uses — a roster row copied forward and never filled in is not participation.
//
// Retired households are left off both boards. Their tracts still count towards
// every campaign total, /series and /summary, and their rows stay on the
// campaign pages where the numbers were typed — retiring takes a family off the
// dashboard, it does not erase what they did.
fillAmericaRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'effort' ? 'effort' : 'household'
    const rawLimit = Number(req.query.limit)
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 10
    const season = seasonFilter(req.query.season)
    const from = dateParam(req.query.from)
    const to = dateParam(req.query.to)

    const conds = [eq(schema.fillAmericaHouseholds.active, true)]
    if (season) conds.push(eq(schema.fillAmericaCampaigns.season, season))
    if (from) conds.push(gte(schema.fillAmericaCampaigns.startDate, from))
    if (to) conds.push(lte(schema.fillAmericaCampaigns.startDate, to))
    const where = and(...conds)

    // Table names are written out: drizzle renders a column inside an sql
    // template as a bare `"tracts"`, which across these joins is ambiguous.
    const tractSum = sql<number>`coalesce(sum(fill_america_tract_reports.tracts), 0)`

    if (scope === 'effort') {
      const rows = db
        .select({
          householdId: schema.fillAmericaHouseholds.id,
          householdName: schema.fillAmericaHouseholds.name,
          campaignId: schema.fillAmericaCampaigns.id,
          campaignTitle: schema.fillAmericaCampaigns.title,
          startDate: schema.fillAmericaCampaigns.startDate,
          season: schema.fillAmericaCampaigns.season,
          tracts: tractSum,
        })
        .from(schema.fillAmericaRosterEntries)
        .innerJoin(
          schema.fillAmericaHouseholds,
          eq(schema.fillAmericaHouseholds.id, schema.fillAmericaRosterEntries.householdId),
        )
        .innerJoin(
          schema.fillAmericaCampaigns,
          eq(schema.fillAmericaCampaigns.id, schema.fillAmericaRosterEntries.campaignId),
        )
        .innerJoin(
          schema.fillAmericaTractReports,
          eq(schema.fillAmericaTractReports.rosterEntryId, schema.fillAmericaRosterEntries.id),
        )
        .where(where)
        .groupBy(schema.fillAmericaRosterEntries.id)
        .all()
      const out = rows
        .filter((r) => r.tracts > 0)
        .sort((a, b) => b.tracts - a.tracts || a.householdName.localeCompare(b.householdName))
        .slice(0, limit)
      res.json({scope, rows: out})
      return
    }

    const rows = db
      .select({
        householdId: schema.fillAmericaHouseholds.id,
        householdName: schema.fillAmericaHouseholds.name,
        tracts: tractSum,
        campaigns: sql<number>`count(distinct case when fill_america_tract_reports.tracts > 0
          then fill_america_roster_entries.campaign_id end)`,
      })
      .from(schema.fillAmericaRosterEntries)
      .innerJoin(
        schema.fillAmericaHouseholds,
        eq(schema.fillAmericaHouseholds.id, schema.fillAmericaRosterEntries.householdId),
      )
      .innerJoin(
        schema.fillAmericaCampaigns,
        eq(schema.fillAmericaCampaigns.id, schema.fillAmericaRosterEntries.campaignId),
      )
      .leftJoin(
        schema.fillAmericaTractReports,
        eq(schema.fillAmericaTractReports.rosterEntryId, schema.fillAmericaRosterEntries.id),
      )
      .where(where)
      .groupBy(schema.fillAmericaHouseholds.id)
      .all()

    const out = rows
      .filter((r) => r.tracts > 0)
      .sort((a, b) => b.tracts - a.tracts || a.householdName.localeCompare(b.householdName))
      .slice(0, limit)
      .map((r) => ({...r, avg: r.campaigns ? Math.round(r.tracts / r.campaigns) : 0}))
    res.json({scope, rows: out})
  }),
)
