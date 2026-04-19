/**
 * Load data/hymns-seed.json into hymns.db. Idempotent — upserts on (book, number).
 *
 * Usage: npx tsx scripts/load-hymns.ts
 */
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_PATH = path.join(__dirname, '..', 'data', 'hymns-seed.json')

// Side-effect import: creates hymns.db and tables if missing.
const {hymnsSqlite} = await import(path.join(__dirname, '..', 'server', 'db-hymns', 'index.js'))

interface SeedEntry {
  book: 'burgundy' | 'silver'
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

function main(): void {
  if (!fs.existsSync(SEED_PATH)) {
    console.error(`Missing seed file: ${SEED_PATH}`)
    console.error(`Run \`npx tsx scripts/extract-hymns.ts\` first.`)
    process.exit(1)
  }

  const entries = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as SeedEntry[]
  console.log(`Loading ${entries.length} hymns from ${SEED_PATH}...`)

  const upsert = hymnsSqlite.prepare(`
    INSERT INTO hymns (book, number, title, first_line, refrain_line, author, composer, tune, meter, topics, scripture_refs, notes)
    VALUES (@book, @number, @title, @firstLine, @refrainLine, @author, @composer, @tune, @meter, @topics, @scriptureRefs, @notes)
    ON CONFLICT(book, number) DO UPDATE SET
      title = excluded.title,
      first_line = excluded.first_line,
      refrain_line = excluded.refrain_line,
      author = excluded.author,
      composer = excluded.composer,
      tune = excluded.tune,
      meter = excluded.meter,
      topics = excluded.topics,
      scripture_refs = excluded.scripture_refs,
      notes = excluded.notes
  `)

  const tx = hymnsSqlite.transaction((rows: SeedEntry[]) => {
    for (const r of rows) {
      upsert.run({
        book: r.book,
        number: r.number,
        title: r.title,
        firstLine: r.firstLine ?? null,
        refrainLine: r.refrainLine ?? null,
        author: r.author ?? null,
        composer: r.composer ?? null,
        tune: r.tune ?? null,
        meter: r.meter ?? null,
        topics: JSON.stringify(r.topics ?? []),
        scriptureRefs: JSON.stringify(r.scriptureRefs ?? []),
        notes: r.notes ?? null,
      })
    }
  })

  tx(entries)

  const counts = hymnsSqlite.prepare(`SELECT book, COUNT(*) AS count FROM hymns GROUP BY book ORDER BY book`).all() as {
    book: string
    count: number
  }[]
  const summary = counts.map((c) => `${c.count} ${c.book}`).join(', ')
  console.log(`Loaded: ${summary}`)
}

main()
