import * as Sentry from '@sentry/node'
import {and, desc, eq, gte, inArray, lte, sql} from 'drizzle-orm'
import {mkdir, writeFile} from 'node:fs/promises'

import {db, schema} from '../../db/index.js'
import type {EventsStoryRunStatus} from '../../db/schema-events-story.js'
import {type ConnectionCheck, checkConnection, withMcpClient} from '../../lib/mcp-client/client.js'
import {findKey, toolJson} from '../../lib/mcp-client/tool-result.js'
import {addDays, weekdayOf} from '../../lib/repeat-rules.js'
import {uploadPath, uploadUrl} from '../../lib/uploads.js'
import {
  DESIGN_ID,
  STORY_LINE_COUNT,
  type StoryLineFields,
  buildOperations,
  checkTitleBoxes,
  describeTitleProblems,
} from './canva-design.js'
import {fetchBestTimes} from './metricool.js'
import {SPAN_LOOKBACK_DAYS, type StoryCandidate, pickEvents} from './pick-events.js'
import {
  MAX_DAYS_AHEAD,
  type RankedHour,
  type ZonedNow,
  defaultPostDay,
  earliestMinute,
  fallbackHours,
  rankHours,
  zonedNow,
} from './post-time.js'
import {type StoryLineText, storyLineFor} from './story-lines.js'

// The Story Run workflow up to Awaiting Approval (approval/scheduling is built separately).
// Long steps run in the background; the UI polls the run row for progress.

export type RunRow = typeof schema.eventsStoryRuns.$inferSelect

export interface StoryLineInput extends StoryLineFields {
  eventIds: number[]
  date: string
  endDate: string | null
}

export interface Candidate extends StoryCandidate, StoryLineText {}

const OPEN_STATUSES: EventsStoryRunStatus[] = ['drafting', 'awaiting_approval', 'scheduling']
const PREVIEW_DIR = 'events-story'

// ---------- picker data ----------

export function loadCandidates(fromDate: string): Candidate[] {
  const rows = db
    .select({
      id: schema.calendarPrintEvents.id,
      date: schema.calendarPrintEvents.date,
      title: schema.calendarPrintEvents.title,
      sortOrder: schema.calendarPrintEvents.sortOrder,
    })
    .from(schema.calendarPrintEvents)
    .where(
      and(
        gte(schema.calendarPrintEvents.date, addDays(fromDate, -SPAN_LOOKBACK_DAYS)),
        lte(schema.calendarPrintEvents.date, addDays(fromDate, 180)),
      ),
    )
    .all()
  return pickEvents(rows, fromDate).map((c) => ({...c, ...storyLineFor(c.date, c.endDate, c.title)}))
}

// Ranked post hours for a day: Metricool's Facebook + Instagram scores, or 10 am if unavailable.
export async function hoursFor(
  date: string,
  now: ZonedNow,
): Promise<{hours: RankedHour[]; source: 'metricool' | 'fallback'}> {
  const earliest = earliestMinute(date, now)
  try {
    const ranked = rankHours(await fetchBestTimes(date), earliest)
    if (ranked.length > 0) return {hours: ranked, source: 'metricool'}
  } catch (error) {
    console.warn(`[events-story] best times for ${date} unavailable:`, error instanceof Error ? error.message : error)
  }
  return {hours: fallbackHours(earliest), source: 'fallback'}
}

export async function resolveDefaultDay(now: ZonedNow): Promise<string> {
  // Pre-fetch the (at most three) Mon–Wed days defaultPostDay may consider, then decide synchronously.
  const good = new Map<string, boolean>()
  for (let d = now.date, i = 0; i < 3; i++, d = addDays(d, 1)) {
    const w = weekdayOf(d)
    if (w === 0 || w >= 4) break
    good.set(d, (await hoursFor(d, now)).hours.length > 0)
  }
  return defaultPostDay(now, (date) => good.get(date) ?? true)
}

export interface PrepareResult {
  connections: Record<'canva' | 'metricool', ConnectionCheck>
  ready: boolean
  today: string
  maxDate: string
  postDate: string
  hours: RankedHour[]
  hoursSource: 'metricool' | 'fallback'
  candidates: Candidate[]
  openRun: RunRow | null
  scheduledThatWeek: RunRow[]
}

