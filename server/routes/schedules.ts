import * as Sentry from '@sentry/node'
import {and, asc, between, desc, eq, inArray, isNull, lt, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {uploadPath, uploadUrl} from '../lib/uploads.js'
import {sendImageViaUI} from '../services/applescript.js'
import {findForSpecialMusic} from '../services/double-booking.js'
import {
  DEFAULT_REMINDER_SEND_TIME,
  REMINDER_SEND_TIME_KEY,
  sendAtForTargetDay,
} from '../services/fair-booth-reminders.js'

export const schedulesRouter = Router()

const LOGOS_DIR = uploadPath('schedule-logos')

// Every image the printed schedules can carry lands in the same folder; the
// slot decides which setting points at it. The Music Schedule's footer
// graphic is one of these — it prints under the verse on the Musicians sheet.
const LOGO_SLOTS = {
  print: {key: 'schedulesLogoPath', prefix: 'logo'},
  compact: {key: 'schedulesCompactLogoPath', prefix: 'logo-compact'},
  music_footer: {key: 'schedules.musicSchedule.footerImagePath', prefix: 'music-footer'},
} as const
type LogoSlot = keyof typeof LOGO_SLOTS

// ── Settings ────────────────────────────────────────────────────────────
// Cross-cutting settings for every Schedule type (logo) plus per-type
// defaults (titlePrefix, footerBlocks, singerGroupIds for special music).

export interface FooterBlock {
  kind: 'quote' | 'note' | 'spacer'
  text: string
  bold?: boolean
}

// Page-1 bullet list of a Workers' Notes Edition. The three placeholder kinds
// carry no text — they render from the edition's own Term, Yearly Theme, and
// Mottos, so they cannot go stale when copied forward.
export interface WorkersNotesBlockSeed {
  kind: 'note' | 'spacer' | 'next_term_forms' | 'growth_plan' | 'month_themes'
  text: string
  bold?: boolean
}

// Default intro copy on the Shifts Card. Admin-editable so "let me know" can be
// reworded to name a person without a deploy.
const DEFAULT_PERSONAL_SHIFTS_INTRO =
  "These are the shifts you signed up for at the fair booth. Please look them over — if anything needs to change, just let me know and I'll get it updated. Thank you for serving!"

interface SchedulesSettings {
  logoPath: string | null
  // Squarer mark for image cards, where the wide print logo reads too small.
  // Falls back to logoPath when unset.
  compactLogoPath: string | null
  nursery: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
  }
  specialMusic: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
    singerGroupIds: number[]
    // Which Service Times the Special Music Schedule covers — was a hardcoded
    // ['sunday_am','sunday_pm'] before service times became the vocabulary.
    // Seeded by migration 0042. See docs/adr/0025.
    serviceTimeIds: number[]
  }
  fairBooth: {
    titlePrefix: string
    rosterGroupIds: number[]
    minSignupsForBold: number
    gridPageFooterBlocks: FooterBlock[]
    rosterPageFooterBlocks: FooterBlock[]
    personalShiftsIntro: string
    // Local HH:MM a Reminder Run fires, the evening before the day it covers.
    reminderSendTime: string
  }
  musicSchedule: {
    titlePrefix: string
    // Two printed headings per Service Time — the Music Sheet says "MORNING
    // SERVICE" where the Sound Booth Sheet says "SUNDAY MORNING". Keyed by
    // service_time_id. See CONTEXT.md → Music Sheet / Sound Booth Sheet.
    serviceHeadings: Record<string, {music: string; booth: string}>
    footerBlocks: FooterBlock[]
    // The music-note graphic under the footer quote.
    footerImagePath: string | null
    footerPlacement: 'last' | 'every' | 'never'
  }
  workersNotes: {
    churchName: string
    // When true, page 1 heads with the shared schedules logo instead of the
    // church-name line. The logo carries the church identity itself.
    useLogoHeader: boolean
    // Seeds the Notes Blocks of a first edition only; later editions copy
    // forward from their predecessor instead. See ADR 0006 amendment.
    defaultBlocks: WorkersNotesBlockSeed[]
  }
}

