CREATE TABLE `recorders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recorders_token_unique` ON `recorders` (`token`);--> statement-breakpoint
CREATE TABLE `service_record_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_record_id` integer NOT NULL,
	`recorder_id` integer,
	`recorder_name` text NOT NULL,
	`attendance` integer,
	`streaming` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`service_record_id`) REFERENCES `service_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorder_id`) REFERENCES `recorders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `service_records` ADD `latest_recorder_id` integer REFERENCES recorders(id);--> statement-breakpoint
ALTER TABLE `service_records` ADD `latest_recorder_name` text;--> statement-breakpoint
ALTER TABLE `service_records` ADD `latest_entered_at` text;