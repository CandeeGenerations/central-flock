import Database from 'better-sqlite3'
import {generateSQLiteDrizzleJson, generateSQLiteMigration} from 'drizzle-kit/api'
import {eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import * as schema from '../db/schema.js'

// This file needs a real DB: an in-memory one built from the current Drizzle
// schema (old migrations don't replay from empty), swapped in for the stub.
const holder = vi.hoisted(() => ({db: null as unknown}))
vi.mock('../db/index.js', async () => ({
  get db() {
    return holder.db
  },
  schema: await vi.importActual('../db/schema.js'),
}))

const {copyOrder, createWeek, insertLines, linesFor, replaceLines, servicesFor} =
  await import('./music-schedule-store.js')

type Db = ReturnType<typeof drizzle<typeof schema>>
let db: Db
let ddl: string[]

beforeAll(async () => {
  ddl = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
})

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  for (const stmt of ddl) sqlite.exec(stmt)
  db = drizzle(sqlite, {schema})
  holder.db = db
  db.insert(schema.serviceTimes)
    .values([
      {id: 1, name: 'Sunday Evening', dayOfWeek: 0, time: '18:30', active: true, sortOrder: 0},
      {id: 2, name: 'Wednesday Evening', dayOfWeek: 3, time: '19:30', active: true, sortOrder: 1},
    ])
    .run()
})

const wed = (weekId: number) => servicesFor(weekId).find((s) => s.serviceTimeId === 2)!
const texts = (serviceId: number) => linesFor(serviceId).map((l) => l.text)

function fill(serviceId: number, words: string[]) {
  db.delete(schema.musicScheduleLines).where(eq(schema.musicScheduleLines.serviceId, serviceId)).run()
  insertLines(
    serviceId,
    words.map((text) => ({kind: 'prose', role: 'plain', text})),
  )
}

describe('createWeek copy-forward', () => {
  it('copies the previous week when nothing is Standalone', () => {
    const a = createWeek('2026-11-15').weekId
    fill(wed(a).id, ['Live Stream', 'Prayer'])
    const b = createWeek('2026-11-22').weekId
    expect(texts(wed(b).id)).toEqual(['Live Stream', 'Prayer'])
  })

  it('reaches back past a Standalone service and clears the Occasion', () => {
    const normal = createWeek('2026-11-15').weekId
    fill(wed(normal).id, ['Live Stream', 'Prayer, Announcements'])
    const thanksgiving = createWeek('2026-11-22').weekId
    fill(wed(thanksgiving).id, ['Candles'])
    db.update(schema.musicScheduleServices)
      .set({standalone: true, occasion: 'Thanksgiving Eve Candlelight', musicHeading: 'CANDLELIGHT'})
      .where(eq(schema.musicScheduleServices.id, wed(thanksgiving).id))
      .run()

    const next = createWeek('2026-11-29').weekId
    const s = wed(next)
    expect(texts(s.id)).toEqual(['Live Stream', 'Prayer, Announcements'])
    expect(s.standalone).toBe(false)
    expect(s.occasion).toBe('')
    expect(s.musicHeading).toBe('')
  })

  it('rolls back the whole week when a step fails', () => {
    db.update(schema.serviceTimes).set({sortOrder: 0}).run()
    const spy = vi.spyOn(db, 'insert')
    let calls = 0
    spy.mockImplementation(((table: unknown) => {
      if (table === schema.musicScheduleServices && ++calls === 2) throw new Error('boom')
      return Object.getPrototypeOf(db).insert.call(db, table)
    }) as typeof db.insert)
    expect(() => createWeek('2026-11-15')).toThrow('boom')
    spy.mockRestore()
    expect(db.select().from(schema.musicSchedules).all()).toHaveLength(0)
    expect(db.select().from(schema.schedules).all()).toHaveLength(0)
  })
})

describe('copyOrder', () => {
  it('copies lines, songs and heading but not title, occasion or highlights', () => {
    const last = createWeek('2025-11-23').weekId
    const src = wed(last)
    db.insert(schema.hymns)
      .values({
        id: 191,
        book: 'burgundy',
        number: 191,
        title: 'COUNT YOUR BLESSINGS',
        topics: '[]',
        scriptureRefs: '[]',
      })
      .run()
    insertLines(src.id, [{kind: 'song', role: 'opening', hymnId: 191, highlight: true}])
    db.update(schema.musicScheduleServices)
      .set({standalone: true, occasion: 'Thanksgiving Eve Candlelight', title: 'Old Title', musicHeading: 'X'})
      .where(eq(schema.musicScheduleServices.id, src.id))
      .run()

    const now = createWeek('2026-11-22').weekId
    const target = wed(now)
    db.update(schema.musicScheduleServices)
      .set({title: 'New Title'})
      .where(eq(schema.musicScheduleServices.id, target.id))
      .run()
    copyOrder(target.id, src.id)

    const after = wed(now)
    const lines = linesFor(after.id)
    expect(lines.map((l) => l.hymnId)).toEqual([191])
    expect(lines[0].highlight).toBe(false)
    expect(after.title).toBe('New Title')
    expect(after.occasion).toBe('')
    expect(after.musicHeading).toBe('X')
    expect(after.standalone).toBe(true)
  })
})

describe('replaceLines', () => {
  it('keeps the previous order when the new one fails to insert', () => {
    const w = createWeek('2026-11-15').weekId
    const s = wed(w).id
    fill(s, ['Live Stream', 'Prayer'])
    // A hymn id that doesn't exist fails the foreign key part-way through.
    expect(() =>
      replaceLines(s, [
        {kind: 'prose', role: 'plain', text: 'New'},
        {kind: 'song', role: 'opening', hymnId: 99999},
      ]),
    ).toThrow()
    expect(texts(s)).toEqual(['Live Stream', 'Prayer'])
  })
})
