import {and, eq} from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'

import {db, schema, sqlite} from '../server/db/index.js'
import {parseBlobToItems} from '../server/lib/normal-schedule-migrate.js'

const DEFAULT_SCHEDULE_KEY = 'calendar_print_default_schedule'

const DEFAULT_SCHEDULE_SEED = `Men's Prayer Time – **9:30 am**
Sunday School – **9:45 am**
Sunday Morning – **11:00 am**
Kids & Youth ALIVE – **5:00 pm**
Choir Practice – **5:30 pm**
Sunday Evening – **6:30 pm**
---
Wednesday Evening Bible Study & Prayer Time – **7:30 pm**

Saturday Cleaning – **9:00 am**
Saturday Visitation & Outreach – **10:00 am**`

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function main() {
  const reportLines: string[] = []
  const log = (s: string) => {
    console.log(s)
    reportLines.push(s)
  }

  log('# Normal Schedule migration report')
  log(`Run: ${new Date().toISOString()}`)
  log('')

  // 1. Default schedule
  const defaultRow = db.select().from(schema.settings).where(eq(schema.settings.key, DEFAULT_SCHEDULE_KEY)).get()
  const defaultBlob = defaultRow?.value ?? DEFAULT_SCHEDULE_SEED
  log(`## Default schedule (source: ${defaultRow ? 'settings table' : 'hard-coded seed'})`)
  const defaultItems = parseBlobToItems(defaultBlob)

  // wipe existing default rows (idempotent migrate)
  db.delete(schema.normalScheduleItems).where(eq(schema.normalScheduleItems.scopeType, 'default')).run()

  for (const it of defaultItems) {
    db.insert(schema.normalScheduleItems)
      .values({
        scopeType: 'default',
        scopeId: null,
        type: it.type,
        text: it.text,
        bold: it.bold,
        column: it.column,
        eligibleDays: it.eligibleDays,
        sortOrder: it.sortOrder,
      })
      .run()
    log(
      `  - [${it.type}] col${it.column} bold=${it.bold} days=${it.eligibleDays}: ${it.type === 'spacer' ? '(blank)' : it.text}`,
    )
  }
  log('')

  // 2. Per-page overrides
  // normal_schedule_text column may still exist; query via raw sql to avoid issues
  // when the column is later dropped.
  const pageOverrides = sqlite
    .prepare(
      `SELECT id, year, month, normal_schedule_text FROM calendar_print_pages WHERE normal_schedule_text IS NOT NULL AND normal_schedule_text != ''`,
    )
    .all() as {id: number; year: number; month: number; normal_schedule_text: string | null}[]
  log(`## Per-page overrides: ${pageOverrides.length} page(s)`)
  for (const p of pageOverrides) {
    log(`### Page ${p.year}-${String(p.month).padStart(2, '0')} (id=${p.id})`)
    const items = parseBlobToItems(p.normal_schedule_text ?? '')
    db.delete(schema.normalScheduleItems)
      .where(and(eq(schema.normalScheduleItems.scopeType, 'page'), eq(schema.normalScheduleItems.scopeId, p.id)))
      .run()
    for (const it of items) {
      db.insert(schema.normalScheduleItems)
        .values({
          scopeType: 'page',
          scopeId: p.id,
          type: it.type,
          text: it.text,
          bold: it.bold,
          column: it.column,
          eligibleDays: it.eligibleDays,
          sortOrder: it.sortOrder,
        })
        .run()
      log(
        `  - [${it.type}] col${it.column} bold=${it.bold} days=${it.eligibleDays}: ${it.type === 'spacer' ? '(blank)' : it.text}`,
      )
    }
  }
  log('')
  log('Done.')

  const reportDir = path.join(process.cwd(), 'data', 'migration-reports')
  fs.mkdirSync(reportDir, {recursive: true})
  const reportPath = path.join(reportDir, `normal-schedule-${timestamp()}.txt`)
  fs.writeFileSync(reportPath, reportLines.join('\n'))
  console.log(`\nReport written: ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
