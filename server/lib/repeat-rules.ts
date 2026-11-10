// Repeat Rules: how a Calendar Print Event lands in the following year. See CONTEXT.md →
// Calendar Print and docs/adr/0040-repeat-rule-is-stored-on-the-event.md.
//
// A rule is guessed once from an Event's title + date, stored on the Event, corrected by hand
// in the Event form, and only ever *evaluated* by the Year Copy — never re-inferred.
//
// This module lives under server/ because the Year Copy and the boot-time backfill need it,
// but it is deliberately PURE — no db, no express, no node built-ins — so the client bundle
// can import it too (the Event form's Repeats field lists alternatives computed here).
//
// Dates are ISO `YYYY-MM-DD` strings throughout; arithmetic runs on UTC midnights so no
// local-time offset can shift a day.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // Sun = 0, matching Date#getUTCDay

export const ANCHOR_IDS = [
  'easter',
  'palm-sunday',
  'good-friday',
  'new-years-day',
  'mlk-day',
  'presidents-day',
  'dst-start',
  'national-day-of-prayer',
  'mothers-day',
  'armed-forces-day',
  'memorial-day',
  'fathers-day',
  'independence-day',
  'labor-day',
  'grandparents-day',
  'columbus-day',
  'dst-end',
  'veterans-day',
  'thanksgiving',
  'christmas-eve',
  'christmas-day',
  'new-years-eve',
] as const
export type AnchorId = (typeof ANCHOR_IDS)[number]

// An Anchor is either a built-in named date or any fixed month/day, written `date:MM-DD`.
export type AnchorRef = AnchorId | `date:${string}`

export type WeekdayRelation = 'before' | 'after' | 'nearest' | 'week'

export type RepeatRule =
  | {kind: 'none'}
  | {kind: 'fixed'; month: number; day: number}
  | {kind: 'nth'; month: number; weekday: Weekday; n: 1 | 2 | 3 | 4}
  | {kind: 'last'; month: number; weekday: Weekday}
  | {kind: 'anchor'; anchor: AnchorRef; days: number}
  | {kind: 'anchor-weekday'; anchor: AnchorRef; weekday: Weekday; relation: WeekdayRelation}

// ---------- date helpers ----------

const DAY_MS = 86_400_000

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function ymd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toUtc(iso).getTime() + days * DAY_MS))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS)
}

