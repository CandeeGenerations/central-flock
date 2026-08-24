import {and, asc, eq, like, or, sql} from 'drizzle-orm'
import {Router} from 'express'

import {
  type LessonRowInput,
  type WorkersNotesTerm,
  isTerm,
  nextStartingLessonNumber,
  parseSpecialLesson,
  resolveLessonNumbers,
  scopeBounds,
  sundaysInTerm,
  termLabel,
} from '../../src/lib/workers-notes-core.js'
import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

export const workersNotesRouter = Router()

// Mounted at /api/schedules/workers-notes, ahead of the generic schedules
// router (same pattern as fair-booth). See CONTEXT.md → Workers' Notes.

type BlockKind = (typeof schema.workersNotesBlockKinds)[number]
type LessonKind = (typeof schema.workersNotesLessonKinds)[number]

const BLOCK_KINDS = new Set<string>(schema.workersNotesBlockKinds)
const LESSON_KINDS = new Set<string>(schema.workersNotesLessonKinds)

function editionWithSchedule(id: number) {
  return db
    .select({edition: schema.workersNotesEditions, schedule: schema.schedules})
    .from(schema.workersNotesEditions)
    .innerJoin(schema.schedules, eq(schema.schedules.id, schema.workersNotesEditions.scheduleId))
    .where(eq(schema.workersNotesEditions.id, id))
    .get()
}

function lessonRowsFor(editionId: number) {
  return db
    .select()
    .from(schema.workersNotesLessonRows)
    .where(eq(schema.workersNotesLessonRows.editionId, editionId))
    .orderBy(asc(schema.workersNotesLessonRows.sortOrder))
    .all()
}

/** Bank each Points line against the story it belongs to, so the picker prefills. */
function bankLastPoints(rows: LessonRowInput[], startingLessonNumber: number) {
  const resolved = resolveLessonNumbers(rows, startingLessonNumber)
  for (const row of resolved) {
    const text = (row.text ?? '').trim()
    if (!text) continue
    const targets =
      row.kind === 'regular' && row.storyNumber !== null
        ? [row.storyNumber]
        : row.kind === 'special'
          ? parseSpecialLesson(row.specialLesson ?? '')
          : []
    for (const number of targets) {
      db.update(schema.bettyLukensStories)
        .set({lastPoints: text, updatedAt: new Date().toISOString()})
        .where(eq(schema.bettyLukensStories.number, number))
        .run()
    }
  }
}

function touch(editionId: number, scheduleId: number) {
  const now = new Date().toISOString()
  db.update(schema.workersNotesEditions)
    .set({updatedAt: now})
    .where(eq(schema.workersNotesEditions.id, editionId))
    .run()
  db.update(schema.schedules).set({updatedAt: now}).where(eq(schema.schedules.id, scheduleId)).run()
}

// ── Yearly Themes ───────────────────────────────────────────────────────
// One row per calendar year, shared by all three editions of that year.

workersNotesRouter.get(
  '/themes',
  asyncHandler(async (_req, res) => {
    res.json(db.select().from(schema.workersNotesThemes).orderBy(asc(schema.workersNotesThemes.year)).all())
  }),
)

workersNotesRouter.get(
  '/themes/:year',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    const row = db.select().from(schema.workersNotesThemes).where(eq(schema.workersNotesThemes.year, year)).get()
    if (!row) {
      res.status(404).json({error: `No theme for ${year}`})
      return
    }
    res.json(row)
  }),
)

/**
 * Upsert a year's theme. Creating a year with no row yet pre-fills from the
 * most recent earlier year — the shape (chorus, tag, verse) is stable even
 * though every word changes.
 */
workersNotesRouter.put(
  '/themes/:year',
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year)
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      res.status(400).json({error: 'Invalid year'})
      return
    }
    const b = req.body as Record<string, unknown>
    const fields = {
      songTitle: String(b.songTitle ?? ''),
      songCredit: String(b.songCredit ?? ''),
      chorusLyrics: String(b.chorusLyrics ?? ''),
      tagLyrics: String(b.tagLyrics ?? ''),
      verseText: String(b.verseText ?? ''),
      verseRef: String(b.verseRef ?? ''),
      growthPlan: String(b.growthPlan ?? ''),
      updatedAt: new Date().toISOString(),
    }
    const existing = db.select().from(schema.workersNotesThemes).where(eq(schema.workersNotesThemes.year, year)).get()
    const row = existing
      ? db
          .update(schema.workersNotesThemes)
          .set(fields)
          .where(eq(schema.workersNotesThemes.year, year))
          .returning()
          .get()
      : db
          .insert(schema.workersNotesThemes)
          .values({year, ...fields})
          .returning()
          .get()
    res.json(row)
  }),
)