// Which Service Times the Special Music Schedule covers. Falls back to every
// active Sunday service if the setting is missing, so a wiped setting degrades
// to a slightly-wide schedule rather than an empty one.
function specialMusicServiceTimeIds(): number[] {
  const configured = readSettings().specialMusic.serviceTimeIds
  if (configured.length > 0) return configured
  return db
    .select({id: schema.serviceTimes.id})
    .from(schema.serviceTimes)
    .where(and(eq(schema.serviceTimes.dayOfWeek, 0), eq(schema.serviceTimes.active, true)))
    .all()
    .map((r) => r.id)
}

function readSettings(): SchedulesSettings {
  const rows = db.select().from(schema.settings).all()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const parseJson = <T>(key: string, fallback: T): T => {
    const v = map.get(key)
    if (v == null) return fallback
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return {
    logoPath: map.get('schedulesLogoPath') ?? null,
    compactLogoPath: map.get('schedulesCompactLogoPath') ?? null,
    nursery: {
      titlePrefix: map.get('schedules.nursery.titlePrefix') ?? 'Nursery Schedule',
      footerBlocks: parseJson<FooterBlock[]>('schedules.nursery.footerBlocks', []),
    },
    specialMusic: {
      titlePrefix: map.get('schedules.specialMusic.titlePrefix') ?? 'Special Music Schedule',
      footerBlocks: parseJson<FooterBlock[]>('schedules.specialMusic.footerBlocks', []),
      singerGroupIds: parseJson<number[]>('schedules.specialMusic.singerGroupIds', []),
      serviceTimeIds: parseJson<number[]>('schedules.specialMusic.serviceTimeIds', []),
    },
    fairBooth: {
      titlePrefix: map.get('schedules.fairBooth.titlePrefix') ?? 'Fair Booth Schedule',
      rosterGroupIds: parseJson<number[]>('schedules.fairBooth.rosterGroupIds', []),
      minSignupsForBold: Number(map.get('schedules.fairBooth.minSignupsForBold') ?? '3'),
      gridPageFooterBlocks: parseJson<FooterBlock[]>('schedules.fairBooth.gridPageFooterBlocks', [
        {
          kind: 'quote',
          text: 'The fruit of the righteous is a tree of life; and he that winneth souls is wise.',
          bold: true,
        },
        {kind: 'note', text: '— Proverbs 11:30'},
        {kind: 'spacer', text: ''},
        {
          kind: 'note',
          text: 'If you are going to work in the Fair Booth this year, please put your initials in a time slot above so we know that we can count on you to be there at that time.',
        },
      ]),
      rosterPageFooterBlocks: parseJson<FooterBlock[]>('schedules.fairBooth.rosterPageFooterBlocks', [
        {
          kind: 'note',
          text: 'Please put your name and your initials above so we know who you are and which slot you signed up to serve.',
        },
      ]),
      personalShiftsIntro: map.get('schedules.fairBooth.personalShiftsIntro') ?? DEFAULT_PERSONAL_SHIFTS_INTRO,
      reminderSendTime: map.get(REMINDER_SEND_TIME_KEY) ?? DEFAULT_REMINDER_SEND_TIME,
    },
    musicSchedule: {
      titlePrefix: map.get('schedules.musicSchedule.titlePrefix') ?? 'Music Schedule',
      serviceHeadings: parseJson<Record<string, {music: string; booth: string}>>(
        'schedules.musicSchedule.serviceHeadings',
        {},
      ),
      footerBlocks: parseJson<FooterBlock[]>('schedules.musicSchedule.footerBlocks', []),
      footerImagePath: map.get('schedules.musicSchedule.footerImagePath') ?? null,
      footerPlacement:
        (map.get('schedules.musicSchedule.footerPlacement') as 'last' | 'every' | 'never' | undefined) ?? 'last',
    },
    workersNotes: {
      churchName: map.get('schedules.workersNotes.churchName') ?? 'Central Baptist Church',
      useLogoHeader: map.get('schedules.workersNotes.useLogoHeader') === 'true',
      defaultBlocks: parseJson<WorkersNotesBlockSeed[]>('schedules.workersNotes.defaultBlocks', [
        {kind: 'note', text: ''},
        {kind: 'next_term_forms', text: ''},
        {kind: 'growth_plan', text: ''},
        {kind: 'month_themes', text: ''},
      ]),
    },
  }
}

function upsert(key: string, value: string) {
  db.insert(schema.settings)
    .values({key, value, updatedAt: new Date().toISOString()})
    .onConflictDoUpdate({target: schema.settings.key, set: {value, updatedAt: new Date().toISOString()}})
    .run()
}

schedulesRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json(readSettings())
  }),
)

schedulesRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<{
      nursery: Partial<SchedulesSettings['nursery']>
      specialMusic: Partial<SchedulesSettings['specialMusic']>
      fairBooth: Partial<SchedulesSettings['fairBooth']>
      musicSchedule: Partial<SchedulesSettings['musicSchedule']>
      workersNotes: Partial<SchedulesSettings['workersNotes']>
    }>
    if (body.nursery?.titlePrefix !== undefined) upsert('schedules.nursery.titlePrefix', body.nursery.titlePrefix)
    if (body.nursery?.footerBlocks !== undefined)
      upsert('schedules.nursery.footerBlocks', JSON.stringify(body.nursery.footerBlocks))
    if (body.specialMusic?.titlePrefix !== undefined)
      upsert('schedules.specialMusic.titlePrefix', body.specialMusic.titlePrefix)
    if (body.specialMusic?.footerBlocks !== undefined)
      upsert('schedules.specialMusic.footerBlocks', JSON.stringify(body.specialMusic.footerBlocks))
    if (body.specialMusic?.serviceTimeIds !== undefined)
      upsert('schedules.specialMusic.serviceTimeIds', JSON.stringify(body.specialMusic.serviceTimeIds))
    if (body.specialMusic?.singerGroupIds !== undefined)
      upsert('schedules.specialMusic.singerGroupIds', JSON.stringify(body.specialMusic.singerGroupIds))
    if (body.musicSchedule?.titlePrefix !== undefined)
      upsert('schedules.musicSchedule.titlePrefix', body.musicSchedule.titlePrefix)
    if (body.musicSchedule?.serviceHeadings !== undefined)
      upsert('schedules.musicSchedule.serviceHeadings', JSON.stringify(body.musicSchedule.serviceHeadings))
    if (body.musicSchedule?.footerBlocks !== undefined)
      upsert('schedules.musicSchedule.footerBlocks', JSON.stringify(body.musicSchedule.footerBlocks))
    if (body.musicSchedule?.footerImagePath !== undefined)
      upsert('schedules.musicSchedule.footerImagePath', body.musicSchedule.footerImagePath ?? '')
    if (body.musicSchedule?.footerPlacement !== undefined)
      upsert('schedules.musicSchedule.footerPlacement', body.musicSchedule.footerPlacement)
    if (body.fairBooth?.titlePrefix !== undefined) upsert('schedules.fairBooth.titlePrefix', body.fairBooth.titlePrefix)
    if (body.fairBooth?.rosterGroupIds !== undefined)
      upsert('schedules.fairBooth.rosterGroupIds', JSON.stringify(body.fairBooth.rosterGroupIds))
    if (body.fairBooth?.minSignupsForBold !== undefined)
      upsert('schedules.fairBooth.minSignupsForBold', String(body.fairBooth.minSignupsForBold))
    if (body.fairBooth?.gridPageFooterBlocks !== undefined)
      upsert('schedules.fairBooth.gridPageFooterBlocks', JSON.stringify(body.fairBooth.gridPageFooterBlocks))
    if (body.fairBooth?.rosterPageFooterBlocks !== undefined)
      upsert('schedules.fairBooth.rosterPageFooterBlocks', JSON.stringify(body.fairBooth.rosterPageFooterBlocks))
    if (body.fairBooth?.personalShiftsIntro !== undefined)
      upsert('schedules.fairBooth.personalShiftsIntro', body.fairBooth.personalShiftsIntro)
    if (body.fairBooth?.reminderSendTime !== undefined && /^\d{2}:\d{2}$/.test(body.fairBooth.reminderSendTime)) {
      upsert(REMINDER_SEND_TIME_KEY, body.fairBooth.reminderSendTime)
      // Re-time every Run still waiting, so the setting can't display one time
      // while the queue holds another. Already-fired Runs are untouched.
      // See docs/adr/0018-fair-booth-reminder-runs.md.
      const pending = db
        .select()
        .from(schema.fairBoothReminderRuns)
        .where(eq(schema.fairBoothReminderRuns.status, 'scheduled'))
        .all()
      for (const run of pending) {
        db.update(schema.fairBoothReminderRuns)
          .set({
            scheduledAt: sendAtForTargetDay(run.targetDay, body.fairBooth.reminderSendTime),
            updatedAt: sql`(datetime('now'))`,
          })
          .where(eq(schema.fairBoothReminderRuns.id, run.id))
          .run()
      }
    }
    if (body.workersNotes?.churchName !== undefined)
      upsert('schedules.workersNotes.churchName', body.workersNotes.churchName)
    if (body.workersNotes?.useLogoHeader !== undefined)
      upsert('schedules.workersNotes.useLogoHeader', String(body.workersNotes.useLogoHeader))
    if (body.workersNotes?.defaultBlocks !== undefined)
      upsert('schedules.workersNotes.defaultBlocks', JSON.stringify(body.workersNotes.defaultBlocks))
    res.json(readSettings())
  }),
)

