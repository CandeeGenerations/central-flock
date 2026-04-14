export type Block = {type: 'point'; text: string} | {type: 'scripture'; text: string; reference: string}

export interface ParsedDevotional {
  title: string
  date: string
  blocks: Block[]
  rawInput: string
}

const TAGLINE_RE = /^—?\s*Passing the truth along\s*$/i
const BIBLE_REF_RE = /^[1-3]?\s*[A-Za-z]+\s+\d+:\d+/

function parseDate(raw: string): string {
  // Normalize separators
  const normalized = raw.trim().replace(/\//g, '-')

  // M-D-YY or MM-DD-YY
  const shortMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/)
  if (shortMatch) {
    const [, m, d, y] = shortMatch
    const year = 2000 + parseInt(y, 10)
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // M-D-YYYY or MM-DD-YYYY
  const longMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (longMatch) {
    const [, m, d, y] = longMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Already ISO
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return raw.trim()
}

export function parseDevotional(rawText: string): ParsedDevotional {
  const lines = rawText.split('\n').map((l) => l.trimEnd())

  // Drop leading blank lines
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++

  const title = lines[i]?.trim() ?? ''
  i++

  // Skip blank lines between title and date
  while (i < lines.length && lines[i].trim() === '') i++

  const dateRaw = lines[i]?.trim() ?? ''
  const date = parseDate(dateRaw)
  i++

  // Remaining text — join and split on emoji markers
  const remaining = lines.slice(i).join('\n')

  // Split on 📚 and 📖 markers — each marker starts a new segment
  const segments = remaining.split(/(📚|📖)/).filter((s) => s !== '')

  const blocks: Block[] = []
  let j = 0
  while (j < segments.length) {
    const marker = segments[j]
    if (marker !== '📚' && marker !== '📖') {
      j++
      continue
    }
    const content = segments[j + 1] ?? ''
    j += 2

    const contentLines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .filter((l) => !TAGLINE_RE.test(l))

    if (marker === '📚') {
      const text = contentLines.join('\n')
      if (text) blocks.push({type: 'point', text})
    } else {
      // 📖 scripture: last line may be the reference
      let reference = ''
      let textLines = [...contentLines]

      if (textLines.length > 1) {
        const lastLine = textLines[textLines.length - 1]
        if (BIBLE_REF_RE.test(lastLine)) {
          reference = lastLine
          textLines = textLines.slice(0, -1)
        }
      }

      const raw = textLines.join('\n')
      // Strip surrounding quotes (straight or curly) added by Gwendolyn
      const text = raw.replace(/^["\u201C\u2018]+|["\u201D\u2019]+$/g, '').trim()
      if (text) blocks.push({type: 'scripture', text, reference})
    }
  }

  return {title, date, blocks, rawInput: rawText}
}
