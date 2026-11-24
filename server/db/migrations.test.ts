import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {migrate} from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

// Every PR test environment starts from an empty database, so the migrations alone must build the
// whole schema. Until 2026-11 they could not: 0022 and 0042 failed on an empty database, and the
// `schedules` table plus three columns had reached production outside migrations.

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as {name: string}[]).map((c) => c.name)
}

describe('migrations on an empty database', () => {
  it('apply cleanly and build the tables production has', () => {
    const db = new Database(':memory:')
    migrate(drizzle(db), {migrationsFolder: MIGRATIONS})

    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {name: string}[]).map(
      (t) => t.name,
    )
    expect(tables).toEqual(expect.arrayContaining(['people', 'messages', 'drafts', 'schedules', 'generated_passages']))
    expect(tables).not.toContain('nursery_schedules')
    expect(columns(db, 'messages')).not.toContain('group_id')
    expect(columns(db, 'calendar_print_pages')).toContain('hide_normal_schedule_footer')
    expect(columns(db, 'normal_schedule_items')).toContain('hidden')
    expect(columns(db, 'calendar_print_day_overrides')).toContain('show_normal_schedule_label')
    expect(columns(db, 'people')).toContain('display_first_name_only')
    expect(columns(db, 'special_music_performers')).toContain('display_first_name_only')
    db.close()
  })
})
