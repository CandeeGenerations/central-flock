-- The Sunday School Roll: one quarter's blank attendance grids for the whole
-- Sunday School, one Roll Sheet per Class. Print-only — it stores rosters and
-- labels and nothing else. No marks, no cells, and no date rows: the Sunday
-- columns are derived from (year, quarter). See ADR 0029 and ADR 0030.
--
-- `scholars` is the whole roster as newline-separated text, so line index IS
-- row index and a blank line prints as a deliberate blank row. There is no
-- Class table and no Scholar table on purpose: copy-forward is the only way
-- either propagates between quarters.

CREATE TABLE `sunday_school_rolls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`year` integer NOT NULL,
	`quarter` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sunday_school_rolls_schedule_uniq` ON `sunday_school_rolls` (`schedule_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sunday_school_rolls_year_quarter_uniq` ON `sunday_school_rolls` (`year`,`quarter`);--> statement-breakpoint
CREATE TABLE `sunday_school_roll_sheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roll_id` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`scholars` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`roll_id`) REFERENCES `sunday_school_rolls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sunday_school_roll_sheets_roll_idx` ON `sunday_school_roll_sheets` (`roll_id`,`sort_order`);
