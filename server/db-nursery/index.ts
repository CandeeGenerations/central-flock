import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import path from 'path'
import {fileURLToPath} from 'url'

import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'nursery.db')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const nurseryDb = drizzle(sqlite, {schema})
export {schema as nurserySchema}

// Seed service config defaults
sqlite.exec(`
  INSERT OR IGNORE INTO nursery_service_config (service_type, label, worker_count, sort_order) VALUES
    ('sunday_school', 'Sunday School Service', 1, 1),
    ('morning', 'Morning Service', 2, 2),
    ('evening', 'Evening Service', 1, 3),
    ('wednesday_evening', 'Wednesday Evening Service', 2, 4)
`)

// Seed workers only if the table is empty (initial setup from April PDF)
const workerCount = sqlite.prepare('SELECT COUNT(*) as count FROM nursery_workers').get() as {count: number}
if (workerCount.count === 0) {
  const seedWorkers = [
    {
      name: 'Carissa Candee',
      maxPerMonth: 10,
      allowMultiplePerDay: 1,
      services: ['sunday_school', 'morning', 'evening', 'wednesday_evening'],
    },
    {name: 'Grace Ortiz', maxPerMonth: 3, allowMultiplePerDay: 0, services: ['morning']},
    {name: 'Angie Cobb', maxPerMonth: 2, allowMultiplePerDay: 0, services: ['morning']},
    {name: 'Kim Stewart', maxPerMonth: 2, allowMultiplePerDay: 0, services: ['evening']},
    {name: 'Yuny Mejia', maxPerMonth: 5, allowMultiplePerDay: 0, services: ['wednesday_evening']},
    {name: 'Debbie Scott', maxPerMonth: 4, allowMultiplePerDay: 0, services: ['wednesday_evening', 'morning']},
    {name: 'Grace Ngong', maxPerMonth: 2, allowMultiplePerDay: 0, services: ['morning']},
    {name: 'Evie Ross', maxPerMonth: 2, allowMultiplePerDay: 0, services: ['evening']},
    {name: 'Carla Mendez', maxPerMonth: 1, allowMultiplePerDay: 0, services: ['morning']},
  ]

  for (const w of seedWorkers) {
    const result = sqlite
      .prepare('INSERT INTO nursery_workers (name, max_per_month, allow_multiple_per_day) VALUES (?, ?, ?)')
      .run(w.name, w.maxPerMonth, w.allowMultiplePerDay)
    const workerId = result.lastInsertRowid
    for (const svc of w.services) {
      sqlite
        .prepare('INSERT OR IGNORE INTO nursery_worker_services (worker_id, service_type) VALUES (?, ?)')
        .run(workerId, svc)
    }
  }
}
