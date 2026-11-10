import type Anthropic from '@anthropic-ai/sdk'

import {AI_MODELS, effortConfig} from '../lib/ai-models.js'
import {createMessage, requireAnthropicKey} from '../lib/anthropic-client.js'
import type {RawScan} from './music-schedule-scan-process.js'

// The model's half of a Schedule Scan: read the pastor's pages, transcribe them.
// It never resolves a song title, never reorders, never invents a line — the
// deterministic half (music-schedule-scan-process.ts) does everything else.

const SYSTEM_PROMPT = `You transcribe a church's weekly music schedule from photographs. You will get one to three photos, in any order, of these page kinds:

1. "sunday_sheet" — a typed page titled "MUSIC SCHEDULE / Sunday" with three typed service blocks (SUNDAY SCHOOL, MORNING SERVICE, EVENING SERVICE). The pastor writes on it by hand in pen: the date beside each heading ("NOV 22"), songs as a book letter and number with a title ("B#219 "Little Is Much"", "S# 27 ..."), parentheticals like "(x2)" or "(2x & tag)", margin markers like "INV." (invitation) or "Op." (optional), and notes beside a heading ("Thanksgiving Testimonies"). Typed lines may also carry songs already ("B-167 Just As I Am (Invitation)") and labels ("Choir:", "Motto:", "Verse:", "Theme:", "Preacher's Selection").
2. "midweek_sheet" — the same, titled "MUSIC SCHEDULE / Midweek", one MIDWEEK SERVICE block. The scripture quote and music-note picture at the bottom are decoration: ignore them.
3. "form" — a handwritten page titled "MUSIC SCHEDULE" listing each service (Sunday School, Sunday Morning, Sunday Evening, Wednesday Evening) with a date, TITLE, TEXT (scripture) and OPENING SONG, plus more songs and notes written underneath.

Transcribe each service block on each page as its own entry, in page order, top to bottom. Rules:
- "which": "sunday_school", "sunday_morning", "sunday_evening" or "midweek" (Wednesday Evening is midweek).
- "page": the page kind the block is on.
- "date": YYYY-MM-DD. Use the year written on the form; if no year is written anywhere, use the year that puts the date nearest to TODAY (given below).
- "occasion": words written beside or above a service heading that name the occasion ("Thanksgiving Eve Candlelight", "Thanksgiving Testimonies"), else null. Not a song, not an instruction.
- "title" and "text": from the form's TITLE and TEXT lines, exactly as written (keep abbreviations like "Ps"), else null. A reference written just above the TEXT line still belongs to TEXT.
- "lines": every line of the block in order, typed and handwritten together, as they will happen in the service. A handwritten song squeezed between two typed lines goes between them. Each line:
  - "kind": "song" for any line with a hymn book + number, else "prose".
  - "label": a label on the line ("Choir", "Motto", "Verse", "Theme", "Opening Song", "Kids' Song"), else null.
  - "book": "B" or "S" as written ("B-167" and "B#167" are both "B"), null if no letter.
  - "number": the hymn number as an integer, null if unreadable. Read digits carefully.
  - "writtenSuffix": a parenthetical attached to the song ("(x2)", "(2x & tag)", "(Invitation)", "(Congregation joins on verse 2)"), else null.
  - "marker": "INV" if the line is marked INV./Invitation in the margin, "Op" if marked Op./Optional, else null.
  - "text": for prose, the line's words exactly as printed/written ("Prayer, Announcements"); for a labelled prose line, the value after the label ("Rejoice That God Put a Song in Our Heart!", "Ps 40:3"); for songs, the title as written (it is not used).
  - "struckOut": true if a typed line is crossed out, else false.
  - On the form, the "TITLE:", "TEXT:" and date lines are not lines — they go in title/text/date. Songs and other items written under a service are lines.
- "notes": anything written for that service you can't place as a line, occasion, title or text ("FILM IT ALL", a bracketed instruction like "Off-line for testimonies"). Copy the words.

Never correct, re-title, reorder or invent anything. If you can't read something, give your best reading of the digits; use null only when there is nothing legible.

Return ONLY a JSON object:
{"pages": ["sunday_sheet", ...], "services": [{"which": "...", "page": "...", "date": "YYYY-MM-DD", "occasion": null, "title": null, "text": null, "lines": [{"kind": "song", "label": null, "book": "B", "number": 219, "writtenSuffix": null, "marker": null, "text": "Little Is Much", "struckOut": false}], "notes": []}]}`

export interface ScanPhoto {
  /** base64, no data: prefix */
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export async function transcribeSchedulePhotos(photos: ScanPhoto[], today: string): Promise<RawScan> {
  requireAnthropicKey()
  if (!photos.length) throw new Error('No photos to scan')

  const content: Anthropic.ContentBlockParam[] = [
    ...photos.map((p): Anthropic.ImageBlockParam => ({
      type: 'image',
      source: {type: 'base64', media_type: p.mediaType, data: p.data},
    })),
    {
      type: 'text',
      text: `TODAY is ${today}. Transcribe every service block on these pages. Return the JSON as specified.`,
    },
  ]

  const response = await createMessage('music-schedule-scan', {
    model: AI_MODELS.sonnet,
    max_tokens: 8192,
    ...effortConfig(AI_MODELS.sonnet, 'low'),
    system: SYSTEM_PROMPT,
    messages: [{role: 'user', content}],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')
  return parseScanResponse(textBlock.text)
}

export function parseScanResponse(text: string): RawScan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  const parsed = JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body) as Partial<RawScan>
  return {
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    services: (Array.isArray(parsed.services) ? parsed.services : []).map((s) => ({
      ...s,
      lines: Array.isArray(s.lines) ? s.lines : [],
      notes: Array.isArray(s.notes) ? s.notes : [],
    })),
  }
}
