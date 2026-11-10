CREATE TABLE `music_schedule_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text,
	`music_schedule_id` integer,
	`status` text DEFAULT 'unfinished' NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`photos_expire_on` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`music_schedule_id`) REFERENCES `music_schedules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `music_schedule_services` ADD `standalone` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `music_schedule_services` ADD `occasion` text DEFAULT '' NOT NULL;