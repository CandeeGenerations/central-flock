import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const notionPages = sqliteTable(
  'notion_pages',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id'),
    title: text('title').notNull(),
    icon: text('icon'),
    url: text('url').notNull(),
    isDatabase: integer('is_database', {mode: 'boolean'}).notNull().default(false),
    isFolder: integer('is_folder', {mode: 'boolean'}).notNull().default(false),
    lastEditedTime: text('last_edited_time').notNull(),
    syncedAt: text('synced_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('notion_pages_parent_idx').on(t.parentId)],
)
