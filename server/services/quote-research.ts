import Anthropic from '@anthropic-ai/sdk'
import {eq} from 'drizzle-orm'

import {quotesDb, quotesSchema, quotesSqlite} from '../db-quotes/index.js'
import {db, schema} from '../db/index.js'

const PREFILTER_THRESHOLD = 300

const SYSTEM_PROMPT = `You help Pastor Tyler Candee find sermon quotes from his personal corpus.
Return exactly this XML — no other text:
<synthesis>2-4 sentences weaving the selected quotes into a framing for the topic</synthesis>
<results>
  <result id="42" relevance="high" note="one-line reason this quote fits the topic"/>
</results>
Rules:
- Include 3-10 quotes ranked most-relevant-first
- Only include quotes genuinely related to the topic
- relevance must be "high", "medium", or "low"
- Notes should describe the unique angle each quote brings
- id must be the numeric id from the corpus`

interface QuoteRow {
  id: number
  title: string
  author: string
  dateDisplay: string
  summary: string
  quoteText: string
  tags: string
}

type PublicQuote = Omit<QuoteRow, 'tags'> & {tags: string[]}

interface ResearchResult {
  searchId: number
  synthesis: string
  results: Array<{
    quoteId: number
    note: string
    relevance: string
    quote: PublicQuote
  }>
  candidateCount: number
  durationMs: number
}

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return row?.value ?? 'claude-sonnet-4-20250514'
}

const STOPWORDS = new Set(['the', 'of', 'and', 'on', 'to', 'a', 'is', 'in', 'for', 'that', 'it', 'with', 'as'])

function toFtsQuery(topic: string): string {
  const tokens = topic
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  if (tokens.length === 0) return topic
  return tokens.join(' OR ')
}

function loadAllQuotes(): QuoteRow[] {
  return quotesDb
    .select({
      id: quotesSchema.quotes.id,
      title: quotesSchema.quotes.title,
      author: quotesSchema.quotes.author,
      dateDisplay: quotesSchema.quotes.dateDisplay,
      summary: quotesSchema.quotes.summary,
      quoteText: quotesSchema.quotes.quoteText,
      tags: quotesSchema.quotes.tags,
    })
    .from(quotesSchema.quotes)
    .all() as QuoteRow[]
}

function prefilterCandidates(topic: string, limit: number): QuoteRow[] {
  const ftsQuery = toFtsQuery(topic)

  let ftsIds: number[] = []
  try {
    const ftsHits = quotesSqlite
      .prepare(
        `SELECT rowid AS id, bm25(quotes_fts) AS score FROM quotes_fts WHERE quotes_fts MATCH ? ORDER BY score LIMIT 200`,
      )
      .all(ftsQuery) as {id: number; score: number}[]
    ftsIds = ftsHits.map((h) => h.id)
  } catch {
    // FTS query failed (e.g. empty query) — fall back to all
  }

  // If FTS found fewer than limit, pad with most recent
  if (ftsIds.length < limit) {
    const recentIds = (
      quotesSqlite.prepare(`SELECT id FROM quotes ORDER BY created_at DESC LIMIT ${limit}`).all() as {id: number}[]
    ).map((r) => r.id)
    const combined = [...new Set([...ftsIds, ...recentIds])]
    ftsIds = combined.slice(0, limit)
  } else {
    ftsIds = ftsIds.slice(0, limit)
  }

  if (ftsIds.length === 0) return loadAllQuotes().slice(0, limit)

  const placeholders = ftsIds.map(() => '?').join(',')
  const rows = quotesSqlite
    .prepare(
      `SELECT id, title, author, date_display AS dateDisplay, summary, quote_text AS quoteText, tags FROM quotes WHERE id IN (${placeholders})`,
    )
    .all(...ftsIds) as QuoteRow[]

  return rows
}

