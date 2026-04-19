import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'hymns.db')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Ensure tables exist (idempotent)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS hymns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    first_line TEXT,
    refrain_line TEXT,
    author TEXT,
    composer TEXT,
    tune TEXT,
    meter TEXT,
    topics TEXT NOT NULL DEFAULT '[]',
    scripture_refs TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS hymn_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    scripture_text TEXT NOT NULL,
    theme TEXT NOT NULL,
    audience TEXT NOT NULL,
    hymnal_filter TEXT NOT NULL,
    sections TEXT NOT NULL,
    raw_response TEXT NOT NULL,
    model TEXT NOT NULL,
    candidate_count INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_hymns_book_number ON hymns(book, number);
  CREATE INDEX IF NOT EXISTS idx_hymns_book ON hymns(book);
  CREATE INDEX IF NOT EXISTS idx_hymns_title ON hymns(title);
  CREATE INDEX IF NOT EXISTS idx_hymn_searches_created_at ON hymn_searches(created_at);
`)

export const hymnsDb = drizzle(sqlite, {schema})
export const hymnsSqlite = sqlite
export {schema as hymnsSchema}
