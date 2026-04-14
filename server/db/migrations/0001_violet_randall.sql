CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_uid` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`calendar_name` text NOT NULL,
	`recurring` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dismissed_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`dismissed_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_contacts_contact_id_unique` ON `dismissed_contacts` (`contact_id`);--> statement-breakpoint
CREATE TABLE `pinned_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`item_id` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `anniversary_month` integer;--> statement-breakpoint
ALTER TABLE `people` ADD `anniversary_day` integer;--> statement-breakpoint
ALTER TABLE `people` ADD `anniversary_year` integer;