/**
 * Extract hymn metadata from the Burgundy and Silver hymnal index PDFs using Claude.
 * Writes `data/hymns-seed.json` for later loading via `scripts/load-hymns.ts`.
 *
 * Usage:
 *   npx tsx scripts/extract-hymns.ts          # skip if data/hymns-seed.json exists
 *   npx tsx scripts/extract-hymns.ts --force  # re-extract, overwrite
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 *
 * The PDFs must live at:
 *   data/Burgandy Book.pdf
 *   data/Silver Book.pdf
 *
 * The script walks each hymnal by hymn-number ranges (100 at a time) so individual
 * Claude calls stay well under max_tokens. Partial failures are logged to
 * data/hymns-seed.errors.log and skipped; a re-run with --force retries everything.
 */
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const SEED_PATH = path.join(DATA_DIR, 'hymns-seed.json')
const ERROR_LOG_PATH = path.join(DATA_DIR, 'hymns-seed.errors.log')

interface ExtractedHymn {
  number: number
  title: string
  firstLine?: string
  refrainLine?: string
  author?: string
  composer?: string
  tune?: string
  meter?: string
  topics?: string[]
  scriptureRefs?: string[]
  notes?: string
}

interface SeedEntry extends ExtractedHymn {
  book: 'burgundy' | 'silver'
}

interface BookConfig {
  book: 'burgundy' | 'silver'
  pdfPath: string
  displayName: string
  // Inclusive number ranges to ask Claude to extract, one chunk per request
  chunks: Array<[number, number]>
}

const BOOKS: BookConfig[] = [
  {
    book: 'burgundy',
    pdfPath: path.join(DATA_DIR, 'Burgandy Book.pdf'),
    displayName: 'Burgundy Book',
    chunks: [
      [1, 100],
      [101, 200],
      [201, 300],
      [301, 400],
      [401, 500],
      [501, 600],
    ],
  },
  {
    book: 'silver',
    pdfPath: path.join(DATA_DIR, 'Silver Book.pdf'),
    displayName: 'Silver Book',
    chunks: [[1, 150]],
  },
]

const SYSTEM_PROMPT = `You are extracting hymn metadata from the indices of a printed hymnal PDF.
Return ONLY a JSON object with shape: {"hymns": [...]} — no markdown, no code fences, no prose.

Per-entry schema (omit any field you don't have a value for — never invent):
{
  "number": 145,
  "title": "Amazing Grace",
  "firstLine": "Amazing grace, how sweet the sound",
  "refrainLine": "...",
  "author": "John Newton",
  "composer": "Traditional American melody",
  "tune": "NEW BRITAIN",
  "meter": "CM",
  "topics": ["grace", "salvation"],
  "scriptureRefs": ["Ephesians 2:8-9"],
  "notes": "invitation-suitable"
}

Rules:
- Do not invent hymns. Only return hymns actually printed in the PDF.
- Do not quote more than the first line of verse 1 or the first line of the refrain. No full verses. No full refrains. Copyright rules require short excerpts only.
- If a topical index or scripture index is present in the PDF, populate "topics" and "scriptureRefs" from those indexes where the song is listed.
- The "notes" field is for flags the index explicitly calls out (e.g. "invitation hymn", "gospel song", "chorus only").`

function loadExistingSeed(): SeedEntry[] | null {
  if (!fs.existsSync(SEED_PATH)) return null
  try {
    return JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as SeedEntry[]
  } catch {
    return null
  }
}

function logError(label: string, detail: string): void {
  fs.appendFileSync(ERROR_LOG_PATH, `[${new Date().toISOString()}] ${label}\n${detail}\n\n`)
}

