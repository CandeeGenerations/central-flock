import Database from 'better-sqlite3'
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {KEEP_DAYS, datedSnapshots, msUntilNextRun, snapshotOverdue, writeSnapshot} from '../services/db-snapshot.js'
import {importIncomingCopy} from './incoming-import.js'

let dir: string
let dbPath: string
let incomingDir: string
let uploadsDir: string

function makeDb(file: string, label: string): void {
  const conn = new Database(file)
  conn.exec(`CREATE TABLE marker (label TEXT); INSERT INTO marker VALUES ('${label}')`)
  conn.close()
}

function readLabel(file: string): string {
  const conn = new Database(file, {readonly: true})
  try {
    return (conn.prepare('SELECT label FROM marker').get() as {label: string}).label
  } finally {
    conn.close()
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-import-'))
  dbPath = path.join(dir, 'central-flock.db')
  incomingDir = path.join(dir, 'incoming')
  uploadsDir = path.join(dir, 'uploads')
  fs.mkdirSync(incomingDir)
  fs.mkdirSync(uploadsDir)
  makeDb(dbPath, 'current')
})

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true})
})

describe('importIncomingCopy', () => {
  it('does nothing when no copy is waiting', () => {
    expect(importIncomingCopy({dbPath, incomingDir, uploadsDir, sandbox: true, runMigrations: vi.fn()})).toBe('none')
    expect(readLabel(dbPath)).toBe('current')
  })

  it('refuses outside a sandbox and leaves both files alone', () => {
    makeDb(path.join(incomingDir, 'central-flock.db'), 'copy')
    const migrate = vi.fn()
    expect(importIncomingCopy({dbPath, incomingDir, uploadsDir, sandbox: false, runMigrations: migrate})).toBe(
      'refused',
    )
    expect(readLabel(dbPath)).toBe('current')
    expect(fs.existsSync(path.join(incomingDir, 'central-flock.db'))).toBe(true)
    expect(migrate).not.toHaveBeenCalled()
  })

  it('swaps the copy in, migrates it and unpacks uploads in a sandbox', () => {
    makeDb(path.join(incomingDir, 'central-flock.db'), 'copy')
    fs.writeFileSync(`${dbPath}-wal`, 'stale')
    const src = path.join(dir, 'src-uploads')
    fs.mkdirSync(path.join(src, 'prayer-sheets'), {recursive: true})
    fs.writeFileSync(path.join(src, 'prayer-sheets', 'a.jpg'), 'img')
    spawnSync('tar', ['-czf', path.join(incomingDir, 'uploads.tar.gz'), '-C', src, '.'])
    fs.writeFileSync(path.join(uploadsDir, 'old.txt'), 'stale upload')

    const migrate = vi.fn()
    expect(importIncomingCopy({dbPath, incomingDir, uploadsDir, sandbox: true, runMigrations: migrate})).toBe(
      'imported',
    )
    expect(readLabel(dbPath)).toBe('copy')
    expect(migrate).toHaveBeenCalledWith(dbPath)
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false)
    expect(fs.readFileSync(path.join(uploadsDir, 'prayer-sheets', 'a.jpg'), 'utf8')).toBe('img')
    expect(fs.existsSync(path.join(uploadsDir, 'old.txt'))).toBe(false)
    expect(fs.readdirSync(incomingDir)).toEqual([])
  })

  it('leaves no -wal/-shm behind in incoming for a WAL-mode copy, even with stale ones there', () => {
    const copy = path.join(incomingDir, 'central-flock.db')
    const conn = new Database(copy)
    conn.pragma('journal_mode = WAL')
    conn.exec(`CREATE TABLE marker (label TEXT); INSERT INTO marker VALUES ('wal-copy')`)
    conn.close()
    fs.writeFileSync(`${copy}-wal`, 'stale from last night')
    fs.writeFileSync(`${copy}-shm`, 'stale from last night')

    expect(importIncomingCopy({dbPath, incomingDir, uploadsDir, sandbox: true, runMigrations: vi.fn()})).toBe(
      'imported',
    )
    expect(readLabel(dbPath)).toBe('wal-copy')
    expect(fs.readdirSync(incomingDir)).toEqual([])
  })

  it('keeps the current database when the copy is corrupt', () => {
    fs.writeFileSync(path.join(incomingDir, 'central-flock.db'), 'not a database')
    expect(importIncomingCopy({dbPath, incomingDir, uploadsDir, sandbox: true, runMigrations: vi.fn()})).toBe('invalid')
    expect(readLabel(dbPath)).toBe('current')
  })
})

describe('writeSnapshot', () => {
  it('writes a consistent copy and an uploads tar', async () => {
    fs.writeFileSync(path.join(uploadsDir, 'a.txt'), 'hello')
    const live = new Database(dbPath)
    live.pragma('journal_mode = WAL')
    live.exec(`INSERT INTO marker VALUES ('written-in-wal')`)
    const out = path.join(dir, 'backups')
    const day = await writeSnapshot(live, out, uploadsDir, new Date(2026, 10, 24, 3))
    live.close()

    expect(path.basename(day)).toBe('2026-11-24')
    expect(fs.existsSync(path.join(day, 'central-flock.db'))).toBe(true)
    const copy = new Database(path.join(out, 'nightly.db'), {readonly: true})
    expect(copy.pragma('integrity_check', {simple: true})).toBe('ok')
    expect((copy.prepare('SELECT count(*) AS n FROM marker').get() as {n: number}).n).toBe(2)
    copy.close()
    const list = spawnSync('tar', ['-tzf', path.join(out, 'uploads.tar.gz')], {encoding: 'utf8'}).stdout
    expect(list).toContain('a.txt')
  })

  it(`keeps the newest ${KEEP_DAYS} nights and points nightly.db at the newest`, async () => {
    const live = new Database(dbPath)
    const out = path.join(dir, 'backups')
    for (let d = 1; d <= 10; d++) {
      live.exec(`INSERT INTO marker VALUES ('night-${d}')`)
      await writeSnapshot(live, out, uploadsDir, new Date(2026, 10, d, 3))
    }
    live.close()

    expect(datedSnapshots(out)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ])
    const latest = new Database(path.join(out, 'nightly.db'), {readonly: true})
    expect((latest.prepare('SELECT count(*) AS n FROM marker').get() as {n: number}).n).toBe(11)
    latest.close()
  })
})

describe('snapshotOverdue', () => {
  it('is overdue with no snapshots, or when the newest is older than yesterday', async () => {
    const out = path.join(dir, 'backups')
    const now = new Date(2026, 10, 24, 12)
    expect(snapshotOverdue(out, now)).toBe(true)
    const live = new Database(dbPath)
    await writeSnapshot(live, out, uploadsDir, new Date(2026, 10, 23, 3))
    expect(snapshotOverdue(out, now)).toBe(false)
    expect(snapshotOverdue(out, new Date(2026, 10, 25, 12))).toBe(true)
    live.close()
  })
})

describe('msUntilNextRun', () => {
  it('waits until 03:00 today, or tomorrow once it has passed', () => {
    expect(msUntilNextRun(new Date(2026, 10, 24, 1, 0, 0))).toBe(2 * 3600_000)
    expect(msUntilNextRun(new Date(2026, 10, 24, 4, 0, 0))).toBe(23 * 3600_000)
  })
})
