import * as Sentry from '@sentry/node'
import type Database from 'better-sqlite3'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Nightly consistent snapshot of the live database and uploads, kept on the same volume. These are
// Central Flock's backups on Railway's Hobby plan, which cannot create volume backups (ADR 0043):
//
//   <dir>/YYYY-MM-DD/central-flock.db   one folder per night, the newest KEEP_DAYS kept
//   <dir>/YYYY-MM-DD/uploads.tar.gz
//   <dir>/nightly.db, <dir>/uploads.tar.gz   the newest night again, at a fixed path for the Mac's
//                                            nightly download into iCloud Drive
//
// db.backup() is SQLite's online backup, so a copy is consistent even while the app writes in WAL
// mode. Enabled only when SNAPSHOT_DIR is set (Railway production), and never in a sandbox.
// Restoring: plans/railway-cutover.md → "Restoring from a snapshot".

const RUN_AT_HOUR = 3 // 03:00 in the server's TZ (set TZ=America/New_York on Railway)
export const KEEP_DAYS = 7
const DATED = /^\d{4}-\d{2}-\d{2}$/

const pad = (n: number) => String(n).padStart(2, '0')
const dayName = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function tarDirectory(source: string, target: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('tar', ['-czf', target, '-C', source, '.'])
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${stderr}`))))
  })
}

// Points <dir>/<name> at the newest dated copy. A hard link costs no extra space; copy if the
// filesystem refuses links.
function publishLatest(dir: string, dated: string, name: string): void {
  const target = path.join(dir, name)
  const tmp = `${target}.tmp`
  fs.rmSync(tmp, {force: true})
  try {
    fs.linkSync(dated, tmp)
  } catch {
    fs.copyFileSync(dated, tmp)
  }
  fs.renameSync(tmp, target)
}

export function datedSnapshots(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => DATED.test(name) && fs.existsSync(path.join(dir, name, 'central-flock.db')))
    .sort()
}

export async function writeSnapshot(
  sqlite: Database.Database,
  dir: string,
  uploadsDir: string,
  now = new Date(),
): Promise<string> {
  const day = path.join(dir, dayName(now))
  fs.mkdirSync(day, {recursive: true})

  const dbTmp = path.join(day, 'central-flock.db.tmp')
  await sqlite.backup(dbTmp)
  fs.renameSync(dbTmp, path.join(day, 'central-flock.db'))
  publishLatest(dir, path.join(day, 'central-flock.db'), 'nightly.db')

  if (fs.existsSync(uploadsDir)) {
    const tarTmp = path.join(day, 'uploads.tar.gz.tmp')
    await tarDirectory(uploadsDir, tarTmp)
    fs.renameSync(tarTmp, path.join(day, 'uploads.tar.gz'))
    publishLatest(dir, path.join(day, 'uploads.tar.gz'), 'uploads.tar.gz')
  }

  for (const old of datedSnapshots(dir).slice(0, -KEEP_DAYS)) {
    fs.rmSync(path.join(dir, old), {recursive: true, force: true})
  }
  return day
}

export function msUntilNextRun(now: Date, hour = RUN_AT_HOUR): number {
  const next = new Date(now)
  next.setHours(hour, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

// True when the newest snapshot is from before yesterday — e.g. the server was down or redeploying
// at 03:00 — so boot takes one straight away instead of leaving a gap.
export function snapshotOverdue(dir: string, now = new Date()): boolean {
  const newest = datedSnapshots(dir).at(-1)
  if (!newest) return true
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return newest < dayName(yesterday)
}

export function startSnapshotScheduler(sqlite: Database.Database, dir: string, uploadsDir: string): void {
  const run = (thenSchedule: boolean) => {
    writeSnapshot(sqlite, dir, uploadsDir)
      .then((day) => console.log(`Snapshot written to ${day}`))
      .catch((err) => {
        console.error('Nightly snapshot failed:', err)
        Sentry.captureException(err, {tags: {source: 'db-snapshot'}})
      })
      .finally(() => {
        if (thenSchedule) schedule()
      })
  }
  const schedule = () => setTimeout(() => run(true), msUntilNextRun(new Date()))
  if (snapshotOverdue(dir)) run(false)
  schedule()
}
