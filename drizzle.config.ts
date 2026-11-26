import {defineConfig} from 'drizzle-kit'

// A PR environment migrates its own database, not production's (server/lib/preview-env.ts).
import {applyPreviewEnvironment} from './server/lib/preview-env.ts'

applyPreviewEnvironment()

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    // Railway keeps the DB on its volume (CENTRAL_FLOCK_DB_PATH=/data/central-flock.db); the
    // pre-deploy `pnpm db:migrate` must migrate that file, not a stray one in the app folder.
    url: process.env.CENTRAL_FLOCK_DB_PATH || './central-flock.db',
  },
  // FTS5 virtual tables and their shadow tables are created at runtime in
  // server/db/index.ts. Drizzle has no schema for them — exclude so push/pull
  // doesn't try to drop them.
  tablesFilter: ['!quotes_fts', '!quotes_fts_*'],
})
