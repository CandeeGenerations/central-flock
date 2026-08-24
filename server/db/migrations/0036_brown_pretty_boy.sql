CREATE TABLE `sermon_reflections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sermon_id` integer NOT NULL,
	`body` text NOT NULL,
	`rank_tier` text NOT NULL,
	`rank_order` integer NOT NULL,
	`rank_note` text,
	`sensitive` integer DEFAULT false NOT NULL,
	`sensitive_reason` text,
	`edited_body` text,
	`used` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`sermon_id`) REFERENCES `sermons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sermon_scriptures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sermon_id` integer NOT NULL,
	`reference` text NOT NULL,
	`book` text NOT NULL,
	`chapter` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sermon_id`) REFERENCES `sermons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sermon_social_quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sermon_id` integer NOT NULL,
	`verbatim_text` text NOT NULL,
	`cleaned_text` text NOT NULL,
	`polished_text` text NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`rank_tier` text NOT NULL,
	`rank_order` integer NOT NULL,
	`rank_note` text,
	`sensitive` integer DEFAULT false NOT NULL,
	`sensitive_reason` text,
	`edited_text` text,
	`used` integer DEFAULT false NOT NULL,
	`promoted_quote_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`sermon_id`) REFERENCES `sermons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promoted_quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sermons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_time_id` integer NOT NULL,
	`sermon_date` text NOT NULL,
	`speaker_person_id` integer NOT NULL,
	`title` text,
	`series` text,
	`big_idea` text,
	`transcript` text NOT NULL,
	`generated_at` text,
	`generation_model` text,
	`generation_duration_ms` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`service_time_id`) REFERENCES `service_times`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`speaker_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sermons_service_date_uniq` ON `sermons` (`service_time_id`,`sermon_date`);