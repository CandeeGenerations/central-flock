import {describe, expect, it} from 'vitest'

import {guessRole, neighbourSongIndex, parseSongEntry} from './music-schedule-core'

describe('parseSongEntry', () => {
  it.each([
    ['219', 'burgundy', 219],
    ['b219', 'burgundy', 219],
    ['B#219', 'burgundy', 219],
    ['B-167', 'burgundy', 167],
    ['b 219', 'burgundy', 219],
    ['s27', 'silver', 27],
    ['S#27', 'silver', 27],
    ['s 27', 'silver', 27],
    [' S # 27 ', 'silver', 27],
  ])('%s → %s #%d', (raw, book, number) => {
    expect(parseSongEntry(raw)).toEqual({kind: 'number', book, number})
  })

  it('reads words as a title search', () => {
    expect(parseSongEntry('count your')).toEqual({kind: 'search', q: 'count your'})
    expect(parseSongEntry('Psalm 23')).toEqual({kind: 'search', q: 'Psalm 23'})
  })

  it('reads blank as empty', () => {
    expect(parseSongEntry('   ')).toEqual({kind: 'empty'})
  })
})

describe('neighbourSongIndex', () => {
  const lines = [{kind: 'prose'}, {kind: 'song'}, {kind: 'prose'}, {kind: 'page_break'}, {kind: 'song'}] as const

  it('skips prose and page breaks both ways', () => {
    expect(neighbourSongIndex([...lines], 1, 1)).toBe(4)
    expect(neighbourSongIndex([...lines], 4, -1)).toBe(1)
  })

  it('returns -1 past either end', () => {
    expect(neighbourSongIndex([...lines], 4, 1)).toBe(-1)
    expect(neighbourSongIndex([...lines], 1, -1)).toBe(-1)
  })
})

describe('guessRole', () => {
  it('makes the first song the opening', () => {
    expect(guessRole('song', [{kind: 'prose', role: 'plain', text: 'Live Stream'}])).toBe('opening')
  })
  it('makes a song after the message the invitation', () => {
    expect(
      guessRole('song', [
        {kind: 'song', role: 'opening', text: ''},
        {kind: 'prose', role: 'message', text: 'Message, Offline, Prayer'},
      ]),
    ).toBe('invitation')
  })
  it('defaults other songs to congregational and prose to plain', () => {
    expect(guessRole('song', [{kind: 'song', role: 'opening', text: ''}])).toBe('congregational')
    expect(guessRole('prose', [])).toBe('plain')
  })
})