// Everything the New Story screen needs. Connections are checked first (Decision 5); when either
// fails the rest is skipped and the picker stays locked.
export async function prepareRun(date?: string): Promise<PrepareResult> {
  const now = zonedNow(new Date())
  const [canva, metricool] = await Promise.all([checkConnection('canva'), checkConnection('metricool')])
  const ready = canva.ok && metricool.ok
  const base = {
    connections: {canva, metricool},
    ready,
    today: now.date,
    maxDate: addDays(now.date, MAX_DAYS_AHEAD),
    openRun: findOpenRun() ?? null,
  }
  if (!ready) {
    return {...base, postDate: now.date, hours: [], hoursSource: 'fallback', candidates: [], scheduledThatWeek: []}
  }
  const postDate = date ?? (await resolveDefaultDay(now))
  const {hours, source} = await hoursFor(postDate, now)
  return {
    ...base,
    postDate,
    hours,
    hoursSource: source,
    candidates: loadCandidates(postDate),
    scheduledThatWeek: scheduledInWeekOf(postDate),
  }
}

// ---------- run rows ----------

export function getRun(id: number): RunRow | undefined {
  return db.select().from(schema.eventsStoryRuns).where(eq(schema.eventsStoryRuns.id, id)).get()
}

export function listRuns(limit = 30): RunRow[] {
  return db.select().from(schema.eventsStoryRuns).orderBy(desc(schema.eventsStoryRuns.id)).limit(limit).all()
}

export function findOpenRun(): RunRow | undefined {
  return db
    .select()
    .from(schema.eventsStoryRuns)
    .where(inArray(schema.eventsStoryRuns.status, OPEN_STATUSES))
    .orderBy(desc(schema.eventsStoryRuns.id))
    .get()
}

// Scheduled runs in the Mon–Sun week holding `date` (Decision 18: warn on a second one).
export function scheduledInWeekOf(date: string): RunRow[] {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7))
  return db
    .select()
    .from(schema.eventsStoryRuns)
    .where(
      and(
        eq(schema.eventsStoryRuns.status, 'scheduled'),
        gte(schema.eventsStoryRuns.postDate, monday),
        lte(schema.eventsStoryRuns.postDate, addDays(monday, 6)),
      ),
    )
    .all()
}

function update(id: number, fields: Partial<RunRow>): void {
  db.update(schema.eventsStoryRuns)
    .set({...fields, updatedAt: sql`datetime('now')`})
    .where(eq(schema.eventsStoryRuns.id, id))
    .run()
}

function progress(id: number, progressPct: number, progressMessage: string): void {
  update(id, {progressPct, progressMessage})
}

export function runLines(run: RunRow): StoryLineInput[] {
  return JSON.parse(run.linesJson) as StoryLineInput[]
}

export class RunInputError extends Error {}

function validateLines(lines: unknown): StoryLineInput[] {
  if (!Array.isArray(lines) || lines.length !== STORY_LINE_COUNT) {
    throw new RunInputError(`Choose exactly ${STORY_LINE_COUNT} events`)
  }
  return lines.map((l, i) => {
    const line = l as Partial<StoryLineInput>
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const out: StoryLineInput = {
      eventIds: Array.isArray(line.eventIds) ? line.eventIds.filter(Number.isInteger) : [],
      date: text(line.date),
      endDate: line.endDate ? text(line.endDate) : null,
      dayNumber: text(line.dayNumber),
      month: text(line.month),
      dayTimeLine: text(line.dayTimeLine),
      line1: text(line.line1),
      line2: text(line.line2) || null,
    }
    if (!out.dayNumber || !out.month || !out.dayTimeLine || !out.line1) {
      throw new RunInputError(`Story Line ${i + 1} is missing its day, month, day/time line or title`)
    }
    return out
  })
}

// ---------- drafting ----------

export function createRun(input: {postDate: unknown; postMinute: unknown; lines: unknown}): RunRow {
  const lines = validateLines(input.lines)
  const postDate = typeof input.postDate === 'string' ? input.postDate : ''
  const postMinute = Number(input.postMinute)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postDate)) throw new RunInputError('Pick a post date')
  if (!Number.isInteger(postMinute) || postMinute < 0 || postMinute >= 24 * 60)
    throw new RunInputError('Pick a post time')
  const open = findOpenRun()
  if (open) throw new RunInputError(`Story Run #${open.id} is still open — resume or discard it first`)

  const run = db
    .insert(schema.eventsStoryRuns)
    .values({
      status: 'drafting',
      postDate,
      postMinute,
      linesJson: JSON.stringify(lines),
      progressPct: 0,
      progressMessage: 'Starting…',
    })
    .returning()
    .get()
  void draftRun(run.id)
  return run
}

async function downloadPreview(runId: number, url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't download the Canva preview (${res.status})`)
  const file = `run-${runId}-preview-${Date.now()}.png`
  await mkdir(uploadPath(PREVIEW_DIR), {recursive: true})
  await writeFile(uploadPath(PREVIEW_DIR, file), Buffer.from(await res.arrayBuffer()))
  return uploadUrl(PREVIEW_DIR, file)
}

