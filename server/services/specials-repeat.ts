import {and, desc, eq, gte, inArray, ne, or, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

const SONG_WINDOW_DAYS = 56 // 8 weeks
const PERFORMER_WINDOW_DAYS = 28 // 4 weeks

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export type RepeatWarning = {
  songRepeat?: {specialId: number; date: string; songTitle: string}
  performerRepeats: {personId: number; specialId: number; date: string}[]
}

export function computeRepeatWarnings(input: {
  songTitle?: string
  hymnId?: number | null
  performerIds?: number[]
  excludeSpecialId?: number
}): RepeatWarning {
  const result: RepeatWarning = {performerRepeats: []}

  // Song repeat: same song_title (case-insensitive) OR same hymn_id within 8 weeks.
  const songConditions = []
  if (input.songTitle) {
    songConditions.push(sql`lower(${schema.specialMusic.songTitle}) = lower(${input.songTitle})`)
  }
  if (input.hymnId != null) {
    songConditions.push(eq(schema.specialMusic.hymnId, input.hymnId))
  }
  if (songConditions.length > 0) {
    const songRow = db
      .select({
        id: schema.specialMusic.id,
        date: schema.specialMusic.date,
        songTitle: schema.specialMusic.songTitle,
      })
      .from(schema.specialMusic)
      .where(
        and(
          gte(schema.specialMusic.date, daysAgoIso(SONG_WINDOW_DAYS)),
          input.excludeSpecialId != null ? ne(schema.specialMusic.id, input.excludeSpecialId) : undefined,
          or(...songConditions),
        ),
      )
      .orderBy(desc(schema.specialMusic.date))
      .get()
    if (songRow) {
      result.songRepeat = {specialId: songRow.id, date: songRow.date, songTitle: songRow.songTitle}
    }
  }

  // Performer repeat: any of these people performed within 4 weeks.
  if (input.performerIds && input.performerIds.length > 0) {
    const rows = db
      .select({
        personId: schema.specialMusicPerformers.personId,
        specialId: schema.specialMusic.id,
        date: schema.specialMusic.date,
      })
      .from(schema.specialMusicPerformers)
      .innerJoin(schema.specialMusic, eq(schema.specialMusicPerformers.specialMusicId, schema.specialMusic.id))
      .where(
        and(
          inArray(schema.specialMusicPerformers.personId, input.performerIds),
          gte(schema.specialMusic.date, daysAgoIso(PERFORMER_WINDOW_DAYS)),
          input.excludeSpecialId != null ? ne(schema.specialMusic.id, input.excludeSpecialId) : undefined,
        ),
      )
      .orderBy(desc(schema.specialMusic.date))
      .all()
    // Dedupe per person to the most recent.
    const seen = new Set<number>()
    for (const r of rows) {
      if (seen.has(r.personId)) continue
      seen.add(r.personId)
      result.performerRepeats.push(r)
    }
  }

  return result
}
