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
