import Anthropic from '@anthropic-ai/sdk'
import {eq} from 'drizzle-orm'

import {db, schema, sqlite} from '../db/index.js'
import {resolveModel} from '../lib/ai-models.js'

export type HymnBook = 'burgundy' | 'silver'

// Source-agnostic contract (ADR 0010). `source: 'web'` now; 'corpus' = future PDF path.
export interface MusicResult {
  book: HymnBook
  number: number
  title: string
  author: string | null
  relevantLyrics: string
  note: string
  relevance: 'high' | 'medium' | 'low'
  source: 'web' | 'corpus'
  verified: boolean
  sourceUrl?: string
}

interface HymnRow {
  id: number
  book: HymnBook
  number: number
  title: string
  firstLine: string | null
  refrainLine: string | null
  author: string | null
  topics: string
  scriptureRefs: string
  notes: string | null
}

const SYSTEM_PROMPT = `You help Pastor Tyler Candee find singable hymn lyrics for a sermon topic, drawn from his two hymnals: "burgundy" (the main hymnal) and "silver" (a supplemental gospel collection).

You are given a corpus of hymn METADATA (id, book, number, title, first line, refrain, author, topics, scripture). The corpus does NOT contain full lyrics.

Steps:
1. From the corpus, choose 3-8 hymns whose topics/scripture/title genuinely fit the user's topic. Fewer is fine — never pad.
2. For each chosen hymn, use web search to find its actual lyrics. Key the search on the title + author + first line so you fetch the RIGHT song.
3. Return only the verse(s) and/or chorus(es) that fit the topic — whole stanzas only, never partial lines, never the whole hymn.

Return exactly this XML — no other text, no prose around it:

<results>
  <result id="N" relevance="high">
    <note>one sentence: why this hymn fits the topic</note>
    <lyrics>the relevant verse(s)/chorus(es), whole stanzas only, newlines preserved</lyrics>
    <source>the URL you took the lyrics from</source>
  </result>
  <!-- 3 to 8 result elements, most-relevant first -->
</results>

Rules:
- Every id MUST be a numeric id from the provided corpus. Do not invent hymns.
- relevance must be "high", "medium", or "low".
- Do NOT invent or paraphrase lyrics — only use text you found via web search. If you cannot find a hymn's lyrics, omit that result.
- Always include a <source> URL for each result.`

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return resolveModel(row?.value)
}

function loadHymns(): HymnRow[] {
  return sqlite
    .prepare(
      `SELECT id, book, number, title, first_line AS firstLine, refrain_line AS refrainLine,
              author, topics, scripture_refs AS scriptureRefs, notes
       FROM hymns ORDER BY book, number`,
    )
    .all() as HymnRow[]
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function buildCorpusText(hymns: HymnRow[]): string {
  return hymns
    .map((h) => {
      const topics = parseJsonArray(h.topics).join(', ') || '(none)'
      const scripture = parseJsonArray(h.scriptureRefs).join(', ') || '(none)'
      return [
        `<hymn id="${h.id}" book="${h.book}" number="${h.number}">`,
        `Title: ${h.title}`,
        `FirstLine: ${h.firstLine || '(none)'}`,
        `Refrain: ${h.refrainLine || '(none)'}`,
        `Author: ${h.author || '(unknown)'}`,
        `Topics: ${topics}`,
        `Scripture: ${scripture}`,
        `</hymn>`,
      ].join('\n')
    })
    .join('\n\n')
}

function extractTag(innerText: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)
  const m = innerText.match(re)
  return m ? m[1].trim() : ''
}

// Normalize a line for verification: lowercase, strip punctuation + collapse whitespace.
function normalizeLine(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstNonEmptyLine(s: string): string {
  return (
    s
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  )
}

// verified = fetched lyrics' first line matches the stored first_line (either direction startsWith).
function isVerified(lyrics: string, storedFirstLine: string | null): boolean {
  if (!storedFirstLine) return false
  const fetched = normalizeLine(firstNonEmptyLine(lyrics))
  const stored = normalizeLine(storedFirstLine)
  if (!fetched || !stored) return false
  return fetched.startsWith(stored) || stored.startsWith(fetched)
}

function parseAiResponse(
  text: string,
  hymnsById: Map<number, HymnRow>,
): {results: MusicResult[]; droppedIds: number[]} {
  const results: MusicResult[] = []
  const droppedIds: number[] = []

  for (const m of text.matchAll(/<result\s+id="(\d+)"\s+relevance="(\w+)">([\s\S]*?)<\/result>/g)) {
    const id = parseInt(m[1])
    const relevanceRaw = m[2]
    const inner = m[3]
    const h = hymnsById.get(id)
    if (!h) {
      droppedIds.push(id)
      continue
    }
    const relevance = (
      ['high', 'medium', 'low'].includes(relevanceRaw) ? relevanceRaw : 'low'
    ) as MusicResult['relevance']
    const lyrics = extractTag(inner, 'lyrics')
    if (!lyrics) {
      droppedIds.push(id)
      continue
    }
    const sourceUrl = extractTag(inner, 'source') || undefined
    results.push({
      book: h.book,
      number: h.number,
      title: h.title,
      author: h.author,
      relevantLyrics: lyrics,
      note: extractTag(inner, 'note'),
      relevance,
      source: 'web',
      verified: isVerified(lyrics, h.firstLine),
      sourceUrl,
    })
  }

  return {results, droppedIds}
}

// Concatenate all text blocks from a (possibly multi-turn, tool-using) response.
function collectText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

export async function runMusicSearch(topic: string): Promise<{model: string; results: MusicResult[]}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')

  const model = getConfiguredModel()
  const hymns = loadHymns()
  if (hymns.length === 0) {
    throw new Error(
      'No hymns found in central-flock.db. Run `npx tsx scripts/extract-hymns.ts` then `npx tsx scripts/load-hymns.ts` to seed.',
    )
  }

  const hymnsById = new Map(hymns.map((h) => [h.id, h]))
  const corpusText = buildCorpusText(hymns)

  const client = new Anthropic({apiKey})

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [{type: 'web_search_20250305', name: 'web_search', max_uses: 8}],
    messages: [
      {
        role: 'user',
        content: [
          {type: 'text', text: corpusText, cache_control: {type: 'ephemeral'}},
          {type: 'text', text: `Topic: ${topic}`},
        ],
      },
    ],
  })

  const text = collectText(response.content)
  if (!text) throw new Error('No text response from Claude')

  const {results, droppedIds} = parseAiResponse(text, hymnsById)
  if (droppedIds.length > 0) {
    console.warn(`music-search: dropped ${droppedIds.length} unknown/empty result refs: ${droppedIds.join(', ')}`)
  }

  return {model, results}
}
