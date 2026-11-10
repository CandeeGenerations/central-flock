import {AI_MODELS, effortConfig} from '../lib/ai-models.js'
import {createMessage, requireAnthropicKey} from '../lib/anthropic-client.js'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface ParsedPrayerSheetSunday {
  date: string
  entries: string[]
}

function readJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  try {
    return JSON.parse((fenced ? fenced[1] : text).trim()) as T
  } catch {
    throw new Error(`Failed to parse OCR response: ${text}`)
  }
}

async function readImage(system: string, prompt: string, imageBase64: string, mediaType: string, maxTokens: number) {
  requireAnthropicKey()
  const model = AI_MODELS.sonnet
  const result = await createMessage('prayer-sheet-ocr', {
    model,
    max_tokens: maxTokens,
    ...effortConfig(model, 'low'),
    system,
    messages: [
      {
        role: 'user',
        content: [
          {type: 'image', source: {type: 'base64', media_type: mediaType as ImageMediaType, data: imageBase64}},
          {type: 'text', text: prompt},
        ],
      },
    ],
  })
  const textBlock = result.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')
  return textBlock.text
}

/** Reads every Sunday group off a photo of a whole printed sheet, oldest first. */
export async function parsePrayerSheetPhoto(
  imageBase64: string,
  mediaType: string,
  today: string,
): Promise<{sundays: ParsedPrayerSheetSunday[]}> {
  const text = await readImage(
    `You are a data extraction assistant reading a photograph of a printed CBC Prayer Sheet.
The front side has a title, a scripture quote, a date-range heading such as "October – November 2026", then prayer requests in two columns. Requests are grouped under underlined headings like "Sunday, November 9"; each line below a heading is one request, usually "Name – description".

Extract every Sunday group on the sheet, reading the left column top to bottom, then the right column.
- date: the Sunday as YYYY-MM-DD. Headings omit the year: take it from the date-range heading, and when the range spans December into January, December Sundays belong to the earlier year. If there is no year anywhere, use the year that puts the date closest to today (${today}).
- entries: each request line exactly as written, in order. Keep the dash and wording; do not add bullets or numbering. A request that wraps onto a second line is still one entry.

Ignore the title, scripture quote, date-range heading, and anything on the back side (the ministry list).
Return only JSON of the form {"sundays": [{"date": "2026-11-09", "entries": ["Linda H – lung cancer surgery"]}]}. If no Sunday groups are visible, return {"sundays": []}.`,
    'Extract every Sunday and its prayer requests from this sheet.',
    imageBase64,
    mediaType,
    4096,
  )
  const parsed = readJson<{sundays?: unknown}>(text)
  const byDate = new Map<string, string[]>()
  for (const raw of Array.isArray(parsed.sundays) ? parsed.sundays : []) {
    const s = raw as {date?: unknown; entries?: unknown}
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) continue
    const entries = (Array.isArray(s.entries) ? s.entries : [])
      .filter((e): e is string => typeof e === 'string')
      .map((e) => e.trim())
      .filter(Boolean)
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), ...entries])
  }
  const sundays = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({date, entries}))
  return {sundays}
}
