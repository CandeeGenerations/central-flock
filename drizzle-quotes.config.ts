import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  schema: './server/db-quotes/schema.ts',
  out: './server/db-quotes/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './quotes.db',
  },
})
