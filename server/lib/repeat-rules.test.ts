import {describe, expect, it} from 'vitest'

import {
  type RepeatRule,
  type RuleEvent,
  describeRule,
  detectSpans,
  easterDate,
  evaluateRule,
  guessRule,
  parseRule,
  planDayOverrides,
  planYearCopy,
  ruleAlternatives,
} from './repeat-rules.js'

describe('easterDate', () => {
  it('matches published dates', () => {
    const known: Record<number, string> = {
      2026: '2026-04-05',
      2027: '2027-03-28',
      2028: '2028-04-16',
      2029: '2029-04-01',
      2030: '2030-04-21',
      2031: '2031-04-13',
      2032: '2032-03-28',
      2033: '2033-04-17',
      2034: '2034-04-09',
      2035: '2035-03-25',
    }
    for (const [y, d] of Object.entries(known)) expect(easterDate(Number(y))).toBe(d)
  })
})

// plans/calendar-year-copy.md → "Expected results for the 2026 data".
const FIXTURE: {title: string; date: string; rule: string; in2027: string | null}[] = [
  {
    title: 'Fellowship House Bible Study\n\n10:30 am',
    date: '2026-01-08',
    rule: '2nd Thursday of January',
    in2027: '2027-01-14',
  },
  {title: 'Holiday', date: '2026-01-19', rule: 'MLK Day', in2027: '2027-01-18'},
  {title: 'Holiday', date: '2026-02-16', rule: "Presidents' Day", in2027: '2027-02-15'},
  {title: 'AGM National Conference', date: '2026-02-02', rule: '1st Monday of February', in2027: '2027-02-01'},
  {title: 'Time Change Sunday', date: '2026-03-08', rule: 'Daylight Saving Time start', in2027: '2027-03-14'},
  {title: 'Palm Sunday', date: '2026-03-29', rule: 'Palm Sunday', in2027: '2027-03-21'},
  {title: "The Lord's Supper\n\n7:30 pm", date: '2026-03-31', rule: 'Last Tuesday of March', in2027: '2027-03-30'},
  {title: 'Resurrection Sunday', date: '2026-04-05', rule: 'Easter', in2027: '2027-03-28'},
  {title: 'National Day\nof Prayer', date: '2026-05-07', rule: 'National Day of Prayer', in2027: '2027-05-06'},
  {title: "Mother's Day", date: '2026-05-10', rule: "Mother's Day", in2027: '2027-05-09'},
  {title: 'Armed Forces Sunday', date: '2026-05-17', rule: 'Sunday nearest Armed Forces Day', in2027: '2027-05-16'},
  {title: 'Memorial Day Sunday', date: '2026-05-24', rule: 'Sunday nearest Memorial Day', in2027: '2027-05-30'},
  {title: 'Memorial Day', date: '2026-05-25', rule: 'Memorial Day', in2027: '2027-05-31'},
  {title: 'Father’s Day', date: '2026-06-21', rule: "Father's Day", in2027: '2027-06-20'},
  {title: "Fran Fraley's\nFuneral\n3 pm", date: '2026-06-13', rule: "Doesn't repeat", in2027: null},
  {
    title: 'Ladies\nBible Study &\nBaby Sprinkle for\nCarissa Candee\n\n7 pm',
    date: '2026-06-09',
    rule: "Doesn't repeat",
    in2027: null,
  },
  {
    title: 'Church Picnic\nKids & Youth Extravaganza',
    date: '2026-07-04',
    rule: '1st Saturday of July',
    in2027: '2027-07-03',
  },
  {title: 'God & Country Sunday', date: '2026-07-05', rule: 'Sunday nearest Independence Day', in2027: '2027-07-04'},
  {title: 'PWC Fair', date: '2026-07-31', rule: 'Last Friday of July', in2027: '2027-07-30'},
  {title: 'Labor Day', date: '2026-09-07', rule: 'Labor Day', in2027: '2027-09-06'},
  {title: 'Grandparents Sunday', date: '2026-09-13', rule: 'Grandparents Day', in2027: '2027-09-12'},
  {title: 'Holiday', date: '2026-10-12', rule: 'Columbus Day', in2027: '2027-10-11'},
  {title: 'Visiting\nMissionary', date: '2026-10-11', rule: '2nd Sunday of October', in2027: '2027-10-10'},
  {title: '63rd Church\nAnniversary', date: '2026-10-25', rule: '4th Sunday of October', in2027: '2027-10-24'},
  {title: 'Daylight Saving Sunday', date: '2026-11-01', rule: 'Daylight Saving Time end', in2027: '2027-11-07'},
  {title: 'Veterans\nSunday', date: '2026-11-08', rule: 'Sunday nearest Veterans Day', in2027: '2027-11-14'},
  {title: 'Veterans Day', date: '2026-11-11', rule: 'Veterans Day', in2027: '2027-11-11'},
  {
    title: 'Church Family Thanksgiving Dinner\n\n4 pm',
    date: '2026-11-21',
    rule: 'Saturday before Thanksgiving',
    in2027: '2027-11-20',
  },
  {title: 'Praise & Testimony Service', date: '2026-11-22', rule: '4th Sunday of November', in2027: '2027-11-28'},
  {
    title: 'All Church Candlelight Service\n\n7:30 pm',
    date: '2026-11-25',
    rule: "Wednesday of Thanksgiving's week",
    in2027: '2027-11-24',
  },
  {title: 'Thanksgiving Day', date: '2026-11-26', rule: 'Thanksgiving', in2027: '2027-11-25'},
  {title: 'Christmas Musicale\n\n11 am', date: '2026-12-13', rule: '2nd Sunday of December', in2027: '2027-12-12'},
  {title: 'Hispanic Christmas Dinner', date: '2026-12-12', rule: '2nd Saturday of December', in2027: '2027-12-11'},
  {
    title: 'Christmas Candlelight Service\n\n7:30 pm',
    date: '2026-12-23',
    rule: "Wednesday of Christmas Day's week",
    in2027: '2027-12-22',
  },
  {title: 'Christmas Day', date: '2026-12-25', rule: 'Christmas Day', in2027: '2027-12-25'},
  {
    title: 'New Years Candlelight Service\n\n7:30 pm',
    date: '2026-12-30',
    rule: "Wednesday of New Year's Eve's week",
    in2027: '2027-12-29',
  },
]

