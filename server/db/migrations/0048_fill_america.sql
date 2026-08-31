CREATE TABLE `fill_america_campaign_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`week_no` integer NOT NULL,
	`week_date` text NOT NULL,
	`door_hangers` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `fill_america_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fill_america_campaign_weeks_uniq` ON `fill_america_campaign_weeks` (`campaign_id`,`week_no`);--> statement-breakpoint
CREATE TABLE `fill_america_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`season` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fill_america_campaigns_start_date_unique` ON `fill_america_campaigns` (`start_date`);--> statement-breakpoint
CREATE TABLE `fill_america_households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fill_america_households_name_unique` ON `fill_america_households` (`name`);--> statement-breakpoint
CREATE TABLE `fill_america_roster_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`household_id` integer NOT NULL,
	`size` integer DEFAULT 1 NOT NULL,
	`goal` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `fill_america_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `fill_america_households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fill_america_roster_entries_uniq` ON `fill_america_roster_entries` (`campaign_id`,`household_id`);--> statement-breakpoint
CREATE INDEX `fill_america_roster_entries_household_idx` ON `fill_america_roster_entries` (`household_id`);--> statement-breakpoint
CREATE TABLE `fill_america_tract_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`roster_entry_id` integer NOT NULL,
	`week_id` integer NOT NULL,
	`tracts` integer,
	FOREIGN KEY (`roster_entry_id`) REFERENCES `fill_america_roster_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_id`) REFERENCES `fill_america_campaign_weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fill_america_tract_reports_uniq` ON `fill_america_tract_reports` (`roster_entry_id`,`week_id`);--> statement-breakpoint
CREATE INDEX `fill_america_tract_reports_week_idx` ON `fill_america_tract_reports` (`week_id`);