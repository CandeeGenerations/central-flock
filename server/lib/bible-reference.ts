/**
 * Parse a bible reference string into normalized individual references.
 *
 * Supports formats like:
 *   "John 14:2"
 *   "John 14:2b"
 *   "John 14:2-3"
 *   "John 14:2, 4"
 *   "John 14:2; 15:1"           → John 14:2 + John 15:1
 *   "John 14:2; 2 Timothy 1:1"  → John 14:2 + 2 Timothy 1:1
 *   "1 John 1:9"
 *   "Song of Solomon 2:10-11"
 */

interface ParsedRef {
  book: string
  chapter: number
  startVerse: number | null
  raw: string
}

const BOOK_ALIASES: Record<string, string> = {
  gen: 'Genesis', genesis: 'Genesis',
  ex: 'Exodus', exod: 'Exodus', exodus: 'Exodus',
  lev: 'Leviticus', leviticus: 'Leviticus',
  num: 'Numbers', numbers: 'Numbers',
  deut: 'Deuteronomy', deuteronomy: 'Deuteronomy',
  josh: 'Joshua', joshua: 'Joshua',
  judg: 'Judges', judges: 'Judges',
  ruth: 'Ruth',
  '1 sam': '1 Samuel', '1 samuel': '1 Samuel',
  '2 sam': '2 Samuel', '2 samuel': '2 Samuel',
  '1 kings': '1 Kings', '1 kgs': '1 Kings',
  '2 kings': '2 Kings', '2 kgs': '2 Kings',
  '1 chron': '1 Chronicles', '1 chronicles': '1 Chronicles',
  '2 chron': '2 Chronicles', '2 chronicles': '2 Chronicles',
  ezra: 'Ezra',
  neh: 'Nehemiah', nehemiah: 'Nehemiah',
  esth: 'Esther', esther: 'Esther',
  job: 'Job',
  ps: 'Psalm', psa: 'Psalm', psalm: 'Psalm', psalms: 'Psalm',
  prov: 'Proverbs', proverbs: 'Proverbs',
  eccl: 'Ecclesiastes', ecclesiastes: 'Ecclesiastes',
  'song of solomon': 'Song of Solomon', 'song': 'Song of Solomon', 'sos': 'Song of Solomon',
  isa: 'Isaiah', isaiah: 'Isaiah',
  jer: 'Jeremiah', jeremiah: 'Jeremiah',
  lam: 'Lamentations', lamentations: 'Lamentations',
  ezek: 'Ezekiel', ezekiel: 'Ezekiel',
  dan: 'Daniel', daniel: 'Daniel',
  hos: 'Hosea', hosea: 'Hosea',
  joel: 'Joel',
  amos: 'Amos',
  obad: 'Obadiah', obadiah: 'Obadiah',
  jonah: 'Jonah',
  mic: 'Micah', micah: 'Micah',
  nah: 'Nahum', nahum: 'Nahum',
  hab: 'Habakkuk', habakkuk: 'Habakkuk',
  zeph: 'Zephaniah', zephaniah: 'Zephaniah',
  hag: 'Haggai', haggai: 'Haggai',
  zech: 'Zechariah', zechariah: 'Zechariah',
  mal: 'Malachi', malachi: 'Malachi',
  matt: 'Matthew', matthew: 'Matthew',
  mark: 'Mark',
  luke: 'Luke',
  john: 'John',
  acts: 'Acts',
  rom: 'Romans', romans: 'Romans',
  '1 cor': '1 Corinthians', '1 corinthians': '1 Corinthians',
  '2 cor': '2 Corinthians', '2 corinthians': '2 Corinthians',
  gal: 'Galatians', galatians: 'Galatians',
  eph: 'Ephesians', ephesians: 'Ephesians',
  phil: 'Philippians', philippians: 'Philippians',
  col: 'Colossians', colossians: 'Colossians',
  '1 thess': '1 Thessalonians', '1 thessalonians': '1 Thessalonians',
  '2 thess': '2 Thessalonians', '2 thessalonians': '2 Thessalonians',
  '1 tim': '1 Timothy', '1 timothy': '1 Timothy',
  '2 tim': '2 Timothy', '2 timothy': '2 Timothy',
  titus: 'Titus',
  philem: 'Philemon', philemon: 'Philemon',
  heb: 'Hebrews', hebrews: 'Hebrews',
  james: 'James', jas: 'James',
  '1 pet': '1 Peter', '1 peter': '1 Peter',
  '2 pet': '2 Peter', '2 peter': '2 Peter',
  '1 john': '1 John',
  '2 john': '2 John',
  '3 john': '3 John',
  jude: 'Jude',
  rev: 'Revelation', revelation: 'Revelation',
}

function normalizeBook(raw: string): string {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  return BOOK_ALIASES[lower] || trimmed
}

export function parseReference(ref: string): ParsedRef[] {
  if (!ref) return []

  const results: ParsedRef[] = []
  // Split on semicolons and slashes for multiple references
  const segments = ref.split(/[;/]/).map((s) => s.trim()).filter(Boolean)

  let lastBook = ''

  for (const segment of segments) {
    // Try to match: "Book Chapter:Verse" or "Chapter:Verse" (continuing previous book)
    // Book can start with a number like "1 John" or "2 Timothy"
    const fullMatch = segment.match(/^(\*?\s*\d?\s*[A-Za-z][A-Za-z\s.]*?)\s+(\d+):(\d+)/)
    const chapterOnlyMatch = segment.match(/^(\d+):(\d+)/)

    if (fullMatch) {
      const book = normalizeBook(fullMatch[1].replace(/^\*\s*/, ''))
      const chapter = parseInt(fullMatch[2])
      const verse = parseInt(fullMatch[3])
      lastBook = book
      results.push({book, chapter, startVerse: verse, raw: segment})
    } else if (chapterOnlyMatch && lastBook) {
      const chapter = parseInt(chapterOnlyMatch[1])
      const verse = parseInt(chapterOnlyMatch[2])
      results.push({book: lastBook, chapter, startVerse: verse, raw: segment})
    } else {
      // Try book + chapter only (no verse)
      const bookChapterMatch = segment.match(/^(\*?\s*\d?\s*[A-Za-z][A-Za-z\s.]*?)\s+(\d+)$/)
      if (bookChapterMatch) {
        const book = normalizeBook(bookChapterMatch[1].replace(/^\*\s*/, ''))
        const chapter = parseInt(bookChapterMatch[2])
        lastBook = book
        results.push({book, chapter, startVerse: null, raw: segment})
      }
    }
  }

  return results
}

/**
 * Generate all verse keys covered by a reference.
 * "John 14:2-4" → ["John 14:2", "John 14:3", "John 14:4"]
 * "John 14:2b"  → ["John 14:2"]
 * "John 14:2"   → ["John 14:2"]
 */
export function referenceKeys(ref: ParsedRef): string[] {
  if (ref.startVerse == null) {
    return [`${ref.book} ${ref.chapter}`]
  }

  // Check for a range like "2-4" in the raw text after the starting verse
  const rangeMatch = ref.raw.match(new RegExp(`${ref.startVerse}[a-z]?\\s*[-–]\\s*(\\d+)`))
  if (rangeMatch) {
    const endVerse = parseInt(rangeMatch[1])
    const keys: string[] = []
    for (let v = ref.startVerse; v <= endVerse; v++) {
      keys.push(`${ref.book} ${ref.chapter}:${v}`)
    }
    return keys
  }

  return [`${ref.book} ${ref.chapter}:${ref.startVerse}`]
}
