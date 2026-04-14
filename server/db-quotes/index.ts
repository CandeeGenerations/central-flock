import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'quotes.db')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Ensure tables exist (idempotent)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    captured_by TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    date_display TEXT NOT NULL,
    summary TEXT NOT NULL,
    quote_text TEXT NOT NULL,
    tags TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quote_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    synthesis TEXT NOT NULL,
    results TEXT NOT NULL,
    model TEXT NOT NULL,
    candidate_count INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_quotes_author ON quotes(author);
  CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
  CREATE INDEX IF NOT EXISTS idx_quote_searches_created_at ON quote_searches(created_at);
`)

// FTS5 virtual table + sync triggers (idempotent via IF NOT EXISTS)
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

export const quotesDb = drizzle(sqlite, {schema})
export const quotesSqlite = sqlite
export {schema as quotesSchema}
