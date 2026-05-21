import * as Sentry from '@sentry/node'
import {eq, inArray} from 'drizzle-orm'
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
