import * as Sentry from '@sentry/node'
import {and, asc, between, desc, eq, inArray, lt, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'
import {uploadPath, uploadUrl} from '../lib/uploads.js'
import {sendImageViaUI} from '../services/applescript.js'

export const schedulesRouter = Router()

const LOGOS_DIR = uploadPath('schedule-logos')

// ── Settings ────────────────────────────────────────────────────────────
// Cross-cutting settings for every Schedule type (logo) plus per-type
// defaults (titlePrefix, footerBlocks, singerGroupIds for special music).

export interface FooterBlock {
  kind: 'quote' | 'note' | 'spacer'
  text: string
  bold?: boolean
}

interface SchedulesSettings {
  logoPath: string | null
  nursery: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
  }
  specialMusic: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
    singerGroupIds: number[]
  }
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
    nursery: {
      titlePrefix: map.get('schedules.nursery.titlePrefix') ?? 'Nursery Schedule',
      footerBlocks: parseJson<FooterBlock[]>('schedules.nursery.footerBlocks', []),
    },
    specialMusic: {
      titlePrefix: map.get('schedules.specialMusic.titlePrefix') ?? 'CBC Special Music Schedule',
      footerBlocks: parseJson<FooterBlock[]>('schedules.specialMusic.footerBlocks', []),
      singerGroupIds: parseJson<number[]>('schedules.specialMusic.singerGroupIds', []),
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
    }>
    if (body.nursery?.titlePrefix !== undefined) upsert('schedules.nursery.titlePrefix', body.nursery.titlePrefix)
    if (body.nursery?.footerBlocks !== undefined)
      upsert('schedules.nursery.footerBlocks', JSON.stringify(body.nursery.footerBlocks))
    if (body.specialMusic?.titlePrefix !== undefined)
      upsert('schedules.specialMusic.titlePrefix', body.specialMusic.titlePrefix)
    if (body.specialMusic?.footerBlocks !== undefined)
      upsert('schedules.specialMusic.footerBlocks', JSON.stringify(body.specialMusic.footerBlocks))
    if (body.specialMusic?.singerGroupIds !== undefined)
      upsert('schedules.specialMusic.singerGroupIds', JSON.stringify(body.specialMusic.singerGroupIds))
    res.json(readSettings())
  }),
)

schedulesRouter.post(
  '/settings/logo',
  asyncHandler(async (req, res) => {
    const {imageData} = req.body as {imageData: string}
    if (!imageData) {
      res.status(400).json({error: 'Image data is required'})
      return
    }

    if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, {recursive: true})

    const filename = `logo-${Date.now()}.png`
    const filePath = path.join(LOGOS_DIR, filename)
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    const logoPath = uploadUrl('schedule-logos', filename)

    const old = db.select().from(schema.settings).where(eq(schema.settings.key, 'schedulesLogoPath')).get()
    if (old) {
      const oldFull = path.join(LOGOS_DIR, path.basename(old.value))
      if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull)
    }
    upsert('schedulesLogoPath', logoPath)
    res.json({logoPath})
  }),
)

// ── Envelope CRUD (any type) ───────────────────────────────────────────

schedulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const where = type === 'nursery' || type === 'special_music' ? eq(schema.schedules.scheduleType, type) : undefined
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
          inArray(schema.specialMusic.serviceType, ['sunday_am', 'sunday_pm']),
        ),
      )
      .orderBy(asc(schema.specialMusic.date), asc(schema.specialMusic.serviceType))
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
        lastSangDate: lastSangByPerson.get(p.personId) ?? null,
      }))
      return {
        ...r,
        guestPerformers: parseGuests(r.guestPerformers),
        performers,
      }
    })

    res.json({schedule, cells: decorated})
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
