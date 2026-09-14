// Pure helpers for the birthday/anniversary scheduler: find upcoming occasions and format the
// single "notify me" text that lists them. No DB access, so it can be exercised in isolation.

export type OccasionKind = 'birthday' | 'anniversary'

export interface OccasionPerson {
  id: number
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  birthMonth: number | null
  birthDay: number | null
  birthYear: number | null
  anniversaryMonth: number | null
  anniversaryDay: number | null
  anniversaryYear: number | null
}

export interface Occasion {
  kind: OccasionKind
  person: OccasionPerson
  date: Date
  daysUntil: number
  /** Age for birthdays, years married for anniversaries; null when the year is unknown. */
  milestone: number | null
}

export interface DigestItem {
  occasion: Occasion
  note?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function formatPersonName(person: {firstName: string | null; lastName: string | null}): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Someone'
}

function nextOccurrence(month: number, day: number, today: Date): Date {
  const date = new Date(today.getFullYear(), month - 1, day)
  return date < today ? new Date(today.getFullYear() + 1, month - 1, day) : date
}

/** Every birthday/anniversary falling within `horizonDays` of `today` (inclusive), soonest first. */
export function collectOccasions(people: OccasionPerson[], today: Date, horizonDays: number): Occasion[] {
  const occasions: Occasion[] = []
  for (const person of people) {
    const sources = [
      {kind: 'birthday', month: person.birthMonth, day: person.birthDay, year: person.birthYear},
      {kind: 'anniversary', month: person.anniversaryMonth, day: person.anniversaryDay, year: person.anniversaryYear},
    ] as const
    for (const source of sources) {
      if (source.month == null || source.day == null) continue
      const date = nextOccurrence(source.month, source.day, today)
      const daysUntil = Math.round((date.getTime() - today.getTime()) / DAY_MS)
      if (daysUntil > horizonDays) continue
      const milestone = source.year ? date.getFullYear() - source.year : null
      occasions.push({
        kind: source.kind,
        person,
        date,
        daysUntil,
        milestone: milestone && milestone > 0 ? milestone : null,
      })
    }
  }
  return occasions.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      a.kind.localeCompare(b.kind) ||
      formatPersonName(a.person).localeCompare(formatPersonName(b.person)),
  )
}

// Couples sharing an anniversary (or twins sharing a birthday) collapse into one line:
// "Carla & Jonathan Mendez's 12th anniversary".
function canMerge(a: DigestItem, b: DigestItem): boolean {
  const [oa, ob] = [a.occasion, b.occasion]
  return (
    oa.kind === ob.kind &&
    oa.daysUntil === ob.daysUntil &&
    oa.milestone === ob.milestone &&
    a.note === b.note &&
    !!oa.person.firstName &&
    !!ob.person.firstName &&
    !!oa.person.lastName &&
    oa.person.lastName.trim().toLowerCase() === ob.person.lastName?.trim().toLowerCase()
  )
}

function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
}

function formatLine(group: DigestItem[], relative: boolean): string {
  const {occasion, note} = group[0]
  const names =
    group.length === 1
      ? formatPersonName(occasion.person)
      : `${joinAnd(group.map((i) => i.occasion.person.firstName!))} ${occasion.person.lastName}`
  const label = `${WEEKDAYS[occasion.date.getDay()]} ${occasion.date.getMonth() + 1}/${occasion.date.getDate()}`
  const when = occasion.daysUntil === 0 ? 'Today' : relative ? `${label} (${occasion.daysUntil} days)` : label
  const milestone = occasion.milestone ? `${ordinal(occasion.milestone)} ` : ''
  return `• ${when} – ${names}'s ${milestone}${occasion.kind}${note ? ` (${note})` : ''}`
}

function formatLines(items: DigestItem[], relative: boolean): string[] {
  const groups: DigestItem[][] = []
  for (const item of items) {
    const group = groups.find((g) => canMerge(g[0], item))
    if (group) group.push(item)
    else groups.push([item])
  }
  return groups.map((g) => formatLine(g, relative))
}

export function formatDigestLine(item: DigestItem): string {
  return formatLine([item], true)
}

/**
 * The one text sent to me per run. `week` is set only on the Sunday run (the Sun–Sat list); `reminders`
 * holds today's pre-notifications and day-of occasions I need to handle myself. Null when there's
 * nothing to say (the Sunday run always says something, so a quiet week is still confirmed).
 */
export function formatDigest({week, reminders}: {week: DigestItem[] | null; reminders: DigestItem[]}): string | null {
  const sections: string[] = []
  if (week) {
    sections.push(
      week.length
        ? ['Birthdays & anniversaries this week:', ...formatLines(week, false)].join('\n')
        : 'No birthdays or anniversaries this week.',
    )
    if (reminders.length) sections.push(['Coming up:', ...formatLines(reminders, true)].join('\n'))
  } else if (reminders.length) {
    sections.push(['Birthday & anniversary reminders:', ...formatLines(reminders, true)].join('\n'))
  }
  return sections.length ? sections.join('\n\n') : null
}
