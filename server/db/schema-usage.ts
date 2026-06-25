import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

// Append-only log of route visits. Section rollups and entity labels are derived
// from `path` at read time (see server/services/usage-entity-resolver.ts), so the
// log stays maximally reinterpretable and reusable by future features.
export const routeVisits = sqliteTable(
  'route_visits',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    path: text('path').notNull(),
    visitedAt: text('visited_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('route_visits_visited_at_idx').on(t.visitedAt), index('route_visits_path_idx').on(t.path)],
)
