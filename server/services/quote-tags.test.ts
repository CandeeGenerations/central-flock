import {describe, expect, it} from 'vitest'

import {parseQuoteTagsResponse} from './quote-tags.js'

describe('parseQuoteTagsResponse', () => {
  it('parses fenced JSON and splits multi-word hashtags', () => {
    const raw = '```json\n{"summary": "Hope endures.", "hashtags": "#Hope #Christian Living #Faith"}\n```'
    expect(parseQuoteTagsResponse(raw)).toEqual({summary: 'Hope endures.', tags: ['Hope', 'Christian Living', 'Faith']})
  })

  it('returns null for non-JSON', () => {
    expect(parseQuoteTagsResponse('Sure! Here are some tags: #Hope')).toBeNull()
  })
})
