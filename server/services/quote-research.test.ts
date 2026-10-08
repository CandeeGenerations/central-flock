import {describe, expect, it} from 'vitest'

import {parseAiResponse} from './quote-research.js'

type QuoteMap = Parameters<typeof parseAiResponse>[1]
type QuoteRow = QuoteMap extends Map<number, infer R> ? R : never

const quote: QuoteRow = {
  id: 3,
  title: 'On Prayer',
  author: 'E. M. Bounds',
  dateDisplay: '1907',
  summary: 'Prayer is essential.',
  quoteText: 'Prayer is not preparation for the work; it is the work.',
  tags: '["Prayer","Ministry"]',
} as QuoteRow

describe('quote-research parseAiResponse', () => {
  it('parses the synthesis and self-closing results, skipping unknown ids', () => {
    const text = `<synthesis>Prayer comes first.</synthesis>
<result id="3" relevance="high" note="Direct hit." />
<result id="99" relevance="low" note="Missing." />`
    const {synthesis, results} = parseAiResponse(text, new Map([[3, quote]]))
    expect(synthesis).toBe('Prayer comes first.')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({quoteId: 3, relevance: 'high', note: 'Direct hit.'})
    expect(results[0].quote.tags).toEqual(['Prayer', 'Ministry'])
  })
})
