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
CREATE INDEX `events_story_runs_post_date_idx` ON `events_story_runs` (`post_date`);