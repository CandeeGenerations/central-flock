ALTER TABLE `households` ADD `name` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `special_music_performers` ADD `display_name` text;--> statement-breakpoint
-- Catch-up for fresh databases (added 2026-11). In production the `schedules` envelope table was
-- created by server/scripts/migrate-schedules-consolidation.ts (ADR 0006), not by a migration, yet
-- 0025 onwards reference it. Production applied this migration long ago and never re-runs it, so
-- these statements only ever run on a new, empty database, where they reproduce what the script did.
CREATE TABLE `schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_type` text NOT NULL,
	`scope_kind` text NOT NULL,
	`month` integer,
	`year` integer,
	`scope_start` text,
	`scope_end` text,
	`scope_label` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
DROP TABLE `nursery_schedules`;--> statement-breakpoint
-- The same script made special_music.song_title nullable.
CREATE TABLE `__new_special_music` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`service_type` text NOT NULL,
	`service_label` text,
	`song_title` text,
	`hymn_id` integer,
	`song_arranger` text,
	`song_writer` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`occasion` text,
	`guest_performers` text DEFAULT '[]' NOT NULL,
	`youtube_url` text,
	`sheet_music_path` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`hymn_id`) REFERENCES `hymns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_special_music` (`id`, `date`, `service_type`, `service_label`, `song_title`, `hymn_id`, `song_arranger`, `song_writer`, `type`, `status`, `occasion`, `guest_performers`, `youtube_url`, `sheet_music_path`, `notes`, `created_at`, `updated_at`) SELECT `id`, `date`, `service_type`, `service_label`, `song_title`, `hymn_id`, `song_arranger`, `song_writer`, `type`, `status`, `occasion`, `guest_performers`, `youtube_url`, `sheet_music_path`, `notes`, `created_at`, `updated_at` FROM `special_music`;--> statement-breakpoint
DROP TABLE `special_music`;--> statement-breakpoint
ALTER TABLE `__new_special_music` RENAME TO `special_music`;
