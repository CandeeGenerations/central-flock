import Anthropic from '@anthropic-ai/sdk'
import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {effortConfig, resolveModel} from '../lib/ai-models.js'

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return resolveModel(row?.value)
}

const QUOTE_TARGET = '8-12'
const REFLECTION_TARGET = '3-5'

const SYSTEM_PROMPT = `You help Pastor Tyler Candee turn a sermon transcript into social media material for Central Baptist Church.

The transcript is raw speech-to-text of a preached message. It has no paragraph breaks, contains
disfluencies ("uh", stutters, false starts), and sometimes contains outright transcription errors.

SCOPE — generate ONLY from the preached message.
- Ignore the announcements section (upcoming events, dates, activities) that usually opens the file.
- Ignore prayers — anything addressed to God rather than to the congregation.

SOCIAL QUOTES — the preacher's own words. Return ${QUOTE_TARGET} of them.
For each, return three forms of the SAME sentence:
- <verbatim>: the span copied EXACTLY from the transcript, character for character. Do not fix
  anything. This is the receipt and it must be findable in the transcript by exact string search.
- <cleaned>: the same span with disfluencies deleted only — "uh", "um", stutters, false starts,
  doubled words. You may NOT add, substitute, or reorder any word. This is the default form.
- <polished>: the same line, allowed to repair grammar and supply elided words so it stands alone
  out of context. Still his words and his meaning — you may repair a sentence, never write one.
Rules:
- SKIP any span damaged by transcription error. A garbled span is not quotable, and <cleaned> may
  not substitute words to repair it. Losing a quote is better than guessing what he said.
- NEVER correct the preacher. If he paraphrases or misquotes scripture, reproduce it as he said it.
- Prefer lines that stand on their own: images, contrasts, one-liners, the statements he repeats.

REFLECTIONS — short posts. Return ${REFLECTION_TARGET} of them, 100-200 words each.
These are NOT quotes. Write engagingly in your own words, drawing on one portion of the sermon, to
give people something to sit with during the week.
Hard limit (the Scripture Floor): you may reference ONLY passages this sermon actually cited, and
you must render any scripture wording in the Authorized King James Version (AKJV). Never introduce
a passage, doctrine, or application the sermon did not preach.

BIG IDEA — the single statement the preacher wanted people to leave with. Preachers often say it
outright ("I want you to leave with one statement..."). Return it in his words if he said it plainly.
Return an empty element if the sermon has no clear one.

SCRIPTURES — every passage the preacher referenced, in order of first mention.

RANK — order results most-useful-first and tag each "high", "medium", or "low", with a one-line
reason. Rank on how well the item works as standalone social content.

SENSITIVE — flag any result that touches politically contested material (sexuality, gender,
abortion, politics, other churches or Bible translations) with sensitive="true" and a short reason.
Do NOT down-rank, soften, or omit these — the pastor decides what to post. Flagged results are
EXTRA: the ${QUOTE_TARGET} quotes and ${REFLECTION_TARGET} reflections above count UNFLAGGED results
only, so generate flagged ones in addition to hitting those targets.

Return exactly this XML and nothing else:
<bigIdea>the one statement, or empty</bigIdea>
<scriptures>
  <scripture reference="Psalm 19:7" book="Psalm" chapter="19"/>
</scriptures>
<quotes>
  <quote tier="high" sensitive="false" reason="">
    <verbatim>exact transcript span</verbatim>
    <cleaned>disfluencies removed</cleaned>
    <polished>grammar repaired</polished>
    <note>one line on why this works</note>
  </quote>
</quotes>
<reflections>
  <reflection tier="high" sensitive="false" reason="">
    <body>100-200 words</body>
    <note>one line on the angle</note>
  </reflection>
</reflections>`

export interface ParsedQuote {
  verbatimText: string
  cleanedText: string
  polishedText: string
  startOffset: number | null
  endOffset: number | null
  rankTier: 'high' | 'medium' | 'low'
  rankOrder: number
  rankNote: string | null
  sensitive: boolean
  sensitiveReason: string | null
}

export interface ParsedReflection {
  body: string
  rankTier: 'high' | 'medium' | 'low'
  rankOrder: number
  rankNote: string | null
  sensitive: boolean
  sensitiveReason: string | null
}

export interface ParsedScripture {
  reference: string
  book: string
  chapter: number | null
  sortOrder: number
}

export interface SermonGeneration {
  bigIdea: string | null
  scriptures: ParsedScripture[]
  quotes: ParsedQuote[]
  reflections: ParsedReflection[]
  model: string
  durationMs: number
  skippedQuotes: number
}

