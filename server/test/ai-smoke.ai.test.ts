import fs from 'fs'
import path from 'path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

import {AI_MODELS, AI_MODEL_KEYS, effortConfig} from '../lib/ai-models.js'
import {type AiResponseInfo, createMessage, onAiResponse} from '../lib/anthropic-client.js'
import {findBibleVerses} from '../services/bible-verses.js'
import {generateDevotionPassage} from '../services/devotion-generation.js'
import {parseDevotionImage} from '../services/devotion-ocr.js'
import {generateHashtags} from '../services/gwendolyn-hashtags.js'
import {runHymnSuggestion} from '../services/hymn-suggestion.js'
import {runMusicSearch} from '../services/music-search.js'
import {computeQuoteResearch} from '../services/quote-research.js'
import {generateQuoteTags} from '../services/quote-tags.js'
import {checkBlock, explainNotFound} from '../services/scripture-check.js'
import {generateSermonSocial} from '../services/sermon-social.js'
import {extractFieldsViaClaude} from '../services/youtube-extract.js'

// Live smoke test: one real call per AI feature against the models in AI_MODELS (runs against a
// DB copy — see ai-setup.ts). Asserts the request is accepted, finishes cleanly, and parses into the
// expected shape; it doesn't grade quality. AI_TEST_ALL=1 adds the expensive features.

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const OCR_IMAGE = path.join(FIXTURES, 'devotion-sheet.jpg')
const RUN_ALL = Boolean(process.env.AI_TEST_ALL)
const RECORD = Boolean(process.env.AI_TEST_RECORD)

// $/MTok (input, output) — only for the cost estimate printed at the end.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}

const all: AiResponseInfo[] = []
let current: AiResponseInfo[] = []

beforeAll(() => {
  onAiResponse((info) => {
    all.push(info)
    current.push(info)
    if (RECORD) {
      const dir = path.join(FIXTURES, 'responses')
      fs.mkdirSync(dir, {recursive: true})
      fs.writeFileSync(path.join(dir, `${info.label.replace(/[^a-z0-9-]/gi, '_')}.txt`), info.text)
    }
  })
})

afterAll(() => {
  let total = 0
  const rows = all.map((r) => {
    const price = PRICES[r.model]
    const input =
      r.usage.input_tokens + (r.usage.cache_creation_input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0)
    const cost = price ? (input * price[0] + r.usage.output_tokens * price[1]) / 1_000_000 : 0
    total += cost
    return {
      label: r.label,
      model: r.model,
      stop: r.stopReason,
      in: input,
      out: r.usage.output_tokens,
      'est $': price ? cost.toFixed(4) : '? (add to PRICES)',
    }
  })
  console.table(rows)
  console.log(`Estimated total: $${total.toFixed(4)}`)
})

// Runs fn, then checks every Claude response it produced ended cleanly.
async function tracked<T>(fn: () => Promise<T>): Promise<T> {
  current = []
  const result = await fn()
  expect(current.length, 'expected at least one Claude call').toBeGreaterThan(0)
  for (const r of current) {
    if (r.stopReason === 'max_tokens') {
      throw new Error(
        `${r.label} (${r.model}) hit max_tokens — thinking may be eating the budget; raise max_tokens or lower effort`,
      )
    }
    if (r.stopReason === 'refusal') throw new Error(`${r.label} (${r.model}) was refused by safety classifiers`)
    expect(r.stopReason, `${r.label} stop_reason`).toBe('end_turn')
  }
  return result
}

describe('model pings', () => {
  for (const key of AI_MODEL_KEYS) {
    const model = AI_MODELS[key]
    it(`${key} (${model}) accepts our standard request shape`, async () => {
      const message = await tracked(() =>
        createMessage(`ping:${key}`, {
          model,
          max_tokens: 1024,
          ...effortConfig(model, 'low'),
          messages: [{role: 'user', content: 'Reply with the word OK.'}],
        }),
      )
      expect(message.content.some((b) => b.type === 'text' && b.text.trim().length > 0)).toBe(true)
    })
  }
})

