import Anthropic from '@anthropic-ai/sdk'
import {eq} from 'drizzle-orm'

import {db, schema, sqlite} from '../db/index.js'
import {resolveModel} from '../lib/ai-models.js'

export type HymnBook = 'burgundy' | 'silver'
export type HymnalFilter = 'burgundy' | 'silver' | 'both'

export interface HymnSuggestionInput {
  title: string
  scriptureText: string
  theme: string
  audience: string
  hymnalFilter?: HymnalFilter
}

export interface HymnPick {
  hymnId: number
  book: HymnBook
  number: number
  title: string
  why: string
  lyricSnippet?: string
}

export interface HymnFlowStep {
  step: number
  slot: 'opening' | 'congregational' | 'special' | 'invitation' | 'other'
  hymnId?: number
  label: string
}

export interface HymnSuggestionSections {
  opening: HymnPick
  congregational: HymnPick[]
  alternate?: HymnPick
  special: HymnPick[]
  invitation: {primary: HymnPick; alternate?: HymnPick}
  flow: HymnFlowStep[]
}

export interface HymnSuggestionResult {
  searchId: number
  sections: HymnSuggestionSections
  model: string
  candidateCount: number
  durationMs: number
}

interface HymnRow {
  id: number
  book: HymnBook
  number: number
  title: string
  firstLine: string | null
  refrainLine: string | null
  author: string | null
  composer: string | null
  tune: string | null
  meter: string | null
  topics: string
  scriptureRefs: string
  notes: string | null
}

const SYSTEM_PROMPT = `You help Pastor Tyler Candee plan Sunday song services from his two hymnals:
"burgundy" (the main hymnal) and "silver" (a supplemental gospel collection).

Return exactly this XML — no other text, no prose around it:

<suggestion>
  <opening hymn-id="N">
    <why>1-2 sentences on why this opens the service well.</why>
    <snippet>optional, max 9 words, a lyric fragment to jog memory</snippet>
  </opening>

  <congregational>
    <pick hymn-id="N">
      <why>...</why>
      <snippet>...</snippet>
    </pick>
    <!-- 2 or 3 pick elements -->
  </congregational>

  <alternate hymn-id="N">  <!-- OPTIONAL; omit the entire element if none -->
    <why>...</why>
  </alternate>

  <special>
    <pick hymn-id="N">
      <why>...</why>
      <snippet>...</snippet>
    </pick>
    <!-- 1 to 3 pick elements -->
  </special>

  <invitation>
    <primary hymn-id="N">
      <why>...</why>
    </primary>
    <alt hymn-id="N">  <!-- OPTIONAL -->
      <why>...</why>
    </alt>
  </invitation>

  <flow>
    <step n="1" slot="opening"        hymn-id="N">Hymn title here</step>
    <step n="2" slot="other"                       >Scripture reading and prayer</step>
    <step n="3" slot="congregational" hymn-id="N">Hymn title here</step>
    <step n="4" slot="special"        hymn-id="N">Hymn title here</step>
    <step n="5" slot="other"                       >Sermon</step>
    <step n="6" slot="invitation"     hymn-id="N">Hymn title here</step>
    <!-- Exactly 6 steps. hymn-id attribute omitted for non-musical steps. -->
  </flow>
</suggestion>

Rules:
- Every hymn-id MUST be a numeric id from the provided corpus. Do not invent hymns.
- If the user's hymnalFilter is "burgundy", only pick hymns with book="burgundy". Same for "silver". "both" permits either.
- The <why> tag must speak to the sermon title, text, theme, and audience the user provided.
- <snippet> must be under 10 words — just enough to jog memory — and MUST come from the hymn's FirstLine or Refrain in the corpus. Never invent lyrics.
- Opening hymns should be upbeat and celebratory. Invitation hymns should match the appeal (conviction, surrender, commitment).
- Prefer hymns whose topics or Scripture overlap the sermon's theme or text.
- Use <alternate> sparingly — only when there is a meaningfully different direction worth offering.`

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return resolveModel(row?.value)
}

