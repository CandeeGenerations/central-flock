-- Sunday School Stats: the weekly grid of Department Counts that replaces the
-- "Sunday School Stats" spreadsheet. Data capture only — no `schedules` envelope
-- row, no draft/final status, no parent quarter entity. The quarter is a picker
-- and its Sundays are derived by sundaysInQuarter(), so nothing has to be
-- created before a number can be typed.
--
-- This shares nothing with `service_records` (the usher's whole-room count for
-- the Sunday School Service Time, adults included) or with
-- `sunday_school_roll_sheets` (five free-text print-only Classes). See ADR 0031.
--
-- girls/boys are nullable and blank is NOT zero: blank means nobody recorded it,
-- 0 means the class met and no one came.

CREATE TABLE `sunday_school_departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sunday_school_department_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_of` text NOT NULL,
	`department_id` integer NOT NULL,
	`girls` integer,
	`boys` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `sunday_school_departments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sunday_school_department_counts_week_dept_uniq` ON `sunday_school_department_counts` (`week_of`,`department_id`);--> statement-breakpoint
CREATE INDEX `sunday_school_department_counts_week_idx` ON `sunday_school_department_counts` (`week_of`);--> statement-breakpoint
-- Seed the three Departments the workbook uses. Idempotent so a re-run is safe.
INSERT INTO `sunday_school_departments` (`name`, `sort_order`)
SELECT '2-5yrs', 0 WHERE NOT EXISTS (SELECT 1 FROM `sunday_school_departments` WHERE `name` = '2-5yrs');--> statement-breakpoint
INSERT INTO `sunday_school_departments` (`name`, `sort_order`)
SELECT '1st-5th', 1 WHERE NOT EXISTS (SELECT 1 FROM `sunday_school_departments` WHERE `name` = '1st-5th');--> statement-breakpoint
INSERT INTO `sunday_school_departments` (`name`, `sort_order`)
SELECT '6th-12th', 2 WHERE NOT EXISTS (SELECT 1 FROM `sunday_school_departments` WHERE `name` = '6th-12th');
