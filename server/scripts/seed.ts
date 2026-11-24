/**
 * Fills an empty sandbox database with fake data (server/db/seed.ts).
 *
 *   CENTRAL_FLOCK_SANDBOX=1 CENTRAL_FLOCK_DB_PATH=/path/to/test.db pnpm db:seed
 *
 * Safe to run on every deploy (Railway pre-deploy runs `pnpm db:migrate && pnpm db:seed`): it does
 * nothing unless CENTRAL_FLOCK_SANDBOX=1, and nothing if the database already has people in it.
 * So production — which is never a sandbox — is never touched.
 */
import {isSandbox} from '../lib/sandbox.js'

if (!isSandbox()) {
  console.log('db:seed: not a sandbox (CENTRAL_FLOCK_SANDBOX != 1), nothing to do')
  process.exit(0)
}

// Imported only after the check, because opening the DB module opens (and creates) the file.
const {db} = await import('../db/index.js')
const {isEmpty, seedDatabase} = await import('../db/seed.js')

if (!isEmpty(db)) {
  console.log('db:seed: database already has data, nothing to do')
  process.exit(0)
}

seedDatabase(db)
console.log('db:seed: fake data added')
