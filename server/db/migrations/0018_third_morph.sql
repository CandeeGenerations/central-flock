CREATE TABLE `special_music` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`service_type` text NOT NULL,
	`service_label` text,
	`song_title` text NOT NULL,
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
CREATE TABLE `special_music_performers` (
	`special_music_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`ordering` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`special_music_id`, `person_id`),
	FOREIGN KEY (`special_music_id`) REFERENCES `special_music`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
