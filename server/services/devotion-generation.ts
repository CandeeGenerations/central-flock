import Anthropic from '@anthropic-ai/sdk'
import {and, desc, eq, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {effortConfig, resolveModel} from '../lib/ai-models.js'
import {parseReference} from '../lib/bible-reference.js'

export interface GeneratedPassage {
  title: string
  bibleReference: string
  talkingPoints: string
  notes: string | null
}

const SYSTEM_PROMPT = `You are a Baptist devotional content creator. Generate a short devotion passage for Tyler Candee, a pastor at Central Baptist Church (Woodbridge, VA), who records a brief 4-6 minute morning devotional video called "From the Shepherd to the Sheep."

Your output MUST follow this exact format with XML tags:
<title>The Power of a Clean Conscience</title>
<verse>1 Timothy 1:19</verse>
<points>
- A good conscience is an anchor for your faith
- When we ignore conscience, we shipwreck (as Paul warns in this very verse)
- Keep short accounts with God — don't let sin pile up
- A clean conscience gives boldness in prayer and witness
</points>

Rules:
- Use ONLY King James Version (KJV) scripture references and quotations
- Use full book names (e.g., "Romans" not "Rom", "1 Timothy" not "1 Tim", "Psalm" not "Ps")
- Tone: warm, evangelical Baptist, practically applicable, encouraging
- Provide 3 to 4 talking points only — concise key phrases the speaker can expand on
- Keep the title concise and compelling (5-8 words ideal)
- Do NOT include any commentary, explanation, or text outside the XML tags
- Do NOT repeat the exact same verse or topic as any listed in the previously used list`

function getConfiguredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return resolveModel(row?.value)
}

