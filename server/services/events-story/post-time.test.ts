import {describe, expect, it} from 'vitest'

import {defaultPostDay, earliestMinute, fallbackHours, rankHours, zonedIso, zonedNow} from './post-time.js'

const at = (date: string, hh: number, mm = 0) => ({date, minutes: hh * 60 + mm})
const always = () => true
// A good hour exists only if 10 am is still reachable (the fallback rule).
const tenAm = (_date: string, earliest: number) => fallbackHours(earliest).length > 0

// 2026-11-23 is a Monday.
describe('defaultPostDay', () => {
  it('posts today on Monday when an hour is left', () => {
    expect(defaultPostDay(at('2026-11-23', 8), always)).toBe('2026-11-23')
  })

  it('rolls Monday → Tuesday → Wednesday when the day is used up', () => {
    expect(defaultPostDay(at('2026-11-23', 15), tenAm)).toBe('2026-11-24')
    expect(defaultPostDay(at('2026-11-25', 15), tenAm)).toBe('2026-11-30') // Wed late → Thu → next Monday
  })

  it('posts today on Tuesday or Wednesday when an hour is left', () => {
    expect(defaultPostDay(at('2026-11-24', 8), tenAm)).toBe('2026-11-24')
    expect(defaultPostDay(at('2026-11-25', 9), tenAm)).toBe('2026-11-25')
  })

  it('goes to next Monday from Thursday through Sunday', () => {
    for (const d of ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']) {
      expect(defaultPostDay(at(d, 8), always)).toBe('2026-11-30')
    }
  })

  it('needs 30 min of lead before the hour', () => {
    expect(defaultPostDay(at('2026-11-25', 9, 45), tenAm)).toBe('2026-11-30')
    expect(defaultPostDay(at('2026-11-25', 9, 30), tenAm)).toBe('2026-11-25')
  })
})

describe('rankHours', () => {
  const fb = new Map([
    [9, 5],
    [10, 8],
    [12, 6],
    [22, 9],
  ])
  const ig = new Map([
    [8, 4],
    [10, 9],
    [12, 3],
    [13, 7],
  ])

  it('adds networks per hour, best first, dropping 9 pm and later', () => {
    expect(rankHours([fb, ig], 0).map((h) => h.hour)).toEqual([10, 12, 13, 9, 8])
  })

  it('drops hours before the earliest allowed minute', () => {
    expect(rankHours([fb, ig], 10 * 60 + 1).map((h) => h.hour)).toEqual([12, 13])
  })

  it('ignores zero scores', () => {
    expect(rankHours([new Map([[10, 0]])], 0)).toEqual([])
  })
})

describe('time helpers', () => {
  it('reads now in Eastern time', () => {
    expect(zonedNow(new Date('2026-11-23T15:30:00Z'))).toEqual({date: '2026-11-23', minutes: 10 * 60 + 30})
    expect(zonedNow(new Date('2026-11-24T03:00:00Z'))).toEqual({date: '2026-11-23', minutes: 22 * 60})
  })

  it('earliest minute is +30 today, midnight later, never in the past', () => {
    expect(earliestMinute('2026-11-23', at('2026-11-23', 9))).toBe(9 * 60 + 30)
    expect(earliestMinute('2026-11-24', at('2026-11-23', 9))).toBe(0)
    expect(earliestMinute('2026-11-22', at('2026-11-23', 9))).toBe(Infinity)
  })

  it('formats an ISO time with the DST-correct offset', () => {
    expect(zonedIso('2026-11-23', 10)).toBe('2026-11-23T10:00:00-05:00')
    expect(zonedIso('2027-06-07', 13, 30)).toBe('2027-06-07T13:30:00-04:00')
  })
})

describe('story weeks', async () => {
  const {defaultDayInWeek, mondayOf, storyWeeks, suggestedWeek} = await import('./post-time.js')

  it('finds the Monday of any day', () => {
    expect(mondayOf('2026-11-23')).toBe('2026-11-23')
    expect(mondayOf('2026-11-29')).toBe('2026-11-23')
    expect(mondayOf('2026-11-30')).toBe('2026-11-30')
  })

  it('lists this week through 28 days ahead', () => {
    expect(storyWeeks(at('2026-11-25', 8))).toEqual([
      '2026-11-23',
      '2026-11-30',
      '2026-12-07',
      '2026-12-14',
      '2026-12-21',
    ])
  })

  it('suggests this week Mon–Wed and next week after that', () => {
    expect(suggestedWeek(at('2026-11-23', 8))).toBe('2026-11-23')
    expect(suggestedWeek(at('2026-11-25', 15))).toBe('2026-11-30')
    expect(suggestedWeek(at('2026-11-27', 8))).toBe('2026-11-30')
  })

  it('defaults to Monday of a future week', () => {
    expect(defaultDayInWeek('2026-11-30', at('2026-11-25', 8), tenAm)).toBe('2026-11-30')
  })

  it('this week: today if an hour is left, else the next day', () => {
    expect(defaultDayInWeek('2026-11-23', at('2026-11-24', 8), tenAm)).toBe('2026-11-24')
    expect(defaultDayInWeek('2026-11-23', at('2026-11-24', 15), tenAm)).toBe('2026-11-25')
    // Friday afternoon: no Mon–Wed left, so Saturday.
    expect(defaultDayInWeek('2026-11-23', at('2026-11-27', 15), tenAm)).toBe('2026-11-28')
  })

  it('refuses a past week', () => {
    expect(defaultDayInWeek('2026-11-16', at('2026-11-24', 8), always)).toBeNull()
  })
})
