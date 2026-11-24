import * as Sentry from '@sentry/node'
import type Database from 'better-sqlite3'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Nightly consistent snapshot of the live database and uploads, written next to them on the same
// volume: <dir>/nightly.db and <dir>/uploads.tar.gz. Railway's volume backups capture it, and the
// Mac downloads it into iCloud Drive (ADR 0043). db.backup() is SQLite's online backup, so the
// copy is consistent even while the app is writing in WAL mode.
//
// Enabled only when SNAPSHOT_DIR is set (Railway production), and never in a sandbox.

const RUN_AT_HOUR = 3 // 03:00 in the server's TZ (set TZ=America/New_York on Railway)

export async function writeSnapshot(sqlite: Database.Database, dir: string, uploadsDir: string): Promise<void> {
  fs.mkdirSync(dir, {recursive: true})
  const dbTmp = path.join(dir, 'nightly.db.tmp')
  await sqlite.backup(dbTmp)
  fs.renameSync(dbTmp, path.join(dir, 'nightly.db'))

  if (fs.existsSync(uploadsDir)) {
    const tarTmp = path.join(dir, 'uploads.tar.gz.tmp')
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('tar', ['-czf', tarTmp, '-C', uploadsDir, '.'])
      let stderr = ''
      proc.stderr.on('data', (d) => (stderr += d))
      proc.on('error', reject)
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${stderr}`))))
    })
    fs.renameSync(tarTmp, path.join(dir, 'uploads.tar.gz'))
  }
}

export function msUntilNextRun(now: Date, hour = RUN_AT_HOUR): number {
  const next = new Date(now)
  next.setHours(hour, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

export function startSnapshotScheduler(sqlite: Database.Database, dir: string, uploadsDir: string): void {
  const run = () => {
    writeSnapshot(sqlite, dir, uploadsDir)
      .then(() => console.log(`Snapshot written to ${dir}`))
      .catch((err) => {
        console.error('Nightly snapshot failed:', err)
        Sentry.captureException(err, {tags: {source: 'db-snapshot'}})
      })
      .finally(schedule)
  }
  const schedule = () => setTimeout(run, msUntilNextRun(new Date()))
  schedule()
}
