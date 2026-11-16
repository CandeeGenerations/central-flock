import {describe, expect, it} from 'vitest'

import {alphabeticalIds, entryName, normalizeEntryText, repeatedFromEarlierSundays} from './prayer-sheet-entries'

describe('normalizeEntryText', () => {
  it('ignores case, spacing, dash style and trailing punctuation', () => {
    expect(normalizeEntryText('  Linda H – lung   cancer surgery. ')).toBe(
      normalizeEntryText('linda h - Lung cancer surgery'),
    )
  })
})

describe('repeatedFromEarlierSundays', () => {
  const sundays = [
    // Out of order on purpose: the helper sorts by date.
    {
      sundayDate: '2026-11-15',
      entries: [
        {id: 5, text: 'Linda H - lung cancer surgery'},
        {id: 6, text: 'New one'},
      ],
    },
    {
      sundayDate: '2026-11-01',
      entries: [
        {id: 1, text: 'Linda H – lung cancer surgery'},
        {id: 2, text: ''},
      ],
    },
    {
      sundayDate: '2026-11-08',
      entries: [
        {id: 3, text: 'linda h - lung cancer surgery.'},
        {id: 4, text: 'Tom B'},
      ],
    },
  ]

  it('flags entries already on an earlier Sunday, listing every earlier date', () => {
    const flags = repeatedFromEarlierSundays(sundays)
    expect(flags.get(1)).toBeUndefined()
    expect(flags.get(3)).toEqual({kind: 'text', dates: ['2026-11-01']})
    expect(flags.get(5)).toEqual({kind: 'text', dates: ['2026-11-01', '2026-11-08']})
  })

  it('ignores blanks and first appearances', () => {
    const flags = repeatedFromEarlierSundays(sundays)
    for (const id of [2, 4, 6]) expect(flags.has(id)).toBe(false)
  })

  it('does not flag a repeat within the same Sunday', () => {
    const flags = repeatedFromEarlierSundays([
      {
        sundayDate: '2026-11-01',
        entries: [
          {id: 1, text: 'Same'},
          {id: 2, text: 'same'},
        ],
      },
    ])
    expect(flags.size).toBe(0)
  })
})

describe('name matches', () => {
  it('takes the name before the first dash', () => {
    expect(entryName('Tony M – improving, good test results')).toBe('tony m')
    expect(entryName('Neil - witnessing opportunities')).toBe('neil')
    expect(entryName('Family of Pat Atkins on her passing')).toBe('family of pat atkins on her passing')
  })

  it('flags the same person with an updated request, text matches winning', () => {
    const flags = repeatedFromEarlierSundays([
      {sundayDate: '2026-10-18', entries: [{id: 1, text: 'Tony M – improving, good test results'}]},
      {
        sundayDate: '2026-10-25',
        entries: [
          {id: 2, text: 'tony m - back in hospital'},
          {id: 3, text: 'Ken (Tony M) – Praise!'},
        ],
      },
      {sundayDate: '2026-11-01', entries: [{id: 4, text: 'Tony M – improving, good test results'}]},
    ])
    expect(flags.get(2)).toEqual({kind: 'name', dates: ['2026-10-18']})
    expect(flags.has(3)).toBe(false)
    expect(flags.get(4)).toEqual({kind: 'text', dates: ['2026-10-18']})
  })
})

describe('alphabeticalIds', () => {
  it('sorts A–Z ignoring case, numbers naturally, blanks last', () => {
    const entries = [
      {id: 1, text: 'tom B'},
      {id: 2, text: ''},
      {id: 3, text: 'Anna 10'},
      {id: 4, text: 'anna 9'},
      {id: 5, text: 'Bob'},
    ]
    expect(alphabeticalIds(entries)).toEqual([4, 3, 5, 1, 2])
  })
})
