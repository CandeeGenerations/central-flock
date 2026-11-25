import {addDays, weekdayOf} from '../../lib/repeat-rules.js'

// When an Events Story posts. All dates/times are wall-clock in the brand's timezone
// (America/New_York). Pure: Metricool's best-time scores are passed in.

export const STORY_TIMEZONE = 'America/New_York'
export const MIN_LEAD_MINUTES = 30 // a "good hour" must be at least this far from now
export const LAST_HOUR = 21 // ...and start before 9 pm
export const FALLBACK_HOUR = 10 // used when Metricool's best times are unavailable
export const MAX_DAYS_AHEAD = 28

const MONDAY = 1
const THURSDAY = 4

// Hour (0–23) → score for one day and one network. Higher is better; 0/absent = no data.
export type HourScores = Map<number, number>

export interface RankedHour {
  hour: number
  score: number
}

export interface ZonedNow {
  date: string // YYYY-MM-DD in the brand timezone
  minutes: number // minutes since local midnight
}

export function zonedNow(now: Date, timeZone = STORY_TIMEZONE): ZonedNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return {date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute)}
}

// Earliest minute of `date` a post may go out, given "now".
export function earliestMinute(date: string, now: ZonedNow): number {
  if (date < now.date) return Infinity
  return date === now.date ? now.minutes + MIN_LEAD_MINUTES : 0
}

// Facebook and Instagram scores added per hour; hours that are too soon, at/after 9 pm, or
// score 0 are dropped. Best first; ties go to the earlier hour.
export function rankHours(networks: HourScores[], earliest: number): RankedHour[] {
  const totals = new Map<number, number>()
  for (const scores of networks) for (const [hour, score] of scores) totals.set(hour, (totals.get(hour) ?? 0) + score)
  return [...totals]
    .filter(([hour, score]) => score > 0 && hour < LAST_HOUR && hour * 60 >= earliest)
    .map(([hour, score]) => ({hour, score}))
    .sort((a, b) => b.score - a.score || a.hour - b.hour)
}

function nextMonday(date: string): string {
  const offset = (MONDAY - weekdayOf(date) + 7) % 7 || 7
  return addDays(date, offset)
}

// Decision 8: Mon–Wed post today if a good hour is left, else roll a day forward; Thu–Sun (or a
// roll that reaches Thursday) goes to next Monday. Never skips a week of events.
// `hasGoodHour(date, earliest)` answers from Metricool scores, or the 10 am fallback.
export function defaultPostDay(now: ZonedNow, hasGoodHour: (date: string, earliest: number) => boolean): string {
  let date = now.date
  for (let i = 0; i < 7; i++) {
    const weekday = weekdayOf(date)
    if (weekday === 0 || weekday >= THURSDAY) return nextMonday(date)
    if (hasGoodHour(date, earliestMinute(date, now))) return date
    date = addDays(date, 1)
  }
  return nextMonday(now.date)
}

// The fallback when Metricool has no scores: 10 am, if still far enough ahead.
export function fallbackHours(earliest: number): RankedHour[] {
  return FALLBACK_HOUR * 60 >= earliest ? [{hour: FALLBACK_HOUR, score: 0}] : []
}

// "2026-11-23T10:00:00-05:00" — the offset Metricool's `date` field wants, DST-correct.
export function zonedIso(date: string, hour: number, minute = 0, timeZone = STORY_TIMEZONE): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  // DST switches at 2 am, so the offset at noon UTC (7–8 am Eastern) holds for any daytime post.
  const probe = new Date(`${date}T12:00:00Z`)
  const offset = new Intl.DateTimeFormat('en-US', {timeZone, timeZoneName: 'longOffset'})
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')!
    .value.replace('GMT', '')
  return `${date}T${hh}:${mm}:00${offset || '+00:00'}`
}

// ---------- weeks (the first thing the New Story screen asks for) ----------

export function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

// Mondays of the weeks a Story can still post in: this week through MAX_DAYS_AHEAD.
export function storyWeeks(now: ZonedNow): string[] {
  const last = addDays(now.date, MAX_DAYS_AHEAD)
  const out: string[] = []
  for (let m = mondayOf(now.date); m <= last; m = addDays(m, 7)) out.push(m)
  return out
}

// The week the default rule (Decision 8) lands in, judged by the 10 am fallback — no Metricool call.
export function suggestedWeek(now: ZonedNow): string {
  return mondayOf(defaultPostDay(now, (_date, earliest) => fallbackHours(earliest).length > 0))
}

// Default post day inside a chosen week: the first Mon–Wed day with a good hour left, else the
// first day with one, else the first day still open. Null when the week is past or out of range.
export function defaultDayInWeek(
  monday: string,
  now: ZonedNow,
  hasGoodHour: (date: string, earliest: number) => boolean,
): string | null {
  const last = addDays(now.date, MAX_DAYS_AHEAD)
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    if (d >= now.date && d <= last) days.push(d)
  }
  if (days.length === 0) return null
  const good = days.filter((d) => hasGoodHour(d, earliestMinute(d, now)))
  const early = good.find((d) => weekdayOf(d) >= MONDAY && weekdayOf(d) < THURSDAY)
  return early ?? good[0] ?? days[0]
}
