import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'central-flock.db')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// FTS5 virtual table + sync triggers for quotes (not expressible in Drizzle schema).
// Idempotent via IF NOT EXISTS — safe to run on every boot.
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(
    title, author, summary, quote_text, tags,
    content='quotes', content_rowid='id',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS quotes_ai AFTER INSERT ON quotes BEGIN
    INSERT INTO quotes_fts(rowid, title, author, summary, quote_text, tags)
    VALUES (new.id, new.title, new.author, new.summary, new.quote_text, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS quotes_ad AFTER DELETE ON quotes BEGIN
    INSERT INTO quotes_fts(quotes_fts, rowid, title, author, summary, quote_text, tags)
    VALUES ('delete', old.id, old.title, old.author, old.summary, old.quote_text, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS quotes_au AFTER UPDATE ON quotes BEGIN
    INSERT INTO quotes_fts(quotes_fts, rowid, title, author, summary, quote_text, tags)
    VALUES ('delete', old.id, old.title, old.author, old.summary, old.quote_text, old.tags);
    INSERT INTO quotes_fts(rowid, title, author, summary, quote_text, tags)
    VALUES (new.id, new.title, new.author, new.summary, new.quote_text, new.tags);
  END;
`)

// Seed nursery service config defaults (idempotent)
sqlite.exec(`
  INSERT OR IGNORE INTO nursery_service_config (service_type, label, worker_count, sort_order) VALUES
    ('sunday_school', 'Sunday School Service', 1, 1),
    ('morning', 'Morning Service', 2, 2),
    ('evening', 'Evening Service', 1, 3),
    ('wednesday_evening', 'Wednesday Evening Service', 2, 4)
`)

// Seed the 4 recurring service times on a fresh DB (idempotent: only when empty,
// so admin edits/retirements are never clobbered). day_of_week: 0=Sun..6=Sat.
{
  const count = (sqlite.prepare(`SELECT count(*) as n FROM service_times`).get() as {n: number}).n
  if (count === 0) {
    const ins = sqlite.prepare(
      `INSERT INTO service_times (name, day_of_week, time, active, sort_order) VALUES (?, ?, ?, 1, ?)`,
    )
    ins.run('Sunday 9:45am', 0, '09:45', 1)
    ins.run('Sunday 11:00am', 0, '11:00', 2)
    ins.run('Sunday 6:30pm', 0, '18:30', 3)
    ins.run('Wednesday 7:30pm', 3, '19:30', 4)
  }
}

// Seed per-schedule-type settings defaults (idempotent). See ADR 0006.
{
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
}

// Idempotent boot-time migration: add display_first_name_only columns for
// the schedule rendering toggle. See ADR 0006 follow-up.
function hasColumn(table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{name: string}>
  return rows.some((r) => r.name === column)
}
if (!hasColumn('people', 'display_first_name_only')) {
  sqlite.exec(`ALTER TABLE people ADD COLUMN display_first_name_only integer NOT NULL DEFAULT 0`)
}
if (!hasColumn('special_music_performers', 'display_first_name_only')) {
  sqlite.exec(`ALTER TABLE special_music_performers ADD COLUMN display_first_name_only integer`)
}

export const db = drizzle(sqlite, {schema})
export {schema, sqlite}