describe('guessRule against the 2026 calendar', () => {
  for (const f of FIXTURE) {
    it(`${f.title.split('\n')[0]} (${f.date})`, () => {
      const rule = guessRule(f.title, f.date)
      expect(describeRule(rule)).toBe(f.rule)
      expect(evaluateRule(rule, 2026)).toBe(f.in2027 === null ? null : f.date)
      expect(evaluateRule(rule, 2027)).toBe(f.in2027)
    })
  }
})

describe('hand corrections from the plan', () => {
  it("Lord's Supper as Easter − 5", () => {
    expect(evaluateRule({kind: 'anchor', anchor: 'easter', days: -5}, 2027)).toBe('2027-03-23')
  })
  it('Church Picnic as Saturday nearest Independence Day', () => {
    const rule: RepeatRule = {kind: 'anchor-weekday', anchor: 'independence-day', weekday: 6, relation: 'nearest'}
    expect(evaluateRule(rule, 2027)).toBe('2027-07-03')
    expect(evaluateRule(rule, 2028)).toBe('2028-07-01') // Jul 4, 2028 is a Tuesday
    expect(evaluateRule(rule, 2029)).toBe('2029-07-07') // Wednesday: Saturday after is closer
    const alts = ruleAlternatives('2026-07-04', 'Church Picnic').map((o) => o.label)
    expect(alts).toContain('Saturday nearest Independence Day')
  })
  it('Praise & Testimony as Sunday before Thanksgiving', () => {
    const rule: RepeatRule = {kind: 'anchor-weekday', anchor: 'thanksgiving', weekday: 0, relation: 'before'}
    expect(evaluateRule(rule, 2027)).toBe('2027-11-21')
    expect(ruleAlternatives('2026-11-22').map((o) => o.label)).toContain('Sunday before Thanksgiving')
  })
})

