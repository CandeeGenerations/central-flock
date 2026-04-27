CREATE TABLE `notion_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`icon` text,
	`url` text NOT NULL,
	`is_database` integer DEFAULT false NOT NULL,
	`is_folder` integer DEFAULT false NOT NULL,
	`last_edited_time` text NOT NULL,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notion_pages_parent_idx` ON `notion_pages` (`parent_id`);