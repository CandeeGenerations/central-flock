import {describe, expect, it} from 'vitest'

import {addDaysIso, localToday, monthEnd, notEnded} from './current-period'
import {musicSchedulesProvider} from './providers/music-schedules'
import {nurserySchedulesProvider} from './providers/nursery-schedules'
import {specialMusicSchedulesProvider} from './providers/special-music-schedules'
import {workersNotesProvider} from './providers/workers-notes'

describe('current-period helpers', () => {
  it('finds month ends, leap years included', () => {
    expect(monthEnd(2026, 11)).toBe('2026-11-30')
    expect(monthEnd(2028, 2)).toBe('2028-02-29')
    expect(monthEnd(2026, 12)).toBe('2026-12-31')
  })

  it('adds days across months', () => {
    expect(addDaysIso('2026-11-29', 6)).toBe('2026-12-05')
  })

  it('keeps periods ending today or later, and ones with no end', () => {
    expect(notEnded('2026-11-16', '2026-11-16')).toBe(true)
    expect(notEnded('2026-11-15', '2026-11-16')).toBe(false)
    expect(notEnded(null, '2026-11-16')).toBe(true)
  })

  it('formats today as a local date', () => {
    expect(localToday(new Date(2026, 10, 16, 23, 30))).toBe('2026-11-16')
  })
})

// Providers filter against the real "today", so build rows relative to it.
const today = localToday()
const [ty, tm] = today.split('-').map(Number)
const prevMonth = tm === 1 ? {year: ty - 1, month: 12} : {year: ty, month: tm - 1}
const ids = (items: {id: string}[]) => items.map((i) => i.id)

describe('schedule providers hide past periods', () => {
  it('music: this week and later', () => {
    const rows = [
      {id: 1, weekStart: addDaysIso(today, -13)}, // ended last week
      {id: 2, weekStart: addDaysIso(today, -6)}, // ends today
      {id: 3, weekStart: addDaysIso(today, 7)},
    ].map((w) => ({...w, label: w.weekStart, serviceCount: 3, status: 'draft', episodeFirst: null, episodeLast: null}))
    expect(ids(musicSchedulesProvider.toItems(rows as never))).toEqual(['music-schedule-2', 'music-schedule-3'])
  })

  it('nursery: this month and later', () => {
    const rows = [
      {id: 1, ...prevMonth},
      {id: 2, year: ty, month: tm},
      {id: 3, year: ty + 1, month: 1},
    ].map((s) => ({...s, status: 'draft'}))
    expect(ids(nurserySchedulesProvider.toItems(rows as never))).toEqual(['nursery-2', 'nursery-3'])
  })

  it('special music: ranges not yet ended', () => {
    const rows = [
      {id: 1, scopeEnd: addDaysIso(today, -1)},
      {id: 2, scopeEnd: today},
      {id: 3, scopeEnd: null},
    ].map((s) => ({...s, scopeStart: null, scopeLabel: 'Q', status: 'draft'}))
    expect(ids(specialMusicSchedulesProvider.toItems(rows as never))).toEqual(['special-music-2', 'special-music-3'])
  })

  it("workers' notes: this term and later", () => {
    const term = Math.floor((tm - 1) / 4) + 1
    const rows = [
      {id: 1, year: ty - 1, term: 3},
      {id: 2, year: ty, term},
      {id: 3, year: ty + 1, term: 1},
    ].map((e) => ({...e, startingLessonNumber: 1, status: 'draft', scopeLabel: ''}))
    expect(ids(workersNotesProvider.toItems(rows as never))).toEqual(['workers-notes-2', 'workers-notes-3'])
  })
})

describe('Recents for dated schedules', async () => {
  const {recentFilter} = await import('./use-search-index')
  const recent = (navPath: string) => ({id: navPath, label: navPath, group: 'Recent', navPath}) as never
  const music = {ownsPath: musicSchedulesProvider.ownsPath}
  const current = [{id: 'w19', label: 'w19', group: 'Schedules', navPath: '/schedules/music/19'}] as never[]

  it('drops a past week (and its service pages) once the provider has loaded', () => {
    const keep = recentFilter([music], [current])
    expect(keep(recent('/schedules/music/19'))).toBe(true)
    expect(keep(recent('/schedules/music/19/service/76'))).toBe(true)
    expect(keep(recent('/schedules/music/18'))).toBe(false)
    expect(keep(recent('/schedules/music/18/service/70'))).toBe(false)
  })

  it('leaves other paths and not-yet-loaded providers alone', () => {
    const keep = recentFilter([music], [current])
    expect(keep(recent('/schedules/music/scans/2'))).toBe(true)
    expect(keep(recent('/people/4'))).toBe(true)
    expect(recentFilter([music], [null])(recent('/schedules/music/18'))).toBe(true)
  })
})

describe('Calendar Print months', async () => {
  const {calendarPrintMonthsProvider} = await import('./providers/calendar-print-months')
  it('starts at this month', async () => {
    const rows = await calendarPrintMonthsProvider.fetch()
    expect(rows[0]).toEqual({year: ty, month: tm})
    expect(rows[rows.length - 1]).toEqual({year: ty + 1, month: 12})
  })
})

describe('more dated providers', async () => {
  const {monthsAgo} = await import('./current-period')
  const {fairBoothSchedulesProvider} = await import('./providers/fair-booth-schedules')
  const {sundaySchoolRollsProvider} = await import('./providers/sunday-school-rolls')
  const {prayerSheetsProvider} = await import('./providers/prayer-sheets')

  it('monthsAgo clamps to month end', () => {
    expect(monthsAgo('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsAgo('2026-01-15', 1)).toBe('2025-12-15')
  })

  it('fair booth: last year and this year', () => {
    const rows = [
      {id: 1, scopeStart: `${ty - 2}-08-01`, scopeEnd: `${ty - 2}-08-09`},
      {id: 2, scopeStart: `${ty - 1}-08-01`, scopeEnd: `${ty - 1}-08-09`},
      {id: 3, scopeStart: `${ty}-08-01`, scopeEnd: `${ty}-08-09`},
    ].map((s) => ({...s, scopeLabel: 'Fair', status: 'final'}))
    expect(ids(fairBoothSchedulesProvider.toItems(rows as never))).toEqual(['fair-booth-2', 'fair-booth-3'])
  })

  it('sunday school roll: this quarter and later', () => {
    const quarter = Math.floor((tm - 1) / 3) + 1
    const rows = [
      {id: 1, year: ty - 1, quarter: 4},
      {id: 2, year: ty, quarter},
    ].map((r) => ({...r, sheetCount: 3, status: 'draft'}))
    expect(ids(sundaySchoolRollsProvider.toItems(rows as never))).toEqual(['sunday-school-roll-2'])
  })

  it('prayer sheets: the last month', () => {
    const rows = [
      {id: 1, latestDate: addDaysIso(monthsAgo(today, 1), -1)},
      {id: 2, latestDate: monthsAgo(today, 1)},
      {id: 3, latestDate: today},
      {id: 4, latestDate: null},
    ].map((e) => ({...e, sundayCount: 1, entryCount: 2}))
    expect(ids(prayerSheetsProvider.toItems(rows as never))).toEqual([
      'prayer-sheet-2',
      'prayer-sheet-3',
      'prayer-sheet-4',
    ])
  })
})