describe('New Year’s Candlelight spill-over', () => {
  const rule: RepeatRule = {kind: 'anchor-weekday', anchor: 'new-years-eve', weekday: 3, relation: 'week'}
  it('lands in January when Dec 31 is a Sun, Mon or Tue', () => {
    expect(evaluateRule(rule, 2028)).toBe('2029-01-03')
    expect(evaluateRule(rule, 2029)).toBe('2030-01-02')
    expect(evaluateRule(rule, 2030)).toBe('2031-01-01')
    expect(evaluateRule(rule, 2031)).toBe('2031-12-31')
  })
})

describe('ruleAlternatives', () => {
  it('puts the guess first, "Doesn\'t repeat" last, and every option gives the date', () => {
    const opts = ruleAlternatives('2026-11-26', 'Thanksgiving Day')
    expect(opts[0].label).toBe('Thanksgiving')
    expect(opts[opts.length - 1].label).toBe("Doesn't repeat")
    for (const o of opts.slice(0, -1)) expect(evaluateRule(o.rule, 2026)).toBe('2026-11-26')
    const labels = opts.map((o) => o.label)
    expect(labels).toContain('4th Thursday of November')
    expect(labels).toContain('Last Thursday of November')
  })
})

describe('parseRule', () => {
  it('round-trips and rejects junk', () => {
    const r: RepeatRule = {kind: 'anchor-weekday', anchor: 'date:07-04', weekday: 6, relation: 'nearest'}
    expect(parseRule(JSON.stringify(r))).toEqual(r)
    expect(parseRule({kind: 'nth', month: 13, weekday: 1, n: 1})).toBeNull()
    expect(parseRule({kind: 'anchor', anchor: 'boxing-day', days: 0})).toBeNull()
    expect(parseRule('not json')).toBeNull()
  })
})

function ev(id: number, date: string, title: string, repeatRule: RepeatRule | null = null): RuleEvent {
  return {id, date, title, repeatRule}
}

describe('Spans and planYearCopy', () => {
  const fair = Array.from({length: 9}, (_, i) =>
    ev(100 + i, `2026-0${i === 0 ? 7 : 8}-${String(i === 0 ? 31 : i).padStart(2, '0')}`, 'PWC Fair'),
  )
  it('detects the Fair as one 9-day Span', () => {
    const spans = detectSpans(fair)
    expect(new Set([...spans.values()].map((s) => s.headId))).toEqual(new Set([100]))
    expect(spans.get(108)).toEqual({headId: 100, offset: 8, length: 9})
  })
  it('moves the Span as a block (per-day rules would scatter it)', () => {
    const plan = planYearCopy(fair, 2027)
    expect(plan.placements.map((p) => p.date)).toEqual([
      '2027-07-30',
      '2027-07-31',
      '2027-08-01',
      '2027-08-02',
      '2027-08-03',
      '2027-08-04',
      '2027-08-05',
      '2027-08-06',
      '2027-08-07',
    ])
  })
  it('skips "doesn\'t repeat" and reports out-of-year results', () => {
    const plan = planYearCopy(
      [
        ev(1, '2026-06-13', 'Funeral'),
        ev(2, '2027-12-29', 'New Years Candlelight Service', {
          kind: 'anchor-weekday',
          anchor: 'new-years-eve',
          weekday: 3,
          relation: 'week',
        }),
      ],
      2028,
    )
    expect(plan.skipped.map((s) => s.sourceId)).toEqual([1])
    expect(plan.outOfYear).toEqual([{sourceId: 2, title: 'New Years Candlelight Service', date: '2029-01-03'}])
  })
})

