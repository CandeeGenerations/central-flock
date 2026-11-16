import {describe, expect, it} from 'vitest'

import {type PrintEventRow, pickEvents} from './pick-events.js'

let nextId = 1
const ev = (date: string, title: string, sortOrder = 0): PrintEventRow => ({id: nextId++, date, title, sortOrder})

describe('pickEvents', () => {
  it('starts at the post date, inclusive, and keeps date order', () => {
    const events = [
      ev('2026-11-22', 'Praise & Testimony Service\n\n6:30 pm'),
      ev('2026-11-15', 'Old'),
      ev('2026-11-21', 'Church Family Thanksgiving Dinner\n\n4 pm'),
      ev('2026-11-23', "Faithful Men's Meeting\n\n7:30 pm"),
    ]
    expect(pickEvents(events, '2026-11-21').map((c) => c.date)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23'])
  })

  it('leaves out Unconfirmed Events', () => {
    const events = [
      ev('2027-01-16', '* Youth Saturation'),
      ev('2027-01-16', '  * Forge I\n1 pm'),
      ev('2027-01-18', 'Holiday'),
    ]
    expect(pickEvents(events, '2027-01-01').map((c) => c.title)).toEqual(['Holiday'])
  })

  it('counts a Span once, by its first day, with its end date', () => {
    const events = [
      ev('2027-02-01', 'AGM National Conference'),
      ev('2027-02-02', 'AGM National Conference'),
      ev('2027-02-03', 'AGM National Conference'),
      ev('2027-02-10', 'Annual Report Meeting'),
    ]
    const picked = pickEvents(events, '2027-01-25')
    expect(picked).toHaveLength(2)
    expect(picked[0]).toMatchObject({
      date: '2027-02-01',
      endDate: '2027-02-03',
      eventIds: [events[0].id, events[1].id, events[2].id],
    })
    expect(picked[1]).toMatchObject({date: '2027-02-10', endDate: null})
  })

  it('shows a Span already under way from the post date', () => {
    const events = [ev('2027-02-01', 'Fair'), ev('2027-02-02', 'Fair'), ev('2027-02-03', 'Fair')]
    expect(pickEvents(events, '2027-02-02')[0]).toMatchObject({date: '2027-02-02', endDate: '2027-02-03'})
  })

  it('treats the last day of a running Span as a single day', () => {
    const events = [ev('2027-02-01', 'Fair'), ev('2027-02-02', 'Fair')]
    expect(pickEvents(events, '2027-02-02')[0]).toMatchObject({date: '2027-02-02', endDate: null})
  })

  it('orders same-day Events by sort order and stops at the limit', () => {
    const events = [
      ev('2027-01-10', 'B', 2),
      ev('2027-01-10', 'A', 1),
      ...Array.from({length: 12}, (_, i) => ev(`2027-02-${String(i + 10).padStart(2, '0')}`, `E${i}`)),
    ]
    const picked = pickEvents(events, '2027-01-01')
    expect(picked).toHaveLength(10)
    expect(picked.slice(0, 2).map((c) => c.title)).toEqual(['A', 'B'])
  })
})
