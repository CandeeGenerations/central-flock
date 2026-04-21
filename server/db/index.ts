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

export const db = drizzle(sqlite, {schema})
export {schema, sqlite}
