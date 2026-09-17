/**
 * The Bible Text: the app's own copy of the AKJV (server/data/bible/akjv.json), looked up in code.
 * Shared across features. See CONTEXT.md and docs/adr/0039.
 *
 * Verses are addressed by a global index (Genesis 1:1 = 0, in canon order), so "adjacent" and
 * "contiguous" are plain integer comparisons. Text is compared as normalised words: lowercase,
 * no punctuation or apostrophes, and British spelling folded to American (honour = honor).
 */
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

export interface VerseKey {
  book: string
  chapter: number
  verse: number
}

export interface Token {
  norm: string
  raw: string
  start: number
  end: number
}

/** An exact or aligned run of Bible words, with the verses it covers (global indices, inclusive). */
export interface Occurrence {
  wordStart: number
  wordEnd: number // exclusive
  verseLo: number
  verseHi: number
}

export type AlignOp =
  | {op: 'same'; frag: number; bible: number}
  | {op: 'sub'; frag: number; bible: number}
  | {op: 'del'; frag: number}
  | {op: 'ins'; bible: number}

export interface Alignment extends Occurrence {
  ops: AlignOp[]
  matches: number
}

export type ResolveFailure = 'unparseable' | 'unknown-book' | 'no-such-chapter' | 'no-such-verse' | 'bad-range'

export type Resolved =
  {ok: true; canonical: string; verses: number[]} | {ok: false; reason: ResolveFailure; message: string}

// ---------------------------------------------------------------------------
// Data + index (lazy)

interface Book {
  name: string
  chapters: string[][]
  firstVerse: number[] // global index of each chapter's verse 1
}

interface BibleIndex {
  books: Book[]
  byAlias: Map<string, number>
  verseBook: Int16Array
  verseChapter: Int16Array
  verseNumber: Int16Array
  verseText: string[]
  words: string[]
  wordRaw: string[]
  wordVerse: Int32Array
  verseFirstWord: Int32Array // length = verses + 1
  positions: Map<string, number[]>
}

const DATA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bible', 'akjv.json')

let index: BibleIndex | null = null

function bible(): BibleIndex {
  if (index) return index
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as {books: {name: string; chapters: string[][]}[]}

  const books: Book[] = []
  const verseBook: number[] = []
  const verseChapter: number[] = []
  const verseNumber: number[] = []
  const verseText: string[] = []
  const words: string[] = []
  const wordRaw: string[] = []
  const wordVerse: number[] = []
  const verseFirstWord: number[] = []
  const positions = new Map<string, number[]>()

  data.books.forEach((b, bi) => {
    const firstVerse: number[] = []
    b.chapters.forEach((verses, ci) => {
      firstVerse.push(verseText.length)
      verses.forEach((text, vi) => {
        const v = verseText.length
        verseBook.push(bi)
        verseChapter.push(ci + 1)
        verseNumber.push(vi + 1)
        verseText.push(text)
        verseFirstWord.push(words.length)
        for (const t of tokenize(text)) {
          let list = positions.get(t.norm)
          if (!list) positions.set(t.norm, (list = []))
          list.push(words.length)
          words.push(t.norm)
          wordRaw.push(t.raw)
          wordVerse.push(v)
        }
      })
    })
    books.push({name: b.name, chapters: b.chapters, firstVerse})
  })
  verseFirstWord.push(words.length)

  index = {
    books,
    byAlias: buildAliases(books),
    verseBook: Int16Array.from(verseBook),
    verseChapter: Int16Array.from(verseChapter),
    verseNumber: Int16Array.from(verseNumber),
    verseText,
    words,
    wordRaw,
    wordVerse: Int32Array.from(wordVerse),
    verseFirstWord: Int32Array.from(verseFirstWord),
    positions,
  }
  return index
}

// ---------------------------------------------------------------------------
// Normalisation

const BRITISH_OUR = [
  'ardour',
  'armour',
  'behaviour',
  'candour',
  'clamour',
  'colour',
  'endeavour',
  'favour',
  'fervour',
  'harbour',
  'honour',
  'humour',
  'labour',
  'neighbour',
  'odour',
  'parlour',
  'rigour',
  'rumour',
  'saviour',
  'savour',
  'splendour',
  'succour',
  'valour',
  'vapour',
]

