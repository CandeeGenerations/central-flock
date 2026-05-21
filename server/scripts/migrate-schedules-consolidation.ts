/**
 * Schedules consolidation migration (ADR 0006).
 *
 * - Creates the new `schedules` envelope table.
 * - Copies all `nursery_schedules` rows into `schedules` (ids preserved) with
 *   schedule_type='nursery', scope_kind='monthly'.
 * - Recreates `nursery_assignments` with the FK retargeted at `schedules.id`.
 * - Recreates `special_music` to make `song_title` nullable.
 * - Drops `nursery_schedules`.
 * - Moves the logo path from `nursery_settings.logoPath` to
 *   `settings.schedulesLogoPath` and renames the on-disk uploads folder
 *   from `nursery-logos` to `schedule-logos`.
 * - Seeds default `schedules.*` settings keys (titlePrefix, footerBlocks,
 *   singerGroupIds) if absent.
 *
 * Idempotent: safe to re-run; each step checks for prior application.
 *
 * Run with: pnpm tsx server/scripts/migrate-schedules-consolidation.ts
 *
 * IMPORTANT: stop the launchd service before running. The script takes an
 * exclusive write lock and the running app would conflict.
 */
import {existsSync, renameSync} from 'node:fs'
import path from 'node:path'

import {sqlite} from '../db/index.js'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function tableExists(name: string): boolean {
  const row = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
  return !!row
}

function columnIsNotNull(table: string, column: string): boolean {
  type Col = {name: string; notnull: number}
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Col[]
  const found = cols.find((c) => c.name === column)
  if (!found) throw new Error(`column ${table}.${column} not found`)
  return found.notnull === 1
}

function fkReferences(table: string, column: string): string | null {
  type Fk = {from: string; table: string; to: string}
  const rows = sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all() as Fk[]
  const fk = rows.find((r) => r.from === column)
  return fk?.table ?? null
}

