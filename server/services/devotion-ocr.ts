import Anthropic from '@anthropic-ai/sdk'

import {AI_MODELS} from '../lib/ai-models.js'
import {parseReference} from '../lib/bible-reference.js'

export interface ParsedDevotionRow {
  date: string
  number: number
  devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
  subcode: string | null
  guestSpeaker: string | null
  guestNumber: number | null
  referencedDevotions: number[]
  bibleReference: string | null
  songName: string | null
}

const SYSTEM_PROMPT = `You are a data extraction assistant. You will be shown a photograph of a handwritten monthly devotional log sheet. Extract each row into structured JSON.

The sheet has these columns:
- DAY (day of week)
- DATE (e.g., APR 1, APR 2)
- # (devotion number, e.g., 2197)
- TITLE/NOTE (describes the type and content)
- SCRIPTURE (bible verse reference)

The TITLE/NOTE column contains one of these patterns:
1. "RENUMBER #XXXX AS #YYYY" or "#XXXX / #YYYY" — This is a REVISIT (re-air). The first number(s) before "AS" are the referenced original devotion numbers.
2. "TYLER" or "TYLER #NNN" — Guest speaker Tyler. May have a subcode in parentheses like "(35)" or "(001 - R-G)".
3. "GABE" or "ED" — Guest speakers Gabe or Ed.
4. A song title in quotes like "TETELESTAI" — This is an ORIGINAL with a song. May have a circled letter code like (G), (H), (E), (F) which is the subcode.
5. Entries with a red star (*) or red ink are ORIGINALS with songs.
6. Plain references like "#1801" or "#1801 / #1439" without "RENUMBER" are also REVISITS.

The header area may contain:
- Month and year
- Notes about removing revisit intros from specific dates
- The series name (e.g., "FROM THE SHEPHERD TO THE SHEEP")

For each row, output:
- date: Full date as YYYY-MM-DD
- number: The devotion number (integer)
- devotionType: "original", "favorite", "guest", or "revisit"
- subcode: Any letter/number code in parentheses (e.g., "G-16", "E-14", "35", "001 - R-G"), or null
- guestSpeaker: "Tyler", "Gabe", or "Ed" if guest type, otherwise null
- guestNumber: The guest's sequential number if present, otherwise null
- referencedDevotions: Array of referenced devotion numbers for revisits, otherwise empty array
- bibleReference: The scripture reference using FULL book names (e.g., "Romans" not "Rom", "2 Timothy" not "2 Tim", "Psalm" not "Ps", "Philippians" not "Phil", "1 Corinthians" not "1 Cor", "Revelation" not "Rev"), or null if not present
- songName: The song title if it's an original with a song, otherwise null

Return ONLY a JSON object with this shape:
{
  "month": "April",
  "year": 2026,
  "devotions": [ ...array of row objects... ]
}

Be precise with the numbers. If you can't read a value clearly, use your best judgment based on context (sequential numbering, etc.). Do not skip any rows.`

export type ProgressCallback = (step: string, message: string, progress: number) => void

export async function parseDevotionImage(
  imageBase64: string,
  mediaType: string,
  onProgress?: ProgressCallback,
): Promise<{
  month: string
  year: number
  devotions: ParsedDevotionRow[]
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  onProgress?.('calling_ai', 'Analyzing handwritten sheet\u2026', 20)

  const client = new Anthropic({apiKey})

  const response = await client.messages.create({
    model: AI_MODELS.sonnet,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Extract all devotion entries from this handwritten sheet. Return the JSON as specified.',
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  onProgress?.('parsing', 'Extracting devotion entries\u2026', 80)

  // Extract JSON from the response (may be wrapped in markdown code block)
  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())

  // Normalize bible references to full book names
  if (parsed.devotions) {
    for (const d of parsed.devotions) {
      if (d.bibleReference) {
        d.bibleReference = normalizeReference(d.bibleReference)
      }
    }
  }

  return parsed
}

/**
 * Normalize abbreviated book names to full names.
 * "Rom 1:16" → "Romans 1:16", "2 Tim 1:1" → "2 Timothy 1:1"
 */
function normalizeReference(ref: string): string {
  const parsed = parseReference(ref)
  if (parsed.length === 0) return ref

  const parts: string[] = []
  let lastBook = ''
  for (const p of parsed) {
    // Extract just the chapter:verse part (e.g., "15:20" or "1:1-3")
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
