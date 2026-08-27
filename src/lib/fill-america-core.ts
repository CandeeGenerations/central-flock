// Pure Campaign arithmetic for Fill America. Imported by BOTH the client
// (rendering the grid) and the server (creating campaigns, importing the
// workbook), so it must stay free of React, the `@` alias, and any Node or DOM
// API — the same contract as sunday-school-roll-core.ts.
//
// See CONTEXT.md → Fill America, and docs/adr/0032 for the Unique Participants
// rule this file is the single home of.

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const
export type Season = (typeof SEASONS)[number]

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export const isSeason = (v: unknown): v is Season => SEASONS.includes(v as Season)

const pad = (n: number) => String(n).padStart(2, '0')

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

/**
 * Every week of a Campaign — start, start+7, … through end. The count is
 * derived and never stored, so a four-week campaign needs no schema change even
 * though every campaign so far has been three weeks. An end before the start
 * yields a single week rather than an empty campaign.
 */
export function campaignWeekDates(startDate: string, endDate: string): string[] {
  const out: string[] = []
  let cur = startDate
  // Guard against a runaway range; a campaign is weeks, not years.
  for (let i = 0; i < 60; i++) {
    if (cur > endDate) break
    out.push(cur)
    cur = addDays(cur, 7)
  }
  return out.length ? out : [startDate]
}

/**
 * Which Season a start date falls in. Mar/Apr spring, Jun/Jul summer, Aug/Sep
 * fall, Dec winter — the four slots the church has actually used — with the
 * remaining months folded into the nearest neighbour so the function is total.
 * Only a default: Season is stored and stays editable.
 */
export function defaultSeason(startDate: string): Season {
  const month = Number(startDate.slice(5, 7))
  if (month === 12 || month === 1 || month === 2) return 'winter'
  if (month >= 3 && month <= 5) return 'spring'
  if (month === 6 || month === 7) return 'summer'
  return 'fall'
}

/** "Jun 20 – Jul 4, 2026", or both years when the campaign straddles New Year. */
export function defaultTitle(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const start = `${MONTH_ABBR[sm - 1]} ${sd}`
  const end = `${MONTH_ABBR[em - 1]} ${ed}`
  if (sy === ey) return `${start} – ${end}, ${sy}`
  return `${start}, ${sy} – ${end}, ${ey}`
}

/** "Jun 20" — one week's column header. */
export function weekLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTH_ABBR[m - 1]} ${d}`
}

// --- Unique Participants (ADR 0032) -----------------------------------------

/**
 * The shape the participant rules need from a Roster Entry: its Size, and its
 * tracts per week in week order (null where nothing was reported).
 */
export interface RosterLike {
  size: number
  tracts: (number | null)[]
}

/** A household took part in a week only if it reported tracts above zero there. */
const participated = (t: number | null | undefined) => t !== null && t !== undefined && t > 0

/**
 * A Campaign's Unique Participants: the sum of Size over every Roster Entry
 * with a Tract Report greater than zero in any week. Derived, never stored.
 *
 * A household that went out but reported no tracts is invisible to this count.
 * Accepted — the roster is the only evidence there is, and Door Hangers are
 * recorded per week rather than per household.
 */
export function campaignUniqueParticipants(entries: RosterLike[]): number {
  let total = 0
  for (const e of entries) if (e.tracts.some(participated)) total += e.size
  return total
}

/**
 * Unique Participants per week: each household counts in the FIRST week it
 * reported tracts, and never again. That is what makes the weekly figures add
 * up to the campaign figure instead of double-counting a family that goes out
 * all three weeks.
 */
export function weeklyUniqueParticipants(entries: RosterLike[], weekCount: number): number[] {
  const out = new Array<number>(weekCount).fill(0)
  for (const e of entries) {
    const first = e.tracts.findIndex(participated)
    if (first >= 0 && first < weekCount) out[first] += e.size
  }
  return out
}

/** Tracts per week — the sum of that week's reports. Never typed, never stored. */
export function weeklyTracts(entries: RosterLike[], weekCount: number): number[] {
  const out = new Array<number>(weekCount).fill(0)
  for (const e of entries) {
    for (let i = 0; i < weekCount; i++) out[i] += e.tracts[i] ?? 0
  }
  return out
}

/** One Roster Entry's total across the campaign. */
export function entryTotal(entry: RosterLike): number {
  return entry.tracts.reduce<number>((a, t) => a + (t ?? 0), 0)
}
