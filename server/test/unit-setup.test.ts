import {expect, it} from 'vitest'

import {db} from '../db/index.js'

// Guards unit-setup.ts: if the mock stops applying, importing a service would open the prod DB.
it('stubs the DB module in unit tests', () => {
  expect(() => db.select()).toThrow(/Unit test touched the DB/)
})