function loadHymns(filter: HymnalFilter): HymnRow[] {
  const query =
    filter === 'both'
      ? `SELECT id, book, number, title, first_line AS firstLine, refrain_line AS refrainLine,
                author, composer, tune, meter, topics, scripture_refs AS scriptureRefs, notes
         FROM hymns ORDER BY book, number`
      : `SELECT id, book, number, title, first_line AS firstLine, refrain_line AS refrainLine,
                author, composer, tune, meter, topics, scripture_refs AS scriptureRefs, notes
         FROM hymns WHERE book = ? ORDER BY book, number`
  const stmt = sqlite.prepare(query)
  return (filter === 'both' ? stmt.all() : stmt.all(filter)) as HymnRow[]
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
        `Composer: ${h.composer || '(unknown)'}`,
        `Tune: ${h.tune || '(none)'}`,
        `Meter: ${h.meter || '(none)'}`,
        `Topics: ${topics}`,
        `Scripture: ${scripture}`,
        `Notes: ${h.notes || '(none)'}`,
        `</hymn>`,
      ].join('\n')
    })
    .join('\n\n')
}

function buildSermonInputsText(input: HymnSuggestionInput): string {
  const filter = input.hymnalFilter ?? 'both'
  return [
    `Sermon Title: ${input.title}`,
    `Text: ${input.scriptureText}`,
    `Theme: ${input.theme}`,
    `Audience: ${input.audience}`,
    `hymnalFilter: ${filter}`,
  ].join('\n')
}

function sliceBetween(text: string, openTag: string, closeTag: string): string | null {
  const openIdx = text.indexOf(openTag)
  if (openIdx === -1) return null
  const afterOpen = text.indexOf('>', openIdx)
  if (afterOpen === -1) return null
  const closeIdx = text.indexOf(closeTag, afterOpen)
  if (closeIdx === -1) return null
  return text.slice(afterOpen + 1, closeIdx)
}

function extractTag(innerText: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)
  const m = innerText.match(re)
  return m ? m[1].trim() : ''
}

function extractSnippet(innerText: string): string | undefined {
  const v = extractTag(innerText, 'snippet')
  return v ? v : undefined
}

function buildPick(
  hymnId: number,
  why: string,
  snippet: string | undefined,
  hymnsById: Map<number, HymnRow>,
): HymnPick | null {
  const h = hymnsById.get(hymnId)
  if (!h) return null
  return {
    hymnId: h.id,
    book: h.book,
    number: h.number,
    title: h.title,
    why,
    lyricSnippet: snippet,
  }
}

function parseAiResponse(
  text: string,
  hymnsById: Map<number, HymnRow>,
): {sections: HymnSuggestionSections; droppedIds: number[]} {
  const droppedIds: number[] = []

  // <opening hymn-id="N"> ... </opening>
  const openingMatch = text.match(/<opening\s+hymn-id="(\d+)">([\s\S]*?)<\/opening>/)
  if (!openingMatch) throw new Error('AI response malformed: missing <opening>')
  const openingId = parseInt(openingMatch[1])
  const opening = buildPick(openingId, extractTag(openingMatch[2], 'why'), extractSnippet(openingMatch[2]), hymnsById)
  if (!opening) throw new Error(`AI response malformed: opening hymn-id=${openingId} not in corpus`)

  // <congregational> ... </congregational>  (contains <pick ...>)
  const congregationalInner = sliceBetween(text, '<congregational>', '</congregational>') ?? ''
  const congregational: HymnPick[] = []
  for (const m of congregationalInner.matchAll(/<pick\s+hymn-id="(\d+)">([\s\S]*?)<\/pick>/g)) {
    const id = parseInt(m[1])
    const pick = buildPick(id, extractTag(m[2], 'why'), extractSnippet(m[2]), hymnsById)
    if (pick) congregational.push(pick)
    else droppedIds.push(id)
  }
  if (congregational.length < 2) throw new Error('AI response malformed: congregational needs 2-3 picks')

  // <alternate hymn-id="N"> ... </alternate>  (optional, single pick)
  let alternate: HymnPick | undefined
  const altMatch = text.match(/<alternate\s+hymn-id="(\d+)">([\s\S]*?)<\/alternate>/)
  if (altMatch) {
    const id = parseInt(altMatch[1])
    const pick = buildPick(id, extractTag(altMatch[2], 'why'), extractSnippet(altMatch[2]), hymnsById)
    if (pick) alternate = pick
    else droppedIds.push(id)
  }

  // <special> ... </special>
  const specialInner = sliceBetween(text, '<special>', '</special>') ?? ''
  const special: HymnPick[] = []
  for (const m of specialInner.matchAll(/<pick\s+hymn-id="(\d+)">([\s\S]*?)<\/pick>/g)) {
    const id = parseInt(m[1])
    const pick = buildPick(id, extractTag(m[2], 'why'), extractSnippet(m[2]), hymnsById)
    if (pick) special.push(pick)
    else droppedIds.push(id)
  }
  if (special.length < 1) throw new Error('AI response malformed: special needs 1-3 picks')

  // <invitation> primary + optional alt
  const invitationInner = sliceBetween(text, '<invitation>', '</invitation>') ?? ''
  const primaryMatch = invitationInner.match(/<primary\s+hymn-id="(\d+)">([\s\S]*?)<\/primary>/)
  if (!primaryMatch) throw new Error('AI response malformed: missing invitation primary')
  const primaryId = parseInt(primaryMatch[1])
  const primary = buildPick(primaryId, extractTag(primaryMatch[2], 'why'), undefined, hymnsById)
  if (!primary) throw new Error(`AI response malformed: invitation primary hymn-id=${primaryId} not in corpus`)

  let invitationAlt: HymnPick | undefined
  const altInvMatch = invitationInner.match(/<alt\s+hymn-id="(\d+)">([\s\S]*?)<\/alt>/)
  if (altInvMatch) {
    const id = parseInt(altInvMatch[1])
    const pick = buildPick(id, extractTag(altInvMatch[2], 'why'), undefined, hymnsById)
    if (pick) invitationAlt = pick
    else droppedIds.push(id)
  }

  // <flow> ... </flow>
  const flowInner = sliceBetween(text, '<flow>', '</flow>') ?? ''
  const flow: HymnFlowStep[] = []
  for (const m of flowInner.matchAll(
    /<step\s+n="(\d+)"\s+slot="(\w+)"(?:\s+hymn-id="(\d+)")?\s*>([\s\S]*?)<\/step>/g,
  )) {
    const step = parseInt(m[1])
    const slot = m[2] as HymnFlowStep['slot']
    const hymnId = m[3] ? parseInt(m[3]) : undefined
    const label = m[4].trim()
    flow.push({step, slot, hymnId, label})
  }
  if (flow.length !== 6) throw new Error(`AI response malformed: flow must have 6 steps, got ${flow.length}`)

  return {
    sections: {
      opening,
      congregational,
      alternate,
      special,
      invitation: {primary, alternate: invitationAlt},
      flow,
    },
    droppedIds,
  }
}

