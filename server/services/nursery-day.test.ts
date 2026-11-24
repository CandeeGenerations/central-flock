import {describe, expect, it} from 'vitest'

import {type DayRow, buildNurseryDay, formatServiceTime, isIsoDate, nextSunday} from './nursery-day.js'

const row = (over: Partial<DayRow>): DayRow => ({
  scheduleId: 1,
  scheduleMonth: 11,
  scheduleYear: 2026,
  scheduleStatus: 'final',
  scheduleLabel: 'November 2026',
  scheduleUpdatedAt: '2026-11-01 10:00:00',
  serviceTimeId: 1,
  serviceName: 'Sunday School',
  serviceTime: '09:45',
  serviceSort: 1,
  slot: 1,
  workerId: 10,
  workerOverride: null,
  firstName: 'Lisa',
  lastName: 'Miller',
  ...over,
})

describe('nextSunday', () => {
  it('is the coming Sunday in Eastern time, today when it is Sunday', () => {
    expect(nextSunday(new Date('2026-11-28T21:10:00Z'))).toBe('2026-11-29') // Sat 4:10 pm ET
    expect(nextSunday(new Date('2026-11-29T15:00:00Z'))).toBe('2026-11-29') // Sunday
    expect(nextSunday(new Date('2026-11-30T03:00:00Z'))).toBe('2026-11-29') // Sun 10 pm ET, Mon in UTC
    expect(nextSunday(new Date('2026-11-30T15:00:00Z'))).toBe('2026-12-06')
  })
})

describe('formatServiceTime', () => {
  it('formats 24h times', () => {
    expect(formatServiceTime('09:45')).toBe('9:45 AM')
    expect(formatServiceTime('18:30')).toBe('6:30 PM')
    expect(formatServiceTime('12:00')).toBe('12:00 PM')
  })
})

describe('isIsoDate', () => {
  it('rejects impossible dates', () => {
    expect(isIsoDate('2026-11-29')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('11/29/2026')).toBe(false)
  })
})

describe('buildNurseryDay', () => {
  it('says plainly when no schedule covers the day', () => {
    expect(buildNurseryDay('2026-11-29', [])).toEqual({
      date: '2026-11-29',
      schedule: null,
      assignments: [],
      unfilled: [],
    })
  })

  it('lists workers in service order and calls out empty slots', () => {
    const day = buildNurseryDay('2026-11-29', [
      row({serviceTimeId: 3, serviceName: 'Sunday Evening', serviceTime: '18:30', serviceSort: 3, workerId: null}),
      row({slot: 2, workerId: 11, firstName: 'Juni', lastName: 'Salgado', workerOverride: 'Yuny Mejia'}),
      row({}),
    ])
    expect(day.schedule).toEqual({id: 1, label: 'November 2026', status: 'final'})
    expect(day.assignments.map((a) => [a.service, a.time, a.slot, a.worker, a.firstName])).toEqual([
      ['Sunday School', '9:45 AM', 1, 'Lisa Miller', 'Lisa'],
      ['Sunday School', '9:45 AM', 2, 'Yuny Mejia', 'Yuny'],
    ])
    expect(Object.keys(day.assignments[0]).sort()).toEqual(
      ['firstName', 'service', 'serviceTimeId', 'slot', 'time', 'worker'].sort(),
    )
    expect(day.unfilled).toEqual([{service: 'Sunday Evening', serviceTimeId: 3, time: '6:30 PM', slot: 1}])
  })

  it("prefers the date's own month, then final, then the latest edit", () => {
    const rows = [
      row({scheduleId: 2, scheduleMonth: 12, firstName: 'Leaked'}),
      row({scheduleId: 3, scheduleStatus: 'draft', scheduleUpdatedAt: '2026-11-20 10:00:00', firstName: 'Draft'}),
      row({scheduleId: 1, firstName: 'Final'}),
    ]
    expect(buildNurseryDay('2026-11-29', rows).assignments[0].firstName).toBe('Final')
    const drafts = [
      row({scheduleId: 4, scheduleStatus: 'draft', scheduleUpdatedAt: '2026-11-02 10:00:00', firstName: 'Old'}),
      row({scheduleId: 5, scheduleStatus: 'draft', scheduleUpdatedAt: '2026-11-09 10:00:00', firstName: 'New'}),
    ]
    expect(buildNurseryDay('2026-11-29', drafts).assignments[0].firstName).toBe('New')
  })
})