export function weekdayOf(iso: string): Weekday {
  return toUtc(iso).getUTCDay() as Weekday
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function nthWeekday(year: number, month: number, weekday: Weekday, n: number): string {
  const first = ymd(year, month, 1)
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return toIso(ymd(year, month, 1 + offset + 7 * (n - 1)))
}

function lastWeekday(year: number, month: number, weekday: Weekday): string {
  const last = ymd(year, month, daysInMonth(year, month))
  const back = (last.getUTCDay() - weekday + 7) % 7
  return toIso(ymd(year, month, daysInMonth(year, month) - back))
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterDate(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toIso(ymd(year, month, day))
}

// ---------- Anchors ----------

interface AnchorDef {
  label: string
  // Possessive used in "Wednesday of Thanksgiving's week".
  date: (year: number) => string
  // Lower-case phrases that name this Anchor in an Event title.
  synonyms: string[]
  // Only match a synonym when the Event is in this month (DST start vs end share words).
  synonymMonth?: number
  // Counts as a real holiday for Events titled just "Holiday".
  federal?: boolean
}

const ANCHORS: Record<AnchorId, AnchorDef> = {
  easter: {label: 'Easter', date: easterDate, synonyms: ['easter', 'resurrection sunday']},
  'palm-sunday': {label: 'Palm Sunday', date: (y) => addDays(easterDate(y), -7), synonyms: ['palm sunday']},
  'good-friday': {label: 'Good Friday', date: (y) => addDays(easterDate(y), -2), synonyms: ['good friday']},
  'new-years-day': {
    label: "New Year's Day",
    date: (y) => toIso(ymd(y, 1, 1)),
    synonyms: ["new year's day", 'new years day'],
    federal: true,
  },
  'mlk-day': {
    label: 'MLK Day',
    date: (y) => nthWeekday(y, 1, 1, 3),
    synonyms: ['mlk', 'martin luther king'],
    federal: true,
  },
  'presidents-day': {
    label: "Presidents' Day",
    date: (y) => nthWeekday(y, 2, 1, 3),
    synonyms: ['presidents'],
    federal: true,
  },
  'dst-start': {
    label: 'Daylight Saving Time start',
    date: (y) => nthWeekday(y, 3, 0, 2),
    synonyms: ['time change', 'daylight saving'],
    synonymMonth: 3,
  },
  'national-day-of-prayer': {
    label: 'National Day of Prayer',
    date: (y) => nthWeekday(y, 5, 4, 1),
    synonyms: ['national day of prayer'],
  },
  'mothers-day': {
    label: "Mother's Day",
    date: (y) => nthWeekday(y, 5, 0, 2),
    synonyms: ["mother's day", 'mothers day'],
  },
  'armed-forces-day': {label: 'Armed Forces Day', date: (y) => nthWeekday(y, 5, 6, 3), synonyms: ['armed forces']},
  'memorial-day': {label: 'Memorial Day', date: (y) => lastWeekday(y, 5, 1), synonyms: ['memorial day'], federal: true},
  'fathers-day': {
    label: "Father's Day",
    date: (y) => nthWeekday(y, 6, 0, 3),
    synonyms: ["father's day", 'fathers day'],
  },
  'independence-day': {
    label: 'Independence Day',
    date: (y) => toIso(ymd(y, 7, 4)),
    synonyms: ['independence day', 'july 4th', 'fourth of july', 'god & country', 'god and country'],
    federal: true,
  },
  'labor-day': {label: 'Labor Day', date: (y) => nthWeekday(y, 9, 1, 1), synonyms: ['labor day'], federal: true},
  'grandparents-day': {
    label: 'Grandparents Day',
    date: (y) => addDays(nthWeekday(y, 9, 1, 1), 6),
    synonyms: ['grandparents'],
  },
  'columbus-day': {
    label: 'Columbus Day',
    date: (y) => nthWeekday(y, 10, 1, 2),
    synonyms: ['columbus', 'indigenous peoples'],
    federal: true,
  },
  'dst-end': {
    label: 'Daylight Saving Time end',
    date: (y) => nthWeekday(y, 11, 0, 1),
    synonyms: ['time change', 'daylight saving'],
    synonymMonth: 11,
  },
  'veterans-day': {label: 'Veterans Day', date: (y) => toIso(ymd(y, 11, 11)), synonyms: ['veterans'], federal: true},
  thanksgiving: {
    label: 'Thanksgiving',
    date: (y) => nthWeekday(y, 11, 4, 4),
    synonyms: ['thanksgiving'],
    federal: true,
  },
  'christmas-eve': {label: 'Christmas Eve', date: (y) => toIso(ymd(y, 12, 24)), synonyms: ['christmas eve']},
  'christmas-day': {
    label: 'Christmas Day',
    date: (y) => toIso(ymd(y, 12, 25)),
    synonyms: ['christmas day'],
    federal: true,
  },
  'new-years-eve': {
    label: "New Year's Eve",
    date: (y) => toIso(ymd(y, 12, 31)),
    synonyms: ["new year's eve", 'new years eve', "new year's", 'new years'],
  },
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['', '1st', '2nd', '3rd', '4th']

export function isAnchorId(value: string): value is AnchorId {
  return (ANCHOR_IDS as readonly string[]).includes(value)
}

function parseDateAnchor(ref: string): {month: number; day: number} | null {
  const m = /^date:(\d{2})-(\d{2})$/.exec(ref)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return {month, day}
}

export function dateAnchor(month: number, day: number): AnchorRef {
  return `date:${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function anchorDate(ref: AnchorRef, year: number): string | null {
  if (isAnchorId(ref)) return ANCHORS[ref].date(year)
  const fixed = parseDateAnchor(ref)
  if (!fixed || fixed.day > daysInMonth(year, fixed.month)) return null
  return toIso(ymd(year, fixed.month, fixed.day))
}

export function anchorLabel(ref: AnchorRef): string {
  if (isAnchorId(ref)) return ANCHORS[ref].label
  const fixed = parseDateAnchor(ref)
  return fixed ? `${MONTHS[fixed.month - 1]} ${fixed.day}` : ref
}

function possessive(label: string): string {
  return label.endsWith('s') ? `${label}'` : `${label}'s`
}

// ---------- evaluation ----------

function weekdayRelative(anchor: string, weekday: Weekday, relation: WeekdayRelation): string {
  const aw = weekdayOf(anchor)
  switch (relation) {
    case 'before':
      return addDays(anchor, -((aw - weekday + 7) % 7 || 7))
    case 'after':
      return addDays(anchor, (weekday - aw + 7) % 7 || 7)
    case 'nearest': {
      const back = (aw - weekday + 7) % 7
      const fwd = (weekday - aw + 7) % 7
      return back <= fwd ? addDays(anchor, -back) : addDays(anchor, fwd)
    }
    case 'week':
      // Weeks run Sunday–Saturday.
      return addDays(anchor, weekday - aw)
  }
}

// The date a rule gives in `year`, or null for "doesn't repeat" / an impossible date (Feb 29).
// The result can fall outside `year` (the Wednesday of New Year's Eve's week can be in January);
// callers decide what that means.
export function evaluateRule(rule: RepeatRule, year: number): string | null {
  switch (rule.kind) {
    case 'none':
      return null
    case 'fixed':
      return rule.day <= daysInMonth(year, rule.month) ? toIso(ymd(year, rule.month, rule.day)) : null
    case 'nth':
      return nthWeekday(year, rule.month, rule.weekday, rule.n)
    case 'last':
      return lastWeekday(year, rule.month, rule.weekday)
    case 'anchor': {
      const a = anchorDate(rule.anchor, year)
      return a ? addDays(a, rule.days) : null
    }
    case 'anchor-weekday': {
      const a = anchorDate(rule.anchor, year)
      return a ? weekdayRelative(a, rule.weekday, rule.relation) : null
    }
  }
}

// ---------- plain words ----------

export function describeRule(rule: RepeatRule): string {
  switch (rule.kind) {
    case 'none':
      return "Doesn't repeat"
    case 'fixed':
      return `${MONTHS[rule.month - 1]} ${rule.day} every year`
    case 'nth':
      return `${ORDINALS[rule.n]} ${WEEKDAYS[rule.weekday]} of ${MONTHS[rule.month - 1]}`
    case 'last':
      return `Last ${WEEKDAYS[rule.weekday]} of ${MONTHS[rule.month - 1]}`
    case 'anchor': {
      const label = anchorLabel(rule.anchor)
      if (rule.days === 0) return label
      const n = Math.abs(rule.days)
      return `${n} day${n === 1 ? '' : 's'} ${rule.days < 0 ? 'before' : 'after'} ${label}`
    }
    case 'anchor-weekday': {
      const label = anchorLabel(rule.anchor)
      const wd = WEEKDAYS[rule.weekday]
      if (rule.relation === 'week') return `${wd} of ${possessive(label)} week`
      return `${wd} ${rule.relation} ${label}`
    }
  }
}

// ---------- validation ----------

function isWeekday(n: unknown): n is Weekday {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6
}

function isMonth(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 12
}

function isAnchorRef(v: unknown): v is AnchorRef {
  return typeof v === 'string' && (isAnchorId(v) || parseDateAnchor(v) !== null)
}

// Validate untrusted input (request body, stored JSON). Returns null when malformed.
export function parseRule(input: unknown): RepeatRule | null {
  let v = input
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  switch (r.kind) {
    case 'none':
      return {kind: 'none'}
    case 'fixed':
      if (isMonth(r.month) && Number.isInteger(r.day) && (r.day as number) >= 1 && (r.day as number) <= 31)
        return {kind: 'fixed', month: r.month, day: r.day as number}
      return null
    case 'nth':
      if (isMonth(r.month) && isWeekday(r.weekday) && [1, 2, 3, 4].includes(r.n as number))
        return {kind: 'nth', month: r.month, weekday: r.weekday, n: r.n as 1 | 2 | 3 | 4}
      return null
    case 'last':
      if (isMonth(r.month) && isWeekday(r.weekday)) return {kind: 'last', month: r.month, weekday: r.weekday}
      return null
    case 'anchor':
      if (isAnchorRef(r.anchor) && Number.isInteger(r.days) && Math.abs(r.days as number) <= 60)
        return {kind: 'anchor', anchor: r.anchor, days: r.days as number}
      return null
    case 'anchor-weekday':
      if (
        isAnchorRef(r.anchor) &&
        isWeekday(r.weekday) &&
        ['before', 'after', 'nearest', 'week'].includes(r.relation as string)
      )
        return {
          kind: 'anchor-weekday',
          anchor: r.anchor,
          weekday: r.weekday,
          relation: r.relation as WeekdayRelation,
        }
      return null
    default:
      return null
  }
}

export function sameRule(a: RepeatRule, b: RepeatRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ---------- guessing ----------

export function normalizeTitle(title: string): string {
  return title.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

const ONE_OFF_KEYWORDS = ['funeral', 'wedding', 'shower', 'sprinkle', 'memorial service']

function anchorsNamedIn(title: string, month: number): AnchorId[] {
  const hits: {id: AnchorId; len: number}[] = []
  for (const id of ANCHOR_IDS) {
    const def = ANCHORS[id]
    if (def.synonymMonth && def.synonymMonth !== month) continue
    for (const syn of def.synonyms) {
      if (title.includes(syn)) {
        hits.push({id, len: syn.length})
        break
      }
    }
  }
  // Longest phrase first: "christmas eve" beats a looser match.
  return hits.sort((a, b) => b.len - a.len).map((h) => h.id)
}

function fallbackRule(date: string): RepeatRule {
  const d = toUtc(date)
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const weekday = d.getUTCDay() as Weekday
  // Days 29–31 are always the 5th occurrence, which some months lack: call it "last".
  if (day >= 29) return {kind: 'last', month, weekday}
  return {kind: 'nth', month, weekday, n: Math.ceil(day / 7) as 1 | 2 | 3 | 4}
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7))
}

function gives(rule: RepeatRule, date: string): boolean {
  return evaluateRule(rule, yearOf(date)) === date
}

// Deterministic first guess for an Event's rule. See plans/calendar-year-copy.md → Guesser.
// Never guesses from closeness to Easter (Kids & Youth Extravaganza on Apr 11, 2026 is
// Easter + 6 by coincidence) and never calls a model.
export function guessRule(title: string, date: string): RepeatRule {
  const t = normalizeTitle(title)
  const year = yearOf(date)
  const month = monthOf(date)
  const weekday = weekdayOf(date)

  if (ONE_OFF_KEYWORDS.some((k) => t.includes(k))) return {kind: 'none'}

  // 1. "Holiday" on a federal holiday's date → that holiday.
  if (t === 'holiday') {
    for (const id of ANCHOR_IDS) {
      if (ANCHORS[id].federal && ANCHORS[id].date(year) === date) return {kind: 'anchor', anchor: id, days: 0}
    }
  }

  const named = anchorsNamedIn(t, month)

  // 2. Candlelight services → the weekday of the holiday's week.
  if (t.includes('candlelight')) {
    const candidates: AnchorId[] = named.length
      ? named
      : (['thanksgiving', 'christmas-day', 'new-years-eve'] as AnchorId[]).sort(
          (a, b) =>
            Math.abs(daysBetween(date, ANCHORS[a].date(year))) - Math.abs(daysBetween(date, ANCHORS[b].date(year))),
        )
    for (const id of candidates) {
      const rule: RepeatRule = {kind: 'anchor-weekday', anchor: id, weekday, relation: 'week'}
      if (gives(rule, date)) return rule
    }
  }

  // 3. The Event is on a named Anchor's own date → that Anchor.
  for (const id of named) {
    if (ANCHORS[id].date(year) === date) return {kind: 'anchor', anchor: id, days: 0}
  }

  // 4. "<Anchor> Sunday" → the Sunday nearest that Anchor.
  if (weekday === 0 && t.endsWith('sunday')) {
    for (const id of named) {
      const rule: RepeatRule = {kind: 'anchor-weekday', anchor: id, weekday: 0, relation: 'nearest'}
      if (gives(rule, date)) return rule
    }
  }

  // 5. Title names an Anchor, date is near it → the weekday before/after it.
  for (const id of named) {
    const delta = daysBetween(ANCHORS[id].date(year), date)
    if (delta === 0 || Math.abs(delta) > 7) continue
    const rule: RepeatRule = {kind: 'anchor-weekday', anchor: id, weekday, relation: delta < 0 ? 'before' : 'after'}
    if (gives(rule, date)) return rule
  }

  // 6. Nth weekday, or "last" in the month's 5th week.
  return fallbackRule(date)
}

export interface RuleOption {
  rule: RepeatRule
  label: string
}

// Every rule that gives `date` in its own year — the Repeats dropdown. The guess comes first,
// "Doesn't repeat" last.
export function ruleAlternatives(date: string, title = ''): RuleOption[] {
  const year = yearOf(date)
  const d = toUtc(date)
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const weekday = d.getUTCDay() as Weekday
  const out: RepeatRule[] = [guessRule(title, date)]

  if (day <= 28) out.push({kind: 'nth', month, weekday, n: Math.ceil(day / 7) as 1 | 2 | 3 | 4})
  if (day + 7 > daysInMonth(year, month)) out.push({kind: 'last', month, weekday})
  out.push({kind: 'fixed', month, day})

  for (const id of ANCHOR_IDS) {
    const a = ANCHORS[id].date(year)
    const delta = daysBetween(a, date)
    if (Math.abs(delta) > 7) continue
    out.push({kind: 'anchor', anchor: id, days: delta})
    for (const relation of ['week', 'nearest', 'before', 'after'] as const) {
      out.push({kind: 'anchor-weekday', anchor: id, weekday, relation})
    }
  }
  // "The <weekday> nearest <this month/day>" for fixed dates the Anchor list doesn't name.
  if (!ANCHOR_IDS.some((id) => ANCHORS[id].date(year) === date)) {
    out.push({kind: 'anchor-weekday', anchor: dateAnchor(month, day), weekday, relation: 'nearest'})
  }
  out.push({kind: 'none'})

  const seen = new Set<string>()
  const options: RuleOption[] = []
  for (const rule of out) {
    if (rule.kind !== 'none' && !gives(rule, date)) continue
    const key = JSON.stringify(rule)
    if (seen.has(key)) continue
    seen.add(key)
    options.push({rule, label: describeRule(rule)})
  }
  return options
}

// ---------- Spans & the Year Copy plan ----------

export interface RuleEvent {
  id: number
  date: string
  title: string
  repeatRule: RepeatRule | null
}

export interface SpanInfo {
  headId: number
  offset: number // days after the Span's first day
  length: number
}

// A Span is a run of Events on consecutive days with the same title. Not stored; recognised
// here whenever a year is copied. Single-day Events get a length-1 entry.
export function detectSpans(events: RuleEvent[]): Map<number, SpanInfo> {
  const byTitle = new Map<string, RuleEvent[]>()
  for (const e of events) {
    const key = normalizeTitle(e.title)
    const list = byTitle.get(key) ?? []
    list.push(e)
    byTitle.set(key, list)
  }
  const result = new Map<number, SpanInfo>()
  for (const list of byTitle.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
    let run: RuleEvent[] = []
    const flush = () => {
      for (const e of run) {
        result.set(e.id, {headId: run[0].id, offset: daysBetween(run[0].date, e.date), length: run.length})
      }
      run = []
    }
    for (const e of list) {
      const prev = run[run.length - 1]
      if (prev && daysBetween(prev.date, e.date) === 1) run.push(e)
      else if (prev && prev.date === e.date) {
        // Same title twice on one day: its own single-day entry, not part of the run.
        result.set(e.id, {headId: e.id, offset: 0, length: 1})
      } else {
        if (run.length) flush()
        run = [e]
      }
    }
    if (run.length) flush()
  }
  return result
}

export interface CopyPlacement {
  sourceId: number
  date: string
  rule: RepeatRule
}

export interface CopyPlan {
  placements: CopyPlacement[]
  skipped: {sourceId: number; title: string}[] // "doesn't repeat"
  outOfYear: {sourceId: number; title: string; date: string}[] // rule lands outside the target year
}

// Where each source Event lands in `targetYear`. A Span moves as a block on its first day's
// rule; the other days keep their offsets (their own rules are ignored).
export function planYearCopy(events: RuleEvent[], targetYear: number): CopyPlan {
  const spans = detectSpans(events)
  const byId = new Map(events.map((e) => [e.id, e]))
  const plan: CopyPlan = {placements: [], skipped: [], outOfYear: []}
  for (const e of events) {
    const span = spans.get(e.id) ?? {headId: e.id, offset: 0, length: 1}
    const head = byId.get(span.headId) ?? e
    const headRule = head.repeatRule ?? guessRule(head.title, head.date)
    const ownRule = e.repeatRule ?? guessRule(e.title, e.date)
    if (headRule.kind === 'none') {
      plan.skipped.push({sourceId: e.id, title: e.title})
      continue
    }
    const headDate = evaluateRule(headRule, targetYear)
    if (!headDate) {
      plan.skipped.push({sourceId: e.id, title: e.title})
      continue
    }
    const date = addDays(headDate, span.offset)
    if (yearOf(date) !== targetYear) {
      plan.outOfYear.push({sourceId: e.id, title: e.title, date})
      continue
    }
    plan.placements.push({sourceId: e.id, date, rule: ownRule})
  }
  plan.placements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sourceId - b.sourceId))
  return plan
}

// ---------- Day Overrides ----------

export interface OverrideShape {
  inlineItemIds: number[]
  showNoKaya: boolean
  showNormalScheduleLabel: boolean
}

export interface SourceOverride extends OverrideShape {
  date: string
}

export interface OverridePlan {
  overrides: (OverrideShape & {date: string})[]
  conflicts: {date: string; titles: string[]}[]
}

function overrideKey(o: OverrideShape | null): string {
  return o ? JSON.stringify([o.inlineItemIds, o.showNoKaya, o.showNormalScheduleLabel]) : 'none'
}

function isServiceDay(iso: string): boolean {
  const w = weekdayOf(iso)
  return w === 0 || w === 3 || w === 6
}

// How Day Overrides carry into the target year (plans/calendar-year-copy.md, decision 9):
// a day with a copied Event takes its source day's override; an ordinary Sun/Wed/Sat takes the
// most common choice for that weekday on ordinary days of the same source month ("no override"
// counts as a choice). `mapItemIds` translates source schedule-line ids to the target page's.
export function planDayOverrides(args: {
  sourceEvents: {id: number; date: string; title: string}[]
  sourceOverrides: SourceOverride[]
  placements: CopyPlacement[]
  targetYear: number
  mapItemIds: (targetMonth: number, sourceMonth: number, ids: number[]) => number[]
}): OverridePlan {
  const {sourceEvents, sourceOverrides, placements, targetYear, mapItemIds} = args
  const overrideByDate = new Map(sourceOverrides.map((o) => [o.date, o]))
  const sourceEventDates = new Set(sourceEvents.map((e) => e.date))
  const titleById = new Map(sourceEvents.map((e) => [e.id, e.title]))
  const sourceDateById = new Map(sourceEvents.map((e) => [e.id, e.date]))

  const result = new Map<string, OverrideShape | null>()
  const titlesByDate = new Map<string, string[]>()
  const conflicts: OverridePlan['conflicts'] = []

  for (const p of placements) {
    const srcDate = sourceDateById.get(p.sourceId)
    if (!srcDate) continue
    // A Day Override is a choice of that weekday's schedule lines; it only travels with an Event
    // that keeps its weekday. Veterans Day moving Wed → Thu must not carry Wednesday's lines —
    // its new day is treated as an ordinary day instead.
    if (weekdayOf(srcDate) !== weekdayOf(p.date)) continue
    const src = overrideByDate.get(srcDate) ?? null
    const mapped: OverrideShape | null = src
      ? {
          inlineItemIds: mapItemIds(monthOf(p.date), monthOf(srcDate), src.inlineItemIds),
          showNoKaya: src.showNoKaya,
          showNormalScheduleLabel: src.showNormalScheduleLabel,
        }
      : null
    const titles = titlesByDate.get(p.date) ?? []
    titles.push(titleById.get(p.sourceId) ?? '')
    titlesByDate.set(p.date, titles)
    if (!result.has(p.date) || result.get(p.date) === null) {
      // A real choice beats "no override" (e.g. a Thursday Bible Study sharing the day).
      result.set(p.date, mapped)
    } else if (mapped && overrideKey(result.get(p.date)!) !== overrideKey(mapped)) {
      // Two real, different choices: the first Event's stands; the post-copy summary lists it.
      if (!conflicts.some((c) => c.date === p.date)) conflicts.push({date: p.date, titles})
    }
  }

  // Most common override per (source month, weekday) across ordinary source days.
  const sourceYear = sourceEvents.length
    ? yearOf(sourceEvents[0].date)
    : sourceOverrides.length
      ? yearOf(sourceOverrides[0].date)
      : targetYear - 1
  const usual = new Map<string, OverrideShape | null>()
  for (let m = 1; m <= 12; m++) {
    const counts = new Map<string, {count: number; value: OverrideShape | null; weekday: Weekday}>()
    for (let d = 1; d <= daysInMonth(sourceYear, m); d++) {
      const iso = toIso(ymd(sourceYear, m, d))
      if (!isServiceDay(iso) || sourceEventDates.has(iso)) continue
      const o = overrideByDate.get(iso) ?? null
      const shape: OverrideShape | null = o
        ? {inlineItemIds: o.inlineItemIds, showNoKaya: o.showNoKaya, showNormalScheduleLabel: o.showNormalScheduleLabel}
        : null
      const key = `${weekdayOf(iso)}|${overrideKey(shape)}`
      const entry = counts.get(key) ?? {count: 0, value: shape, weekday: weekdayOf(iso)}
      entry.count++
      counts.set(key, entry)
    }
    for (const w of [0, 3, 6] as Weekday[]) {
      let best: {count: number; value: OverrideShape | null} | null = null
      for (const entry of counts.values()) {
        if (entry.weekday !== w) continue
        if (!best || entry.count > best.count) best = entry
      }
      usual.set(`${m}|${w}`, best?.value ?? null)
    }
  }

  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(targetYear, m); d++) {
      const iso = toIso(ymd(targetYear, m, d))
      if (!isServiceDay(iso) || result.get(iso)) continue
      const u = usual.get(`${m}|${weekdayOf(iso)}`) ?? null
      result.set(iso, u ? {...u, inlineItemIds: mapItemIds(m, m, u.inlineItemIds)} : null)
    }
  }

  const overrides: OverridePlan['overrides'] = []
  for (const [date, o] of [...result.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (o) overrides.push({...o, date})
  }
  return {overrides, conflicts}
}
