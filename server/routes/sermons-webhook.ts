import * as Sentry from '@sentry/node'
import {and, eq, isNull, sql} from 'drizzle-orm'
import {Router} from 'express'

import {db, schema} from '../db/index.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'
import {sendNotifyMeTextWithFallback} from '../services/notify-me.js'
import {normalizeTranscript} from '../services/sermon-social.js'
import {runGeneration} from './sermons.js'

// Hand-off from the sermon pipeline (~/repos/cgen/sermon-pipeline) via cgen-api: a Recording's
// transcript becomes a Sermon. Never replaces an existing Sermon — a re-run must not wipe curated
// Social Quotes or Favorites (the pipeline's CONTEXT.md, "Hand-off").
export const sermonsWebhookRouter = Router()

// Recording Name service codes → Service Time ids. Ids, not names: a Service Time can be renamed
// (docs/adr/0025). Weekdays are enforced by the pipeline before transcription.
const SERVICE_CODES: Record<string, {serviceTimeId: number; label: string}> = {
  sunam: {serviceTimeId: 2, label: 'Sun AM'},
  sunpm: {serviceTimeId: 3, label: 'Sun PM'},
  wedpm: {serviceTimeId: 4, label: 'Wed PM'},
}

// A Recording with no Speaker Key was preached by the contact whose first name is "Preacher".
const DEFAULT_SPEAKER_KEY = 'preacher'

const PUBLIC_URL = process.env.CENTRAL_FLOCK_PUBLIC_URL ?? 'https://flock.cgen.cc'

// Speaker Key = a preacher's first name, lower-cased. Adding a guest evangelist to Contacts with
// isPreacher set makes his key work with no other change. A first name shared by two preachers
// is ambiguous and is never guessed.
function speakerKeyMap(): Map<string, number[]> {
  const rows = db
    .select({id: schema.people.id, firstName: schema.people.firstName})
    .from(schema.people)
    .where(eq(schema.people.isPreacher, true))
    .all()
  const map = new Map<string, number[]>()
  for (const row of rows) {
    const key = row.firstName?.trim().toLowerCase()
    if (!key || !/^[a-z]+$/.test(key)) continue
    map.set(key, [...(map.get(key) ?? []), row.id])
  }
  return map
}

function sermonLabel(serviceTimeId: number, serviceTimeName: string, sermonDate: string): string {
  const short = Object.values(SERVICE_CODES).find((s) => s.serviceTimeId === serviceTimeId)?.label
  const [, m, d] = sermonDate.split('-').map(Number)
  return `${short ?? serviceTimeName} ${m}/${d}`
}

/** Generate a Sermon's social content and send the Outcome Text either way. Never throws. */
async function generateAndNotify(sermonId: number, transcript: string, label: string): Promise<void> {
  try {
    await runGeneration(sermonId, transcript)
    const sermon = db
      .select({bigIdea: schema.sermons.bigIdea})
      .from(schema.sermons)
      .where(eq(schema.sermons.id, sermonId))
      .get()
    const [{quotes}] = db
      .select({quotes: sql<number>`count(*)`})
      .from(schema.sermonSocialQuotes)
      .where(eq(schema.sermonSocialQuotes.sermonId, sermonId))
      .all()
    const [{reflections}] = db
      .select({reflections: sql<number>`count(*)`})
      .from(schema.sermonReflections)
      .where(eq(schema.sermonReflections.sermonId, sermonId))
      .all()
    const lines = [`✅ ${label} sermon ready — ${quotes} quotes, ${reflections} reflections`]
    if (sermon?.bigIdea) lines.push(`Big Idea: ${sermon.bigIdea}`)
    lines.push(`${PUBLIC_URL}/sermons/social/${sermonId}`)
    await sendNotifyMeTextWithFallback(lines.join('\n'))
  } catch (err) {
    Sentry.captureException(err, {tags: {source: 'sermons-webhook-generate'}, extra: {sermonId}})
    console.error(`[sermons-webhook] generation failed for sermon ${sermonId}:`, err)
    const reason = err instanceof Error ? err.message : String(err)
    await sendNotifyMeTextWithFallback(
      `⚠️ ${label} transcript saved, but generation failed: ${reason.slice(0, 200)} — regenerate it in Central Flock.\n${PUBLIC_URL}/sermons/social/${sermonId}`,
    )
  }
}

