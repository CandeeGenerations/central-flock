import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './central-flock.db',
  },
  // FTS5 virtual tables and their shadow tables are created at runtime in
  // server/db/index.ts. Drizzle has no schema for them — exclude so push/pull
  // doesn't try to drop them.
  tablesFilter: ['!quotes_fts', '!quotes_fts_*'],
})
