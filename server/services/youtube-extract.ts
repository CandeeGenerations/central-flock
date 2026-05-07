import Anthropic from '@anthropic-ai/sdk'
import {YoutubeTranscript} from 'youtube-transcript'

import {db, schema} from '../db/index.js'
import {AI_MODELS} from '../lib/ai-models.js'

const anthropic = new Anthropic()

export type YoutubeExtraction = {
  videoId: string
  videoTitle: string | null
  videoDescription: string | null
  videoUploadDate: string | null
  // AI-derived fields, all best-effort:
  date?: string // 'YYYY-MM-DD'
  songTitle?: string
  type?: 'solo' | 'duet' | 'trio' | 'group' | 'instrumental' | 'other'
  performerSuggestions: PerformerSuggestion[]
  hymnSuggestion?: HymnSuggestion
}

export type PerformerSuggestion = {
  name: string
  candidatePersonIds: number[]
}

export type HymnSuggestion = {
  hymnId: number
  book: string
  number: number
  title: string
  matchedOn: 'title' | 'first_line' | 'refrain_line'
}

export function parseVideoId(input: string): string | null {
  const m = input.trim().match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  if (m) return m[1]
  // Allow bare video IDs.
  if (/^[A-Za-z0-9_-]{11}$/.test(input.trim())) return input.trim()
  return null
}

type OembedResponse = {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

async function fetchOembed(videoId: string): Promise<OembedResponse | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    if (!r.ok) return null
    return (await r.json()) as OembedResponse
  } catch {
    return null
  }
}

async function fetchTranscriptText(videoId: string): Promise<string | null> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId)
    if (!segments || segments.length === 0) return null
    return segments.map((s) => s.text).join(' ')
  } catch {
    return null
  }
}

function fuzzyPersonMatch(name: string): number[] {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return []
  const parts = trimmed.split(/\s+/)
  const first = parts[0]
  const last = parts.slice(1).join(' ') || null

  const rows = db
    .select({id: schema.people.id, firstName: schema.people.firstName, lastName: schema.people.lastName})
    .from(schema.people)
    .all()

  const matches = rows.filter((p) => {
    const f = (p.firstName ?? '').toLowerCase()
    const l = (p.lastName ?? '').toLowerCase()
    if (last) return f === first && l === last
    // Single-token name: match either first or last that equals.
    return f === first || l === first
  })
  return matches.map((m) => m.id)
}

function findHymnFromTranscript(transcript: string): HymnSuggestion | undefined {
  const haystack = transcript.toLowerCase()
  const hymns = db
    .select({
      id: schema.hymns.id,
      book: schema.hymns.book,
      number: schema.hymns.number,
      title: schema.hymns.title,
      firstLine: schema.hymns.firstLine,
      refrainLine: schema.hymns.refrainLine,
    })
    .from(schema.hymns)
    .all()

  // Score by longest matched line. First line / refrain line are typically the best signal.
  type Cand = {hymn: (typeof hymns)[number]; matchedOn: 'title' | 'first_line' | 'refrain_line'; score: number}
  const cands: Cand[] = []
  for (const h of hymns) {
    const tryLine = (line: string | null, matchedOn: Cand['matchedOn']) => {
      if (!line) return
      const needle = line.trim().toLowerCase()
      if (needle.length < 8) return // skip too-short lines to reduce noise
      if (haystack.includes(needle)) cands.push({hymn: h, matchedOn, score: needle.length})
    }
    tryLine(h.firstLine, 'first_line')
    tryLine(h.refrainLine, 'refrain_line')
    tryLine(h.title, 'title')
  }
  if (cands.length === 0) return undefined
  cands.sort((a, b) => b.score - a.score)
  const best = cands[0]
  return {
    hymnId: best.hymn.id,
    book: best.hymn.book,
    number: best.hymn.number,
    title: best.hymn.title,
    matchedOn: best.matchedOn,
  }
}

type AiPayload = {
  date?: string
  songTitle?: string
  type?: 'solo' | 'duet' | 'trio' | 'group' | 'instrumental' | 'other'
  performers?: string[]
}

async function extractFieldsViaClaude(input: {
  title: string | null
  description: string | null
  uploadDate: string | null
}): Promise<AiPayload> {
  const userContent = [
    input.title ? `TITLE: ${input.title}` : null,
    input.description ? `DESCRIPTION: ${input.description}` : null,
    input.uploadDate ? `UPLOADED: ${input.uploadDate}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  if (!userContent.trim()) return {}

  const message = await anthropic.messages.create({
    model: AI_MODELS.sonnet,
    max_tokens: 1024,
    system: `You extract structured metadata about a special musical performance from a YouTube video's title, description, and upload date.

Return ONLY a single JSON object (no prose, no code fence) with these optional fields:
- date: 'YYYY-MM-DD' if a performance date is mentioned or strongly implied (the upload date is often, but not always, the same as the performance date — only use it if no other date appears).
- songTitle: the title of the song performed (without leading "Special Music -" prefixes, etc.).
- type: one of "solo" | "duet" | "trio" | "group" | "instrumental" | "other". Use "instrumental" only when the description makes it clear there is no vocalist.
- performers: array of human names of the singers/musicians (omit titles, instruments). For a duet of "John & Jane Smith", return ["John Smith", "Jane Smith"].

If a field is unknown, omit it. If you have no information at all, return {}.`,
    messages: [{role: 'user', content: userContent}],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return {}
  const raw = textBlock.text.trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return {}
  try {
    return JSON.parse(raw.slice(start, end + 1)) as AiPayload
  } catch {
    return {}
  }
}

export async function extractFromYoutube(url: string): Promise<YoutubeExtraction> {
  const videoId = parseVideoId(url)
  if (!videoId) throw new Error('Could not parse a YouTube video ID from the provided URL')

  const [oembed, transcript] = await Promise.all([fetchOembed(videoId), fetchTranscriptText(videoId)])

  const videoTitle = oembed?.title ?? null
  const ai = await extractFieldsViaClaude({
    title: videoTitle,
    description: null, // oEmbed does not include description; YouTube Data API would. Skip for now.
    uploadDate: null,
  })

  const performerSuggestions: PerformerSuggestion[] = (ai.performers ?? []).map((name) => ({
    name,
    candidatePersonIds: fuzzyPersonMatch(name),
  }))

  const hymnSuggestion = transcript ? findHymnFromTranscript(transcript) : undefined

  return {
    videoId,
    videoTitle,
    videoDescription: null,
    videoUploadDate: null,
    date: ai.date,
    songTitle: ai.songTitle,
    type: ai.type,
    performerSuggestions,
    hymnSuggestion,
  }
}
