import type {SQL} from 'drizzle-orm'
import {and, eq, gte, inArray, lte} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {workerDisplayName} from './nursery-workers.js'

// A Double Booking is a Nursery Worker in the nursery for a service her Person
// is also singing in. Derived at read time, never stored — either side can move
// at any moment. Asymmetric: nursery is the *exclusive* commitment (it removes
// her from the auditorium); special music is a *present* one. Do not generalise
// this to "any person twice at a service time" — that pulls in sermons and
// false-alarms on the preacher who sings. See docs/adr/0026.

export interface DoubleBooking {
  personId: number
  personName: string
  date: string
  serviceTimeId: number
  serviceName: string
  nurseryAssignmentId: number
  nurseryWorkerId: number
  nurserySlot: number
  specialMusicId: number
  specialMusicTitle: string | null
}

// Key used by both sides to look a conflict up without re-querying.
export function nurseryKey(assignmentId: number): string {
  return `nursery:${assignmentId}`
}
export function specialKey(specialMusicId: number, personId: number): string {
  return `special:${specialMusicId}:${personId}`
}

export function findDoubleBookings(opts: {from?: string; to?: string} = {}): DoubleBooking[] {
  // Special music with no Service Time is a one-off and can never conflict —
  // the equi-join below drops nulls on its own, no extra predicate needed.
  const conditions: SQL[] = []
  if (opts.from) conditions.push(gte(schema.nurseryAssignments.date, opts.from))
  if (opts.to) conditions.push(lte(schema.nurseryAssignments.date, opts.to))

  return db
    .select({
      personId: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      overrideName: schema.nurseryWorkers.name,
      date: schema.nurseryAssignments.date,
      serviceTimeId: schema.nurseryAssignments.serviceTimeId,
      serviceName: schema.serviceTimes.name,
      nurseryAssignmentId: schema.nurseryAssignments.id,
      nurseryWorkerId: schema.nurseryWorkers.id,
      nurserySlot: schema.nurseryAssignments.slot,
      specialMusicId: schema.specialMusic.id,
      specialMusicTitle: schema.specialMusic.songTitle,
    })
    .from(schema.nurseryAssignments)
    .innerJoin(schema.nurseryWorkers, eq(schema.nurseryWorkers.id, schema.nurseryAssignments.workerId))
    .innerJoin(schema.people, eq(schema.people.id, schema.nurseryWorkers.personId))
    .innerJoin(schema.serviceTimes, eq(schema.serviceTimes.id, schema.nurseryAssignments.serviceTimeId))
    .innerJoin(
      schema.specialMusicPerformers,
      eq(schema.specialMusicPerformers.personId, schema.nurseryWorkers.personId),
    )
    .innerJoin(
      schema.specialMusic,
      and(
        eq(schema.specialMusic.id, schema.specialMusicPerformers.specialMusicId),
        eq(schema.specialMusic.date, schema.nurseryAssignments.date),
        // A null service_time_id never matches, which is what makes a one-off
        // service silent rather than a guess.
        eq(schema.specialMusic.serviceTimeId, schema.nurseryAssignments.serviceTimeId),
      ),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all()
    .map((r) => ({
      personId: r.personId,
      personName: workerDisplayName(r.overrideName, r.firstName, r.lastName),
      date: r.date,
      serviceTimeId: r.serviceTimeId,
      serviceName: r.serviceName,
      nurseryAssignmentId: r.nurseryAssignmentId,
      nurseryWorkerId: r.nurseryWorkerId,
      nurserySlot: r.nurserySlot,
      specialMusicId: r.specialMusicId,
      specialMusicTitle: r.specialMusicTitle,
    }))
}

// Conflicts for one nursery schedule's assignments.
export function findForNurserySchedule(scheduleId: number): DoubleBooking[] {
  const dates = db
    .selectDistinct({date: schema.nurseryAssignments.date})
    .from(schema.nurseryAssignments)
    .where(eq(schema.nurseryAssignments.scheduleId, scheduleId))
    .all()
    .map((r) => r.date)
  if (dates.length === 0) return []
  return findDoubleBookings({
    from: dates.reduce((a, b) => (a < b ? a : b)),
    to: dates.reduce((a, b) => (a > b ? a : b)),
  })
}

// Conflicts for a set of special_music rows.
export function findForSpecialMusic(specialMusicIds: number[]): DoubleBooking[] {
  if (specialMusicIds.length === 0) return []
  const rows = db
    .select({date: schema.specialMusic.date})
    .from(schema.specialMusic)
    .where(inArray(schema.specialMusic.id, specialMusicIds))
    .all()
  if (rows.length === 0) return []
  const dates = rows.map((r) => r.date)
  const all = findDoubleBookings({
    from: dates.reduce((a, b) => (a < b ? a : b)),
    to: dates.reduce((a, b) => (a > b ? a : b)),
  })
  const wanted = new Set(specialMusicIds)
  return all.filter((c) => wanted.has(c.specialMusicId))
}
