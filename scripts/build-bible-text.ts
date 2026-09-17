/**
 * Builds the Bible Text (server/data/bible/akjv.json) from eBible.org's public-domain KJV
 * verse-per-line file. See server/data/bible/README.md and docs/adr/0039.
 *
 * Usage:
 *   curl -sSLO https://ebible.org/Scriptures/eng-kjv_vpl.zip && unzip eng-kjv_vpl.zip
 *   npx tsx scripts/build-bible-text.ts path/to/eng-kjv_vpl.txt
 *
 * Keeps the 66 books (drops the Apocrypha), unwraps italic supplied words ("I [am] with thee" →
 * "I am with thee"), and removes pilcrows.
 */
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'server', 'data', 'bible', 'akjv.json')

// eBible VPL book codes, in canon order, for the 66 books
const BOOKS: [string, string][] = [
  ['GEN', 'Genesis'],
  ['EXO', 'Exodus'],
  ['LEV', 'Leviticus'],
  ['NUM', 'Numbers'],
  ['DEU', 'Deuteronomy'],
  ['JOS', 'Joshua'],
  ['JDG', 'Judges'],
  ['RUT', 'Ruth'],
  ['1SA', '1 Samuel'],
  ['2SA', '2 Samuel'],
  ['1KI', '1 Kings'],
  ['2KI', '2 Kings'],
  ['1CH', '1 Chronicles'],
  ['2CH', '2 Chronicles'],
  ['EZR', 'Ezra'],
  ['NEH', 'Nehemiah'],
  ['EST', 'Esther'],
  ['JOB', 'Job'],
  ['PSA', 'Psalms'],
  ['PRO', 'Proverbs'],
  ['ECC', 'Ecclesiastes'],
  ['SOL', 'Song of Solomon'],
  ['ISA', 'Isaiah'],
  ['JER', 'Jeremiah'],
  ['LAM', 'Lamentations'],
  ['EZE', 'Ezekiel'],
  ['DAN', 'Daniel'],
  ['HOS', 'Hosea'],
  ['JOE', 'Joel'],
  ['AMO', 'Amos'],
  ['OBA', 'Obadiah'],
  ['JON', 'Jonah'],
  ['MIC', 'Micah'],
  ['NAH', 'Nahum'],
  ['HAB', 'Habakkuk'],
  ['ZEP', 'Zephaniah'],
  ['HAG', 'Haggai'],
  ['ZEC', 'Zechariah'],
  ['MAL', 'Malachi'],
  ['MAT', 'Matthew'],
  ['MAR', 'Mark'],
  ['LUK', 'Luke'],
  ['JOH', 'John'],
  ['ACT', 'Acts'],
  ['ROM', 'Romans'],
  ['1CO', '1 Corinthians'],
  ['2CO', '2 Corinthians'],
  ['GAL', 'Galatians'],
  ['EPH', 'Ephesians'],
  ['PHI', 'Philippians'],
  ['COL', 'Colossians'],
  ['1TH', '1 Thessalonians'],
  ['2TH', '2 Thessalonians'],
  ['1TI', '1 Timothy'],
  ['2TI', '2 Timothy'],
  ['TIT', 'Titus'],
  ['PHM', 'Philemon'],
  ['HEB', 'Hebrews'],
  ['JAM', 'James'],
  ['1PE', '1 Peter'],
  ['2PE', '2 Peter'],
  ['1JO', '1 John'],
  ['2JO', '2 John'],
  ['3JO', '3 John'],
  ['JUD', 'Jude'],
  ['REV', 'Revelation'],
]

const input = process.argv[2]
if (!input) {
  console.error('Usage: npx tsx scripts/build-bible-text.ts path/to/eng-kjv_vpl.txt')
  process.exit(1)
}

const byCode = new Map(BOOKS.map(([code, name]) => [code, {name, chapters: [] as string[][]}]))
let verseCount = 0

for (const line of fs.readFileSync(input, 'utf8').split('\n')) {
  const m = line.match(/^(\w{3}) (\d+):(\d+) (.*)$/)
  if (!m) continue
  const book = byCode.get(m[1])
  if (!book) continue // Apocrypha
  const chapter = parseInt(m[2])
  const verse = parseInt(m[3])
  const text = m[4]
    .replace(/¶/g, '')
    .replace(/[[\]]/g, '') // brackets can nest: 1 John 2:23 has "[[but] he that …]"
    .replace(/\s+/g, ' ')
    .trim()
  const verses = (book.chapters[chapter - 1] ??= [])
  if (verses.length !== verse - 1) throw new Error(`Out of order: ${line.slice(0, 20)}`)
  verses.push(text)
  verseCount++
}

for (const [, book] of byCode) {
  if (book.chapters.length === 0 || book.chapters.some((c) => !c?.length)) {
    throw new Error(`Missing chapters in ${book.name}`)
  }
}
if (verseCount !== 31102) throw new Error(`Expected 31102 verses, got ${verseCount}`)

fs.mkdirSync(path.dirname(OUT), {recursive: true})
fs.writeFileSync(OUT, JSON.stringify({books: [...byCode.values()]}))
console.log(`Wrote ${verseCount} verses in ${byCode.size} books → ${path.relative(process.cwd(), OUT)}`)
