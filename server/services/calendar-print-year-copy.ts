// Year Copy: build next year's Calendar Print from this year's. See CONTEXT.md → Year Copy,
// plans/calendar-year-copy.md and docs/adr/0040. The date logic is pure and lives in
// server/lib/repeat-rules.ts; this file only reads and writes rows.
//
// Destructive for the target year's Events and Day Overrides (deleted first, so a re-run gives a
// clean result). It runs as one History Change, which is what makes that acceptable.
import {and, asc, count, eq, inArray, isNull} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {
  type RepeatRule,
  type RuleEvent,
  guessRule,
  parseRule,
  planDayOverrides,
  planYearCopy,
} from '../lib/repeat-rules.js'
import {recordChange} from './calendar-print-history.js'

type Page = typeof schema.calendarPrintPages.$inferSelect
type Item = typeof schema.normalScheduleItems.$inferSelect

export function getOrCreatePage(year: number, month: number): Page {
  const existing = db
    .select()
    .from(schema.calendarPrintPages)
    .where(and(eq(schema.calendarPrintPages.year, year), eq(schema.calendarPrintPages.month, month)))
    .get()
  if (existing) return existing
  return db.insert(schema.calendarPrintPages).values({year, month}).returning().get()
}

function pagesOf(year: number): Page[] {
  return db.select().from(schema.calendarPrintPages).where(eq(schema.calendarPrintPages.year, year)).all()
}

function pageItems(pageId: number): Item[] {
  return db
    .select()
    .from(schema.normalScheduleItems)
    .where(and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, pageId)))
    .orderBy(asc(schema.normalScheduleItems.sortOrder), asc(schema.normalScheduleItems.id))
    .all()
}

function defaultItems(): Item[] {
  return db
    .select()
    .from(schema.normalScheduleItems)
    .where(eq(schema.normalScheduleItems.scopeType, 'default'))
    .orderBy(asc(schema.normalScheduleItems.sortOrder), asc(schema.normalScheduleItems.id))
    .all()
}

function effectiveItems(pageId: number | undefined): Item[] {
  if (pageId != null) {
    const own = pageItems(pageId)
    if (own.length) return own
  }
  return defaultItems()
}

function itemKey(it: Item): string {
  return `${it.type}|${it.column}|${it.eligibleDays}|${it.text}`
}

// "Blank" = nothing typed into the page yet, so 2026's colour and schedule setup may fill it.
function isBlankPage(p: Page): boolean {
  return (
    !p.theme &&
    !p.themeColor &&
    !p.verseText &&
    !p.verseReference &&
    !p.hideNormalScheduleFooter &&
    !pageItems(p.id).length
  )
}

function storedRule(e: {repeatRule: string | null; title: string; date: string}): RepeatRule {
  return parseRule(e.repeatRule) ?? guessRule(e.title, e.date)
}

function loadSource(fromYear: number) {
  const pages = pagesOf(fromYear)
  const pageIds = pages.map((p) => p.id)
  const events = pageIds.length
    ? db
        .select()
        .from(schema.calendarPrintEvents)
        .where(inArray(schema.calendarPrintEvents.pageId, pageIds))
        .orderBy(asc(schema.calendarPrintEvents.date), asc(schema.calendarPrintEvents.sortOrder))
        .all()
    : []
  const overrides = pageIds.length
    ? db
        .select()
        .from(schema.calendarPrintDayOverrides)
        .where(inArray(schema.calendarPrintDayOverrides.pageId, pageIds))
        .all()
    : []
  return {pages, events, overrides}
}

function countTarget(toYear: number) {
  const ids = pagesOf(toYear).map((p) => p.id)
  if (!ids.length) return {events: 0, overrides: 0}
  const events = db
    .select({n: count()})
    .from(schema.calendarPrintEvents)
    .where(inArray(schema.calendarPrintEvents.pageId, ids))
    .get()
  const overrides = db
    .select({n: count()})
    .from(schema.calendarPrintDayOverrides)
    .where(inArray(schema.calendarPrintDayOverrides.pageId, ids))
    .get()
  return {events: events?.n ?? 0, overrides: overrides?.n ?? 0}
}

