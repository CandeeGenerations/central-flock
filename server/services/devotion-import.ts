import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'

interface ParsedDevotion {
  date: string
  number: number
  devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
  subcode: string | null
  guestSpeaker: string | null
  guestNumber: number | null
  referencedDevotions: string | null
  bibleReference: string | null
  songName: string | null
  produced: boolean
  rendered: boolean
  youtube: boolean
  facebookInstagram: boolean
  podcast: boolean
  notes: string | null
}

interface ParseResult {
  devotions: ParsedDevotion[]
  warnings: string[]
}

export function parseNoteField(note: string | null | undefined): {
  devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
  subcode: string | null
  guestSpeaker: string | null
  guestNumber: number | null
  referencedDevotions: number[]
} {
  const defaults = {subcode: null, guestSpeaker: null, guestNumber: null, referencedDevotions: [] as number[]}

  if (!note || !note.trim()) {
    return {devotionType: 'original', ...defaults}
  }

  const trimmed = note.trim()

  // "Favorite"
  if (/^Favorite/i.test(trimmed)) {
    return {devotionType: 'favorite', ...defaults}
  }

  // "Original" or "Original (E-14)"
  if (/^Original/i.test(trimmed)) {
    const sub = trimmed.match(/\(([^)]+)\)/)?.[1] || null
    return {devotionType: 'original', ...defaults, subcode: sub}
  }

  // Guest speakers: "Tyler #123 (XXX)" or "Gabe #45" or "Ed #12" or "Guest Gabe #005"
  const guestMatch = trimmed.match(/^(?:Guest\s+)?(Tyler|Gabe|Ed)\s*#?(\d+)?(?:\s*\(([^)]+)\))?/i)
  if (guestMatch) {
    return {
      devotionType: 'guest',
      subcode: guestMatch[3] || null,
      guestSpeaker: guestMatch[1],
      guestNumber: guestMatch[2] ? parseInt(guestMatch[2]) : null,
      referencedDevotions: [],
    }
  }

  // "Revisit #123" or "Renumber #123" or "Renumber #1833 as #2200" or "Script #1114"
  const revisitMatch = trimmed.match(/^(?:Revisit|Renumber|Script)\s*#(\d+)/i)
  if (revisitMatch) {
    // Extract all referenced numbers
    const nums = [...trimmed.matchAll(/#(\d+)/g)].map((m) => parseInt(m[1]))
    // For "Renumber #1833 as #2200", the first number is the reference
    return {
      devotionType: 'revisit',
      ...defaults,
      referencedDevotions: [nums[0]],
    }
  }

  // "#1801 / #1439 / #710" — re-air chains (also treated as revisit)
  if (/^#\d+/.test(trimmed)) {
    const nums = [...trimmed.matchAll(/#(\d+)/g)].map((m) => parseInt(m[1]))
    return {devotionType: 'revisit', ...defaults, referencedDevotions: nums}
  }

  // Fallback
  return {devotionType: 'original', ...defaults}
}

function isChecked(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const v = value.trim()
    return v === '✅' || v === 'TRUE' || v === '1' || v === 'Yes' || v === 'yes' || v === 'x' || v === 'X'
  }
  return false
}

// Header name mappings for column detection
const HEADER_MAPS: Record<string, string> = {
  date: 'date',
  number: 'number',
  '#': 'number',
  note: 'note',
  reference: 'bibleReference',
  'song name': 'songName',
  'verse timestamp': 'verseTimestamp',
  produced: 'produced',
  rendered: 'rendered',
  'r / v': 'rendered',
  'r/v': 'rendered',
  youtube: 'youtube',
  facebook: 'facebookInstagram',
  'fb / ig': 'facebookInstagram',
  'fb/ig': 'facebookInstagram',
  validated: 'rendered',
  instagram: 'instagram',
  podcast: 'podcast',
}

function detectColumns(headers: unknown[]): Map<number, string> {
  const columnMap = new Map<number, string>()
  const usedFields = new Set<string>()
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '')
      .trim()
      .toLowerCase()
    const mapped = HEADER_MAPS[h]
    if (mapped && !usedFields.has(mapped)) {
      columnMap.set(i, mapped)
      usedFields.add(mapped)
    } else if (mapped === 'number' && usedFields.has('number') && !usedFields.has('note')) {
      // Second "Number" column is actually the Note/type column (2023 August format)
      columnMap.set(i, 'note')
      usedFields.add('note')
    }
  }
  return columnMap
}

function parseDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(value).trim()
  // Try ISO format
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  return null
}

function parseNumber(value: unknown): number | null {
  if (!value) return null
  const s = String(value).replace(/^#/, '').trim()
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

export function parseSheetRows(rows: unknown[][], year: number, month: number): ParseResult {
  if (rows.length === 0) return {devotions: [], warnings: []}

  const columnMap = detectColumns(rows[0])
  if (columnMap.size === 0) return {devotions: [], warnings: ['Could not detect column headers']}

  const devotions: ParsedDevotion[] = []
  const warnings: string[] = []

  // Check if we have a separate instagram column (older format)
  const hasInstagram = [...columnMap.values()].includes('instagram')

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((cell) => cell == null || String(cell).trim() === '')) continue

    const getValue = (fieldName: string): unknown => {
      for (const [colIdx, name] of columnMap.entries()) {
        if (name === fieldName) return row[colIdx]
      }
      return undefined
    }

    // Parse date — use the date from the sheet but fix the year based on the file's year and month
    let dateStr = parseDate(getValue('date'))
    if (!dateStr) {
      // Try to construct from row position and month
      const day = i
      dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    } else {
      // Fix the year — Excel sometimes stores dates with wrong year
      const parts = dateStr.split('-')
      dateStr = `${year}-${String(month).padStart(2, '0')}-${parts[2]}`
    }

    const number = parseNumber(getValue('number'))
    if (!number) {
      warnings.push(`Row ${i + 1}: could not parse devotion number`)
      continue
    }

    const noteValue = getValue('note')
    const noteStr = noteValue != null ? String(noteValue).trim() : null
    const parsed = parseNoteField(noteStr)

    const facebookInstagram =
      isChecked(getValue('facebookInstagram')) ||
      (hasInstagram && isChecked(getValue('instagram')) && isChecked(getValue('facebookInstagram'))) ||
      isChecked(getValue('facebookInstagram'))

    devotions.push({
      date: dateStr,
      number,
      devotionType: parsed.devotionType,
      subcode: parsed.subcode,
      guestSpeaker: parsed.guestSpeaker,
      guestNumber: parsed.guestNumber,
      referencedDevotions: parsed.referencedDevotions.length > 0 ? JSON.stringify(parsed.referencedDevotions) : null,
      bibleReference: getValue('bibleReference') ? String(getValue('bibleReference')).trim() : null,
      songName: getValue('songName') ? String(getValue('songName')).trim() : null,
      produced: isChecked(getValue('produced')),
      rendered: isChecked(getValue('rendered')),
      youtube: isChecked(getValue('youtube')),
      facebookInstagram,
      podcast: isChecked(getValue('podcast')),
      notes: null,
    })
  }

  return {devotions, warnings}
}

export function importDevotions(devotions: ParsedDevotion[]): {inserted: number; skipped: number; errors: string[]} {
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const d of devotions) {
    try {
      // Check if already exists
      const existing = db
        .select({id: schema.devotions.id})
        .from(schema.devotions)
        .where(eq(schema.devotions.number, d.number))
        .get()

      if (existing) {
        skipped++
        continue
      }

      db.insert(schema.devotions).values(d).run()
      inserted++
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('UNIQUE constraint')) {
        skipped++
      } else {
        errors.push(`#${d.number}: ${msg}`)
      }
    }
  }

  return {inserted, skipped, errors}
}
