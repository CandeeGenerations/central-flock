import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  schema: './server/db-hymns/schema.ts',
  out: './server/db-hymns/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './hymns.db',
  },
})
