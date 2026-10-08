import {vi} from 'vitest'

// Services import db/index.js, which opens (and writes to) the production DB on import.
// Unit tests only exercise pure code, so swap it for a stub that fails loudly if touched.
vi.mock('../db/index.js', async () => {
  const schema = await vi.importActual('../db/schema.js')
  const stub = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop === 'symbol' || prop === 'then') return undefined
        throw new Error(`Unit test touched the DB (${String(prop)}). Use the live AI tests for DB-backed code.`)
      },
    },
  )
  return {db: stub, sqlite: stub, schema}
})
