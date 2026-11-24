CREATE TABLE `events_story_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`failed_step` text,
	`error` text,
	`progress_message` text,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`post_date` text NOT NULL,
	`post_minute` integer NOT NULL,
	`lines_json` text NOT NULL,
	`canva_transaction_id` text,
	`preview_path` text,
	`export_path` text,
	`metricool_post_id` text,
	`metricool_planner_url` text,
	`stale` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_story_runs_status_idx` ON `events_story_runs` (`status`);--> statement-breakpoint
CREATE INDEX `events_story_runs_post_date_idx` ON `events_story_runs` (`post_date`);--> statement-breakpoint
-- Catch-up for fresh databases (added 2026-11). These three columns reached production through
-- `drizzle-kit push`, never a migration. Production applied this migration before they were listed
-- here and never re-runs it, so these only ever run on a new, empty database.
ALTER TABLE `calendar_print_pages` ADD `hide_normal_schedule_footer` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `normal_schedule_items` ADD `hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_print_day_overrides` ADD `show_normal_schedule_label` integer DEFAULT true NOT NULL;
