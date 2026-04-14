import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  schema: './server/db-nursery/schema.ts',
  out: './server/db-nursery/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './nursery.db',
  },
})
