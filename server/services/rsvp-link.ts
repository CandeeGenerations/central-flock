import {and, eq, inArray} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

export function getRsvpPublicUrlBase(): string {
  return process.env.RSVP_PUBLIC_URL_BASE || ''
}

// Returns a map: personId → rsvpLink absolute URL, for the given list and recipients.
// Recipients without an entry on the list are simply absent from the map (their {{rsvpLink}} resolves to '').
export function buildRsvpLinkMap(rsvpListId: number, personIds: number[]): Map<number, string> {
  const map = new Map<number, string>()
  if (personIds.length === 0) return map
  const base = getRsvpPublicUrlBase()
  if (!base) return map

  const entries = db
    .select({personId: schema.rsvpEntries.personId, publicToken: schema.rsvpEntries.publicToken})
    .from(schema.rsvpEntries)
    .where(and(eq(schema.rsvpEntries.rsvpListId, rsvpListId), inArray(schema.rsvpEntries.personId, personIds)))
    .all()

  for (const e of entries) {
    if (e.publicToken) map.set(e.personId, `${base}/r/${e.publicToken}`)
  }
  return map
}

export function rsvpLinkFor(personId: number, linkMap: Map<number, string> | null): Record<string, string> {
  if (!linkMap) return {}
  const link = linkMap.get(personId)
  return {rsvpLink: link ?? ''}
}
