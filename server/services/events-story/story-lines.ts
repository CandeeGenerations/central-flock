import {weekdayOf} from '../../lib/repeat-rules.js'

// Turns a Calendar Print Event title into the text of one Story Line. Deterministic, and only a
// proposal: every field is editable in the picker. Title shape on the calendar: name line(s), an
// optional blank line, then time line(s) — "Church Family Thanksgiving Dinner\n\n4 pm".

export interface StoryLineText {
  dayNumber: string // "21"
  month: string // "Nov" — the design draws it in capitals
  dayTimeLine: string // "Saturday @ 4 pm", "Thursday", "Monday – Wednesday"
  line1: string
  line2: string | null // null = one-line title (a single word can't split)
  warnings: string[]
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// About what fits one title line on the design (500px box, 38.7px font) before it wraps.
export const MAX_LINE_CHARS = 22

const T = String.raw`\d{1,2}(?::\d{2})?`
const AMPM = String.raw`\s*(?:am|pm|a\.m\.|p\.m\.)`
// "4 pm", "10:30 am", "10 am - 2 pm", "10 - 11 am"; must start the line.
const TIME_AT_START = new RegExp(String.raw`^(${T}(?:${AMPM})?\s*[-–]\s*${T}${AMPM}|${T}${AMPM})`, 'i')

export function normalizeTime(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/a\.m\./g, 'am')
    .replace(/p\.m\./g, 'pm')
    .replace(/\s*[-–]\s*/g, ' - ')
    .replace(/(\d)(am|pm)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

const NO_END = new Set(['&', 'and', 'of', 'the', 'at', 'for', 'a', 'to', 'in', 'on', 'with'])

// Splits a one-line name over two lines as evenly as possible, never leaving a joining word
// ("&", "of", "the"…) at the end of line 1 or "&" at the start of line 2.
export function splitName(name: string): [string, string | null] {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length < 2) return [name.trim(), null]
  let best: [string, string] | null = null
  let bestScore = Infinity
  for (let i = 1; i < words.length; i++) {
    if (NO_END.has(words[i - 1].toLowerCase()) || words[i] === '&') continue
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const score = Math.max(a.length, b.length)
    if (score < bestScore) {
      best = [a, b]
      bestScore = score
    }
  }
  return best ?? [words.slice(0, -1).join(' '), words[words.length - 1]]
}

export function storyLineFor(date: string, endDate: string | null, title: string): StoryLineText {
  const warnings: string[] = []
  const lines = title
    .replace(/^\s*\*\s*/, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const times: string[] = []
  const names: string[] = []
  for (const line of lines) {
    const m = line.match(TIME_AT_START)
    if (m) times.push(normalizeTime(m[1]))
    else names.push(line)
  }
  if (times.length > 1) warnings.push(`Several times on the calendar (${times.join(', ')}); using the first`)

  let line1 = ''
  let line2: string | null = null
  if (names.length === 0) {
    warnings.push('No event name found in the title')
  } else if (names.length === 1) {
    ;[line1, line2] = splitName(names[0])
  } else {
    ;[line1, line2] = [names[0], names[1]]
    if (names.length > 2) warnings.push(`Title has ${names.length} lines; kept the first two`)
  }
  for (const l of [line1, line2]) {
    if (l && l.length > MAX_LINE_CHARS) warnings.push(`"${l}" may be too long for one line`)
  }

  const day = WEEKDAYS[weekdayOf(date)]
  const days = endDate ? `${day} – ${WEEKDAYS[weekdayOf(endDate)]}` : day
  const [, mm, dd] = date.split('-').map(Number)

  return {
    dayNumber: String(dd),
    month: MONTHS[mm - 1],
    dayTimeLine: times.length > 0 ? `${days} @ ${times[0]}` : days,
    line1,
    line2,
    warnings,
  }
}