schedulesRouter.post(
  '/settings/logo',
  asyncHandler(async (req, res) => {
    const {imageData, slot} = req.body as {imageData: string; slot?: LogoSlot}
    if (!imageData) {
      res.status(400).json({error: 'Image data is required'})
      return
    }
    if (slot !== undefined && !(slot in LOGO_SLOTS)) {
      res.status(400).json({error: `slot must be one of ${Object.keys(LOGO_SLOTS).join(', ')}`})
      return
    }

    if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, {recursive: true})

    const {key: settingsKey, prefix} = LOGO_SLOTS[slot ?? 'print']
    const filename = `${prefix}-${Date.now()}.png`
    const filePath = path.join(LOGOS_DIR, filename)
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    const logoPath = uploadUrl('schedule-logos', filename)

    const old = db.select().from(schema.settings).where(eq(schema.settings.key, settingsKey)).get()
    if (old) {
      const oldFull = path.join(LOGOS_DIR, path.basename(old.value))
      if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull)
    }
    upsert(settingsKey, logoPath)
    res.json({logoPath})
  }),
)

// ── Households ─────────────────────────────────────────────────────────

schedulesRouter.get(
  '/households',
  asyncHandler(async (_req, res) => {
    const allHouseholds = db.select().from(schema.households).orderBy(asc(schema.households.id)).all()
    const memberRows = db
      .select({
        householdId: schema.householdMembers.householdId,
        personId: schema.householdMembers.personId,
        firstName: schema.people.firstName,
        lastName: schema.people.lastName,
      })
      .from(schema.householdMembers)
      .innerJoin(schema.people, eq(schema.householdMembers.personId, schema.people.id))
      .orderBy(asc(schema.householdMembers.householdId), asc(schema.people.firstName))
      .all()
    const byId = new Map<number, {personId: number; firstName: string | null; lastName: string | null}[]>()
    for (const r of memberRows) {
      const list = byId.get(r.householdId) ?? []
      list.push({personId: r.personId, firstName: r.firstName, lastName: r.lastName})
      byId.set(r.householdId, list)
    }
    res.json(allHouseholds.map((h) => ({id: h.id, name: h.name, members: byId.get(h.id) ?? []})))
  }),
)

