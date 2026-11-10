import {and, asc, desc, eq, lt} from 'drizzle-orm'

import {
  type BoothLine,
  type OrderLine,
  ROLE_DEFAULTS,
  assignEpisodeNumbers,
  serviceDateFor,
  weekBounds,
  weekLabel,
  yearOf,
} from '../../src/lib/music-schedule-core.js'
import {db, schema} from '../db/index.js'

type LineKind = (typeof schema.musicLineKinds)[number]
type LineRole = (typeof schema.musicLineRoles)[number]
type BoothMode = (typeof schema.musicBoothModes)[number]
type LineAlign = (typeof schema.musicLineAligns)[number]

const LINE_KINDS = new Set<string>(schema.musicLineKinds)
const LINE_ROLES = new Set<string>(schema.musicLineRoles)
const BOOTH_MODES = new Set<string>(schema.musicBoothModes)
const LINE_ALIGNS = new Set<string>(schema.musicLineAligns)
type NoteColumn = (typeof schema.musicNoteColumns)[number]
const NOTE_COLUMNS = new Set<string>(schema.musicNoteColumns)

export interface LineTemplate {
  kind?: string
  role?: string
  text?: string
  suffix?: string
  leftText?: string
  merged?: boolean | null
  align?: string | null
  bold?: boolean | null
  italic?: boolean
  booth?: string
  boothLabel?: string
  boothNote?: string
  musicSheet?: boolean
  noteColumn?: string
  boothOneLine?: boolean
  sticky?: boolean
}

export interface LineInput extends LineTemplate {
  hymnId?: number | null
  freeSongTitle?: string | null
  highlight?: boolean
  boothHighlight?: boolean
}