function toRuleEvents(events: {id: number; date: string; title: string; repeatRule: string | null}[]): RuleEvent[] {
  return events.map((e) => ({id: e.id, date: e.date, title: e.title, repeatRule: storedRule(e)}))
}

export interface YearCopyPreview {
  fromYear: number
  toYear: number
  sourceEvents: number
  toCopy: number
  skipped: string[]
  outOfYear: {title: string; date: string}[]
  existingEvents: number
  existingOverrides: number
}

export function previewYearCopy(fromYear: number, toYear: number): YearCopyPreview {
  const {events} = loadSource(fromYear)
  const plan = planYearCopy(toRuleEvents(events), toYear)
  const existing = countTarget(toYear)
  return {
    fromYear,
    toYear,
    sourceEvents: events.length,
    toCopy: plan.placements.length,
    skipped: plan.skipped.map((s) => s.title),
    outOfYear: plan.outOfYear.map((o) => ({title: o.title, date: o.date})),
    existingEvents: existing.events,
    existingOverrides: existing.overrides,
  }
}

export interface YearCopyResult {
  copied: number
  overrides: number
  deletedEvents: number
  deletedOverrides: number
  skipped: string[]
  outOfYear: {title: string; date: string}[]
  conflicts: {date: string; titles: string[]}[]
}

