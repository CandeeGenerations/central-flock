import {describe, expect, it} from 'vitest'

import {parseAiResponse} from './music-search.js'

type HymnMap = Parameters<typeof parseAiResponse>[1]
type HymnRow = HymnMap extends Map<number, infer R> ? R : never

const amazingGrace: HymnRow = {
  id: 7,
  book: 'burgundy',
  number: 108,
  title: 'Amazing Grace',
  firstLine: 'Amazing grace! how sweet the sound',
  refrainLine: null,
  author: 'John Newton',
  topics: '[]',
  scriptureRefs: '[]',
  notes: null,
}

describe('music-search parseAiResponse', () => {
  it('parses results, verifies lyrics against the first line, and drops unknown ids', () => {
    const text = `<result id="7" relevance="high">
  <lyrics>Amazing grace, how sweet the sound
That saved a wretch like me</lyrics>
  <note>Grace theme.</note>
  <source>https://example.com/amazing-grace</source>
</result>
<result id="42" relevance="low"><lyrics>Unknown</lyrics></result>`
    const {results, droppedIds} = parseAiResponse(text, new Map([[7, amazingGrace]]))
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      title: 'Amazing Grace',
      relevance: 'high',
      verified: true,
      note: 'Grace theme.',
      sourceUrl: 'https://example.com/amazing-grace',
    })
    expect(droppedIds).toEqual([42])
  })

  it('drops a result without lyrics', () => {
    const {results, droppedIds} = parseAiResponse(
      '<result id="7" relevance="high"><note>No lyrics</note></result>',
      new Map([[7, amazingGrace]]),
    )
    expect(results).toEqual([])
    expect(droppedIds).toEqual([7])
  })
})