workersNotesRouter.delete(
  '/themes/:year',
  asyncHandler(async (req, res) => {
    db.delete(schema.workersNotesThemes)
      .where(eq(schema.workersNotesThemes.year, Number(req.params.year)))
      .run()
    res.status(204).end()
  }),
)

// ── Betty Lukens catalogue ──────────────────────────────────────────────

workersNotesRouter.get(
  '/stories',
  asyncHandler(async (_req, res) => {
    res.json(db.select().from(schema.bettyLukensStories).orderBy(asc(schema.bettyLukensStories.number)).all())
  }),
)

workersNotesRouter.put(
  '/stories/:number',
  asyncHandler(async (req, res) => {
    const number = Number(req.params.number)
    const b = req.body as {title?: string; page?: number | null; lastPoints?: string | null}
    const existing = db
      .select()
      .from(schema.bettyLukensStories)
      .where(eq(schema.bettyLukensStories.number, number))
      .get()
    const values = {
      title: b.title !== undefined ? String(b.title) : (existing?.title ?? ''),
      page: b.page !== undefined ? (b.page === null ? null : Number(b.page)) : (existing?.page ?? null),
      lastPoints: b.lastPoints !== undefined ? b.lastPoints : (existing?.lastPoints ?? null),
      updatedAt: new Date().toISOString(),
    }
    const row = existing
      ? db
          .update(schema.bettyLukensStories)
          .set(values)
          .where(eq(schema.bettyLukensStories.number, number))
          .returning()
          .get()
      : db
          .insert(schema.bettyLukensStories)
          .values({number, ...values})
          .returning()
          .get()
    res.json(row)
  }),
)

workersNotesRouter.delete(
  '/stories/:number',
  asyncHandler(async (req, res) => {
    db.delete(schema.bettyLukensStories)
      .where(eq(schema.bettyLukensStories.number, Number(req.params.number)))
      .run()
    res.status(204).end()
  }),
)

// ── Hymn picker ─────────────────────────────────────────────────────────
// A thin list for the month Song picker. Lives here rather than on the hymns
// router because it exists to serve this one control.

workersNotesRouter.get(
  '/hymns',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    const base = db
      .select({id: schema.hymns.id, book: schema.hymns.book, number: schema.hymns.number, title: schema.hymns.title})
      .from(schema.hymns)
    const rows = q
      ? base
          .where(
            or(
              like(sql`lower(${schema.hymns.title})`, `%${q.toLowerCase()}%`),
              eq(schema.hymns.number, Number.isFinite(Number(q)) ? Number(q) : -1),
            ),
          )
          .limit(50)
          .all()
      : base.orderBy(asc(schema.hymns.book), asc(schema.hymns.number)).limit(50).all()
    res.json(rows)
  }),
)

// ── Editions ────────────────────────────────────────────────────────────

workersNotesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db
      .select({edition: schema.workersNotesEditions, schedule: schema.schedules})
      .from(schema.workersNotesEditions)
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.workersNotesEditions.scheduleId))
      .all()
    rows.sort((a, b) =>
      a.edition.year !== b.edition.year ? b.edition.year - a.edition.year : b.edition.term - a.edition.term,
    )
    res.json(
      rows.map((r) => ({
        ...r.edition,
        scopeLabel: r.schedule.scopeLabel,
        status: r.schedule.status,
        scopeStart: r.schedule.scopeStart,
        scopeEnd: r.schedule.scopeEnd,
      })),
    )
  }),
)

/**
 * Create an edition for (year, term). Seeds four empty month rows, one
 * `regular` lesson row per Sunday, and a Notes Block list copied forward from
 * the previous edition — falling back to the settings defaults when there is
 * none. The starting lesson number continues the previous edition unless the
 * caller supplies one.
 */
workersNotesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body as {year?: number; term?: number; startingLessonNumber?: number}
    const year = Number(b.year)
    const term = Number(b.term)
    if (!Number.isInteger(year) || year < 1900 || year > 2200 || !isTerm(term)) {
      res.status(400).json({error: 'year and term (1, 2 or 3) are required'})
      return
    }
    const clash = db
      .select()
      .from(schema.workersNotesEditions)
      .where(and(eq(schema.workersNotesEditions.year, year), eq(schema.workersNotesEditions.term, term)))
      .get()
    if (clash) {
      res.status(409).json({error: 'An edition already exists for that year and term', editionId: clash.id})
      return
    }

    // Continue the sequence from the most recent earlier edition.
    const priorEditions = db.select().from(schema.workersNotesEditions).all()
    const prior = priorEditions
      .filter((e) => e.year < year || (e.year === year && e.term < term))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.term - b.term))
      .pop()
    let startingLessonNumber = Number(b.startingLessonNumber)
    if (!Number.isInteger(startingLessonNumber) || startingLessonNumber < 1) {
      if (!prior) {
        res.status(400).json({error: 'No previous edition to continue from — startingLessonNumber is required'})
        return
      }
      startingLessonNumber = nextStartingLessonNumber(lessonRowsFor(prior.id), prior.startingLessonNumber)
    }

    const {scopeStart, scopeEnd} = scopeBounds(year, term as WorkersNotesTerm)
    const schedule = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'workers_notes',
        scopeKind: 'date_range',
        scopeStart,
        scopeEnd,
        scopeLabel: termLabel(year, term as WorkersNotesTerm),
      })
      .returning()
      .get()
    const edition = db
      .insert(schema.workersNotesEditions)
      .values({scheduleId: schedule.id, year, term, startingLessonNumber})
      .returning()
      .get()

    // Blocks: copy the previous edition's forward, else the settings defaults.
    const priorBlocks = prior
      ? db
          .select()
          .from(schema.workersNotesBlocks)
          .where(eq(schema.workersNotesBlocks.editionId, prior.id))
          .orderBy(asc(schema.workersNotesBlocks.sortOrder))
          .all()
      : []
    const seedBlocks: {kind: BlockKind; text: string; bold: boolean}[] = priorBlocks.length
      ? priorBlocks.map((pb) => ({kind: pb.kind, text: pb.text, bold: pb.bold}))
      : readDefaultBlocks()
    seedBlocks.forEach((blk, i) =>
      db
        .insert(schema.workersNotesBlocks)
        .values({editionId: edition.id, kind: blk.kind, text: blk.text, bold: blk.bold, sortOrder: i})
        .run(),
    )

    for (const month of [1, 2, 3, 4].map((offset) => (term - 1) * 4 + offset)) {
      db.insert(schema.workersNotesMonths).values({editionId: edition.id, month}).run()
    }

    sundaysInTerm(year, term as WorkersNotesTerm).forEach((date, i) =>
      db
        .insert(schema.workersNotesLessonRows)
        .values({editionId: edition.id, kind: 'regular', date, sortOrder: i})
        .run(),
    )

    res.status(201).json({...edition, scopeLabel: schedule.scopeLabel, status: schedule.status})
  }),
)

function readDefaultBlocks(): {kind: BlockKind; text: string; bold: boolean}[] {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'schedules.workersNotes.defaultBlocks'))
    .get()
  const fallback: {kind: BlockKind; text: string; bold: boolean}[] = [
    {kind: 'note', text: '', bold: false},
    {kind: 'next_term_forms', text: '', bold: false},
    {kind: 'growth_plan', text: '', bold: false},
    {kind: 'month_themes', text: '', bold: false},
  ]
  if (!row?.value) return fallback
  try {
    const parsed = JSON.parse(row.value) as {kind?: string; text?: string; bold?: boolean}[]
    const mapped = parsed
      .filter((b) => b.kind && BLOCK_KINDS.has(b.kind))
      .map((b) => ({kind: b.kind as BlockKind, text: String(b.text ?? ''), bold: Boolean(b.bold)}))
    return mapped.length ? mapped : fallback
  } catch {
    return fallback
  }
}

/** Everything page 1 and page 2 need, in one request. */
workersNotesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = editionWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Edition not found'})
      return
    }
    const {edition, schedule} = found
    const rows = lessonRowsFor(id)
    res.json({
      ...edition,
      scopeLabel: schedule.scopeLabel,
      status: schedule.status,
      scopeStart: schedule.scopeStart,
      scopeEnd: schedule.scopeEnd,
      theme:
        db.select().from(schema.workersNotesThemes).where(eq(schema.workersNotesThemes.year, edition.year)).get() ??
        null,
      blocks: db
        .select()
        .from(schema.workersNotesBlocks)
        .where(eq(schema.workersNotesBlocks.editionId, id))
        .orderBy(asc(schema.workersNotesBlocks.sortOrder))
        .all(),
      months: db
        .select({month: schema.workersNotesMonths, hymn: schema.hymns})
        .from(schema.workersNotesMonths)
        .leftJoin(schema.hymns, eq(schema.hymns.id, schema.workersNotesMonths.hymnId))
        .where(eq(schema.workersNotesMonths.editionId, id))
        .orderBy(asc(schema.workersNotesMonths.month))
        .all()
        .map((r) => ({
          ...r.month,
          hymnBook: r.hymn?.book ?? null,
          hymnNumber: r.hymn?.number ?? null,
          hymnTitle: r.hymn?.title ?? null,
        })),
      lessonRows: resolveLessonNumbers(rows, edition.startingLessonNumber),
    })
  }),
)

workersNotesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = editionWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Edition not found'})
      return
    }
    const b = req.body as {status?: 'draft' | 'final'; startingLessonNumber?: number}
    if (b.status === 'draft' || b.status === 'final') {
      db.update(schema.schedules)
        .set({status: b.status, updatedAt: new Date().toISOString()})
        .where(eq(schema.schedules.id, found.schedule.id))
        .run()
    }
    if (Number.isInteger(b.startingLessonNumber) && Number(b.startingLessonNumber) > 0) {
      db.update(schema.workersNotesEditions)
        .set({startingLessonNumber: Number(b.startingLessonNumber), updatedAt: new Date().toISOString()})
        .where(eq(schema.workersNotesEditions.id, id))
        .run()
    }
    res.json({ok: true})
  }),
)

workersNotesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const found = editionWithSchedule(Number(req.params.id))
    if (!found) {
      res.status(404).json({error: 'Edition not found'})
      return
    }
    // Cascades to the edition and all its body rows.
    db.delete(schema.schedules).where(eq(schema.schedules.id, found.schedule.id)).run()
    res.status(204).end()
  }),
)

// ── Body lists ──────────────────────────────────────────────────────────
// Small, ordered, always edited as a set — replaced wholesale so sort_order
// stays consistent and no per-row diffing is needed.

workersNotesRouter.put(
  '/:id/blocks',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = editionWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Edition not found'})
      return
    }
    const incoming = (req.body as {blocks?: {kind?: string; text?: string; bold?: boolean}[]}).blocks ?? []
    if (incoming.some((b) => !b.kind || !BLOCK_KINDS.has(b.kind))) {
      res.status(400).json({error: 'Invalid block kind'})
      return
    }
    db.delete(schema.workersNotesBlocks).where(eq(schema.workersNotesBlocks.editionId, id)).run()
    incoming.forEach((b, i) =>
      db
        .insert(schema.workersNotesBlocks)
        .values({
          editionId: id,
          kind: b.kind as BlockKind,
          text: String(b.text ?? ''),
          bold: Boolean(b.bold),
          sortOrder: i,
        })
        .run(),
    )
    touch(id, found.schedule.id)
    res.json({ok: true})
  }),
)

workersNotesRouter.put(
  '/:id/months',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = editionWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Edition not found'})
      return
    }
    const incoming =
      (
        req.body as {
          months?: {
            month: number
            hymnId?: number | null
            songTitleOverride?: string | null
            motto?: string
            verse?: string
          }[]
        }
      ).months ?? []
    for (const m of incoming) {
      db.update(schema.workersNotesMonths)
        .set({
          hymnId: m.hymnId == null ? null : Number(m.hymnId),
          songTitleOverride: m.songTitleOverride == null ? null : String(m.songTitleOverride),
          motto: String(m.motto ?? ''),
          verse: String(m.verse ?? ''),
        })
        .where(and(eq(schema.workersNotesMonths.editionId, id), eq(schema.workersNotesMonths.month, Number(m.month))))
        .run()
    }
    touch(id, found.schedule.id)
    res.json({ok: true})
  }),
)

workersNotesRouter.put(
  '/:id/lessons',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const found = editionWithSchedule(id)
    if (!found) {
      res.status(404).json({error: 'Edition not found'})
      return
    }
    const incoming =
      (req.body as {rows?: {kind?: string; date?: string | null; specialLesson?: string; text?: string}[]}).rows ?? []
    if (incoming.some((r) => !r.kind || !LESSON_KINDS.has(r.kind))) {
      res.status(400).json({error: 'Invalid lesson row kind'})
      return
    }
    const rows = incoming.map((r) => ({
      kind: r.kind as LessonKind,
      date: r.kind === 'note' ? null : (r.date ?? null),
      specialLesson: String(r.specialLesson ?? ''),
      text: String(r.text ?? ''),
    }))
    db.delete(schema.workersNotesLessonRows).where(eq(schema.workersNotesLessonRows.editionId, id)).run()
    rows.forEach((r, i) =>
      db
        .insert(schema.workersNotesLessonRows)
        .values({editionId: id, ...r, sortOrder: i})
        .run(),
    )
    // Bank every Points line against its story so the picker prefills next cycle.
    bankLastPoints(rows, found.edition.startingLessonNumber)
    touch(id, found.schedule.id)
    res.json({lessonRows: resolveLessonNumbers(rows, found.edition.startingLessonNumber)})
  }),
)
