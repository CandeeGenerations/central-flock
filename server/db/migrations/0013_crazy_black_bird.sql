CREATE TABLE `rsvp_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rsvp_list_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`status` text DEFAULT 'no_response' NOT NULL,
	`headcount` integer,
	`note` text,
	`responded_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`rsvp_list_id`) REFERENCES `rsvp_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_entries_list_person_uniq` ON `rsvp_entries` (`rsvp_list_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `rsvp_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`calendar_event_id` integer,
	`standalone_title` text,
	`standalone_date` text,
	`standalone_time` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`calendar_event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE set null
);