schedulesRouter.post(
  '/households',
  asyncHandler(async (req, res) => {
    const {memberIds, name} = req.body as {memberIds: number[]; name?: string}
    if (!Array.isArray(memberIds) || memberIds.length < 2) {
      res.status(400).json({error: 'At least 2 members required'})
      return
    }
    const existing = db
      .select({personId: schema.householdMembers.personId})
      .from(schema.householdMembers)
      .where(inArray(schema.householdMembers.personId, memberIds))
      .all()
    if (existing.length > 0) {
      res
        .status(409)
        .json({error: 'One or more people already belong to a household', personIds: existing.map((e) => e.personId)})
      return
    }
    const members = db
      .select({personId: schema.people.id, firstName: schema.people.firstName, lastName: schema.people.lastName})
      .from(schema.people)
      .where(inArray(schema.people.id, memberIds))
      .all()
    const autoName = members.map((m) => m.firstName || 'Unknown').join(' & ')
    const household = db
      .insert(schema.households)
      .values({name: name?.trim() || autoName})
      .returning()
      .get()
    db.insert(schema.householdMembers)
      .values(memberIds.map((personId) => ({householdId: household.id, personId})))
      .run()
    res.status(201).json({id: household.id, name: household.name, members})
  }),
)

schedulesRouter.put(
  '/households/:hid',
  asyncHandler(async (req, res) => {
    const hid = Number(req.params.hid)
    const {memberIds, name} = req.body as {memberIds?: number[]; name?: string}
    if (memberIds !== undefined) {
      if (!Array.isArray(memberIds) || memberIds.length < 2) {
        res.status(400).json({error: 'At least 2 members required'})
        return
      }
      const existing = db
        .select({personId: schema.householdMembers.personId})
        .from(schema.householdMembers)
        .where(
          and(
            inArray(schema.householdMembers.personId, memberIds),
            sql`${schema.householdMembers.householdId} != ${hid}`,
          ),
        )
        .all()
      if (existing.length > 0) {
        res.status(409).json({
          error: 'One or more people already belong to another household',
          personIds: existing.map((e) => e.personId),
        })
        return
      }
      db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, hid)).run()
      db.insert(schema.householdMembers)
        .values(memberIds.map((personId) => ({householdId: hid, personId})))
        .run()
    }
    if (name !== undefined) {
      db.update(schema.households).set({name: name.trim()}).where(eq(schema.households.id, hid)).run()
    }
    const household = db.select().from(schema.households).where(eq(schema.households.id, hid)).get()
    const members = db
      .select({personId: schema.people.id, firstName: schema.people.firstName, lastName: schema.people.lastName})
      .from(schema.people)
      .innerJoin(schema.householdMembers, eq(schema.people.id, schema.householdMembers.personId))
      .where(eq(schema.householdMembers.householdId, hid))
      .all()
    res.json({id: hid, name: household?.name ?? '', members})
  }),
)

schedulesRouter.delete(
  '/households/:hid',
  asyncHandler(async (req, res) => {
    const hid = Number(req.params.hid)
    db.delete(schema.households).where(eq(schema.households.id, hid)).run()
    res.json({success: true})
  }),
)

// ── Envelope CRUD (any type) ───────────────────────────────────────────

schedulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const where =
      type === 'nursery' || type === 'special_music' || type === 'fair_booth' || type === 'workers_notes'
        ? eq(schema.schedules.scheduleType, type)
        : undefined
    const rows = db
      .select()
      .from(schema.schedules)
      .where(where)
      .orderBy(desc(schema.schedules.scopeStart), desc(schema.schedules.year), desc(schema.schedules.month))
      .all()
    res.json(rows)
  }),
)

schedulesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body as {
      scheduleType: 'nursery' | 'special_music'
      scopeStart?: string
      scopeEnd?: string
      scopeLabel?: string
    }
    if (b.scheduleType !== 'special_music') {
      // Nursery uses its own /api/nursery/schedules/generate flow.
      res.status(400).json({error: 'Use /api/nursery/schedules/generate for nursery schedules'})
      return
    }
    if (
      !b.scopeStart ||
      !b.scopeEnd ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.scopeStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.scopeEnd)
    ) {
      res.status(400).json({error: 'scopeStart and scopeEnd are required (YYYY-MM-DD)'})
      return
    }
    if (b.scopeStart > b.scopeEnd) {
      res.status(400).json({error: 'scopeStart must be on or before scopeEnd'})
      return
    }
    const startYear = Number(b.scopeStart.slice(0, 4))
    const label = b.scopeLabel?.trim() || String(startYear)
    const row = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'special_music',
        scopeKind: 'date_range',
        scopeStart: b.scopeStart,
        scopeEnd: b.scopeEnd,
        scopeLabel: label,
      })
      .returning()
      .get()
    res.status(201).json(row)
  }),
)

schedulesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const row = db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get()
    if (!row) {
      res.status(404).json({error: 'Schedule not found'})
      return
    }
    res.json(row)
  }),
)

schedulesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const b = req.body as Partial<{scopeLabel: string; status: 'draft' | 'final'}>
    const updates: Partial<typeof schema.schedules.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    }
    if (typeof b.scopeLabel === 'string') updates.scopeLabel = b.scopeLabel
    if (b.status === 'draft' || b.status === 'final') updates.status = b.status
    const row = db.update(schema.schedules).set(updates).where(eq(schema.schedules.id, id)).returning().get()
    if (!row) {
      res.status(404).json({error: 'Schedule not found'})
      return
    }
    res.json(row)
  }),
)

schedulesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    db.delete(schema.schedules).where(eq(schema.schedules.id, id)).run()
    res.json({success: true})
  }),
)

// POST /api/schedules/:id/duplicate
// Clones the envelope at the supplied new scope and shifts each cell's date
// by the delta between old.scopeStart and new.scopeStart. Cells outside the
// new scope are dropped. Status resets per date (will_perform when future,
// needs_review when past). Song details (title/hymn/youtube/sheet music/
// notes) are NOT copied — the new schedule is a forward-looking plan, not
// a performance log. Performer links + displayFirstNameOnly overrides are.
schedulesRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const b = req.body as {scopeStart?: string; scopeEnd?: string; scopeLabel?: string}
    if (
      !b.scopeStart ||
      !b.scopeEnd ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.scopeStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.scopeEnd)
    ) {
      res.status(400).json({error: 'scopeStart and scopeEnd are required (YYYY-MM-DD)'})
      return
    }
    if (b.scopeStart > b.scopeEnd) {
      res.status(400).json({error: 'scopeStart must be on or before scopeEnd'})
      return
    }
    const source = db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get()
    if (!source) {
      res.status(404).json({error: 'Schedule not found'})
      return
    }
    if (source.scheduleType !== 'special_music' || !source.scopeStart) {
      res.status(400).json({error: 'Only special_music schedules can be duplicated'})
      return
    }

    const label = b.scopeLabel?.trim() || String(Number(b.scopeStart.slice(0, 4)))
    const newEnv = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'special_music',
        scopeKind: 'date_range',
        scopeStart: b.scopeStart,
        scopeEnd: b.scopeEnd,
        scopeLabel: label,
      })
      .returning()
      .get()

    const todayStr = new Date().toISOString().slice(0, 10)

    const sourceCells = db
      .select()
      .from(schema.specialMusic)
      .where(
        and(
          between(schema.specialMusic.date, source.scopeStart, source.scopeEnd!),
          inArray(schema.specialMusic.serviceTimeId, specialMusicServiceTimeIds()),
        ),
      )
      .all()

    // Align by Sunday, not by raw date delta. We pick the *earliest cell
    // date* in the source and the *first Sunday on/after new.scopeStart*,
    // and shift every cell by that day delta — guaranteed multiple of 7,
    // so Sunday cells stay on Sundays even if the user picks a mid-week
    // newScopeStart.
    const earliestCellDate = sourceCells.length > 0 ? sourceCells.map((c) => c.date).sort()[0] : source.scopeStart
    const deltaDays = dayDelta(earliestCellDate, firstSundayOnOrAfter(b.scopeStart))

    let copied = 0
    let skippedExisting = 0
    for (const cell of sourceCells) {
      const newDate = shiftDate(cell.date, deltaDays)
      if (newDate < b.scopeStart || newDate > b.scopeEnd) continue
      // Skip if a cell already exists at (newDate, service_time_id) — avoids
      // duplicate rows when the new scope overlaps the source scope.
      const existing = db
        .select({id: schema.specialMusic.id})
        .from(schema.specialMusic)
        .where(
          and(
            eq(schema.specialMusic.date, newDate),
            cell.serviceTimeId == null
              ? isNull(schema.specialMusic.serviceTimeId)
              : eq(schema.specialMusic.serviceTimeId, cell.serviceTimeId),
          ),
        )
        .get()
      if (existing) {
        skippedExisting += 1
        continue
      }
      const newStatus: 'will_perform' | 'needs_review' = newDate > todayStr ? 'will_perform' : 'needs_review'
      const inserted = db
        .insert(schema.specialMusic)
        .values({
          date: newDate,
          serviceTimeId: cell.serviceTimeId,
          serviceLabel: cell.serviceLabel,
          songTitle: null,
          hymnId: null,
          songArranger: null,
          songWriter: null,
          type: cell.type,
          status: newStatus,
          occasion: null,
          guestPerformers: cell.guestPerformers,
          youtubeUrl: null,
          sheetMusicPath: null,
          notes: null,
        })
        .returning({id: schema.specialMusic.id})
        .get()
      const links = db
        .select()
        .from(schema.specialMusicPerformers)
        .where(eq(schema.specialMusicPerformers.specialMusicId, cell.id))
        .all()
      if (links.length > 0) {
        db.insert(schema.specialMusicPerformers)
          .values(
            links.map((l) => ({
              specialMusicId: inserted.id,
              personId: l.personId,
              ordering: l.ordering,
              displayFirstNameOnly: l.displayFirstNameOnly,
              displayName: l.displayName,
            })),
          )
          .run()
      }
      copied += 1
    }

    res.status(201).json({...newEnv, cellsCopied: copied, cellsSkipped: skippedExisting})
  }),
)