describe('planDayOverrides', () => {
  const sat = {inlineItemIds: [145, 146, 147], showNoKaya: false, showNormalScheduleLabel: true}
  const sunShort = {inlineItemIds: [135, 136, 137, 140], showNoKaya: true, showNormalScheduleLabel: true}
  const sunFull = {inlineItemIds: [135, 136, 137, 138, 139, 140], showNoKaya: false, showNormalScheduleLabel: true}

  it('carries an Event day override with the Event and fills ordinary days with the month’s usual', () => {
    const sourceEvents = [
      {id: 1, date: '2026-05-09', title: 'Youth Saturation'},
      {id: 2, date: '2026-05-10', title: "Mother's Day"},
    ]
    const sourceOverrides = [
      {date: '2026-05-02', ...sat},
      {date: '2026-05-03', ...sunFull},
      {date: '2026-05-09', ...sat},
      {date: '2026-05-10', ...sunShort},
      {date: '2026-05-16', ...sat},
      {date: '2026-05-23', ...sat},
      {date: '2026-05-30', ...sat},
      {date: '2026-05-31', ...sunFull},
    ]
    const plan = planDayOverrides({
      sourceEvents,
      sourceOverrides,
      placements: [
        {sourceId: 1, date: '2027-05-08', rule: {kind: 'none'}},
        {sourceId: 2, date: '2027-05-09', rule: {kind: 'none'}},
      ],
      targetYear: 2027,
      mapItemIds: (_t, _s, ids) => ids,
    })
    const byDate = new Map(plan.overrides.map((o) => [o.date, o]))
    expect(byDate.get('2027-05-08')?.inlineItemIds).toEqual(sat.inlineItemIds) // Youth Saturation
    expect(byDate.get('2027-05-09')).toMatchObject(sunShort) // Mother's Day: short list + No Kaya
    expect(byDate.get('2027-05-16')).toMatchObject(sunFull) // ordinary May Sunday
    expect(byDate.get('2027-05-15')?.inlineItemIds).toEqual(sat.inlineItemIds) // ordinary May Saturday
    expect(byDate.has('2027-01-03')).toBe(false) // January had no overrides → Normal Schedule label
    expect(plan.conflicts).toEqual([])
  })

  it('drops an Event day override when the Event changes weekday, and ignores "none" vs a real choice', () => {
    const wed = {inlineItemIds: [141, 142, 143], showNoKaya: false, showNormalScheduleLabel: true}
    const plan = planDayOverrides({
      sourceEvents: [
        {id: 1, date: '2026-11-11', title: 'Veterans Day'}, // Wed → Thu in 2027
        {id: 2, date: '2026-11-12', title: 'Fellowship House Bible Study'},
      ],
      sourceOverrides: [{date: '2026-11-11', ...wed}],
      placements: [
        {sourceId: 1, date: '2027-11-11', rule: {kind: 'none'}},
        {sourceId: 2, date: '2027-11-11', rule: {kind: 'none'}},
      ],
      targetYear: 2027,
      mapItemIds: (_t, _s, ids) => ids,
    })
    expect(plan.overrides.some((o) => o.date === '2027-11-11')).toBe(false)
    expect(plan.conflicts).toEqual([])
  })

  it('reports two Events with different overrides on one day', () => {
    const plan = planDayOverrides({
      sourceEvents: [
        {id: 1, date: '2026-05-09', title: 'A'},
        {id: 2, date: '2026-05-16', title: 'B'},
      ],
      sourceOverrides: [
        {date: '2026-05-09', ...sat},
        {date: '2026-05-16', inlineItemIds: [], showNoKaya: false, showNormalScheduleLabel: false},
      ],
      placements: [
        {sourceId: 1, date: '2027-05-08', rule: {kind: 'none'}},
        {sourceId: 2, date: '2027-05-08', rule: {kind: 'none'}},
      ],
      targetYear: 2027,
      mapItemIds: (_t, _s, ids) => ids,
    })
    expect(plan.conflicts).toEqual([{date: '2027-05-08', titles: ['A', 'B']}])
  })
})
