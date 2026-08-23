CREATE TABLE `music_schedule_booth_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer NOT NULL,
	`slot` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`highlight` integer DEFAULT false NOT NULL,
	`drafted_from` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `music_schedule_services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_schedule_booth_lines_service_id_slot_unique` ON `music_schedule_booth_lines` (`service_id`,`slot`);--> statement-breakpoint
CREATE TABLE `music_schedule_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer NOT NULL,
	`kind` text NOT NULL,
	`role` text DEFAULT 'plain' NOT NULL,
	`hymn_id` integer,
	`free_song_title` text,
	`suffix` text DEFAULT '' NOT NULL,
	`left_text` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`merged` integer,
	`align` text,
	`bold` integer,
	`italic` integer DEFAULT false NOT NULL,
	`highlight` integer DEFAULT false NOT NULL,
	`sticky` integer DEFAULT false NOT NULL,
	`booth` text DEFAULT 'auto' NOT NULL,
	`booth_label` text DEFAULT '' NOT NULL,
	`booth_note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `music_schedule_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hymn_id`) REFERENCES `hymns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `music_schedule_lines_service_idx` ON `music_schedule_lines` (`service_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `music_schedule_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`music_schedule_id` integer NOT NULL,
	`service_time_id` integer,
	`name` text DEFAULT '' NOT NULL,
	`music_heading` text DEFAULT '' NOT NULL,
	`booth_heading` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`meeting` integer DEFAULT true NOT NULL,
	`uploaded` integer DEFAULT true NOT NULL,
	`episode_number` integer,
	`title` text DEFAULT '' NOT NULL,
	`title_note` text DEFAULT '' NOT NULL,
	`title_highlight` integer DEFAULT false NOT NULL,
	`scripture` text DEFAULT '' NOT NULL,
	`scripture_note` text DEFAULT '' NOT NULL,
	`scripture_highlight` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`music_schedule_id`) REFERENCES `music_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_time_id`) REFERENCES `service_times`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `music_schedule_services_week_idx` ON `music_schedule_services` (`music_schedule_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `music_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_schedules_schedule_uniq` ON `music_schedules` (`schedule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `music_schedules_week_uniq` ON `music_schedules` (`week_start`);