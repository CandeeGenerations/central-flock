import {sql} from 'drizzle-orm'
import {integer, primaryKey, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'

export const people = sqliteTable('people', {
  id: integer('id').primaryKey({autoIncrement: true}),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phoneNumber: text('phone_number').unique(),
  phoneDisplay: text('phone_display'),
  status: text('status', {enum: ['active', 'inactive', 'do_not_contact']})
    .default('active')
    .notNull(),
  birthMonth: integer('birth_month'),
  birthDay: integer('birth_day'),
  birthYear: integer('birth_year'),
  anniversaryMonth: integer('anniversary_month'),
  anniversaryDay: integer('anniversary_day'),
  anniversaryYear: integer('anniversary_year'),
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
  source: text('source', {enum: ['manual', 'birthday_scheduler']})
    .default('manual')
    .notNull(),
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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const birthdayMessagesSent = sqliteTable('birthday_messages_sent', {
  id: integer('id').primaryKey({autoIncrement: true}),
  personId: integer('person_id')
    .notNull()
    .references(() => people.id, {onDelete: 'cascade'}),
  type: text('type', {
    enum: [
      'birthday',
      'pre_3',
      'pre_7',
      'pre_10',
      'anniversary',
      'anniversary_pre_3',
      'anniversary_pre_7',
      'anniversary_pre_10',
    ],
  }).notNull(),
  year: integer('year').notNull(),
  sentAt: text('sent_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const dismissedContacts = sqliteTable('dismissed_contacts', {
  id: integer('id').primaryKey({autoIncrement: true}),
  contactId: text('contact_id').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  dismissedAt: text('dismissed_at')
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

export const pinnedItems = sqliteTable('pinned_items', {
  id: integer('id').primaryKey({autoIncrement: true}),
  type: text('type', {enum: ['person', 'group', 'template']}).notNull(),
  itemId: integer('item_id').notNull(),
  position: integer('position').notNull(),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const calendarEvents = sqliteTable('calendar_events', {
  id: integer('id').primaryKey({autoIncrement: true}),
  eventUid: text('event_uid').notNull(),
  title: text('title').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  allDay: integer('all_day', {mode: 'boolean'}).default(false).notNull(),
  location: text('location'),
  calendarName: text('calendar_name').notNull(),
  recurring: integer('recurring', {mode: 'boolean'}).default(false).notNull(),
})

export const rsvpLists = sqliteTable('rsvp_lists', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  calendarEventId: integer('calendar_event_id').references(() => calendarEvents.id, {onDelete: 'set null'}),
  standaloneTitle: text('standalone_title'),
  standaloneDate: text('standalone_date'),
  standaloneTime: text('standalone_time'),
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const rsvpEntries = sqliteTable(
  'rsvp_entries',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    rsvpListId: integer('rsvp_list_id')
      .notNull()
      .references(() => rsvpLists.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    status: text('status', {enum: ['yes', 'no', 'maybe', 'no_response']})
      .default('no_response')
      .notNull(),
    headcount: integer('headcount'),
    note: text('note'),
    respondedAt: text('responded_at'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [uniqueIndex('rsvp_entries_list_person_uniq').on(t.rsvpListId, t.personId)],
)
