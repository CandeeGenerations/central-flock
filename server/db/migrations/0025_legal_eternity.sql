CREATE TABLE `fair_booth_roster_attrs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`fair_role` text DEFAULT 'worker' NOT NULL,
	`initials_override` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fair_booth_roster_attrs_schedule_person_uniq` ON `fair_booth_roster_attrs` (`schedule_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `fair_booth_signups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`day_date` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`shift_role` text DEFAULT 'worker' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`display_row_override` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `people` ADD `is_hispanic` integer DEFAULT false NOT NULL;
