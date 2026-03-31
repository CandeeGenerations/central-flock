import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  schema: './server/db-devotions/schema.ts',
  out: './server/db-devotions/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './devotions.db',
  },
})
