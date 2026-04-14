import Anthropic from '@anthropic-ai/sdk'
import {and, desc, eq, sql} from 'drizzle-orm'

import {devotionsDb, devotionsSchema} from '../db-devotions/index.js'
import {db, schema} from '../db/index.js'
import {parseReference} from '../lib/bible-reference.js'

export interface GeneratedPassage {
  title: string
  bibleReference: string
  talkingPoints: string
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
  return row?.value ?? 'claude-sonnet-4-20250514'
}

function getRepetitionContext(): {references: string[]; titles: string[]} {
  const tylerHistory = devotionsDb
    .select({
      bibleReference: devotionsSchema.devotions.bibleReference,
      title: devotionsSchema.devotions.title,
    })
    .from(devotionsSchema.devotions)
    .where(
      and(
        eq(devotionsSchema.devotions.devotionType, 'guest'),
        eq(devotionsSchema.devotions.guestSpeaker, 'Tyler'),
        sql`${devotionsSchema.devotions.bibleReference} IS NOT NULL`,
      ),
    )
    .orderBy(desc(devotionsSchema.devotions.date))
    .limit(80)
    .all()

  const poolHistory = devotionsDb
    .select({
      bibleReference: devotionsSchema.generatedPassages.bibleReference,
      title: devotionsSchema.generatedPassages.title,
    })
    .from(devotionsSchema.generatedPassages)
    .orderBy(desc(devotionsSchema.generatedPassages.createdAt))
    .limit(50)
    .all()

  const allRows = [...tylerHistory, ...poolHistory]
  const references = [...new Set(allRows.map((r) => r.bibleReference).filter(Boolean) as string[])]
  const titles = [...new Set(allRows.map((r) => r.title).filter(Boolean) as string[])]

  return {references, titles}
}

function buildUserMessage(extraRefs: string[], extraTitles: string[]): string {
  const {references, titles} = getRepetitionContext()
  const allRefs = [...new Set([...references, ...extraRefs])]
  const allTitles = [...new Set([...titles, ...extraTitles])]

  let msg = 'Generate one fresh devotion passage.\n'

  if (allRefs.length > 0) {
    msg += `\nPreviously used Bible references (avoid repeating these):\n${allRefs.join(', ')}\n`
  }
  if (allTitles.length > 0) {
    msg += `\nPreviously used topics (avoid repeating these):\n${allTitles.join(', ')}\n`
  }

  msg += '\nReturn only the XML-formatted output.'
  return msg
}

function parseResponse(text: string): GeneratedPassage {
  const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/)
  const verseMatch = text.match(/<verse>([\s\S]*?)<\/verse>/)
  const pointsMatch = text.match(/<points>([\s\S]*?)<\/points>/)

  if (!titleMatch || !verseMatch || !pointsMatch) {
    throw new Error('Failed to parse AI response — missing required XML tags')
  }

  const rawRef = verseMatch[1].trim()
  const bibleReference = normalizeReference(rawRef)

  return {
    title: titleMatch[1].trim(),
    bibleReference,
    talkingPoints: pointsMatch[1].trim(),
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

export type ProgressCallback = (step: string, message: string, progress: number) => void

export async function generateDevotionPassage(count = 1, onProgress?: ProgressCallback): Promise<GeneratedPassage[]> {
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

    const userMessage = buildUserMessage(freshRefs, freshTitles)

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{role: 'user', content: userMessage}],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    onProgress?.(
      'parsing',
      `Processing response${count > 1 ? ` ${i + 1}/${count}` : ''}\u2026`,
      80 + Math.round((i / count) * 15),
    )

    const passage = parseResponse(textBlock.text)
    results.push(passage)
    freshRefs.push(passage.bibleReference)
    freshTitles.push(passage.title)
  }

  return results
}
