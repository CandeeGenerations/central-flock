import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {migrate} from 'drizzle-orm/better-sqlite3/migrator'
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// Loads a copy of production into a sandbox at boot: the nightly rehearsal copy before cut-over,
// and staging afterwards (plans/railway-cutover.md, Phase 2). The copy is uploaded to
// <incoming>/central-flock.db (+ optional uploads.tar.gz) and swapped in before the DB opens.
//
// Only a sandbox may import. Anywhere else the files are left alone and the refusal is logged
// loudly, so a stray upload can never overwrite live data.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations')

export type ImportResult = 'none' | 'imported' | 'refused' | 'invalid'

export interface ImportOptions {
  dbPath: string
  incomingDir: string
  uploadsDir: string
  sandbox: boolean
  // Brings the copy up to this build's schema. Swappable for tests.
  runMigrations?: (dbPath: string) => void
}

function migrateCopy(dbPath: string): void {
  const conn = new Database(dbPath)
  try {
    migrate(drizzle(conn), {migrationsFolder: MIGRATIONS_FOLDER})
  } finally {
    conn.close()
  }
}

function integrityOk(file: string): boolean {
  try {
    const conn = new Database(file, {readonly: true, fileMustExist: true})
    try {
      return conn.pragma('integrity_check', {simple: true}) === 'ok'
    } finally {
      conn.close()
    }
  } catch {
    return false
  }
}

export function importIncomingCopy(options: ImportOptions): ImportResult {
  const {dbPath, incomingDir, uploadsDir, sandbox, runMigrations = migrateCopy} = options
  const incomingDb = path.join(incomingDir, 'central-flock.db')
  const incomingUploads = path.join(incomingDir, 'uploads.tar.gz')
  if (!fs.existsSync(incomingDb)) return 'none'

  if (!sandbox) {
    console.error(
      `!!! ${incomingDb} exists but CENTRAL_FLOCK_SANDBOX is not 1 — refusing to replace the live database. ` +
        'Delete the file if it was not meant to be here.',
    )
    return 'refused'
  }

  if (!integrityOk(incomingDb)) {
    console.error(`Incoming copy ${incomingDb} failed its integrity check; keeping the current database`)
    return 'invalid'
  }

  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, {force: true})
  fs.mkdirSync(path.dirname(dbPath), {recursive: true})
  fs.renameSync(incomingDb, dbPath)
  runMigrations(dbPath)

  if (fs.existsSync(incomingUploads)) {
    fs.mkdirSync(uploadsDir, {recursive: true})
    for (const entry of fs.readdirSync(uploadsDir)) {
      fs.rmSync(path.join(uploadsDir, entry), {recursive: true, force: true})
    }
    const tar = spawnSync('tar', ['-xzf', incomingUploads, '-C', uploadsDir], {encoding: 'utf8'})
    if (tar.status !== 0) console.error(`Unpacking ${incomingUploads} failed: ${tar.stderr}`)
    fs.rmSync(incomingUploads, {force: true})
  }

  console.log(`Sandbox: imported the production copy from ${incomingDir}`)
  return 'imported'
}