export async function runHymnSuggestion(input: HymnSuggestionInput): Promise<HymnSuggestionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')

  const filter = input.hymnalFilter ?? 'both'
  const start = Date.now()
  const model = getConfiguredModel()

  const hymns = loadHymns(filter)
  if (hymns.length === 0) {
    throw new Error(
      'No hymns found in the hymns.db. Run `npx tsx scripts/extract-hymns.ts` then `npx tsx scripts/load-hymns.ts` to seed.',
    )
  }

  const hymnsById = new Map(hymns.map((h) => [h.id, h]))
  const corpusText = buildCorpusText(hymns)
  const sermonText = buildSermonInputsText(input)

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
            text: sermonText,
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')
  const rawResponse = textBlock.text

  const {sections, droppedIds} = parseAiResponse(rawResponse, hymnsById)
  if (droppedIds.length > 0) {
    console.warn(`hymn-suggestion: dropped ${droppedIds.length} unknown hymn-id refs: ${droppedIds.join(', ')}`)
  }

  const durationMs = Date.now() - start

  const inserted = db
    .insert(schema.hymnSearches)
    .values({
      title: input.title,
      scriptureText: input.scriptureText,
      theme: input.theme,
      audience: input.audience,
      hymnalFilter: filter,
      sections: JSON.stringify(sections),
      rawResponse,
      model,
      candidateCount: hymns.length,
      durationMs,
    })
    .returning({id: schema.hymnSearches.id})
    .get()

  return {
    searchId: inserted!.id,
    sections,
    model,
    candidateCount: hymns.length,
    durationMs,
  }
}

export interface HymnSearchDetail {
  id: number
  title: string
  scriptureText: string
  theme: string
  audience: string
  hymnalFilter: HymnalFilter
  sections: HymnSuggestionSections
  model: string
  createdAt: string | null
  candidateCount: number
  durationMs: number
}

export function rehydrateHymnSearch(row: {
  id: number
  title: string
  scriptureText: string
  theme: string
  audience: string
  hymnalFilter: HymnalFilter
  sections: string
  model: string
  candidateCount: number
  durationMs: number
  createdAt: string | null
}): HymnSearchDetail {
  return {
    id: row.id,
    title: row.title,
    scriptureText: row.scriptureText,
    theme: row.theme,
    audience: row.audience,
    hymnalFilter: row.hymnalFilter,
    sections: JSON.parse(row.sections) as HymnSuggestionSections,
    model: row.model,
    createdAt: row.createdAt,
    candidateCount: row.candidateCount,
    durationMs: row.durationMs,
  }
}
