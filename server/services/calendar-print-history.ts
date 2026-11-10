// Calendar Print History — one linear timeline of Changes for all of Calendar Print, like a
// document's history. See CONTEXT.md → Change / History and docs/adr/0041.
//
// Every Calendar Print write goes through recordChange(). A Change stores a gzipped snapshot of
// every Calendar Print table *after* it ran; undo / redo / Restore to here just put an earlier
// snapshot back. The data is small (~100 Events a year), so whole snapshots beat diffs: there is
// no per-table undo logic to keep in sync with the routes, and Restore can never half-apply.
//
// Snapshots keep row ids, so a restore re-inserts rows under their original ids and every
// reference between them (Day Override → schedule line ids, page-scoped lines → page id) holds.
// AUTOINCREMENT never reuses ids, so a restored row can't collide with one created later.
import {asc, desc, eq} from 'drizzle-orm'
import {gunzipSync, gzipSync} from 'node:zlib'

import {db, schema} from '../db/index.js'

interface Snapshot {
  pages: (typeof schema.calendarPrintPages.$inferSelect)[]
  events: (typeof schema.calendarPrintEvents.$inferSelect)[]
  items: (typeof schema.normalScheduleItems.$inferSelect)[]
  overrides: (typeof schema.calendarPrintDayOverrides.$inferSelect)[]
}

export interface HistoryEntry {
  id: number
  description: string
  createdAt: string
  undone: boolean
  isBaseline: boolean
}

const BASELINE_DESCRIPTION = 'Calendar before history began'

function takeSnapshot(): Snapshot {
  return {
    pages: db.select().from(schema.calendarPrintPages).orderBy(asc(schema.calendarPrintPages.id)).all(),
    events: db.select().from(schema.calendarPrintEvents).orderBy(asc(schema.calendarPrintEvents.id)).all(),
    items: db.select().from(schema.normalScheduleItems).orderBy(asc(schema.normalScheduleItems.id)).all(),
    overrides: db
      .select()
      .from(schema.calendarPrintDayOverrides)
      .orderBy(asc(schema.calendarPrintDayOverrides.id))
      .all(),
  }
}

function encode(s: Snapshot): Buffer {
  return gzipSync(JSON.stringify(s))
}

function decode(b: Buffer): Snapshot {
  return JSON.parse(gunzipSync(b).toString('utf8')) as Snapshot
}

// Content identity, ignoring timestamps — so a save that changed nothing records no Change.
function contentKey(s: Snapshot): string {
  return JSON.stringify(s, (k, v) => (k === 'updatedAt' || k === 'createdAt' ? undefined : v))
}

function insertChunked<T>(rows: T[], insert: (chunk: T[]) => void) {
  for (let i = 0; i < rows.length; i += 200) insert(rows.slice(i, i + 200))
}

function applySnapshot(s: Snapshot) {
  // Events and Day Overrides cascade from pages; schedule lines have no FK, so clear them too.
  db.delete(schema.calendarPrintDayOverrides).run()
  db.delete(schema.calendarPrintEvents).run()
  db.delete(schema.calendarPrintPages).run()
  db.delete(schema.normalScheduleItems).run()
  insertChunked(s.pages, (c) => db.insert(schema.calendarPrintPages).values(c).run())
  insertChunked(s.events, (c) => db.insert(schema.calendarPrintEvents).values(c).run())
  insertChunked(s.items, (c) => db.insert(schema.normalScheduleItems).values(c).run())
  insertChunked(s.overrides, (c) => db.insert(schema.calendarPrintDayOverrides).values(c).run())
}

function activeRows() {
  return db
    .select({id: schema.calendarPrintChanges.id, description: schema.calendarPrintChanges.description})
    .from(schema.calendarPrintChanges)
    .where(eq(schema.calendarPrintChanges.undone, false))
    .orderBy(asc(schema.calendarPrintChanges.id))
    .all()
}

