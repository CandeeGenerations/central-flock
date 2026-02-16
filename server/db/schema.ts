import {sql} from 'drizzle-orm'
import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const people = sqliteTable('people', {
  id: integer('id').primaryKey({autoIncrement: true}),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phoneNumber: text('phone_number').notNull().unique(),
  phoneDisplay: text('phone_display'),
  status: text('status', {enum: ['active', 'inactive', 'do_not_contact']})
    .default('active')
    .notNull(),
  notes: text('notes'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const peopleGroups = sqliteTable(
  'people_groups',
  {
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, {onDelete: 'cascade'}),
  },
  (table) => [primaryKey({columns: [table.personId, table.groupId]})],
)

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({autoIncrement: true}),
  content: text('content').notNull(),
  renderedPreview: text('rendered_preview'),
  groupId: integer('group_id').references(() => groups.id),
  totalRecipients: integer('total_recipients').notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  skippedCount: integer('skipped_count').default(0).notNull(),
  status: text('status', {
    enum: ['pending', 'scheduled', 'past_due', 'sending', 'completed', 'cancelled'],
  }).notNull(),
  batchSize: integer('batch_size').default(1).notNull(),
  batchDelayMs: integer('batch_delay_ms').default(5000).notNull(),
  scheduledAt: text('scheduled_at'),
  templateState: text('template_state'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  completedAt: text('completed_at'),
})

export const drafts = sqliteTable('drafts', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name'),
  content: text('content').default('').notNull(),
  recipientMode: text('recipient_mode', {enum: ['group', 'individual']})
    .default('group')
    .notNull(),
  groupId: integer('group_id').references(() => groups.id, {onDelete: 'set null'}),
  selectedIndividualIds: text('selected_individual_ids'),
  excludeIds: text('exclude_ids'),
  batchSize: integer('batch_size').default(1).notNull(),
  batchDelayMs: integer('batch_delay_ms').default(5000).notNull(),
  scheduledAt: text('scheduled_at'),
  templateState: text('template_state'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  content: text('content').default('').notNull(),
  customVariables: text('custom_variables'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const globalVariables = sqliteTable('global_variables', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull().unique(),
  value: text('value').notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const messageRecipients = sqliteTable('message_recipients', {
  id: integer('id').primaryKey({autoIncrement: true}),
  messageId: integer('message_id')
    .notNull()
    .references(() => messages.id, {onDelete: 'cascade'}),
  personId: integer('person_id')
    .notNull()
    .references(() => people.id),
  renderedContent: text('rendered_content'),
  status: text('status', {enum: ['pending', 'sent', 'failed', 'skipped']})
    .default('pending')
    .notNull(),
  errorMessage: text('error_message'),
  sentAt: text('sent_at'),
})
