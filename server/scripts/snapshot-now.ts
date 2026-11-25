/**
 * Takes a snapshot right now, the same as the nightly one (server/services/db-snapshot.ts).
 * For before a restore or a rollback, when last night's copy is too old:
 *
 *   railway ssh -- pnpm snapshot:now
 *
 * Needs SNAPSHOT_DIR (set on Railway). Safe while the app is running: db.backup() is SQLite's
 * online backup.
 */
const dir = process.env.SNAPSHOT_DIR
if (!dir) {
  console.error('snapshot:now: SNAPSHOT_DIR is not set')
  process.exit(1)
}

const {sqlite} = await import('../db/index.js')
const {UPLOADS_DIR} = await import('../lib/uploads.js')
const {writeSnapshot} = await import('../services/db-snapshot.js')

const day = await writeSnapshot(sqlite, dir, UPLOADS_DIR)
console.log(`snapshot:now: written to ${day} (and ${dir}/nightly.db)`)

export {}
