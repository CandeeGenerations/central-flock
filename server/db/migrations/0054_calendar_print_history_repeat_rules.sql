CREATE TABLE `calendar_print_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`snapshot` blob NOT NULL,
	`undone` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `calendar_print_events` ADD `repeat_rule` text;