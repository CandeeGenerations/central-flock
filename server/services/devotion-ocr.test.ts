import {describe, expect, it} from 'vitest'

import {parseOcrResponse} from './devotion-ocr.js'

const ROW = {
  date: '2026-04-01',
  dayOfWeek: 'WED',
  number: 2197,
  devotionType: 'original',
  subcode: null,
  guestSpeaker: null,
  guestNumber: null,
  referencedDevotions: [],
  bibleReference: 'Rom 1:16',
  songName: 'TETELESTAI',
}

describe('devotion-ocr parseOcrResponse', () => {
  it('parses bare JSON and expands abbreviated books', () => {
    const parsed = parseOcrResponse(JSON.stringify({month: 'April', year: 2026, devotions: [ROW]}))
    expect(parsed.month).toBe('April')
    expect(parsed.devotions[0].bibleReference).toBe('Romans 1:16')
  })

  it('unwraps a fenced JSON block with surrounding prose', () => {
    const text = `Here you go:\n\`\`\`json\n${JSON.stringify({month: 'April', year: 2026, devotions: [ROW]})}\n\`\`\``
    expect(parseOcrResponse(text).devotions).toHaveLength(1)
  })

  it('throws on non-JSON', () => {
    expect(() => parseOcrResponse('I could not read the sheet.')).toThrow()
  })
})
