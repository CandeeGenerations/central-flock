import {describe, expect, it} from 'vitest'

import {parseResponse} from './devotion-generation.js'

describe('devotion-generation parseResponse', () => {
  it('parses the three tags and normalizes the reference', () => {
    const passage = parseResponse(
      '<title>Held by Grace</title>\n<verse>Eph 2:8-9</verse>\n<points>- Grace is a gift\n- Not of works</points>',
    )
    expect(passage).toEqual({
      title: 'Held by Grace',
      bibleReference: 'Ephesians 2:8-9',
      talkingPoints: '- Grace is a gift\n- Not of works',
      notes: null,
    })
  })

  it('tolerates code fences and renamed tags', () => {
    const passage = parseResponse(
      '```xml\n<title>Peace</title><reference>John 14:27</reference><talking_points>Point</talking_points>\n```',
    )
    expect(passage).toMatchObject({title: 'Peace', bibleReference: 'John 14:27', talkingPoints: 'Point'})
  })

  it('returns null when a tag is missing', () => {
    expect(parseResponse('<title>Only a title</title>')).toBeNull()
  })
})
