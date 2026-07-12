PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rsvp_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`calendar_event_uid` text,
	`standalone_title` text,
	`standalone_date` text,
	`standalone_time` text,
	`standalone_end_time` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_rsvp_lists`("id", "name", "calendar_event_uid", "standalone_title", "standalone_date", "standalone_time", "standalone_end_time", "created_at", "updated_at") SELECT "id", "name", "calendar_event_uid", "standalone_title", "standalone_date", "standalone_time", "standalone_end_time", "created_at", "updated_at" FROM `rsvp_lists`;--> statement-breakpoint
DROP TABLE `rsvp_lists`;--> statement-breakpoint
ALTER TABLE `__new_rsvp_lists` RENAME TO `rsvp_lists`;--> statement-breakpoint
PRAGMA foreign_keys=ON;