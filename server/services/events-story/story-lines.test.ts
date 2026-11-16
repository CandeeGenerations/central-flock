import {describe, expect, it} from 'vitest'

import {splitName, storyLineFor} from './story-lines.js'

describe('storyLineFor', () => {
  it('matches the Nov 16 Events Story', () => {
    expect(storyLineFor('2026-11-21', null, 'Church Family Thanksgiving Dinner\n\n4 pm')).toEqual({
      dayNumber: '21',
      month: 'Nov',
      dayTimeLine: 'Saturday @ 4 pm',
      line1: 'Church Family',
      line2: 'Thanksgiving Dinner',
      warnings: [],
    })
    expect(storyLineFor('2026-11-22', null, 'Praise & Testimony Service\n\n6:30 pm')).toMatchObject({
      dayTimeLine: 'Sunday @ 6:30 pm',
      line1: 'Praise & Testimony',
      line2: 'Service',
    })
    expect(storyLineFor('2026-11-25', null, 'All Church Candlelight Service\n\n7:30 pm')).toMatchObject({
      dayTimeLine: 'Wednesday @ 7:30 pm',
      line1: 'All Church',
      line2: 'Candlelight Service',
    })
  })

  it('has just the day when there is no time, and splits two words', () => {
    expect(storyLineFor('2026-11-26', null, 'Thanksgiving Day')).toMatchObject({
      dayTimeLine: 'Thursday',
      line1: 'Thanksgiving',
      line2: 'Day',
    })
  })

  it('keeps a single word on one line', () => {
    expect(storyLineFor('2027-01-18', null, 'Holiday')).toMatchObject({line1: 'Holiday', line2: null})
  })

  it('uses existing name lines as they are', () => {
    expect(storyLineFor('2026-12-02', null, 'Business\nMeeting\n\n7:30 pm')).toMatchObject({
      dayTimeLine: 'Wednesday @ 7:30 pm',
      line1: 'Business',
      line2: 'Meeting',
      warnings: [],
    })
  })

  it('finds a time with no blank line before it', () => {
    expect(storyLineFor('2026-12-05', null, 'Hispanic Christmas Dinner\n4 pm')).toMatchObject({
      dayTimeLine: 'Saturday @ 4 pm',
      line1: 'Hispanic',
      line2: 'Christmas Dinner',
    })
  })

  it('keeps the first two of three name lines and warns', () => {
    const s = storyLineFor('2026-12-11', null, 'Cookies & Carols\nChristmas Concert\nat Fellowship House\n\n7 pm')
    expect(s).toMatchObject({dayTimeLine: 'Friday @ 7 pm', line1: 'Cookies & Carols', line2: 'Christmas Concert'})
    expect(s.warnings).toHaveLength(1)
  })

  it('takes the first of several labelled times and drops the labels', () => {
    const s = storyLineFor('2027-03-06', null, 'Men & Boys\nBEAST FEAST\n1 pm Activities\n4 pm Meal')
    expect(s).toMatchObject({dayTimeLine: 'Saturday @ 1 pm', line1: 'Men & Boys', line2: 'BEAST FEAST'})
    expect(s.warnings[0]).toMatch(/Several times/)
  })

  it('handles time ranges and strips the unconfirmed star', () => {
    expect(storyLineFor('2027-01-23', null, '* Kids & Youth Extravaganza\n\n10 am - 2 pm')).toMatchObject({
      dayTimeLine: 'Saturday @ 10 am - 2 pm',
      line1: 'Kids & Youth',
      line2: 'Extravaganza',
    })
    expect(storyLineFor('2027-01-23', null, 'Thing\n10-11am').dayTimeLine).toBe('Saturday @ 10 - 11 am')
  })

  it('shows a Span as a day range', () => {
    expect(storyLineFor('2027-02-01', '2027-02-03', 'AGM National Conference').dayTimeLine).toBe('Monday – Wednesday')
  })

  it('warns when a line is likely too long', () => {
    expect(storyLineFor('2027-01-01', null, 'Supercalifragilisticexpialidocious Night').warnings[0]).toMatch(/too long/)
  })
})

describe('splitName', () => {
  it('never ends line 1 with a joining word', () => {
    expect(splitName('Feast of the Tabernacles')).toEqual(['Feast', 'of the Tabernacles'])
    expect(splitName('Cookies and Carols Night')).toEqual(['Cookies', 'and Carols Night'])
  })
})