function dayDelta(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T12:00:00').getTime()
  const b = new Date(toIso + 'T12:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + deltaDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function firstSundayOnOrAfter(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Special Music body: cells in scope ─────────────────────────────────
// Returns the special_music rows that the schedule's date range
// (Sundays only, AM + PM) is a view over, decorated with performers and
// each performer's "weeks since last special_music" hint.

schedulesRouter.get(
  '/:id/cells',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const schedule = db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get()
    if (!schedule) {
      res.status(404).json({error: 'Schedule not found'})
      return
    }
    if (schedule.scheduleType !== 'special_music' || !schedule.scopeStart || !schedule.scopeEnd) {
      res.status(400).json({error: 'Schedule is not a special_music date-range schedule'})
      return
    }

    const rows = db
      .select()
      .from(schema.specialMusic)
      .where(
        and(
          between(schema.specialMusic.date, schedule.scopeStart, schedule.scopeEnd),
          inArray(schema.specialMusic.serviceTimeId, specialMusicServiceTimeIds()),
        ),
      )
      .orderBy(asc(schema.specialMusic.date), asc(schema.specialMusic.serviceTimeId))
      .all()

    // Performers joined to people
    const ids = rows.map((r) => r.id)
    const performerRows =
      ids.length > 0
        ? db
            .select({
              specialMusicId: schema.specialMusicPerformers.specialMusicId,
              personId: schema.specialMusicPerformers.personId,
              ordering: schema.specialMusicPerformers.ordering,
              firstName: schema.people.firstName,
              lastName: schema.people.lastName,
              personDisplayFirstNameOnly: schema.people.displayFirstNameOnly,
              cellDisplayFirstNameOnly: schema.specialMusicPerformers.displayFirstNameOnly,
              displayName: schema.specialMusicPerformers.displayName,
            })
            .from(schema.specialMusicPerformers)
            .innerJoin(schema.people, eq(schema.specialMusicPerformers.personId, schema.people.id))
            .where(inArray(schema.specialMusicPerformers.specialMusicId, ids))
            .orderBy(asc(schema.specialMusicPerformers.specialMusicId), asc(schema.specialMusicPerformers.ordering))
            .all()
        : []
    const perfBySpecial = new Map<number, typeof performerRows>()
    for (const p of performerRows) {
      const list = perfBySpecial.get(p.specialMusicId) ?? []
      list.push(p)
      perfBySpecial.set(p.specialMusicId, list)
    }

    // "Last sang" hint per person: most-recent special_music.date strictly
    // before the schedule's scope_start. Computed once across all unique
    // performer person ids referenced by the schedule's cells.
    const personIds = [...new Set(performerRows.map((p) => p.personId))]
    const lastSangByPerson = new Map<number, string>()
    if (personIds.length > 0) {
      const lastRows = db
        .select({
          personId: schema.specialMusicPerformers.personId,
          lastDate: sql<string>`MAX(${schema.specialMusic.date})`,
        })
        .from(schema.specialMusicPerformers)
        .innerJoin(schema.specialMusic, eq(schema.specialMusicPerformers.specialMusicId, schema.specialMusic.id))
        .where(
          and(
            inArray(schema.specialMusicPerformers.personId, personIds),
            lt(schema.specialMusic.date, schedule.scopeStart),
          ),
        )
        .groupBy(schema.specialMusicPerformers.personId)
        .all()
      for (const r of lastRows) {
        if (r.lastDate) lastSangByPerson.set(r.personId, r.lastDate)
      }
    }

    const decorated = rows.map((r) => {
      const performers = (perfBySpecial.get(r.id) ?? []).map((p) => ({
        personId: p.personId,
        ordering: p.ordering,
        firstName: p.firstName,
        lastName: p.lastName,
        // Effective render flag: cell override wins over person default.
        displayFirstNameOnly: p.cellDisplayFirstNameOnly ?? p.personDisplayFirstNameOnly ?? false,
        cellOverride: p.cellDisplayFirstNameOnly,
        personDefault: p.personDisplayFirstNameOnly,
        displayName: p.displayName,
        lastSangDate: lastSangByPerson.get(p.personId) ?? null,
      }))
      return {
        ...r,
        guestPerformers: parseGuests(r.guestPerformers),
        performers,
      }
    })

    // Advisory only — derived live, never stored, never exported.
    // See docs/adr/0026.
    res.json({schedule, cells: decorated, doubleBookings: findForSpecialMusic(ids)})
  }),
)

