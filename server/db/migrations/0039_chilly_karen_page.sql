CREATE TABLE `betty_lukens_stories` (
	`number` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`page` integer,
	`last_points` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workers_notes_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`bold` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `workers_notes_editions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workers_notes_blocks_edition_idx` ON `workers_notes_blocks` (`edition_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `workers_notes_editions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`year` integer NOT NULL,
	`term` integer NOT NULL,
	`starting_lesson_number` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_notes_editions_schedule_uniq` ON `workers_notes_editions` (`schedule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workers_notes_editions_year_term_uniq` ON `workers_notes_editions` (`year`,`term`);--> statement-breakpoint
CREATE TABLE `workers_notes_lesson_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text,
	`special_lesson` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `workers_notes_editions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workers_notes_lesson_rows_edition_idx` ON `workers_notes_lesson_rows` (`edition_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `workers_notes_months` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`month` integer NOT NULL,
	`hymn_id` integer,
	`song_title_override` text,
	`motto` text DEFAULT '' NOT NULL,
	`verse` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `workers_notes_editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hymn_id`) REFERENCES `hymns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_notes_months_edition_id_month_unique` ON `workers_notes_months` (`edition_id`,`month`);--> statement-breakpoint
CREATE TABLE `workers_notes_themes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`song_title` text DEFAULT '' NOT NULL,
	`song_credit` text DEFAULT '' NOT NULL,
	`chorus_lyrics` text DEFAULT '' NOT NULL,
	`tag_lyrics` text DEFAULT '' NOT NULL,
	`verse_text` text DEFAULT '' NOT NULL,
	`verse_ref` text DEFAULT '' NOT NULL,
	`growth_plan` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_notes_themes_year_unique` ON `workers_notes_themes` (`year`);