export function runYearCopy(fromYear: number, toYear: number): YearCopyResult {
  return recordChange(
    (r: YearCopyResult) => `Year Copy ${fromYear} → ${toYear} (${r.copied} Events)`,
    () => {
      const source = loadSource(fromYear)
      const sourcePageByMonth = new Map(source.pages.map((p) => [p.month, p]))
      const plan = planYearCopy(toRuleEvents(source.events), toYear)
      const existing = countTarget(toYear)

      // Target pages: create missing ones; fill colour / footer / schedule setup only where blank.
      const targetPageByMonth = new Map<number, Page>()
      for (let m = 1; m <= 12; m++) {
        const page = getOrCreatePage(toYear, m)
        const src = sourcePageByMonth.get(m)
        if (src && isBlankPage(page)) {
          db.update(schema.calendarPrintPages)
            .set({themeColor: src.themeColor, hideNormalScheduleFooter: src.hideNormalScheduleFooter})
            .where(eq(schema.calendarPrintPages.id, page.id))
            .run()
          const srcItems = pageItems(src.id)
          if (srcItems.length) {
            db.insert(schema.normalScheduleItems)
              .values(
                srcItems.map((it) => ({
                  scopeType: 'page' as const,
                  scopeId: page.id,
                  type: it.type,
                  text: it.text,
                  bold: it.bold,
                  column: it.column,
                  eligibleDays: it.eligibleDays,
                  hidden: it.hidden,
                  sortOrder: it.sortOrder,
                })),
              )
              .run()
          }
        }
        targetPageByMonth.set(m, page)
      }

      const targetIds = [...targetPageByMonth.values()].map((p) => p.id)
      db.delete(schema.calendarPrintDayOverrides)
        .where(inArray(schema.calendarPrintDayOverrides.pageId, targetIds))
        .run()
      db.delete(schema.calendarPrintEvents).where(inArray(schema.calendarPrintEvents.pageId, targetIds)).run()

      const sourceById = new Map(source.events.map((e) => [e.id, e]))
      const placed = plan.placements.map((p) => {
        const src = sourceById.get(p.sourceId)!
        return {
          pageId: targetPageByMonth.get(Number(p.date.slice(5, 7)))!.id,
          date: p.date,
          title: src.title,
          style: src.style,
          sortOrder: src.sortOrder,
          repeatRule: JSON.stringify(p.rule),
        }
      })
      for (let i = 0; i < placed.length; i += 200) {
        db.insert(schema.calendarPrintEvents)
          .values(placed.slice(i, i + 200))
          .run()
      }

      // Schedule-line ids differ between pages (a page override has its own rows), so map
      // source ids → target ids by the line's content.
      const sourceItemsByMonth = new Map<number, Map<number, string>>()
      const targetIdByMonth = new Map<number, Map<string, number>>()
      const mapItemIds = (targetMonth: number, sourceMonth: number, ids: number[]) => {
        if (!sourceItemsByMonth.has(sourceMonth)) {
          const items = effectiveItems(sourcePageByMonth.get(sourceMonth)?.id)
          sourceItemsByMonth.set(sourceMonth, new Map(items.map((it) => [it.id, itemKey(it)])))
        }
        if (!targetIdByMonth.has(targetMonth)) {
          const items = effectiveItems(targetPageByMonth.get(targetMonth)?.id)
          targetIdByMonth.set(targetMonth, new Map(items.map((it) => [itemKey(it), it.id])))
        }
        const src = sourceItemsByMonth.get(sourceMonth)!
        const tgt = targetIdByMonth.get(targetMonth)!
        return ids.flatMap((id) => {
          const key = src.get(id)
          const mapped = key ? tgt.get(key) : undefined
          return mapped == null ? [] : [mapped]
        })
      }

      const overridePlan = planDayOverrides({
        sourceEvents: source.events,
        sourceOverrides: source.overrides.map((o) => ({
          date: o.date,
          inlineItemIds: parseIds(o.inlineItemIds),
          showNoKaya: o.showNoKaya,
          showNormalScheduleLabel: o.showNormalScheduleLabel,
        })),
        placements: plan.placements,
        targetYear: toYear,
        mapItemIds,
      })
      const overrideRows = overridePlan.overrides.map((o) => ({
        pageId: targetPageByMonth.get(Number(o.date.slice(5, 7)))!.id,
        date: o.date,
        inlineItemIds: JSON.stringify(o.inlineItemIds),
        showNoKaya: o.showNoKaya,
        showNormalScheduleLabel: o.showNormalScheduleLabel,
      }))
      for (let i = 0; i < overrideRows.length; i += 200) {
        db.insert(schema.calendarPrintDayOverrides)
          .values(overrideRows.slice(i, i + 200))
          .run()
      }

      return {
        copied: placed.length,
        overrides: overrideRows.length,
        deletedEvents: existing.events,
        deletedOverrides: existing.overrides,
        skipped: plan.skipped.map((s) => s.title),
        outOfYear: plan.outOfYear.map((o) => ({title: o.title, date: o.date})),
        conflicts: overridePlan.conflicts,
      }
    },
  )
}

function parseIds(json: string): number[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : []
  } catch {
    return []
  }
}

// One-time (idempotent) boot backfill: give every Event written before Repeat Rules existed
// its guessed rule. Recorded as a History Change so it can be undone (plan decision 17).
export function backfillRepeatRules(): number {
  const missing = db
    .select({id: schema.calendarPrintEvents.id})
    .from(schema.calendarPrintEvents)
    .where(isNull(schema.calendarPrintEvents.repeatRule))
    .all()
  if (!missing.length) return 0
  return recordChange(
    (n: number) => `Guessed Repeat Rules for ${n} Events`,
    () => {
      const rows = db
        .select()
        .from(schema.calendarPrintEvents)
        .where(isNull(schema.calendarPrintEvents.repeatRule))
        .all()
      for (const e of rows) {
        db.update(schema.calendarPrintEvents)
          .set({repeatRule: JSON.stringify(guessRule(e.title, e.date))})
          .where(eq(schema.calendarPrintEvents.id, e.id))
          .run()
      }
      return rows.length
    },
  )
}