const tx = sqlite.transaction(() => {
  console.log('starting migration...')
  // Defer FK checks until commit so the table-recreate dance doesn't trip on
  // transient mid-transaction inconsistencies.
  sqlite.pragma('defer_foreign_keys = ON')

  // 1. CREATE schedules
  if (!tableExists('schedules')) {
    console.log('  creating schedules envelope table')
    sqlite.exec(`
      CREATE TABLE schedules (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        schedule_type text NOT NULL,
        scope_kind text NOT NULL,
        month integer,
        year integer,
        scope_start text,
        scope_end text,
        scope_label text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at text NOT NULL DEFAULT (datetime('now')),
        updated_at text NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_schedules_type_status ON schedules(schedule_type, status);
      CREATE INDEX idx_schedules_type_year_month ON schedules(schedule_type, year, month);
      CREATE INDEX idx_schedules_type_scope ON schedules(schedule_type, scope_start, scope_end);
    `)
  } else {
    console.log('  schedules already exists, skip create')
  }

  // 2. INSERT nursery_schedules → schedules (ids preserved)
  if (tableExists('nursery_schedules')) {
    const existing = sqlite.prepare(`SELECT COUNT(*) AS n FROM schedules WHERE schedule_type='nursery'`).get() as {
      n: number
    }
    if (existing.n === 0) {
      console.log('  copying nursery_schedules rows into schedules')
      const rows = sqlite
        .prepare(`SELECT id, month, year, status, created_at, updated_at FROM nursery_schedules`)
        .all() as Array<{
        id: number
        month: number
        year: number
        status: string
        created_at: string
        updated_at: string
      }>

      const insert = sqlite.prepare(`
        INSERT INTO schedules (id, schedule_type, scope_kind, month, year, scope_label, status, created_at, updated_at)
        VALUES (@id, 'nursery', 'monthly', @month, @year, @scope_label, @status, @created_at, @updated_at)
      `)
      for (const r of rows) {
        insert.run({
          id: r.id,
          month: r.month,
          year: r.year,
          scope_label: `${MONTH_NAMES[r.month - 1]} ${r.year}`,
          status: r.status,
          created_at: r.created_at,
          updated_at: r.updated_at,
        })
      }
      console.log(`  copied ${rows.length} nursery schedule(s)`)
    } else {
      console.log('  schedules already has nursery rows, skip copy')
    }
  }

  // 3. Recreate nursery_assignments with FK to schedules.id
  if (tableExists('nursery_assignments')) {
    const currentTarget = fkReferences('nursery_assignments', 'schedule_id')
    if (currentTarget === 'nursery_schedules') {
      console.log('  recreating nursery_assignments with FK to schedules')
      sqlite.exec(`
        CREATE TABLE nursery_assignments_new (
          id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          schedule_id integer NOT NULL,
          date text NOT NULL,
          service_type text NOT NULL,
          slot integer NOT NULL,
          worker_id integer,
          FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON UPDATE no action ON DELETE cascade,
          FOREIGN KEY (worker_id) REFERENCES nursery_workers(id) ON UPDATE no action ON DELETE set null
        );

        INSERT INTO nursery_assignments_new (id, schedule_id, date, service_type, slot, worker_id)
          SELECT id, schedule_id, date, service_type, slot, worker_id FROM nursery_assignments;

        DROP TABLE nursery_assignments;
        ALTER TABLE nursery_assignments_new RENAME TO nursery_assignments;

        CREATE UNIQUE INDEX nursery_assignments_schedule_id_date_service_type_slot_unique
          ON nursery_assignments (schedule_id, date, service_type, slot);
      `)
    } else if (currentTarget === 'schedules') {
      console.log('  nursery_assignments already FKs to schedules, skip recreate')
    } else {
      console.log(`  unexpected FK target: ${currentTarget ?? '(none)'}, skip recreate`)
    }
  }

  // 4. Drop nursery_schedules
  if (tableExists('nursery_schedules')) {
    console.log('  dropping nursery_schedules')
    sqlite.exec(`DROP TABLE nursery_schedules`)
  } else {
    console.log('  nursery_schedules already gone, skip drop')
  }

  // 5. Recreate special_music to make song_title nullable
  if (tableExists('special_music') && columnIsNotNull('special_music', 'song_title')) {
    console.log('  recreating special_music to make song_title nullable')
    sqlite.exec(`
      CREATE TABLE special_music_new (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        date text NOT NULL,
        service_type text NOT NULL,
        service_label text,
        song_title text,
        hymn_id integer,
        song_arranger text,
        song_writer text,
        type text NOT NULL,
        status text NOT NULL,
        occasion text,
        guest_performers text NOT NULL DEFAULT '[]',
        youtube_url text,
        sheet_music_path text,
        notes text,
        created_at text NOT NULL DEFAULT (datetime('now')),
        updated_at text NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (hymn_id) REFERENCES hymns(id) ON UPDATE no action ON DELETE set null
      );

      INSERT INTO special_music_new
        SELECT id, date, service_type, service_label, song_title, hymn_id, song_arranger, song_writer,
               type, status, occasion, guest_performers, youtube_url, sheet_music_path, notes,
               created_at, updated_at
        FROM special_music;

      DROP TABLE special_music;
      ALTER TABLE special_music_new RENAME TO special_music;
    `)
  } else {
    console.log('  special_music.song_title already nullable, skip recreate')
  }

  // 6. Move logo path from nursery_settings to settings
  if (tableExists('nursery_settings')) {
    const oldRow = sqlite.prepare(`SELECT value FROM nursery_settings WHERE key='logoPath'`).get() as
      | {value: string}
      | undefined
    if (oldRow) {
      const newPath = oldRow.value.replace('/nursery-logos/', '/schedule-logos/')
      console.log(`  migrating logo path -> ${newPath}`)
      sqlite
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES ('schedulesLogoPath', @value, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value=@value, updated_at=datetime('now')`,
        )
        .run({value: newPath})
      sqlite.prepare(`DELETE FROM nursery_settings WHERE key='logoPath'`).run()
    } else {
      console.log('  no nursery_settings.logoPath row, skip logo migrate')
    }
  }

  // 7. Seed per-type settings defaults
  console.log('  seeding default settings keys')
  const seed = sqlite.prepare(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
  seed.run('schedules.nursery.titlePrefix', 'Nursery Schedule')
  seed.run('schedules.nursery.footerBlocks', '[]')
  seed.run('schedules.specialMusic.titlePrefix', 'CBC Special Music Schedule')
  seed.run(
    'schedules.specialMusic.footerBlocks',
    JSON.stringify([
      {
        kind: 'quote',
        text:
          '"I will praise thee, O LORD, with my whole heart; I will shew forth all thy marvellous works. ' +
          'I will be glad and rejoice in thee; I will sing praise to thy name, O thou most High." (Psalm 9:1-2)',
      },
      {kind: 'spacer', text: ''},
      {
        kind: 'note',
        text:
          'If you cannot present your special number when scheduled, contact Preacher in a timely manner ' +
          'and he will handle all adjustments. Thank you!',
      },
      {
        kind: 'note',
        text:
          "Remember, we're singing (or playing) first, to the Lord; second, about the Lord; and third, " +
          'about what the Lord has done for us. Our spirit and our attitude must be right with God :)',
      },
    ]),
  )
  seed.run('schedules.specialMusic.singerGroupIds', '[]')

  console.log('migration complete.')
})

// Run the on-disk uploads folder rename OUTSIDE the DB transaction.
function renameLogosFolder() {
  const uploadsRoot = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'data')
  const oldDir = path.join(uploadsRoot, 'nursery-logos')
  const newDir = path.join(uploadsRoot, 'schedule-logos')
  if (existsSync(oldDir) && !existsSync(newDir)) {
    console.log(`renaming uploads folder: ${oldDir} -> ${newDir}`)
    renameSync(oldDir, newDir)
  } else if (existsSync(newDir)) {
    console.log('schedule-logos folder already exists, skip rename')
  } else {
    console.log('no nursery-logos folder to rename')
  }
}

tx()
renameLogosFolder()