function snapshotOf(id: number): Snapshot {
  const row = db
    .select({snapshot: schema.calendarPrintChanges.snapshot})
    .from(schema.calendarPrintChanges)
    .where(eq(schema.calendarPrintChanges.id, id))
    .get()
  if (!row) throw new Error(`History entry ${id} not found`)
  return decode(row.snapshot)
}

function insertChange(description: string, snapshot: Snapshot) {
  db.insert(schema.calendarPrintChanges)
    .values({description, snapshot: encode(snapshot)})
    .run()
}

// Run `fn` (a Calendar Print write) as one Change. `description` may depend on fn's result.
// Returns fn's result. If the write left everything as it was, nothing is recorded.
export function recordChange<T>(description: string | ((result: T) => string), fn: () => T): T {
  return db.transaction(() => {
    const active = activeRows()
    let before: Snapshot | null = null
    if (active.length === 0) {
      before = takeSnapshot()
      insertChange(BASELINE_DESCRIPTION, before)
    }
    const result = fn()
    const after = takeSnapshot()
    const latest = before ?? snapshotOf(activeRows().at(-1)!.id)
    if (contentKey(after) === contentKey(latest)) return result
    // A new Change ends the redo trail.
    db.delete(schema.calendarPrintChanges).where(eq(schema.calendarPrintChanges.undone, true)).run()
    insertChange(typeof description === 'function' ? description(result) : description, after)
    return result
  })
}

export function undo(): {description: string} | null {
  return db.transaction(() => {
    const active = activeRows()
    if (active.length < 2) return null // only the baseline (or nothing) — nothing to undo
    const latest = active[active.length - 1]
    db.update(schema.calendarPrintChanges)
      .set({undone: true})
      .where(eq(schema.calendarPrintChanges.id, latest.id))
      .run()
    applySnapshot(snapshotOf(active[active.length - 2].id))
    return {description: latest.description}
  })
}

export function redo(): {description: string} | null {
  return db.transaction(() => {
    const next = db
      .select({id: schema.calendarPrintChanges.id, description: schema.calendarPrintChanges.description})
      .from(schema.calendarPrintChanges)
      .where(eq(schema.calendarPrintChanges.undone, true))
      .orderBy(asc(schema.calendarPrintChanges.id))
      .limit(1)
      .get()
    if (!next) return null
    db.update(schema.calendarPrintChanges).set({undone: false}).where(eq(schema.calendarPrintChanges.id, next.id)).run()
    applySnapshot(snapshotOf(next.id))
    return {description: next.description}
  })
}

// Roll back every Change after `id`. Itself a Change, so a regretted Restore can be undone.
export function restoreTo(id: number): {description: string} | null {
  const target = db.select().from(schema.calendarPrintChanges).where(eq(schema.calendarPrintChanges.id, id)).get()
  if (!target || target.undone) return null
  const when = target.createdAt.replace(' ', 'T') + 'Z'
  const description = `Restored to “${target.description}” (${new Date(when).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })})`
  recordChange(description, () => applySnapshot(decode(target.snapshot)))
  return {description}
}

export function listHistory(limit = 200): {entries: HistoryEntry[]; canUndo: boolean; canRedo: boolean} {
  const rows = db
    .select({
      id: schema.calendarPrintChanges.id,
      description: schema.calendarPrintChanges.description,
      createdAt: schema.calendarPrintChanges.createdAt,
      undone: schema.calendarPrintChanges.undone,
    })
    .from(schema.calendarPrintChanges)
    .orderBy(desc(schema.calendarPrintChanges.id))
    .limit(limit)
    .all()
  const first = db
    .select({id: schema.calendarPrintChanges.id})
    .from(schema.calendarPrintChanges)
    .orderBy(asc(schema.calendarPrintChanges.id))
    .limit(1)
    .get()
  return {
    entries: rows.map((r) => ({...r, isBaseline: r.id === first?.id})),
    canUndo: activeRows().length >= 2,
    canRedo: rows.some((r) => r.undone),
  }
}
