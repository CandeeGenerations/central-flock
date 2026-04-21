/**
 * One-time data migration: merges devotions.db, quotes.db, hymns.db, nursery.db
 * into the unified central-flock.db.
 *
 * Prereq: run `pnpm db:migrate` first so the target DB has all the new tables.
 *
 * Usage: pnpm consolidate-dbs
 *
 * Safe to re-run: refuses if the sentinel row in `settings` indicates consolidation
 * already happened. Backs up every .db file before touching anything.
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const TARGET = path.join(ROOT, 'central-flock.db')
const SOURCES = [
  {
    file: path.join(ROOT, 'devotions.db'),
    alias: 'src_devotions',
    tables: ['devotions', 'gwendolyn_devotions', 'scan_drafts', 'generated_passages'],
  },
  {
    file: path.join(ROOT, 'quotes.db'),
    alias: 'src_quotes',
    tables: ['quotes', 'quote_searches'],
  },
  {
    file: path.join(ROOT, 'hymns.db'),
    alias: 'src_hymns',
    tables: ['hymns', 'hymn_searches'],
  },
  {
    file: path.join(ROOT, 'nursery.db'),
    alias: 'src_nursery',
    tables: [
      'nursery_workers',
      'nursery_worker_services',
      'nursery_service_config',
      'nursery_schedules',
      'nursery_assignments',
      'nursery_settings',
    ],
  },
] as const

const SENTINEL_KEY = 'consolidated_at'

function backupAll(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(ROOT, 'backups', ts)
  fs.mkdirSync(backupDir, {recursive: true})

  const candidates = [TARGET, ...SOURCES.map((s) => s.file)]
  for (const db of candidates) {
    for (const suffix of ['', '-wal', '-shm']) {
      const src = db + suffix
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupDir, path.basename(src)))
      }
    }
  }
  return backupDir
}

function checkSentinel(target: Database.Database): void {
  const row = target.prepare(`SELECT value FROM settings WHERE key = ?`).get(SENTINEL_KEY) as
    | {value: string}
    | undefined
  if (row) {
    throw new Error(
      `Consolidation sentinel already set (settings.${SENTINEL_KEY} = ${row.value}). ` +
        `Aborting to avoid duplicate imports. Delete the row to force re-run.`,
    )
  }
}

function countRows(db: Database.Database, table: string, schema = 'main'): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${schema}.${table}`).get() as {c: number}
  return row.c
}

function copyTable(target: Database.Database, alias: string, table: string): {copied: number; before: number} {
  const before = countRows(target, table)
  const srcCount = countRows(target, table, alias)

  // Pull the concrete column list from the source, so we insert in a known order
  // regardless of table layout or generated columns.
  const cols = (
    target.prepare(`SELECT name FROM ${alias}.pragma_table_info('${table}')`).all() as {name: string}[]
  ).map((c) => `"${c.name}"`)
  const colList = cols.join(', ')

  target.exec(`INSERT OR IGNORE INTO main."${table}" (${colList}) SELECT ${colList} FROM ${alias}."${table}"`)

  const after = countRows(target, table)
  const copied = after - before
  if (copied !== srcCount && copied !== srcCount - 0) {
    // Informational — OR IGNORE may have skipped rows that collided with an existing row.
    console.log(`  note: ${table} source=${srcCount} actuallyCopied=${copied} (conflicts ignored)`)
  }
  return {copied, before}
}

function main(): void {
  if (!fs.existsSync(TARGET)) {
    console.error(`Target DB not found: ${TARGET}`)
    console.error(`Run \`pnpm db:migrate\` first to create the schema.`)
    process.exit(1)
  }

  const missingSources = SOURCES.filter((s) => !fs.existsSync(s.file))
  if (missingSources.length > 0) {
    console.log(`Note: these source DBs are missing and will be skipped:`)
    for (const s of missingSources) console.log(`  - ${s.file}`)
  }

  console.log(`Backing up databases...`)
  const backupDir = backupAll()
  console.log(`  backup → ${backupDir}`)

  const target = new Database(TARGET)
  target.pragma('foreign_keys = OFF')

  try {
    checkSentinel(target)

    for (const src of SOURCES) {
      if (!fs.existsSync(src.file)) continue

      console.log(`\nAttaching ${path.basename(src.file)}...`)
      target.exec(`ATTACH DATABASE '${src.file.replace(/'/g, "''")}' AS ${src.alias}`)

      try {
        target.exec('BEGIN')
        for (const table of src.tables) {
          const {copied, before} = copyTable(target, src.alias, table)
          const srcCount = countRows(target, table, src.alias)
          console.log(`  ${table}: target had ${before}, source has ${srcCount}, copied ${copied}`)
        }
        target.exec('COMMIT')
      } catch (err) {
        target.exec('ROLLBACK')
        throw err
      } finally {
        target.exec(`DETACH DATABASE ${src.alias}`)
      }
    }

    // Set sentinel so future runs refuse.
    target
      .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
      .run(SENTINEL_KEY, new Date().toISOString())

    console.log(`\n✓ Consolidation complete. Sentinel set.`)
    console.log(`  Backup retained at: ${backupDir}`)
    console.log(`\nNext steps:`)
    console.log(`  1. Smoke-test the app (devotions, quotes, hymns, nursery, home).`)
    console.log(`  2. Once confirmed working, delete: devotions.db, quotes.db, hymns.db, nursery.db (+ -wal/-shm).`)
  } finally {
    target.pragma('foreign_keys = ON')
    target.close()
  }
}

main()
