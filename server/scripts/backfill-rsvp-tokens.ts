import {randomBytes} from 'node:crypto'

import {eq, isNull} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

const rows = db.select().from(schema.rsvpEntries).where(isNull(schema.rsvpEntries.publicToken)).all()

let count = 0
for (const r of rows) {
  const token = randomBytes(24).toString('base64url')
  db.update(schema.rsvpEntries).set({publicToken: token}).where(eq(schema.rsvpEntries.id, r.id)).run()
  count++
}

console.log(`Backfilled ${count} RSVP token(s).`)
