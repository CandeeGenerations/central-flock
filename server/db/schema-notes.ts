import {sql} from 'drizzle-orm'
import {type AnySQLiteColumn, index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const notesItems = sqliteTable(
  'notes_items',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    type: text('type', {enum: ['folder', 'note']}).notNull(),
    parentId: integer('parent_id').references((): AnySQLiteColumn => notesItems.id, {onDelete: 'cascade'}),
    title: text('title').notNull().default('Untitled'),
    // BlockNote Block[] as JSON (null for folders). M1: plain text. M2: BlockNote JSON.
    contentJson: text('content_json'),
    // Plain-text excerpt derived server-side from contentJson, for table row previews.
    excerpt: text('excerpt'),
    // Optional emoji icon (future polish, nullable for now).
    icon: text('icon'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('notes_items_parent_idx').on(t.parentId), index('notes_items_type_idx').on(t.type)],
)

export const notesAttachments = sqliteTable('notes_attachments', {
  id: integer('id').primaryKey({autoIncrement: true}),
  noteId: integer('note_id')
    .notNull()
    .references(() => notesItems.id, {onDelete: 'cascade'}),
  fileName: text('file_name').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})
