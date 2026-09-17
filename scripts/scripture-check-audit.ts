/**
 * Read-only audit: runs the Scripture Check over every Gwendolyn Devotional — its current blocks
 * and, where it still has one, its re-parsed Original — and prints the Findings.
 *
 * Usage: npx tsx scripts/scripture-check-audit.ts [path/to/central-flock.db]
 */
import Database from 'better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import {parseDevotional} from '../server/services/gwendolyn-parse.js'
import {checkBlock} from '../server/services/scripture-check.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.argv[2] ?? path.join(__dirname, '..', 'central-flock.db')
const sqlite = new Database(dbPath, {readonly: true, fileMustExist: true})

type Block = {type: string; text: string; reference?: string; dismissals?: {kind: string; basis: string}[]}
const rows = sqlite
  .prepare('SELECT id, date, title, blocks, raw_input FROM gwendolyn_devotions ORDER BY date')
  .all() as {id: number; date: string; title: string; blocks: string; raw_input: string | null}[]

function report(label: string, blocks: Block[]): number {
  let open = 0
  for (const [i, b] of blocks.entries()) {
    if (b.type !== 'scripture') continue
    const prev = blocks[i - 1]
    const check = checkBlock({
      text: b.text,
      reference: b.reference ?? '',
      dismissals: b.dismissals as never,
      leadIn: prev?.type === 'point' ? prev.text : undefined,
    })
    const findings = check.findings.filter((f) => !f.dismissed)
    open += findings.length
    for (const f of findings) {
      console.log(
        `  ${label} [${b.reference || '—'}] ${f.kind}: ${f.message}${f.fix?.text ? `\n      → ${f.fix.text}` : ''}`,
      )
    }
  }
  return open
}

let total = 0
for (const row of rows) {
  console.log(`#${row.id} ${row.date} ${row.title}`)
  const open = report('current ', JSON.parse(row.blocks))
  total += open
  if (row.raw_input) report('original', parseDevotional(row.raw_input).blocks)
  if (!open) console.log('  current  ✅ all scripture matches')
}
console.log(`\n${rows.length} devotionals, ${total} open findings on current blocks`)