async function draftRun(id: number): Promise<void> {
  const run = getRun(id)
  if (!run) return
  let transactionId: string | undefined
  try {
    const lines = runLines(run)
    progress(id, 10, 'Opening the Canva design…')
    await withMcpClient('canva', async (client) => {
      const started = toolJson(
        await client.callTool({
          name: 'start-editing-transaction',
          arguments: {design_id: DESIGN_ID, user_intent: 'Central Flock: draft the weekly Events Story'},
        }),
      )
      transactionId = findKey<string>(started, 'transaction_id')
      if (!transactionId) throw new Error('Canva did not return an editing transaction')
      update(id, {canvaTransactionId: transactionId})

      const problem = describeTitleProblems(checkTitleBoxes(started))
      if (problem) throw new Error(problem)

      progress(id, 35, 'Updating Story Lines…')
      toolJson(
        await client.callTool({
          name: 'perform-editing-operations',
          arguments: {
            transaction_id: transactionId,
            page_index: 1,
            operations: buildOperations(lines),
            user_intent: 'Central Flock: fill the five Story Lines',
          },
        }),
      )

      progress(id, 70, 'Rendering preview…')
      const thumb = toolJson(
        await client.callTool({
          name: 'get-design-thumbnail',
          arguments: {transaction_id: transactionId, page_index: 1, user_intent: 'Central Flock: preview the draft'},
        }),
      )
      const url = findKey<string>(thumb, 'url') ?? findKey<string>(thumb, 'thumbnail_url')
      if (!url) throw new Error('Canva did not return a preview image')
      progress(id, 90, 'Saving preview…')
      const previewPath = await downloadPreview(id, url)
      update(id, {status: 'awaiting_approval', previewPath, progressPct: 100, progressMessage: 'Ready for approval'})
    })
  } catch (error) {
    Sentry.captureException(error)
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[events-story] run ${id} draft failed:`, error)
    if (transactionId) await cancelTransaction(transactionId)
    update(id, {status: 'failed', failedStep: 'draft', error: message, canvaTransactionId: null, progressMessage: null})
  }
}

async function cancelTransaction(transactionId: string): Promise<void> {
  try {
    await withMcpClient('canva', (client) =>
      client.callTool({
        name: 'cancel-editing-transaction',
        arguments: {transaction_id: transactionId, user_intent: 'Central Flock: discard the Events Story draft'},
      }),
    )
  } catch (error) {
    // Already expired or closed — nothing left to discard.
    console.warn('[events-story] cancel transaction failed:', error instanceof Error ? error.message : error)
  }
}

export async function discardRun(id: number): Promise<RunRow> {
  const run = getRun(id)
  if (!run) throw new RunInputError('Story Run not found')
  if (run.status === 'scheduling' || run.status === 'scheduled' || run.status === 'drafting') {
    throw new RunInputError(`A ${run.status.replace('_', ' ')} Story Run can't be discarded`)
  }
  if (run.canvaTransactionId) await cancelTransaction(run.canvaTransactionId)
  update(id, {status: 'discarded', canvaTransactionId: null, progressMessage: null})
  return getRun(id)!
}

// Re-drafts a failed or awaiting run with the same lines (e.g. after a Canva transaction expired).
export function redraftRun(id: number): RunRow {
  const run = getRun(id)
  if (!run) throw new RunInputError('Story Run not found')
  if (run.status !== 'failed' && run.status !== 'awaiting_approval') {
    throw new RunInputError(`A ${run.status.replace('_', ' ')} Story Run can't be redrafted`)
  }
  update(id, {status: 'drafting', failedStep: null, error: null, progressPct: 0, progressMessage: 'Starting…'})
  const stale = run.canvaTransactionId
  void (async () => {
    if (stale) await cancelTransaction(stale)
    await draftRun(id)
  })()
  return getRun(id)!
}

// A restart mid-step leaves a run 'drafting'/'scheduling' forever; mark it failed so it can be retried.
export function recoverInterruptedRuns(): number {
  const result = db
    .update(schema.eventsStoryRuns)
    .set({
      status: 'failed',
      failedStep: sql`CASE status WHEN 'drafting' THEN 'draft' ELSE coalesce(failed_step, 'commit') END`,
      error: 'Interrupted by a server restart',
      progressMessage: null,
      updatedAt: sql`datetime('now')`,
    })
    .where(inArray(schema.eventsStoryRuns.status, ['drafting', 'scheduling']))
    .run()
  return result.changes
}
