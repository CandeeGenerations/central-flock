import {sql} from 'drizzle-orm'
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

// One Story Run: a pass through the weekly Events Story workflow (CONTEXT.md). Rows are kept so an
// unapproved draft can be resumed and past weeks looked back on.
export const eventsStoryRunStatuses = [
  'drafting',
  'awaiting_approval',
  'scheduling',
  'scheduled',
  'failed',
  'discarded',
] as const
export type EventsStoryRunStatus = (typeof eventsStoryRunStatuses)[number]

export const eventsStoryRuns = sqliteTable(
  'events_story_runs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    status: text('status', {enum: eventsStoryRunStatuses}).notNull(),
    // Step a failed run stopped at ('draft' | 'commit' | 'export' | 'schedule'); retry resumes there.
    failedStep: text('failed_step'),
    error: text('error'),
    // Live progress for the UI's progress bar while drafting/scheduling.
    progressMessage: text('progress_message'),
    progressPct: integer('progress_pct').notNull().default(0),
    // Wall-clock post time in America/New_York: date + minutes since midnight.
    postDate: text('post_date').notNull(),
    postMinute: integer('post_minute').notNull(),
    // JSON: the five Story Lines as drafted (event ids, date, and the text written to Canva).
    linesJson: text('lines_json').notNull(),
    canvaTransactionId: text('canva_transaction_id'),
    // Copy of the draft preview under UPLOADS_DIR (Canva's thumbnail URLs expire in hours).
    previewPath: text('preview_path'),
    exportPath: text('export_path'),
    metricoolPostId: text('metricool_post_id'),
    metricoolPlannerUrl: text('metricool_planner_url'),
    // Set when a later Calendar Print change alters the Events this (scheduled) run shows.
    stale: integer('stale', {mode: 'boolean'}).notNull().default(false),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [index('events_story_runs_status_idx').on(t.status), index('events_story_runs_post_date_idx').on(t.postDate)],
)