// Raw ASR arrives with no space after sentence punctuation ("amen.And you may be seated"). Fix that
// once on ingest and store the result, so Social Quote offsets index into readable text.
export function normalizeTranscript(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/([.!?])(["']?)([A-Z])/g, '$1$2 $3')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// Straight vs curly apostrophes, quotes and dashes: models routinely normalise typography while
// copying a span, and a mismatch there silently drops a real quote. Every variant maps to a class
// matching all of them.
const TYPOGRAPHY_CLASS: Record<string, string> = {
  "'": "['\u2018\u2019]",
  '\u2018': "['\u2018\u2019]",
  '\u2019': "['\u2018\u2019]",
  '"': '["\u201C\u201D]',
  '\u201C': '["\u201C\u201D]',
  '\u201D': '["\u201C\u201D]',
  '-': '[-\u2013\u2014]',
  '\u2013': '[-\u2013\u2014]',
  '\u2014': '[-\u2013\u2014]',
  '\u2026': '(?:\\.\\.\\.|\u2026)',
}

function toPatternChar(ch: string): string {
  const cls = TYPOGRAPHY_CLASS[ch]
  if (cls) return cls
  if (/\s/.test(ch)) return '\\s+'
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Find the model's verbatim span in the transcript. Exact match first; then a whitespace- and
// typography-tolerant match. Returns null when the span cannot be located at all — that quote is
// dropped rather than shipped with an unverifiable receipt. See docs/adr/0019.
export function locateSpan(transcript: string, verbatim: string): {start: number; end: number} | null {
  const trimmed = verbatim.trim()
  if (!trimmed) return null

  const exact = transcript.indexOf(trimmed)
  if (exact !== -1) return {start: exact, end: exact + trimmed.length}

  const pattern = [...trimmed]
    .map(toPatternChar)
    .join('')
    .replace(/(?:\\s\+)+/g, '\\s+')

  const match = new RegExp(pattern).exec(transcript)
  if (!match) return null
  return {start: match.index, end: match.index + match[0].length}
}

function childText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].trim() : ''
}

function attr(tagOpen: string, name: string): string {
  const m = tagOpen.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : ''
}

function toTier(raw: string): 'high' | 'medium' | 'low' {
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'medium'
}

export function parseGeneration(text: string, transcript: string): Omit<SermonGeneration, 'model' | 'durationMs'> {
  const bigIdeaRaw = childText(text, 'bigIdea')
  const bigIdea = bigIdeaRaw.length > 0 ? bigIdeaRaw : null

  const scriptures: ParsedScripture[] = []
  const seenRefs = new Set<string>()
  for (const m of text.matchAll(/<scripture\s+([^/>]*)\/>/g)) {
    const reference = attr(m[1], 'reference').trim()
    if (!reference || seenRefs.has(reference)) continue
    seenRefs.add(reference)
    const chapterRaw = parseInt(attr(m[1], 'chapter'), 10)
    scriptures.push({
      reference,
      book: attr(m[1], 'book').trim() || reference,
      chapter: Number.isFinite(chapterRaw) ? chapterRaw : null,
      sortOrder: scriptures.length,
    })
  }

  const quotes: ParsedQuote[] = []
  let skippedQuotes = 0
  for (const m of text.matchAll(/<quote\s+([^>]*)>([\s\S]*?)<\/quote>/g)) {
    const verbatimText = childText(m[2], 'verbatim')
    const cleanedText = childText(m[2], 'cleaned') || verbatimText
    if (!verbatimText || !cleanedText) {
      skippedQuotes++
      continue
    }
    const span = locateSpan(transcript, verbatimText)
    if (!span) {
      // Unverifiable receipt — the whole promise of a Social Quote is that he said it.
      skippedQuotes++
      continue
    }
    const sensitive = attr(m[1], 'sensitive') === 'true'
    const reason = attr(m[1], 'reason').trim()
    quotes.push({
      verbatimText,
      cleanedText,
      polishedText: childText(m[2], 'polished') || cleanedText,
      startOffset: span.start,
      endOffset: span.end,
      rankTier: toTier(attr(m[1], 'tier')),
      rankOrder: quotes.length,
      rankNote: childText(m[2], 'note') || null,
      sensitive,
      sensitiveReason: sensitive && reason ? reason : null,
    })
  }

  const reflections: ParsedReflection[] = []
  for (const m of text.matchAll(/<reflection\s+([^>]*)>([\s\S]*?)<\/reflection>/g)) {
    const body = childText(m[2], 'body')
    if (!body) continue
    const sensitive = attr(m[1], 'sensitive') === 'true'
    const reason = attr(m[1], 'reason').trim()
    reflections.push({
      body,
      rankTier: toTier(attr(m[1], 'tier')),
      rankOrder: reflections.length,
      rankNote: childText(m[2], 'note') || null,
      sensitive,
      sensitiveReason: sensitive && reason ? reason : null,
    })
  }

  return {bigIdea, scriptures, quotes, reflections, skippedQuotes}
}

export async function generateSermonSocial(transcript: string): Promise<SermonGeneration> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')

  const start = Date.now()
  const model = getConfiguredModel()
  const client = new Anthropic({apiKey})

  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    ...effortConfig(model, 'medium'),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {type: 'text', text: transcript, cache_control: {type: 'ephemeral'}},
          {type: 'text', text: 'Generate the social content for this sermon.'},
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const parsed = parseGeneration(textBlock.text, transcript)

  return {...parsed, model, durationMs: Date.now() - start}
}

// The few sentences either side of a Social Quote. Derived from offsets at render time, never
// stored — see CONTEXT.md (Quote Context).
export function buildQuoteContext(
  transcript: string,
  startOffset: number,
  endOffset: number,
  sentences = 3,
): {before: string; quote: string; after: string} {
  const boundary = /[.!?]["']?\s/g

  const starts: number[] = [0]
  boundary.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = boundary.exec(transcript)) !== null) {
    if (m.index >= startOffset) break
    starts.push(m.index + m[0].length)
  }
  const beforeStart = starts[Math.max(0, starts.length - sentences - 1)] ?? 0

  let afterEnd = transcript.length
  boundary.lastIndex = endOffset
  for (let i = 0; i < sentences; i++) {
    const next = boundary.exec(transcript)
    if (!next) {
      afterEnd = transcript.length
      break
    }
    afterEnd = next.index + next[0].length
  }

  return {
    before: transcript.slice(beforeStart, startOffset).trim(),
    quote: transcript.slice(startOffset, endOffset).trim(),
    after: transcript.slice(endOffset, afterEnd).trim(),
  }
}