export function readSetting(key: string): string | null {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? null
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readSetting(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export interface ServiceHeadings {
  music: string
  booth: string
}

/** The Music/Sound Booth heading configured per Service Time, keyed by its id. */
export function readHeadings(): Record<string, ServiceHeadings> {
  return readJson<Record<string, ServiceHeadings>>('schedules.musicSchedule.serviceHeadings', {})
}

export function readDefaultOrders(): Record<string, LineTemplate[]> {
  return readJson<Record<string, LineTemplate[]>>('schedules.musicSchedule.defaultOrders', {})
}

export function weekWithSchedule(id: number) {
  return db
    .select({week: schema.musicSchedules, schedule: schema.schedules})
    .from(schema.musicSchedules)
    .innerJoin(schema.schedules, eq(schema.schedules.id, schema.musicSchedules.scheduleId))
    .where(eq(schema.musicSchedules.id, id))
    .get()
}

export function servicesFor(weekId: number) {
  return db
    .select()
    .from(schema.musicScheduleServices)
    .where(eq(schema.musicScheduleServices.musicScheduleId, weekId))
    .orderBy(asc(schema.musicScheduleServices.sortOrder))
    .all()
}

/** Lines joined to their hymn, in the shape music-schedule-core expects. */
export function linesFor(serviceId: number): OrderLine[] {
  return db
    .select({line: schema.musicScheduleLines, hymn: schema.hymns})
    .from(schema.musicScheduleLines)
    .leftJoin(schema.hymns, eq(schema.hymns.id, schema.musicScheduleLines.hymnId))
    .where(eq(schema.musicScheduleLines.serviceId, serviceId))
    .orderBy(asc(schema.musicScheduleLines.sortOrder))
    .all()
    .map(({line, hymn}) => ({
      id: line.id,
      kind: line.kind,
      role: line.role,
      hymnId: line.hymnId,
      hymnBook: hymn?.book ?? null,
      hymnNumber: hymn?.number ?? null,
      hymnTitle: hymn?.title ?? null,
      freeSongTitle: line.freeSongTitle,
      suffix: line.suffix,
      leftText: line.leftText,
      text: line.text,
      merged: line.merged,
      align: line.align,
      bold: line.bold,
      italic: line.italic,
      highlight: line.highlight,
      boothHighlight: line.boothHighlight,
      sticky: line.sticky,
      booth: line.booth,
      boothLabel: line.boothLabel,
      boothNote: line.boothNote,
      musicSheet: line.musicSheet,
      noteColumn: line.noteColumn,
      boothOneLine: line.boothOneLine,
      sortOrder: line.sortOrder,
    }))
}

export function boothLinesFor(serviceId: number): BoothLine[] {
  return db
    .select()
    .from(schema.musicScheduleBoothLines)
    .where(eq(schema.musicScheduleBoothLines.serviceId, serviceId))
    .orderBy(asc(schema.musicScheduleBoothLines.sortOrder))
    .all()
}

export function touch(weekId: number, scheduleId: number) {
  const now = new Date().toISOString()
  db.update(schema.musicSchedules).set({updatedAt: now}).where(eq(schema.musicSchedules.id, weekId)).run()
  db.update(schema.schedules).set({updatedAt: now}).where(eq(schema.schedules.id, scheduleId)).run()
}

/** Highest Episode Number already used in each year, across every week. */
export function highestEpisodeByYear(excludeWeekId?: number): Record<number, number> {
  const rows = db
    .select({
      date: schema.musicScheduleServices.date,
      episodeNumber: schema.musicScheduleServices.episodeNumber,
      weekId: schema.musicScheduleServices.musicScheduleId,
    })
    .from(schema.musicScheduleServices)
    .all()
  const out: Record<number, number> = {}
  for (const r of rows) {
    if (r.episodeNumber == null) continue
    if (excludeWeekId != null && r.weekId === excludeWeekId) continue
    const y = yearOf(r.date)
    out[y] = Math.max(out[y] ?? 0, r.episodeNumber)
  }
  return out
}

export function insertLines(serviceId: number, lines: LineInput[]) {
  lines.forEach((l, i) => {
    const kind: LineKind = LINE_KINDS.has(String(l.kind)) ? (l.kind as LineKind) : 'prose'
    const role: LineRole = LINE_ROLES.has(String(l.role)) ? (l.role as LineRole) : 'plain'
    db.insert(schema.musicScheduleLines)
      .values({
        serviceId,
        kind,
        role,
        hymnId: l.hymnId ?? null,
        freeSongTitle: l.freeSongTitle ?? null,
        suffix: String(l.suffix ?? ''),
        leftText: String(l.leftText ?? ''),
        text: String(l.text ?? ''),
        merged: l.merged ?? null,
        align: LINE_ALIGNS.has(String(l.align)) ? (l.align as LineAlign) : null,
        bold: l.bold ?? null,
        italic: Boolean(l.italic),
        highlight: Boolean(l.highlight),
        boothHighlight: Boolean(l.boothHighlight),
        sticky: l.sticky ?? ROLE_DEFAULTS[role].sticky,
        booth: BOOTH_MODES.has(String(l.booth)) ? (l.booth as BoothMode) : 'auto',
        boothLabel: String(l.boothLabel ?? ''),
        boothNote: String(l.boothNote ?? ''),
        musicSheet: l.musicSheet ?? true,
        noteColumn: NOTE_COLUMNS.has(String(l.noteColumn)) ? (l.noteColumn as NoteColumn) : 'all',
        boothOneLine: Boolean(l.boothOneLine),
        sortOrder: i,
      })
      .run()
  })
}

/** Replace a Service Order in one transaction — a failed insert leaves the old order, never none. */
export function replaceLines(serviceId: number, lines: LineInput[]) {
  db.transaction(() => {
    db.delete(schema.musicScheduleLines).where(eq(schema.musicScheduleLines.serviceId, serviceId)).run()
    insertLines(serviceId, lines)
  })
}

/** A line as a template for another service, songs and highlights included or not. */
export function lineAsInput(l: OrderLine, opts: {keepSongs: 'all' | 'sticky'}): LineInput {
  const keep = opts.keepSongs === 'all' || l.sticky
  return {
    kind: l.kind,
    role: l.role,
    text: l.text,
    suffix: l.suffix,
    leftText: l.leftText,
    merged: l.merged,
    align: l.align,
    bold: l.bold,
    italic: l.italic,
    booth: l.booth,
    boothLabel: l.boothLabel,
    boothNote: l.boothNote,
    musicSheet: l.musicSheet,
    noteColumn: l.noteColumn,
    boothOneLine: l.boothOneLine,
    sticky: l.sticky,
    hymnId: keep ? l.hymnId : null,
    freeSongTitle: keep ? l.freeSongTitle : null,
  }
}

/**
 * Where a new week's service copies its order from: the most recent earlier
 * service of the same Service Time that is not Standalone — never a Standalone
 * one, so a candlelight order can't leak into the following week.
 */
export function copyForwardSource(serviceTimeId: number, beforeWeekStart: string) {
  return db
    .select({service: schema.musicScheduleServices})
    .from(schema.musicScheduleServices)
    .innerJoin(schema.musicSchedules, eq(schema.musicSchedules.id, schema.musicScheduleServices.musicScheduleId))
    .where(
      and(
        eq(schema.musicScheduleServices.serviceTimeId, serviceTimeId),
        eq(schema.musicScheduleServices.standalone, false),
        lt(schema.musicSchedules.weekStart, beforeWeekStart),
      ),
    )
    .orderBy(desc(schema.musicSchedules.weekStart))
    .limit(1)
    .get()?.service
}

export class WeekExistsError extends Error {
  constructor(public weekId: number) {
    super('A week already exists for that Sunday')
  }
}

/**
 * Create a week from its Sunday. Services seed from the active Service Times;
 * each copies forward from its copy-forward source, else from the settings
 * default order. What carries and what clears is ADR 0022's table: structure,
 * prose, roles, booth toggles and condensed-line edits carry; songs (unless
 * sticky), highlights, titles, texts, notes and the Occasion clear.
 */
export function createWeek(weekStart: string): {weekId: number; status: string} {
  const clash = db.select().from(schema.musicSchedules).where(eq(schema.musicSchedules.weekStart, weekStart)).get()
  if (clash) throw new WeekExistsError(clash.id)

  return db.transaction(() => {
    const {scopeStart, scopeEnd} = weekBounds(weekStart)
    const schedule = db
      .insert(schema.schedules)
      .values({
        scheduleType: 'music_schedule',
        scopeKind: 'date_range',
        scopeStart,
        scopeEnd,
        scopeLabel: weekLabel(weekStart),
      })
      .returning()
      .get()

    const week = db.insert(schema.musicSchedules).values({scheduleId: schedule.id, weekStart}).returning().get()
    const defaultOrders = readDefaultOrders()

    const times = db
      .select()
      .from(schema.serviceTimes)
      .where(eq(schema.serviceTimes.active, true))
      .orderBy(asc(schema.serviceTimes.sortOrder))
      .all()

    const created: {id: number; date: string; meeting: boolean; uploaded: boolean}[] = []

    times.forEach((t, i) => {
      const source = copyForwardSource(t.id, weekStart)
      const date = serviceDateFor(weekStart, t.dayOfWeek)
      const service = db
        .insert(schema.musicScheduleServices)
        .values({
          musicScheduleId: week.id,
          serviceTimeId: t.id,
          name: t.name,
          musicHeading: source?.musicHeading ?? '',
          boothHeading: source?.boothHeading ?? '',
          date,
          time: source?.time ?? null,
          meeting: true,
          // Sunday School isn't uploaded, so it consumes no Episode Number.
          uploaded: source ? source.uploaded : t.dayOfWeek === 0 && t.time < '10:30',
          sortOrder: i,
        })
        .returning()
        .get()
      created.push({id: service.id, date, meeting: true, uploaded: service.uploaded})

      insertLines(
        service.id,
        source
          ? linesFor(source.id).map((l) => lineAsInput(l, {keepSongs: 'sticky'}))
          : (defaultOrders[String(t.id)] ?? []),
      )

      // Condensed Sound Booth lines and their edits carry forward verbatim.
      if (source) {
        boothLinesFor(source.id).forEach((bl, idx) =>
          db
            .insert(schema.musicScheduleBoothLines)
            .values({
              serviceId: service.id,
              slot: bl.slot,
              text: bl.text,
              // A highlight means "different this week" — never carried.
              highlight: false,
              draftedFrom: bl.draftedFrom,
              sortOrder: idx,
            })
            .run(),
        )
      }
    })

    const numbers = assignEpisodeNumbers(created, highestEpisodeByYear(week.id))
    for (const [id, n] of Object.entries(numbers)) {
      db.update(schema.musicScheduleServices)
        .set({episodeNumber: n})
        .where(eq(schema.musicScheduleServices.id, Number(id)))
        .run()
    }

    return {weekId: week.id, status: schedule.status}
  })
}

/**
 * Replace one service's order with another's — lines (songs included), condensed
 * booth lines and heading overrides. Never the title, text, notes, highlights or
 * Occasion: those belong to that year's sermon. Copying from a Standalone
 * service makes the target Standalone too.
 */
export function copyOrder(targetServiceId: number, sourceServiceId: number) {
  const source = db
    .select()
    .from(schema.musicScheduleServices)
    .where(eq(schema.musicScheduleServices.id, sourceServiceId))
    .get()
  if (!source) throw new Error('Source service not found')
  db.transaction(() => {
    db.delete(schema.musicScheduleLines).where(eq(schema.musicScheduleLines.serviceId, targetServiceId)).run()
    insertLines(
      targetServiceId,
      linesFor(source.id).map((l) => lineAsInput(l, {keepSongs: 'all'})),
    )
    db.delete(schema.musicScheduleBoothLines).where(eq(schema.musicScheduleBoothLines.serviceId, targetServiceId)).run()
    boothLinesFor(source.id).forEach((bl, idx) =>
      db
        .insert(schema.musicScheduleBoothLines)
        .values({
          serviceId: targetServiceId,
          slot: bl.slot,
          text: bl.text,
          highlight: false,
          draftedFrom: bl.draftedFrom,
          sortOrder: idx,
        })
        .run(),
    )
    db.update(schema.musicScheduleServices)
      .set({
        musicHeading: source.musicHeading,
        boothHeading: source.boothHeading,
        ...(source.standalone ? {standalone: true} : {}),
      })
      .where(eq(schema.musicScheduleServices.id, targetServiceId))
      .run()
  })
}
