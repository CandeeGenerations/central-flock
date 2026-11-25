import * as Sentry from '@sentry/node'
import {and, count, desc, eq, gte, inArray, lte, notInArray, sql} from 'drizzle-orm'
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
  altText,
  buildOperations,
  checkTitleBoxes,
  describeTitleProblems,
} from './canva-design.js'
import {fetchBestTimes, scheduleStory} from './metricool.js'
import {SPAN_LOOKBACK_DAYS, type StoryCandidate, pickEvents} from './pick-events.js'
import {
  type HourScores,
  MAX_DAYS_AHEAD,
  type RankedHour,
  type ZonedNow,
  defaultDayInWeek,
  defaultPostDay,
  earliestMinute,
  fallbackHours,
  mondayOf,
  rankHours,
  storyWeeks,
  suggestedWeek,
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

const OPEN_STATUSES: EventsStoryRunStatus[] = ['editing', 'drafting', 'awaiting_approval', 'scheduling', 'failed']
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

// ---------- caches ----------
// The New Story screen is reopened often (a refresh, an iPad waking up, another device), and each
// open used to re-ask Canva and Metricool. Best times are historical averages and a working
// Connection stays working, so both are kept in memory for a while. Failures are never cached.

const BEST_TIMES_TTL_MS = 6 * 60 * 60_000
const CONNECTION_TTL_MS = 30 * 60_000

const bestTimesCache = new Map<string, {at: number; value: Promise<HourScores[]>}>()
const connectionCache = new Map<'canva' | 'metricool', {at: number; value: Promise<ConnectionCheck>}>()

function cachedBestTimes(date: string): Promise<HourScores[]> {
  const hit = bestTimesCache.get(date)
  if (hit && Date.now() - hit.at < BEST_TIMES_TTL_MS) return hit.value
  const value = fetchBestTimes(date)
  bestTimesCache.set(date, {at: Date.now(), value})
  value.catch(() => bestTimesCache.delete(date))
  return value
}

function cachedConnection(provider: 'canva' | 'metricool', fresh: boolean): Promise<ConnectionCheck> {
  const hit = connectionCache.get(provider)
  if (!fresh && hit && Date.now() - hit.at < CONNECTION_TTL_MS) return hit.value
  const value = checkConnection(provider)
  connectionCache.set(provider, {at: Date.now(), value})
  void value.then((c) => {
    if (!c.ok) connectionCache.delete(provider)
  })
  return value
}

// Ranked post hours for a day: Metricool's Facebook + Instagram scores, or 10 am if unavailable.
export async function hoursFor(
  date: string,
  now: ZonedNow,
): Promise<{hours: RankedHour[]; source: 'metricool' | 'fallback'}> {
  const earliest = earliestMinute(date, now)
  try {
    const ranked = rankHours(await cachedBestTimes(date), earliest)
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

// Week picker: no Canva or Metricool calls, just the calendar and the scheduled Stories.
export interface StoryWeek {
  monday: string
  sunday: string
  scheduled: RunRow[]
}

export function listStoryWeeks(): {today: string; maxDate: string; suggested: string; weeks: StoryWeek[]} {
  const now = zonedNow(new Date())
  return {
    today: now.date,
    maxDate: addDays(now.date, MAX_DAYS_AHEAD),
    suggested: suggestedWeek(now),
    weeks: storyWeeks(now).map((monday) => ({
      monday,
      sunday: addDays(monday, 6),
      scheduled: scheduledInWeekOf(monday),
    })),
  }
}

// Default post day within a chosen week. Only today can run out of good hours (any later day
// has at least the 10 am fallback), so at most one best-times lookup.
async function resolveDayInWeek(monday: string, now: ZonedNow): Promise<string> {
  const todayHasHour = mondayOf(now.date) === monday ? (await hoursFor(now.date, now)).hours.length > 0 : true
  const day = defaultDayInWeek(monday, now, (date) => date !== now.date || todayHasHour)
  if (!day) throw new RunInputError('That week has already passed — pick another')
  return day
}

export interface PrepareOptions {
  // An exact post day (resuming a saved run), or a week (its Monday) to pick the day within.
  date?: string
  week?: string
  // Re-check the Connections instead of trusting a recent check ("Check again").
  fresh?: boolean
}

// Everything the New Story screen needs. Connections are checked first (Decision 5); when either
// fails the rest is skipped and the picker stays locked.
export async function prepareRun({date, week, fresh = false}: PrepareOptions = {}): Promise<PrepareResult> {
  const now = zonedNow(new Date())
  const [canva, metricool] = await Promise.all([cachedConnection('canva', fresh), cachedConnection('metricool', fresh)])
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
  const postDate = date ?? (week ? await resolveDayInWeek(mondayOf(week), now) : await resolveDefaultDay(now))
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

// Past Stories: every run that is neither open (it has its own card) nor discarded — in practice
// the scheduled ones — latest post date first.
export function listPastRuns(page: number, pageSize: number): {runs: RunRow[]; total: number} {
  const where = notInArray(schema.eventsStoryRuns.status, [...OPEN_STATUSES, 'discarded'])
  const total = db.select({n: count()}).from(schema.eventsStoryRuns).where(where).get()?.n ?? 0
  const runs = db
    .select()
    .from(schema.eventsStoryRuns)
    .where(where)
    .orderBy(desc(schema.eventsStoryRuns.postDate), desc(schema.eventsStoryRuns.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
  return {runs, total}
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

function normalizeLine(l: unknown): StoryLineInput {
  const line = (l ?? {}) as Partial<StoryLineInput>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return {
    eventIds: Array.isArray(line.eventIds) ? line.eventIds.filter(Number.isInteger) : [],
    date: text(line.date),
    endDate: line.endDate ? text(line.endDate) : null,
    dayNumber: text(line.dayNumber),
    month: text(line.month),
    dayTimeLine: text(line.dayTimeLine),
    line1: text(line.line1),
    line2: text(line.line2) || null,
  }
}

// While editing: any 0–5 lines, saved as they are.
function editingLines(lines: unknown): StoryLineInput[] {
  if (!Array.isArray(lines)) return []
  return lines.slice(0, STORY_LINE_COUNT).map(normalizeLine)
}

// Before drafting: exactly five, each complete.
function validateLines(lines: unknown): StoryLineInput[] {
  if (!Array.isArray(lines) || lines.length !== STORY_LINE_COUNT) {
    throw new RunInputError(`Choose exactly ${STORY_LINE_COUNT} events`)
  }
  return lines.map((l, i) => {
    const out = normalizeLine(l)
    if (!out.dayNumber || !out.month || !out.dayTimeLine || !out.line1) {
      throw new RunInputError(`Story Line ${i + 1} is missing its day, month, day/time line or title`)
    }
    return out
  })
}

interface PostTimeInput {
  postDate?: unknown
  postMinute?: unknown
}

function postTime(input: PostTimeInput): {postDate: string; postMinute: number} {
  const postDate = typeof input.postDate === 'string' ? input.postDate : ''
  const postMinute = Number(input.postMinute)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postDate)) throw new RunInputError('Pick a post date')
  if (!Number.isInteger(postMinute) || postMinute < 0 || postMinute >= 24 * 60) {
    throw new RunInputError('Pick a post time')
  }
  return {postDate, postMinute}
}

function requireRun(id: number, statuses: EventsStoryRunStatus[], action: string): RunRow {
  const run = getRun(id)
  if (!run) throw new RunInputError('Story Run not found')
  if (!statuses.includes(run.status)) {
    throw new RunInputError(`A ${run.status.replace('_', ' ')} Story Run can't be ${action}`)
  }
  return run
}

// ---------- editing (the picker) ----------

// Opens a Story Run in 'editing' the moment the picker has data, so every change can autosave.
export function startEditing(input: PostTimeInput & {lines?: unknown}): RunRow {
  const open = findOpenRun()
  if (open) throw new RunInputError(`Story Run #${open.id} is still open — resume or discard it first`)
  return db
    .insert(schema.eventsStoryRuns)
    .values({status: 'editing', ...postTime(input), linesJson: JSON.stringify(editingLines(input.lines))})
    .returning()
    .get()
}

export function saveEditing(id: number, input: PostTimeInput & {lines?: unknown}): RunRow {
  requireRun(id, ['editing'], 'edited')
  update(id, {...postTime(input), linesJson: JSON.stringify(editingLines(input.lines))})
  return getRun(id)!
}

// "Make draft": final save, then Canva.
export function draftFromEditing(id: number, input: PostTimeInput & {lines?: unknown}): RunRow {
  requireRun(id, ['editing'], 'drafted')
  const lines = validateLines(input.lines)
  update(id, {
    ...postTime(input),
    linesJson: JSON.stringify(lines),
    status: 'drafting',
    failedStep: null,
    error: null,
    progressPct: 0,
    progressMessage: 'Starting…',
  })
  void draftRun(id)
  return getRun(id)!
}

// Back to the picker from a draft: its Canva changes are discarded, its lines kept.
export async function reopenEditing(id: number): Promise<RunRow> {
  const run = requireRun(id, ['awaiting_approval', 'failed'], 'edited')
  if (run.failedStep && run.failedStep !== 'draft' && run.failedStep !== 'commit') {
    throw new RunInputError('This Story is already saved in Canva — retry scheduling instead')
  }
  if (run.canvaTransactionId) await cancelTransaction(run.canvaTransactionId)
  update(id, {
    status: 'editing',
    canvaTransactionId: null,
    previewPath: null,
    failedStep: null,
    error: null,
    progressMessage: null,
    progressPct: 0,
  })
  return getRun(id)!
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
      const opened = toolJson(
        await client.callTool({
          name: 'read-design',
          arguments: {
            design_id: DESIGN_ID,
            open_transaction: true,
            filter: {fields: ['design_content'], page_indices: [1]},
            user_intent: 'Central Flock: draft the weekly Events Story',
          },
        }),
      )
      transactionId = findKey<string>(opened, 'transaction_id')
      if (!transactionId) throw new Error('Canva did not return an editing transaction')
      update(id, {canvaTransactionId: transactionId})

      const problem = describeTitleProblems(checkTitleBoxes(opened))
      if (problem) throw new Error(problem)

      progress(id, 35, 'Updating Story Lines…')
      toolJson(
        await client.callTool({
          name: 'edit-design',
          arguments: {
            transaction_id: transactionId,
            page_index: 1,
            operations: buildOperations(lines),
            finalize: 'keep_open',
            user_intent: 'Central Flock: fill the five Story Lines',
          },
        }),
      )

      progress(id, 70, 'Rendering preview…')
      const thumb = toolJson(
        await client.callTool({
          name: 'read-design',
          arguments: {
            design_id: DESIGN_ID,
            transaction_id: transactionId,
            filter: {fields: ['thumbnails'], thumbnail_pages: [1]},
            user_intent: 'Central Flock: preview the draft',
          },
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
        name: 'edit-design',
        arguments: {
          transaction_id: transactionId,
          finalize: 'cancel',
          user_intent: 'Central Flock: discard the Events Story draft',
        },
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
  if (run.failedStep === 'export' || run.failedStep === 'schedule') {
    throw new RunInputError('This Story is already saved in Canva — retry scheduling instead')
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

// ---------- approval & scheduling ----------

export class LateApprovalError extends Error {
  constructor(readonly suggestion: {postDate: string; postMinute: number} | null) {
    super('The chosen post time has passed')
  }
}

// Approve: save the Canva draft, export the PNG, schedule the Story. If the chosen time is now
// too close (Decision 11) the caller gets a suggestion to confirm instead. `postDate`/`postMinute`
// let the client confirm a new time in the same call.
export async function approveRun(id: number, input: PostTimeInput): Promise<RunRow> {
  const run = requireRun(id, ['awaiting_approval'], 'approved')
  const time = input.postDate !== undefined ? postTime(input) : {postDate: run.postDate, postMinute: run.postMinute}
  const now = zonedNow(new Date())
  if (time.postMinute < earliestMinute(time.postDate, now)) {
    const today = await hoursFor(time.postDate, now)
    const next = today.hours[0]
      ? {postDate: time.postDate, postMinute: today.hours[0].hour * 60}
      : await nextGoodTime(addDays(time.postDate, 1), now)
    throw new LateApprovalError(next)
  }
  update(id, {
    ...time,
    status: 'scheduling',
    failedStep: null,
    error: null,
    progressPct: 0,
    progressMessage: 'Saving in Canva…',
  })
  void scheduleRun(id, 'commit')
  return getRun(id)!
}

async function nextGoodTime(from: string, now: ZonedNow): Promise<{postDate: string; postMinute: number} | null> {
  for (let i = 0, d = from; i < 7; i++, d = addDays(d, 1)) {
    const {hours} = await hoursFor(d, now)
    if (hours[0]) return {postDate: d, postMinute: hours[0].hour * 60}
  }
  return null
}

export function retryRun(id: number): RunRow {
  const run = requireRun(id, ['failed'], 'retried')
  if (run.failedStep === 'export' || run.failedStep === 'schedule') {
    // Already saved in Canva: export again (the previous export URL has expired) and schedule.
    update(id, {status: 'scheduling', error: null, progressPct: 0, progressMessage: 'Retrying…'})
    void scheduleRun(id, 'export')
    return getRun(id)!
  }
  return redraftRun(id)
}

type ScheduleStep = 'commit' | 'export' | 'schedule'

async function downloadExport(runId: number, url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't download the Canva export (${res.status})`)
  const file = `run-${runId}-story-${Date.now()}.png`
  await mkdir(uploadPath(PREVIEW_DIR), {recursive: true})
  await writeFile(uploadPath(PREVIEW_DIR, file), Buffer.from(await res.arrayBuffer()))
  return uploadUrl(PREVIEW_DIR, file)
}

async function scheduleRun(id: number, from: ScheduleStep): Promise<void> {
  let step: ScheduleStep = from
  // failedStep doubles as "step in progress" while scheduling, so a restart knows where it stopped.
  const enter = (s: ScheduleStep, pct: number, message: string) => {
    step = s
    update(id, {failedStep: s, progressPct: pct, progressMessage: message})
  }
  try {
    const run = getRun(id)!
    const lines = runLines(run)

    if (step === 'commit') {
      enter('commit', 10, 'Saving in Canva…')
      try {
        if (!run.canvaTransactionId) throw new Error('No open Canva draft')
        await withMcpClient('canva', async (client) =>
          toolJson(
            await client.callTool({
              name: 'edit-design',
              arguments: {
                transaction_id: run.canvaTransactionId,
                finalize: 'commit',
                user_intent: 'Central Flock: save the Events Story Tyler approved',
              },
            }),
          ),
        )
      } catch (error) {
        // Decision 17: the Canva draft expired (or was closed). Redraft the same lines and ask again —
        // never save something Tyler hasn't seen.
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[events-story] run ${id} commit failed, redrafting:`, message)
        update(id, {
          status: 'drafting',
          canvaTransactionId: null,
          failedStep: null,
          error: 'The Canva draft had expired, so it was redrafted. Check the new preview and approve again.',
          progressPct: 0,
          progressMessage: 'Redrafting…',
        })
        await draftRun(id) // keeps the note in `error` for the new preview
        return
      }
      update(id, {canvaTransactionId: null})
      step = 'export'
    }

    let imageUrl: string | undefined
    if (step === 'export' || step === 'schedule') {
      enter('export', 40, 'Exporting PNG…')
      const exported = await withMcpClient('canva', async (client) =>
        toolJson(
          await client.callTool({
            name: 'export-design',
            arguments: {
              design_id: DESIGN_ID,
              format: {type: 'png'},
              user_intent: 'Central Flock: export the approved Events Story',
            },
          }),
        ),
      )
      const status = findKey<string>(exported, 'status')
      imageUrl = findKey<string[]>(exported, 'urls')?.[0]
      if (status && status !== 'success') throw new Error(`Canva export ${status}`)
      if (!imageUrl) throw new Error('Canva did not return an export URL')
      update(id, {exportPath: await downloadExport(id, imageUrl)})
    }

    enter('schedule', 75, 'Scheduling in Metricool…')
    const fresh = getRun(id)!
    const post = await scheduleStory(imageUrl!, altText(lines), fresh.postDate, fresh.postMinute)
    update(id, {
      status: 'scheduled',
      failedStep: null,
      metricoolPostId: post.id,
      metricoolPlannerUrl: post.plannerUrl,
      progressPct: 100,
      progressMessage: 'Scheduled',
    })
  } catch (error) {
    Sentry.captureException(error)
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[events-story] run ${id} failed at ${step}:`, error)
    // A failed schedule restarts from export: the Canva export URL from this attempt is gone.
    update(id, {
      status: 'failed',
      failedStep: step === 'schedule' ? 'export' : step,
      error: message,
      progressMessage: null,
    })
  }
}