function getRepetitionContext(): {references: string[]; titles: string[]} {
  const tylerHistory = db
    .select({
      bibleReference: schema.devotions.bibleReference,
      title: schema.devotions.title,
    })
    .from(schema.devotions)
    .where(
      and(
        eq(schema.devotions.devotionType, 'guest'),
        eq(schema.devotions.guestSpeaker, 'Tyler'),
        sql`${schema.devotions.bibleReference} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.devotions.date))
    .limit(80)
    .all()

  const poolHistory = db
    .select({
      bibleReference: schema.generatedPassages.bibleReference,
      title: schema.generatedPassages.title,
    })
    .from(schema.generatedPassages)
    .orderBy(desc(schema.generatedPassages.createdAt))
    .limit(50)
    .all()

  const allRows = [...tylerHistory, ...poolHistory]
  const references = [...new Set(allRows.map((r) => r.bibleReference).filter(Boolean) as string[])]
  const titles = [...new Set(allRows.map((r) => r.title).filter(Boolean) as string[])]

  return {references, titles}
}

function buildUserMessage(extraRefs: string[], extraTitles: string[], topic?: string): string {
  const {references, titles} = getRepetitionContext()
  const allRefs = [...new Set([...references, ...extraRefs])]
  const allTitles = [...new Set([...titles, ...extraTitles])]

  let msg = 'Generate one fresh devotion passage.\n'

  if (topic && topic.trim()) {
    msg += `\nThis passage MUST be on the topic: ${topic.trim()}. Choose a fitting verse and title for that theme.\n`
  }

  if (allRefs.length > 0) {
    msg += `\nPreviously used Bible references (avoid repeating these):\n${allRefs.join(', ')}\n`
  }
  if (allTitles.length > 0) {
    msg += `\nPreviously used topics (avoid repeating these):\n${allTitles.join(', ')}\n`
  }

  msg += '\nReturn only the XML-formatted output.'
  return msg
}

// The model occasionally drifts from the asked-for tags — renaming <points> to
// <talking_points>, wrapping the block in a code fence, or dropping a closing
// tag. None of those change the content, so accept them rather than discarding
// an otherwise good passage.
function extractTag(text: string, names: string[]): string | null {
  for (const name of names) {
    const closed = new RegExp(`<\\s*${name}\\s*[^>]*>([\\s\\S]*?)<\\s*/\\s*${name}\\s*>`, 'i')
    const m = text.match(closed)
    if (m?.[1].trim()) return m[1].trim()
  }
  // No closing tag — truncated output, or the model just dropped it. Take up to
  // the next tag so an unclosed <title> can't swallow the rest of the reply.
  for (const name of names) {
    const unclosed = new RegExp(`<\\s*${name}\\s*[^>]*>([\\s\\S]*?)(?:<|$)`, 'i')
    const m = text.match(unclosed)
    if (m?.[1].trim()) return m[1].trim()
  }
  return null
}

function parseResponse(text: string): GeneratedPassage | null {
  const cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')

  const title = extractTag(cleaned, ['title'])
  const verse = extractTag(cleaned, ['verse', 'reference', 'bible_reference', 'bibleReference'])
  const points = extractTag(cleaned, ['points', 'talking_points', 'talkingPoints'])

  if (!title || !verse || !points) return null

  return {
    title,
    bibleReference: normalizeReference(verse),
    talkingPoints: points,
    notes: null,
  }
}

function normalizeReference(ref: string): string {
  const parsed = parseReference(ref)
  if (parsed.length === 0) return ref

  const parts: string[] = []
  let lastBook = ''
  for (const p of parsed) {
    const cvMatch = p.raw.match(/(\d+:\d+\S*)/)
    const chapterVerse = cvMatch ? cvMatch[1] : p.raw.trim()

    if (p.book !== lastBook) {
      parts.push(`${p.book} ${chapterVerse}`)
      lastBook = p.book
    } else {
      parts.push(chapterVerse)
    }
  }

  return parts.join('; ')
}

// A reply that misses a tag is a one-off formatting slip, not a permanent
// failure — asking again almost always fixes it.
const MAX_PARSE_ATTEMPTS = 3
const RETRY_NUDGE =
  '\n\nIMPORTANT: your previous reply could not be parsed. Reply with ONLY the three tags ' +
  '<title></title>, <verse></verse> and <points></points> — no preamble, no code fences, no other tags.'

export type ProgressCallback = (step: string, message: string, progress: number) => void

export async function generateDevotionPassage(
  count = 1,
  onProgress?: ProgressCallback,
  topic?: string,
): Promise<GeneratedPassage[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  onProgress?.('querying_history', 'Checking previous passages\u2026', 10)

  const model = getConfiguredModel()
  const client = new Anthropic({apiKey})
  const results: GeneratedPassage[] = []
  const freshRefs: string[] = []
  const freshTitles: string[] = []

  for (let i = 0; i < count; i++) {
    const label = count > 1 ? `Generating passage ${i + 1}/${count}\u2026` : 'Generating passage\u2026'
    const progress = 20 + Math.round((i / count) * 60)
    onProgress?.('calling_ai', label, progress)

    const userMessage = buildUserMessage(freshRefs, freshTitles, topic)

    let passage: GeneratedPassage | null = null
    let lastText = ''
    let lastStop: string | null = null

    for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS && !passage; attempt++) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        ...effortConfig(model, 'medium'),
        system: SYSTEM_PROMPT,
        messages: [{role: 'user', content: attempt === 1 ? userMessage : `${userMessage}${RETRY_NUDGE}`}],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      lastText = textBlock?.type === 'text' ? textBlock.text : ''
      lastStop = response.stop_reason

      onProgress?.(
        'parsing',
        `Processing response${count > 1 ? ` ${i + 1}/${count}` : ''}\u2026`,
        80 + Math.round((i / count) * 15),
      )

      passage = parseResponse(lastText)

      // Log what actually came back — the old error said only "missing tags",
      // which left no way to tell a truncation from a reworded tag.
      if (!passage) {
        console.warn(
          `[devotion-generation] unparseable reply (attempt ${attempt}/${MAX_PARSE_ATTEMPTS}, ` +
            `stop_reason=${lastStop}): ${JSON.stringify(lastText.slice(0, 300))}`,
        )
      }
    }

    if (!passage) {
      throw new Error(
        `The AI reply could not be parsed after ${MAX_PARSE_ATTEMPTS} attempts ` +
          `(stop_reason=${lastStop}). Reply began: ${lastText.slice(0, 200) || '(empty)'}`,
      )
    }

    if (topic && topic.trim()) passage.notes = `Topic: ${topic.trim()}`
    results.push(passage)
    freshRefs.push(passage.bibleReference)
    freshTitles.push(passage.title)
  }

  return results
}
