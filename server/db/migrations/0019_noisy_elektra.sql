CREATE TABLE `calendar_print_day_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`date` text NOT NULL,
	`inline_item_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `calendar_print_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_print_day_overrides_page_id_date_unique` ON `calendar_print_day_overrides` (`page_id`,`date`);--> statement-breakpoint
CREATE TABLE `normal_schedule_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` integer,
	`type` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`bold` integer DEFAULT false NOT NULL,
	`column` integer DEFAULT 1 NOT NULL,
	`eligible_days` text DEFAULT 'sun,wed,sat' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `normal_schedule_items_scope_idx` ON `normal_schedule_items` (`scope_type`,`scope_id`,`sort_order`);