async function callClaudeForChunk(
  client: Anthropic,
  model: string,
  book: BookConfig,
  pdfBase64: string,
  range: [number, number],
): Promise<ExtractedHymn[]> {
  const [lo, hi] = range
  const userText = `This is the ${book.displayName} hymnal. Extract every hymn or song entry whose printed number is between ${lo} and ${hi} (inclusive). If the hymnal tops out before ${hi}, just return whatever entries exist up to that point. Output the JSON object described in the system prompt.`

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
            cache_control: {type: 'ephemeral'},
          },
          {
            type: 'text',
            text: userText,
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')
  const raw = textBlock.text.trim()
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let parsed: {hymns?: unknown}
  try {
    parsed = JSON.parse(cleaned) as {hymns?: unknown}
  } catch (err) {
    throw new Error(`non-JSON response: ${(err as Error).message}\nRAW:\n${raw.slice(0, 2000)}`, {cause: err})
  }

  if (!Array.isArray(parsed.hymns)) {
    throw new Error(`response missing "hymns" array. Got keys: ${Object.keys(parsed).join(', ')}`)
  }

  const valid: ExtractedHymn[] = []
  for (const row of parsed.hymns) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const number = typeof r.number === 'number' ? r.number : parseInt(String(r.number))
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    if (!Number.isFinite(number) || !title) continue
    valid.push({
      number,
      title,
      firstLine: typeof r.firstLine === 'string' ? r.firstLine : undefined,
      refrainLine: typeof r.refrainLine === 'string' ? r.refrainLine : undefined,
      author: typeof r.author === 'string' ? r.author : undefined,
      composer: typeof r.composer === 'string' ? r.composer : undefined,
      tune: typeof r.tune === 'string' ? r.tune : undefined,
      meter: typeof r.meter === 'string' ? r.meter : undefined,
      topics: Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === 'string') : undefined,
      scriptureRefs: Array.isArray(r.scriptureRefs)
        ? r.scriptureRefs.filter((t): t is string => typeof t === 'string')
        : undefined,
      notes: typeof r.notes === 'string' ? r.notes : undefined,
    })
  }
  return valid
}

async function extractBook(client: Anthropic, model: string, book: BookConfig): Promise<SeedEntry[]> {
  console.log(`\n=== ${book.displayName} (${book.book}) ===`)
  if (!fs.existsSync(book.pdfPath)) {
    console.error(`  MISSING PDF: ${book.pdfPath} — drop the file there and re-run.`)
    logError(`${book.book} missing PDF`, `Expected at ${book.pdfPath}`)
    return []
  }

  const pdfBuffer = fs.readFileSync(book.pdfPath)
  const pdfBase64 = pdfBuffer.toString('base64')
  console.log(`  PDF loaded: ${(pdfBuffer.length / 1024).toFixed(0)} KB`)

  const byNumber = new Map<number, ExtractedHymn>()

  for (const range of book.chunks) {
    const label = `${book.book} ${range[0]}-${range[1]}`
    let lastErr: Error | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`  chunk ${label} attempt ${attempt}...`)
        const entries = await callClaudeForChunk(client, model, book, pdfBase64, range)
        console.log(`    got ${entries.length} entries`)
        for (const e of entries) {
          const existing = byNumber.get(e.number)
          // First-write-wins, but merge topics/scriptureRefs if later chunks provide richer data
          if (!existing) {
            byNumber.set(e.number, e)
          } else {
            byNumber.set(e.number, {
              ...existing,
              topics: dedupeStrings([...(existing.topics ?? []), ...(e.topics ?? [])]),
              scriptureRefs: dedupeStrings([...(existing.scriptureRefs ?? []), ...(e.scriptureRefs ?? [])]),
            })
          }
        }
        lastErr = null
        break
      } catch (err) {
        lastErr = err as Error
        const wait = [1000, 4000, 10000][attempt - 1] ?? 10000
        console.warn(`    attempt ${attempt} failed: ${(err as Error).message}`)
        if (attempt < 3) await sleep(wait)
      }
    }
    if (lastErr) {
      console.error(`  chunk ${label} FAILED after 3 attempts — logged and skipping`)
      logError(`${label} failed`, lastErr.message)
    }
  }

  const entries: SeedEntry[] = [...byNumber.values()]
    .sort((a, b) => a.number - b.number)
    .map((e) => ({...e, book: book.book}))
  console.log(`  ${book.book}: ${entries.length} unique hymns extracted`)
  return entries
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of arr) {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(s.trim())
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const existing = loadExistingSeed()
  if (existing && !force) {
    console.log(`hymns-seed.json already exists (${existing.length} entries). Pass --force to re-extract.`)
    process.exit(0)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set.')
    process.exit(1)
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true})
  if (fs.existsSync(ERROR_LOG_PATH)) fs.unlinkSync(ERROR_LOG_PATH)

  const client = new Anthropic({apiKey})
  const model = process.env.HYMN_EXTRACT_MODEL ?? 'claude-sonnet-4-20250514'
  console.log(`Using model: ${model}`)

  const all: SeedEntry[] = []
  for (const book of BOOKS) {
    const entries = await extractBook(client, model, book)
    all.push(...entries)
  }

  fs.writeFileSync(SEED_PATH, JSON.stringify(all, null, 2), 'utf-8')
  console.log(`\nWrote ${all.length} entries to ${SEED_PATH}`)
  if (fs.existsSync(ERROR_LOG_PATH)) {
    console.log(`(see ${ERROR_LOG_PATH} for failed chunks)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
