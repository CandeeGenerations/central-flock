CREATE TABLE `fair_booth_reminder_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`target_day` text NOT NULL,
	`template_id` integer NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`message_id` integer,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fair_booth_reminder_runs_schedule_day_uniq` ON `fair_booth_reminder_runs` (`schedule_id`,`target_day`);