function parseGuests(raw: string): string[] {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// ── Generic Send-Image ──────────────────────────────────────────────────
// Accepts a base64 JPEG image + recipient person ids; sends via Messages
// (AppleScript clipboard-paste UI automation). Generic across schedule
// types — replaces /api/nursery/send-image for new callers.

schedulesRouter.post(
  '/send-image',
  asyncHandler(async (req, res) => {
    const {imageData, recipientIds, caption} = req.body as {
      imageData: string
      recipientIds: number[]
      caption?: string
    }

    if (!imageData || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      res.status(400).json({error: 'imageData and recipientIds are required'})
      return
    }

    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    const tmpPath = path.join(os.tmpdir(), `flock-schedule-${Date.now()}.jpg`)
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'))

    const recipients = db
      .select({id: schema.people.id, firstName: schema.people.firstName, phoneNumber: schema.people.phoneNumber})
      .from(schema.people)
      .where(inArray(schema.people.id, recipientIds))
      .all()

    const results: {id: number; name: string; success: boolean; error?: string}[] = []

    try {
      for (const r of recipients) {
        if (!r.phoneNumber) {
          results.push({id: r.id, name: r.firstName || 'Unknown', success: false, error: 'No phone number'})
          continue
        }
        try {
          await sendImageViaUI(r.phoneNumber, tmpPath, caption)
          results.push({id: r.id, name: r.firstName || 'Unknown', success: true})
        } catch (err) {
          console.error(`[schedules/send-image] send to ${r.phoneNumber} failed:`, err)
          Sentry.captureException(err, {tags: {source: 'schedules-send-image'}})
          const cause = err instanceof Error ? (err.cause as unknown) : undefined
          const message =
            err instanceof Error && err.message
              ? err.message
              : typeof err === 'string' && err
                ? err
                : 'Send failed (no error message)'
          const causeMessage = cause instanceof Error ? cause.message : ''
          results.push({
            id: r.id,
            name: r.firstName || 'Unknown',
            success: false,
            error: causeMessage ? `${message} (${causeMessage})` : message,
          })
        }
      }
    } finally {
      try {
        fs.unlinkSync(tmpPath)
      } catch {
        // ignore cleanup
      }
    }

    res.json({results})
  }),
)