function buildCorpusText(quotes: QuoteRow[]): string {
  return quotes
    .map(
      (q) =>
        `<quote id="${q.id}">\nTitle: ${q.title}\nAuthor: ${q.author}\nDate: ${q.dateDisplay}\nSummary: ${q.summary}\nText: ${q.quoteText}\nTags: ${(JSON.parse(q.tags) as string[]).join(', ')}\n</quote>`,
    )
    .join('\n\n')
}

function parseAiResponse(
  text: string,
  quotesById: Map<number, QuoteRow>,
): {synthesis: string; results: Array<{quoteId: number; note: string; relevance: string; quote: PublicQuote}>} {
  const synthesisMatch = text.match(/<synthesis>([\s\S]*?)<\/synthesis>/)
  const synthesis = synthesisMatch ? synthesisMatch[1].trim() : ''

  const resultMatches = [...text.matchAll(/<result\s+id="(\d+)"\s+relevance="(\w+)"\s+note="([^"]*)"[^/]*/g)]
  const results: Array<{quoteId: number; note: string; relevance: string; quote: PublicQuote}> = []

  for (const m of resultMatches) {
    const quoteId = parseInt(m[1])
    const relevance = m[2]
    const note = m[3]
    const quote = quotesById.get(quoteId)
    if (quote) {
      results.push({quoteId, note, relevance, quote: {...quote, tags: parseTags(quote.tags)}})
    }
  }

  return {synthesis, results}
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export async function runQuoteResearch(topic: string): Promise<ResearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')

  const start = Date.now()
  const model = getConfiguredModel()

  const totalRow = quotesSqlite.prepare(`SELECT COUNT(*) AS count FROM quotes`).get() as {count: number}
  const total = totalRow.count

  const candidates = total <= PREFILTER_THRESHOLD ? loadAllQuotes() : prefilterCandidates(topic, 100)

  const quotesById = new Map(candidates.map((q) => [q.id, q]))
  const corpusText = buildCorpusText(candidates)

  const client = new Anthropic({apiKey})

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: corpusText,
            cache_control: {type: 'ephemeral'},
          },
          {
            type: 'text',
            text: `Topic: ${topic}`,
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const {synthesis, results} = parseAiResponse(textBlock.text, quotesById)
  const durationMs = Date.now() - start

  const inserted = quotesDb
    .insert(quotesSchema.quoteSearches)
    .values({
      topic,
      synthesis,
      results: JSON.stringify(results.map((r) => ({quoteId: r.quoteId, note: r.note, relevance: r.relevance}))),
      model,
      candidateCount: candidates.length,
      durationMs,
    })
    .returning({id: quotesSchema.quoteSearches.id})
    .get()

  return {
    searchId: inserted!.id,
    synthesis,
    results,
    candidateCount: candidates.length,
    durationMs,
  }
}

export function rehydrateSearch(searchRow: {
  id: number
  topic: string
  synthesis: string
  results: string
  model: string
  createdAt: string | null
}): {
  id: number
  topic: string
  synthesis: string
  model: string
  createdAt: string | null
  results: Array<{
    quoteId: number
    note: string
    relevance: string
    quote: PublicQuote | null
  }>
} {
  const stored = JSON.parse(searchRow.results) as Array<{quoteId: number; note: string; relevance: string}>

  const ids = stored.map((r) => r.quoteId)
  let quotesById = new Map<number, QuoteRow>()

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',')
    const rows = quotesSqlite
      .prepare(
        `SELECT id, title, author, date_display AS dateDisplay, summary, quote_text AS quoteText, tags FROM quotes WHERE id IN (${placeholders})`,
      )
      .all(...ids) as QuoteRow[]
    quotesById = new Map(rows.map((q) => [q.id, q]))
  }

  return {
    id: searchRow.id,
    topic: searchRow.topic,
    synthesis: searchRow.synthesis,
    model: searchRow.model,
    createdAt: searchRow.createdAt,
    results: stored.map((r) => {
      const row = quotesById.get(r.quoteId)
      return {
        quoteId: r.quoteId,
        note: r.note,
        relevance: r.relevance,
        quote: row ? {...row, tags: parseTags(row.tags)} : null,
      }
    }),
  }
}