export function normalizeWord(word: string): string {
  const w = word.toLowerCase().replace(/['’‘]/g, '')
  for (const stem of BRITISH_OUR) {
    if (w.startsWith(stem)) return stem.slice(0, -2) + 'r' + w.slice(stem.length)
  }
  return w
}

/** Words with their character spans, so a fix can edit the original string in place. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const m of text.matchAll(/[A-Za-z0-9]+(?:['’‘][A-Za-z0-9]+)*/g)) {
    const norm = normalizeWord(m[0])
    if (norm) tokens.push({norm, raw: m[0], start: m.index, end: m.index + m[0].length})
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Books and references

// Abbreviations beyond the full name. Numbered books list the stem once; "1 ", "2 ", "3 " are added.
const ALIASES: Record<string, string[]> = {
  Genesis: ['gen', 'ge', 'gn'],
  Exodus: ['exod', 'exo', 'ex'],
  Leviticus: ['lev', 'le', 'lv'],
  Numbers: ['num', 'nu', 'nm', 'numb'],
  Deuteronomy: ['deut', 'deu', 'dt'],
  Joshua: ['josh', 'jos'],
  Judges: ['judg', 'jdg', 'jg'],
  Ruth: ['ru', 'rth'],
  Samuel: ['sam', 'sa', 'sm'],
  Kings: ['kgs', 'ki', 'kin', 'king'],
  Chronicles: ['chron', 'chr', 'ch'],
  Ezra: ['ezr'],
  Nehemiah: ['neh', 'ne'],
  Esther: ['esth', 'est', 'es'],
  Job: ['jb'],
  Psalms: ['psalm', 'ps', 'psa', 'pss', 'psm'],
  Proverbs: ['prov', 'pro', 'pr', 'prv', 'proverb'],
  Ecclesiastes: ['eccl', 'ecc', 'eccles', 'ec', 'qoh'],
  'Song of Solomon': ['song', 'song of songs', 'sos', 'song of sol', 'canticles', 'ss'],
  Isaiah: ['isa', 'is'],
  Jeremiah: ['jer', 'je', 'jr'],
  Lamentations: ['lam', 'la'],
  Ezekiel: ['ezek', 'eze', 'ezk'],
  Daniel: ['dan', 'da', 'dn'],
  Hosea: ['hos', 'ho'],
  Joel: ['jl'],
  Amos: ['am'],
  Obadiah: ['obad', 'ob'],
  Jonah: ['jon', 'jnh'],
  Micah: ['mic', 'mc'],
  Nahum: ['nah', 'na'],
  Habakkuk: ['hab', 'hb'],
  Zephaniah: ['zeph', 'zep', 'zp'],
  Haggai: ['hag', 'hg'],
  Zechariah: ['zech', 'zec', 'zc'],
  Malachi: ['mal', 'ml'],
  Matthew: ['matt', 'mat', 'mt'],
  Mark: ['mk', 'mrk', 'mar'],
  Luke: ['lk', 'luk'],
  John: ['jn', 'jhn', 'joh'],
  Acts: ['ac', 'act'],
  Romans: ['rom', 'ro', 'rm'],
  Corinthians: ['cor', 'co'],
  Galatians: ['gal', 'ga'],
  Ephesians: ['eph', 'ephes'],
  Philippians: ['phil', 'php', 'pp'],
  Colossians: ['col'],
  Thessalonians: ['thess', 'thes', 'th'],
  Timothy: ['tim', 'ti'],
  Titus: ['tit'],
  Philemon: ['philem', 'phm', 'phlm'],
  Hebrews: ['heb'],
  James: ['jas', 'jm', 'jam'],
  Peter: ['pet', 'pe', 'pt'],
  Jude: ['jud', 'jd'],
  Revelation: ['rev', 're', 'revelations'],
}

function buildAliases(books: Book[]): Map<string, number> {
  const map = new Map<string, number>()
  books.forEach((b, i) => {
    map.set(b.name.toLowerCase(), i)
    const m = b.name.match(/^([123]) (.+)$/)
    const stem = m ? m[2] : b.name
    const alt = ALIASES[stem]
    if (alt) {
      if (m) {
        map.set(`${m[1]} ${stem.toLowerCase()}`, i)
        for (const a of alt) map.set(`${m[1]} ${a}`, i)
      } else {
        for (const a of alt) map.set(a, i)
      }
    }
  })
  // "1 Jo" is common for the epistles but would be ambiguous for the gospel, so it is numbered-only
  for (const n of ['1', '2', '3']) map.set(`${n} jo`, map.get(`${n} john`)!)
  return map
}

function lookupBook(raw: string): number | undefined {
  const key = raw
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(first|1st|i)\s+/, '1 ')
    .replace(/^(second|2nd|ii)\s+/, '2 ')
    .replace(/^(third|3rd|iii)\s+/, '3 ')
    .replace(/^([123])\s*(?=[a-z])/, '$1 ')
  return bible().byAlias.get(key)
}

