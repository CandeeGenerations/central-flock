/**
 * One-time import of existing quotes from the private tscandeequotes GitHub repo.
 * Uses local `gh` CLI auth — no PAT or env var required.
 *
 * Usage: pnpm tsx scripts/import-quotes.ts
 *
 * Fully idempotent: safe to re-run. Upserts on externalId.
 */
import {execFileSync} from 'child_process'
import {sql} from 'drizzle-orm'
import path from 'path'
import {fileURLToPath} from 'url'

// Bootstrap the DB (side-effect: ensures tables + FTS exist).
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {db, schema} = await import(path.join(__dirname, '..', 'server', 'db', 'index.js'))
const {parseQuoteMarkdown} = await import(path.join(__dirname, '..', 'server', 'services', 'quote-parser.js'))

const REPO = 'cgen01/tscandeequotes'

interface GhFile {
  name: string
  download_url: string
  url: string
  type: string
}

function ghApi(endpoint: string): unknown {
  const out = execFileSync('gh', ['api', endpoint, '--paginate'], {encoding: 'utf8'})
  // gh --paginate returns one JSON value per page; for arrays it emits multiple JSON arrays.
  // For simple endpoints it's a single JSON value.
  try {
    return JSON.parse(out)
  } catch {
    // Multiple JSON arrays — merge them
    const arrays = out
      .trim()
      .split(/\n(?=\[)/)
      .map((s) => JSON.parse(s) as unknown[])
    return arrays.flat()
  }
}

function fetchFileContent(contentsUrl: string): string {
  // contentsUrl is like /repos/owner/repo/contents/filename.md
  const data = ghApi(contentsUrl) as {content?: string; encoding?: string}
  if (!data.content) throw new Error(`No content field at ${contentsUrl}`)
  // GitHub returns base64 with newlines
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

console.log(`Fetching file list from ${REPO}...`)
const files = ghApi(`/repos/${REPO}/contents/`) as GhFile[]

const quoteFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('-quote.md'))
console.log(`Found ${quoteFiles.length} quote files.`)

let imported = 0
let updated = 0
let skipped = 0

for (const file of quoteFiles) {
  const externalId = file.name.replace(/\.md$/, '')
  try {
    const markdown = fetchFileContent(`/repos/${REPO}/contents/${file.name}`)
    const parsed = parseQuoteMarkdown(markdown, externalId, 'import')
    if (!parsed) {
      console.warn(`  SKIP (parse failed): ${file.name}`)
      skipped++
      continue
    }

    const existing = db
      .select({id: schema.quotes.id})
      .from(schema.quotes)
      .where(sql`${schema.quotes.externalId} = ${parsed.externalId}`)
      .get()

    db.insert(schema.quotes)
      .values({
        externalId: parsed.externalId,
        title: parsed.title,
        author: parsed.author,
        capturedBy: parsed.capturedBy,
        capturedAt: parsed.capturedAt,
        dateDisplay: parsed.dateDisplay,
        summary: parsed.summary,
        quoteText: parsed.quoteText,
        tags: JSON.stringify(parsed.tags),
        source: parsed.source,
      })
      .onConflictDoUpdate({
        target: schema.quotes.externalId,
        set: {
          title: parsed.title,
          author: parsed.author,
          capturedBy: parsed.capturedBy,
          capturedAt: parsed.capturedAt,
          dateDisplay: parsed.dateDisplay,
          summary: parsed.summary,
          quoteText: parsed.quoteText,
          tags: JSON.stringify(parsed.tags),
          updatedAt: sql`datetime('now')`,
        },
      })
      .run()

    if (existing) {
      updated++
    } else {
      imported++
    }
  } catch (err) {
    console.error(`  ERROR processing ${file.name}:`, err instanceof Error ? err.message : err)
    skipped++
  }
}

console.log(`\nDone. Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}`)
