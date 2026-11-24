import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {migrate} from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

import * as schema from './schema.js'
import {fakePhone, isEmpty, seedDatabase} from './seed.js'

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

function freshDb() {
  const conn = new Database(':memory:')
  const db = drizzle(conn, {schema})
  migrate(db, {migrationsFolder: MIGRATIONS})
  return {conn, db}
}

describe('seedDatabase', () => {
  it('fills an empty, freshly migrated database', () => {
    const {conn, db} = freshDb()
    expect(isEmpty(db)).toBe(true)
    seedDatabase(db, new Date(2026, 10, 24))
    expect(isEmpty(db)).toBe(false)

    const count = (table: string) => (conn.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n: number}).n
    expect(count('people')).toBeGreaterThan(20)
    expect(count('groups')).toBe(5)
    expect(count('messages')).toBe(2)
    expect(count('drafts')).toBe(1)
    expect(count('devotions')).toBe(24)
    expect(count('generated_passages')).toBe(5)
    expect(count('nursery_assignments')).toBeGreaterThan(0)
    expect(count('service_records')).toBeGreaterThan(0)
    expect(count('rsvp_entries')).toBe(10)
    conn.close()
  })

  it('uses only fictional 555-0100–0199 phone numbers', () => {
    const {conn, db} = freshDb()
    seedDatabase(db)
    const phones = (conn.prepare('SELECT phone_number FROM people').all() as {phone_number: string}[]).map(
      (r) => r.phone_number,
    )
    for (const phone of phones) expect(phone).toMatch(/^\+1202555(01\d\d)$/)
    expect(new Set(phones).size).toBe(phones.length)
    conn.close()
  })

  it('keeps fakePhone in range', () => {
    expect(fakePhone(0).e164).toBe('+12025550100')
    expect(fakePhone(99).e164).toBe('+12025550199')
    expect(fakePhone(100).e164).toBe('+12025550100')
  })
})