export function isBookName(raw: string): boolean {
  return lookupBook(raw) !== undefined
}

/** Resolvable, or at least shaped like a reference — "Proverbs 25:29" still counts, so it can be flagged. */
export function looksLikeReference(ref: string): boolean {
  const r = resolveReference(ref)
  return r.ok || r.reason === 'no-such-chapter' || r.reason === 'no-such-verse' || r.reason === 'bad-range'
}

/**
 * The last reference named in prose — "Proverbs 3:13 reminds us," → "Proverbs 3:13". Needs a
 * chapter:verse, so a bare "Psalm 23" in a sentence is not mistaken for one.
 */
export function findReferenceIn(text: string): string | null {
  let found: string | null = null
  for (const m of text.matchAll(/(\d+:\d+[ab]?(?:\s*[-–]\s*\d+(?::\d+)?[ab]?)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)/g)) {
    const words = text.slice(0, m.index).trimEnd().split(/\s+/)
    for (let k = Math.min(4, words.length); k >= 1; k--) {
      const book = words
        .slice(-k)
        .join(' ')
        .replace(/^[("“”'‘’—–-]+/, '')
        .trim()
      if (book && isBookName(book) && looksLikeReference(`${book} ${m[1]}`)) {
        found = `${book} ${m[1]}`
        break
      }
    }
  }
  return found
}

interface Segment {
  book: number
  chapter: number
  verse: number | null // null = whole chapter(s)
  suffix: string
  endChapter: number
  endVerse: number | null
  endSuffix: string
}

const fail = (reason: ResolveFailure, message: string): Resolved => ({ok: false, reason, message})

export function resolveReference(ref: string): Resolved {
  const b = bible()
  const cleaned = ref
    .trim()
    .replace(/\s*\(?\b(?:a?kjv)\)?\s*$/i, '')
    .replace(/[–—]/g, '-')
  if (!cleaned) return fail('unparseable', 'No reference')

  const segments: Segment[] = []
  let lastBook: number | null = null
  for (const rawSeg of cleaned.split(';')) {
    const seg = rawSeg.trim()
    if (!seg) return fail('unparseable', `Can't read "${ref}"`)
    let book: number | null = lastBook
    let nums = seg
    const m = seg.match(/^(.*?[A-Za-z].*?)\s*(\d[\d\s:,\-ab]*)$/)
    if (m) {
      const found = lookupBook(m[1])
      if (found === undefined) return fail('unknown-book', `No book called "${m[1].trim()}"`)
      book = found
      nums = m[2]
    }
    if (book === null || !/^\d/.test(nums)) return fail('unparseable', `Can't read "${ref}"`)
    lastBook = book

    let curChapter: number | null = null
    for (const rawPart of nums.split(',')) {
      const part = rawPart.trim()
      const cv = part.match(/^(\d+):(\d+)([ab])?(?:\s*-\s*(?:(\d+):)?(\d+)([ab])?)?$/)
      const n = part.match(/^(\d+)([ab])?(?:\s*-\s*(\d+)([ab])?)?$/)
      if (cv) {
        const chapter = parseInt(cv[1])
        const verse = parseInt(cv[2])
        const endChapter = cv[4] ? parseInt(cv[4]) : chapter
        const endVerse = cv[5] ? parseInt(cv[5]) : verse
        segments.push({
          book,
          chapter,
          verse,
          suffix: cv[3] ?? '',
          endChapter,
          endVerse,
          endSuffix: cv[5] ? (cv[6] ?? '') : (cv[3] ?? ''),
        })
        curChapter = endChapter
      } else if (n && curChapter !== null) {
        const verse = parseInt(n[1])
        const endVerse = n[3] ? parseInt(n[3]) : verse
        segments.push({
          book,
          chapter: curChapter,
          verse,
          suffix: n[2] ?? '',
          endChapter: curChapter,
          endVerse,
          endSuffix: n[3] ? (n[4] ?? '') : (n[2] ?? ''),
        })
      } else if (n && !n[2] && !n[4]) {
        const chapter = parseInt(n[1])
        const endChapter = n[3] ? parseInt(n[3]) : chapter
        segments.push({book, chapter, verse: null, suffix: '', endChapter, endVerse: null, endSuffix: ''})
      } else {
        return fail('unparseable', `Can't read "${ref}"`)
      }
    }
  }

  const verses: number[] = []
  for (const s of segments) {
    const bk = b.books[s.book]
    for (const [c, v] of [
      [s.chapter, s.verse],
      [s.endChapter, s.endVerse],
    ] as const) {
      if (c < 1 || c > bk.chapters.length) {
        return fail('no-such-chapter', `${displayBook(bk.name, true)} has ${bk.chapters.length} chapters`)
      }
      if (v !== null && (v < 1 || v > bk.chapters[c - 1].length)) {
        return fail('no-such-verse', `${displayBook(bk.name, true)} ${c} has ${bk.chapters[c - 1].length} verses`)
      }
    }
    const lo = bk.firstVerse[s.chapter - 1] + (s.verse ?? 1) - 1
    const hi = bk.firstVerse[s.endChapter - 1] + (s.endVerse ?? bk.chapters[s.endChapter - 1].length) - 1
    if (hi < lo) return fail('bad-range', `"${ref}" runs backwards`)
    for (let v = lo; v <= hi; v++) verses.push(v)
  }

  return {ok: true, canonical: formatSegments(segments), verses}
}

function displayBook(name: string, singleChapter: boolean): string {
  return name === 'Psalms' && singleChapter ? 'Psalm' : name
}

function formatSegments(segments: Segment[]): string {
  const b = bible()
  let out = ''
  let prev: Segment | null = null
  for (const s of segments) {
    const versePart = (v: number | null, suf: string) => `${v}${suf}`
    const spec =
      s.verse === null
        ? `${s.chapter}${s.endChapter !== s.chapter ? `-${s.endChapter}` : ''}`
        : `${s.chapter}:${versePart(s.verse, s.suffix)}` +
          (s.endChapter !== s.chapter
            ? `-${s.endChapter}:${versePart(s.endVerse, s.endSuffix)}`
            : s.endVerse !== s.verse || s.endSuffix !== s.suffix
              ? `-${versePart(s.endVerse, s.endSuffix)}`
              : '')
    if (!prev || prev.book !== s.book) {
      const name = displayBook(b.books[s.book].name, s.chapter === s.endChapter)
      out += `${out ? '; ' : ''}${name} ${spec}`
    } else if (s.verse !== null && prev.verse !== null && prev.endChapter === s.chapter && s.endChapter === s.chapter) {
      out += `, ${versePart(s.verse, s.suffix)}${s.endVerse !== s.verse ? `-${versePart(s.endVerse, s.endSuffix)}` : ''}`
    } else {
      out += `; ${spec}`
    }
    prev = s
  }
  return out
}

/** Canonical reference for a set of verses: contiguous runs become ranges. */
export function referenceFromVerses(verses: Iterable<number>): string {
  const b = bible()
  const sorted = [...new Set(verses)].sort((x, y) => x - y)
  const segments: Segment[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (
      j + 1 < sorted.length &&
      sorted[j + 1] === sorted[j] + 1 &&
      b.verseBook[sorted[j + 1]] === b.verseBook[sorted[i]]
    ) {
      j++
    }
    const lo = sorted[i]
    const hi = sorted[j]
    segments.push({
      book: b.verseBook[lo],
      chapter: b.verseChapter[lo],
      verse: b.verseNumber[lo],
      suffix: '',
      endChapter: b.verseChapter[hi],
      endVerse: b.verseNumber[hi],
      endSuffix: '',
    })
    i = j + 1
  }
  return formatSegments(segments)
}

export function verseKey(v: number): VerseKey {
  const b = bible()
  return {book: b.books[b.verseBook[v]].name, chapter: b.verseChapter[v], verse: b.verseNumber[v]}
}

export function verseText(v: number): string {
  return bible().verseText[v]
}

export function sameBook(a: number, b: number): boolean {
  const idx = bible()
  return idx.verseBook[a] === idx.verseBook[b]
}

export function verseCount(): number {
  return bible().verseText.length
}

// ---------------------------------------------------------------------------
// Searching

const MAX_OCCURRENCES = 400

/** Every place the word sequence appears verbatim (after normalisation), optionally within verses lo..hi. */
export function findExact(words: string[], within?: {lo: number; hi: number}): Occurrence[] {
  const b = bible()
  if (words.length === 0) return []
  let anchor = 0
  let anchorList: number[] | undefined
  for (let k = 0; k < words.length; k++) {
    const list = b.positions.get(words[k])
    if (!list) return []
    if (!anchorList || list.length < anchorList.length) {
      anchorList = list
      anchor = k
    }
  }
  const lowWord = within ? b.verseFirstWord[within.lo] : 0
  const highWord = within ? b.verseFirstWord[within.hi + 1] : b.words.length
  const out: Occurrence[] = []
  for (const p of anchorList!) {
    const s = p - anchor
    if (s < lowWord || s + words.length > highWord) continue
    let ok = true
    for (let k = 0; k < words.length; k++) {
      if (b.words[s + k] !== words[k]) {
        ok = false
        break
      }
    }
    if (ok) {
      out.push({
        wordStart: s,
        wordEnd: s + words.length,
        verseLo: b.wordVerse[s],
        verseHi: b.wordVerse[s + words.length - 1],
      })
      if (out.length >= MAX_OCCURRENCES) break
    }
  }
  return out
}

/**
 * Fitting alignment: the whole fragment against the best-matching stretch of verses lo..hi. Bible
 * words before and after that stretch are free, so a fix never widens what she chose to quote.
 */
export function align(words: string[], lo: number, hi: number): Alignment | null {
  const b = bible()
  const ws = b.verseFirstWord[lo]
  const we = b.verseFirstWord[hi + 1]
  const m = words.length
  const n = we - ws
  if (m === 0 || n === 0) return null
  const MATCH = 2
  const SUB = -1
  const GAP = -2
  const score = new Float64Array((m + 1) * (n + 1))
  const at = (i: number, j: number) => i * (n + 1) + j
  for (let i = 1; i <= m; i++) score[at(i, 0)] = i * GAP
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const diag = score[at(i - 1, j - 1)] + (words[i - 1] === b.words[ws + j - 1] ? MATCH : SUB)
      score[at(i, j)] = Math.max(diag, score[at(i - 1, j)] + GAP, score[at(i, j - 1)] + GAP)
    }
  }
  let bestJ = 1
  for (let j = 1; j <= n; j++) if (score[at(m, j)] > score[at(m, bestJ)]) bestJ = j

  const ops: AlignOp[] = []
  let i = m
  let j = bestJ
  let matches = 0
  while (i > 0) {
    const cur = score[at(i, j)]
    if (j > 0) {
      const same = words[i - 1] === b.words[ws + j - 1]
      if (cur === score[at(i - 1, j - 1)] + (same ? MATCH : SUB)) {
        ops.push({op: same ? 'same' : 'sub', frag: i - 1, bible: ws + j - 1})
        if (same) matches++
        i--
        j--
        continue
      }
      if (cur === score[at(i, j - 1)] + GAP) {
        ops.push({op: 'ins', bible: ws + j - 1})
        j--
        continue
      }
    }
    ops.push({op: 'del', frag: i - 1})
    i--
  }
  ops.reverse()
  const bibleIdx = ops.filter((o): o is Extract<AlignOp, {bible: number}> => 'bible' in o).map((o) => o.bible)
  if (bibleIdx.length === 0) return null
  const wordStart = bibleIdx[0]
  const wordEnd = bibleIdx[bibleIdx.length - 1] + 1
  return {ops, matches, wordStart, wordEnd, verseLo: b.wordVerse[wordStart], verseHi: b.wordVerse[wordEnd - 1]}
}

/** Close enough to call it the same passage misquoted, rather than a different passage. */
export function isClose(a: Alignment, fragLength: number): boolean {
  return a.matches >= 2 && a.matches / fragLength >= 0.6
}

/**
 * Where a misquoted fragment probably comes from: verses voted for by its exact three-word runs,
 * each then aligned. Returns close alignments, best first.
 */
export function findFuzzy(words: string[], limit = 5): Alignment[] {
  const b = bible()
  if (words.length < 3) return []
  const votes = new Map<number, number>()
  for (let k = 0; k + 3 <= words.length; k++) {
    const occ = findExact(words.slice(k, k + 3))
    if (occ.length === 0 || occ.length > 200) continue
    for (const o of occ) votes.set(o.verseLo, (votes.get(o.verseLo) ?? 0) + 1)
  }
  const top = [...votes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)
  const results: Alignment[] = []
  const seen = new Set<string>()
  for (const [v] of top) {
    let lo = v
    let hi = v
    if (v > 0 && b.verseBook[v - 1] === b.verseBook[v]) lo = v - 1
    if (v + 1 < b.verseText.length && b.verseBook[v + 1] === b.verseBook[v]) hi = v + 1
    const a = align(words, lo, hi)
    if (!a || !isClose(a, words.length)) continue
    const key = `${a.wordStart}-${a.wordEnd}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(a)
  }
  return results.sort((x, y) => y.matches - x.matches).slice(0, limit)
}

export function bibleWord(i: number): string {
  return bible().wordRaw[i]
}
