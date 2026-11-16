import {detectSpans} from '../../lib/repeat-rules.js'

// Which Calendar Print Events the Events Story picker offers: the next N from the post date
// (inclusive), Unconfirmed Events left out, each Span counted once. Nothing else is filtered —
// Tyler chooses five, so a "Holiday" row is simply left unticked. Pure: callers load the rows.

export interface PrintEventRow {
  id: number
  date: string // YYYY-MM-DD
  title: string
  sortOrder: number
}

export interface StoryCandidate {
  // Every Event row the candidate stands for (one per day of a Span).
  eventIds: number[]
  // First day shown: the Span's first day, or the post date if the Span is already running.
  date: string
  // Last day of a multi-day Span; null for a single-day Event.
  endDate: string | null
  title: string
}

export const PICKER_SIZE = 10

// Days before the post date to load so a Span already under way is still recognised as one.
export const SPAN_LOOKBACK_DAYS = 14

export function isUnconfirmed(title: string): boolean {
  return title.trimStart().startsWith('*')
}

export function pickEvents(events: PrintEventRow[], fromDate: string, limit = PICKER_SIZE): StoryCandidate[] {
  const confirmed = events.filter((e) => !isUnconfirmed(e.title))
  const spans = detectSpans(confirmed.map((e) => ({id: e.id, date: e.date, title: e.title, repeatRule: null})))

  const groups = new Map<number, PrintEventRow[]>()
  for (const e of confirmed) {
    const headId = spans.get(e.id)?.headId ?? e.id
    const list = groups.get(headId) ?? []
    list.push(e)
    groups.set(headId, list)
  }

  const candidates: (StoryCandidate & {sortOrder: number})[] = []
  for (const days of groups.values()) {
    days.sort((a, b) => a.date.localeCompare(b.date))
    const first = days[0]
    const last = days[days.length - 1]
    if (last.date < fromDate) continue
    const date = first.date < fromDate ? fromDate : first.date
    candidates.push({
      eventIds: days.map((d) => d.id),
      date,
      endDate: days.length > 1 && last.date !== date ? last.date : null,
      title: first.title,
      sortOrder: first.sortOrder,
    })
  }

  return candidates
    .sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder || a.eventIds[0] - b.eventIds[0])
    .slice(0, limit)
    .map(({sortOrder: _sortOrder, ...c}) => c)
}