describe('features', () => {
  it('quote tags (haiku)', async () => {
    const result = await tracked(() =>
      generateQuoteTags('Prayer is not preparation for the work; it is the work. — Oswald Chambers'),
    )
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.tags.length).toBeGreaterThan(0)
  })

  it('bible verses from a transcript', async () => {
    const transcript = [
      '[0:05] Good morning, turn with me to John chapter 3.',
      '[0:12] Verse 16 says for God so loved the world that he gave his only begotten Son.',
      '[1:40] And Paul writes in Romans 8:28 that all things work together for good.',
    ].join('\n')
    const result = await tracked(() => findBibleVerses(transcript))
    expect(result).toMatch(/John\s+3/)
    expect(result).toMatch(/Romans\s+8/)
  })

  it('devotion passage generation', async () => {
    const [passage] = await tracked(() => generateDevotionPassage(1, undefined, 'patience'))
    expect(passage.title.length).toBeGreaterThan(0)
    expect(passage.bibleReference).toMatch(/\d+:\d+/)
    expect(passage.talkingPoints.length).toBeGreaterThan(0)
  })

  it.skipIf(!fs.existsSync(OCR_IMAGE))('devotion sheet OCR (vision)', async () => {
    const image = fs.readFileSync(OCR_IMAGE).toString('base64')
    const parsed = await tracked(() => parseDevotionImage(image, 'image/jpeg'))
    expect(parsed.month).toBeTruthy()
    expect(parsed.year).toBeGreaterThan(2000)
    expect(parsed.devotions.length).toBeGreaterThan(0)
  })

  it('gwendolyn hashtags', async () => {
    const result = await tracked(() =>
      generateHashtags('Join us Sunday as we look at how God meets us in seasons of waiting.'),
    )
    expect(result).toContain('#')
  })

  it('scripture check AI fallback', async () => {
    // NIV wording under the wrong reference: no AKJV match, so the check falls back to Claude.
    const block = {text: 'I can do all this through him who gives me strength.', reference: 'Philippians 4:19'}
    const check = checkBlock(block)
    expect(check.findings.some((f) => f.kind === 'not_found')).toBe(true)
    // explainNotFound swallows API errors and returns the input check, so aiChecked proves the call worked.
    const result = await tracked(() => explainNotFound(block, check))
    expect(result.aiChecked).toBe(true)
  })

  it('sermon social', async () => {
    const transcript = fs.readFileSync(path.join(FIXTURES, 'sermon-excerpt.txt'), 'utf8')
    const result = await tracked(() => generateSermonSocial(transcript))
    expect(result.bigIdea).toBeTruthy()
    expect(result.scriptures.length + result.reflections.length).toBeGreaterThan(0)
  })

  it('youtube field extraction', async () => {
    const result = await tracked(() =>
      extractFieldsViaClaude({
        title: 'Special Music - "Amazing Grace" - John & Jane Smith Duet - May 3, 2026',
        description: null,
        uploadDate: null,
      }),
    )
    expect(result.songTitle ?? result.performers?.length).toBeTruthy()
  })
})

describe.runIf(RUN_ALL)('expensive features (AI_TEST_ALL=1)', () => {
  it('hymn suggestion', async () => {
    const result = await tracked(() =>
      runHymnSuggestion({
        title: 'Waiting on the Lord',
        scriptureText: 'Isaiah 40:31',
        theme: 'Strength through patient trust',
        audience: 'Sunday morning congregation',
      }),
    )
    expect(result.sections.flow).toHaveLength(6)
  })

  it('quote research', async () => {
    const result = await tracked(() => computeQuoteResearch('prayer'))
    expect(result.synthesis.length).toBeGreaterThan(0)
  })

  it('music search (web search)', async () => {
    const result = await tracked(() => runMusicSearch('the blood of Jesus'))
    expect(result.results.length).toBeGreaterThan(0)
  })
})
