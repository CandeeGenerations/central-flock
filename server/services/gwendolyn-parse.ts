import {isBookName, looksLikeReference} from '../lib/bible-text.js'

export type Block = {type: 'point'; text: string} | {type: 'scripture'; text: string; reference: string}

export interface ParsedDevotional {
  title: string
  date: string
  blocks: Block[]
  rawInput: string
}

const TAGLINE_RE = /^—?\s*Passing the truth along\s*$/i
// Chapter/verse numbers at the end of a line: "3:17-18", "34:1", "14:2, 4", "23"
const TRAILING_NUMBERS_RE =
  /(\d+(?::\d+[ab]?)?(?:\s*[-–—]\s*\d+(?::\d+)?[ab]?)?(?:\s*[,;]\s*\d+(?::\d+)?[ab]?(?:\s*[-–—]\s*\d+[ab]?)?)*)\s*\)?\s*$/
// A line that hands over to a quotation: "God said:", "The Bible says,", "Proverbs 23:7 says,"
const LEAD_IN_RE = /[:,]\s*$/

/**
 * A reference at the end of a line — alone, in parentheses, after a dash, or trailing the quote
 * itself (`…help thee.” Isaiah 41:10`). Book names can be several words ("Song of Solomon").
 */
export function splitTrailingReference(line: string): {rest: string; reference: string} | null {
  const nums = line.match(TRAILING_NUMBERS_RE)
  if (!nums || nums.index === undefined) return null
  const before = line.slice(0, nums.index).trimEnd()
  const words = before.split(/\s+/)
  // Longest run of trailing words that names a book, e.g. "Song of Solomon", "1 John", "Psalm"
  for (let k = Math.min(4, words.length); k >= 1; k--) {
    const book = words
      .slice(-k)
      .join(' ')
      .replace(/^[("“”'‘’—–-]+/, '')
      .trim()
    if (!book || !isBookName(book)) continue
    const reference = `${book} ${nums[1].trim()}`
    if (!looksLikeReference(reference)) continue
    const rest = words
      .slice(0, -k)
      .join(' ')
      .replace(/[\s(—–-]+$/, '')
      .trim()
    return {rest, reference}
  }
  return null
}

// Strip surrounding quotes (straight or curly) — she sometimes opens with a closing curly quote
function stripQuotes(text: string): string {
  return text.replace(/^["“”‘’]+|["“”‘’]+$/g, '').trim()
}

/**
 * One 📖 segment → blocks, the way they are split by hand: a lead-in ("The Bible says,") becomes
 * its own point before the Scripture Block, prose after the reference ("Just yield to Jesus Christ
 * who says,") its own point after. A reference named only in the lead-in ("Proverbs 3:13 reminds
 * us,") stays there — the Scripture Check reads it from the lead-in, and the caption doesn't repeat it.
 */
function parseScripture(lines: string[]): Block[] {
  const joined = lines.join('\n')
  const open = joined.search(/["“”]/)
  const close = Math.max(joined.lastIndexOf('"'), joined.lastIndexOf('”'))

  if (open >= 0 && close > open) {
    const leadIn = joined.slice(0, open).trim()
    const quote = joined.slice(open + 1, close).trim()
    const after = joined
      .slice(close + 1)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    let reference = ''
    const first = after[0] ? splitTrailingReference(after[0]) : null
    if (first && !first.rest) {
      reference = first.reference
      after.shift()
    }
    const blocks: Block[] = []
    if (leadIn) blocks.push({type: 'point', text: leadIn})
    if (quote) blocks.push({type: 'scripture', text: quote, reference})
    if (after.length) blocks.push({type: 'point', text: after.join('\n')})
    return blocks
  }

  // No quotation marks: the reference ends the block, on its own line or trailing the text
  let reference = ''
  let textLines = [...lines]
  if (textLines.length > 0) {
    const split = splitTrailingReference(textLines[textLines.length - 1])
    if (split && (split.rest || textLines.length > 1)) {
      reference = split.reference
      textLines = split.rest ? [...textLines.slice(0, -1), split.rest] : textLines.slice(0, -1)
    }
  }
  const text = stripQuotes(textLines.join('\n'))
  return text ? [{type: 'scripture', text, reference}] : []
}

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
      // A last line handing over to the next 📖 ("Proverbs 23:7 says,") is its own lead-in point
      const nextIsScripture = segments.slice(j).find((s) => s === '📚' || s === '📖') === '📖'
      const last = contentLines[contentLines.length - 1]
      if (nextIsScripture && contentLines.length > 1 && LEAD_IN_RE.test(last)) {
        blocks.push({type: 'point', text: contentLines.slice(0, -1).join('\n')})
        blocks.push({type: 'point', text: last})
      } else {
        const text = contentLines.join('\n')
        if (text) blocks.push({type: 'point', text})
      }
    } else {
      blocks.push(...parseScripture(contentLines))
    }
  }

  return {title, date, blocks, rawInput: rawText}
}
