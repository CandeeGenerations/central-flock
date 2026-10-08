import {describe, expect, it} from 'vitest'

import {parseAiResponse} from './hymn-suggestion.js'

type HymnMap = Parameters<typeof parseAiResponse>[1]
type HymnRow = HymnMap extends Map<number, infer R> ? R : never

const hymn = (id: number): HymnRow => ({
  id,
  book: 'burgundy',
  number: id,
  title: `Hymn ${id}`,
  firstLine: null,
  refrainLine: null,
  author: null,
  composer: null,
  tune: null,
  meter: null,
  topics: '[]',
  scriptureRefs: '[]',
  notes: null,
})
const hymns: HymnMap = new Map([1, 2, 3, 4, 5, 6].map((id) => [id, hymn(id)]))

const flowSteps = (n: number) =>
  Array.from({length: n}, (_, i) => `<step n="${i + 1}" slot="other">Step ${i + 1}</step>`).join('\n')

const reply = (flow = flowSteps(6)) => `<suggestion>
  <opening hymn-id="1"><why>Strong start.</why><snippet>Holy holy holy</snippet></opening>
  <congregational>
    <pick hymn-id="2"><why>Fits the text.</why></pick>
    <pick hymn-id="3"><why>Builds.</why></pick>
    <pick hymn-id="999"><why>Not in corpus.</why></pick>
  </congregational>
  <special><pick hymn-id="4"><why>Solo.</why></pick></special>
  <invitation>
    <primary hymn-id="5"><why>Invites.</why></primary>
    <alt hymn-id="6"><why>Backup.</why></alt>
  </invitation>
  <flow>${flow}</flow>
</suggestion>`

describe('hymn-suggestion parseAiResponse', () => {
  it('parses every section and drops ids missing from the corpus', () => {
    const {sections, droppedIds} = parseAiResponse(reply(), hymns)
    expect(sections.opening).toMatchObject({hymnId: 1, why: 'Strong start.', lyricSnippet: 'Holy holy holy'})
    expect(sections.congregational.map((p) => p.hymnId)).toEqual([2, 3])
    expect(sections.special.map((p) => p.hymnId)).toEqual([4])
    expect(sections.invitation.primary.hymnId).toBe(5)
    expect(sections.invitation.alternate?.hymnId).toBe(6)
    expect(sections.flow).toHaveLength(6)
    expect(droppedIds).toEqual([999])
  })

  it('rejects a flow without exactly 6 steps', () => {
    expect(() => parseAiResponse(reply(flowSteps(5)), hymns)).toThrow(/flow must have 6 steps/)
  })

  it('rejects a reply with no opening', () => {
    expect(() => parseAiResponse('<suggestion></suggestion>', hymns)).toThrow(/missing <opening>/)
  })
})
