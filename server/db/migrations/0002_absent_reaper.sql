CREATE TABLE `devotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`number` integer NOT NULL,
	`devotion_type` text NOT NULL,
	`subcode` text,
	`guest_speaker` text,
	`guest_number` integer,
	`referenced_devotions` text,
	`bible_reference` text,
	`song_name` text,
	`title` text,
	`talking_points` text,
	`youtube_description` text,
	`facebook_description` text,
	`podcast_description` text,
	`produced` integer DEFAULT false NOT NULL,
	`rendered` integer DEFAULT false NOT NULL,
	`youtube` integer DEFAULT false NOT NULL,
	`facebook_instagram` integer DEFAULT false NOT NULL,
	`podcast` integer DEFAULT false NOT NULL,
	`notes` text,
	`flagged` integer DEFAULT false NOT NULL,
	`chain_ignores` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devotions_number_unique` ON `devotions` (`number`);--> statement-breakpoint
CREATE TABLE `generated_passages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`bible_reference` text NOT NULL,
	`talking_points` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`devotion_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`used_at` text,
	FOREIGN KEY (`devotion_id`) REFERENCES `devotions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `gwendolyn_devotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`blocks` text NOT NULL,
	`hashtags` text DEFAULT '' NOT NULL,
	`raw_input` text,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`year` integer NOT NULL,
	`data` text NOT NULL,
	`image_path` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quote_searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic` text NOT NULL,
	`synthesis` text NOT NULL,
	`results` text NOT NULL,
	`model` text NOT NULL,
	`candidate_count` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`captured_by` text NOT NULL,
	`captured_at` text NOT NULL,
	`date_display` text NOT NULL,
	`summary` text NOT NULL,
	`quote_text` text NOT NULL,
	`tags` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'localtime')),
	`updated_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_external_id_unique` ON `quotes` (`external_id`);--> statement-breakpoint
CREATE TABLE `hymn_searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`scripture_text` text NOT NULL,
	`theme` text NOT NULL,
	`audience` text NOT NULL,
	`hymnal_filter` text NOT NULL,
	`sections` text NOT NULL,
	`raw_response` text NOT NULL,
	`model` text NOT NULL,
	`candidate_count` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
CREATE TABLE `hymns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`first_line` text,
	`refrain_line` text,
	`author` text,
	`composer` text,
	`tune` text,
	`meter` text,
	`topics` text NOT NULL,
	`scripture_refs` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_hymns_book_number` ON `hymns` (`book`,`number`);--> statement-breakpoint
CREATE TABLE `nursery_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`date` text NOT NULL,
	`service_type` text NOT NULL,
	`slot` integer NOT NULL,
	`worker_id` integer,
	FOREIGN KEY (`schedule_id`) REFERENCES `nursery_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `nursery_workers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nursery_assignments_schedule_id_date_service_type_slot_unique` ON `nursery_assignments` (`schedule_id`,`date`,`service_type`,`slot`);--> statement-breakpoint
CREATE TABLE `nursery_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nursery_service_config` (
	`service_type` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`worker_count` integer DEFAULT 2 NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nursery_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nursery_worker_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`worker_id` integer NOT NULL,
	`service_type` text NOT NULL,
	`max_per_month` integer,
	FOREIGN KEY (`worker_id`) REFERENCES `nursery_workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nursery_worker_services_worker_id_service_type_unique` ON `nursery_worker_services` (`worker_id`,`service_type`);--> statement-breakpoint
CREATE TABLE `nursery_workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`max_per_month` integer DEFAULT 4 NOT NULL,
	`allow_multiple_per_day` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