// GET /webhooks/sermons/speaker-keys — lets the pipeline reject an unknown key before transcribing
sermonsWebhookRouter.get(
  '/speaker-keys',
  asyncHandler(async (_req, res) => {
    const keys = [...speakerKeyMap().entries()].filter(([, ids]) => ids.length === 1).map(([key]) => key)
    res.json({keys: keys.sort(), defaultKey: DEFAULT_SPEAKER_KEY})
  }),
)

// POST /webhooks/sermons — create the Sermon, answer 202, generate in the background
sermonsWebhookRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {serviceCode, date, speakerKey, transcript, sourceFile} = req.body as {
      serviceCode?: string
      date?: string
      speakerKey?: string | null
      transcript?: string
      sourceFile?: string
    }

    const service = serviceCode ? SERVICE_CODES[serviceCode] : undefined
    if (!service) return void res.status(400).json({error: `unknown serviceCode "${serviceCode}"`})
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return void res.status(400).json({error: 'date must be YYYY-MM-DD'})
    if (!transcript?.trim()) return void res.status(400).json({error: 'transcript is required'})

    const key = (speakerKey || DEFAULT_SPEAKER_KEY).toLowerCase()
    const speakerIds = speakerKeyMap().get(key) ?? []
    if (speakerIds.length !== 1) {
      const why = speakerIds.length === 0 ? 'no preacher has that first name' : 'more than one preacher has it'
      return void res.status(422).json({error: `speaker key "${key}" doesn't resolve: ${why}`})
    }

    const existing = db
      .select({id: schema.sermons.id})
      .from(schema.sermons)
      .where(and(eq(schema.sermons.serviceTimeId, service.serviceTimeId), eq(schema.sermons.sermonDate, date)))
      .get()
    if (existing)
      return void res.status(409).json({error: 'a sermon already exists for that service and date', id: existing.id})

    const normalized = normalizeTranscript(transcript)
    let sermonId: number
    try {
      sermonId = db
        .insert(schema.sermons)
        .values({
          serviceTimeId: service.serviceTimeId,
          sermonDate: date,
          speakerPersonId: speakerIds[0],
          transcript: normalized,
        })
        .returning({id: schema.sermons.id})
        .get()!.id
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return void res.status(409).json({error: 'a sermon already exists for that service and date'})
      }
      throw error
    }

    console.log(`[sermons-webhook] created sermon ${sermonId} from ${sourceFile ?? 'unknown file'}`)
    res.status(202).json({id: sermonId})

    const [, m, d] = date.split('-').map(Number)
    void generateAndNotify(sermonId, normalized, `${service.label} ${m}/${d}`)
  }),
)

/**
 * Boot recovery: a restart mid-generation leaves a Sermon with no generated content and nobody told.
 * Re-run generation for recent ungenerated Sermons — safe, since nothing has been curated yet. The
 * two-day window keeps an old, permanently failing Sermon from re-running on every restart.
 */
export async function recoverUngeneratedSermons(): Promise<void> {
  const rows = db
    .select({
      id: schema.sermons.id,
      transcript: schema.sermons.transcript,
      serviceTimeId: schema.sermons.serviceTimeId,
      serviceTimeName: schema.serviceTimes.name,
      sermonDate: schema.sermons.sermonDate,
    })
    .from(schema.sermons)
    .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.sermons.serviceTimeId))
    .where(and(isNull(schema.sermons.generatedAt), sql`${schema.sermons.createdAt} >= datetime('now', '-2 days')`))
    .all()

  for (const row of rows) {
    console.log(`[sermons-webhook] recovering ungenerated sermon ${row.id}`)
    await generateAndNotify(row.id, row.transcript, sermonLabel(row.serviceTimeId, row.serviceTimeName, row.sermonDate))
  }
}
