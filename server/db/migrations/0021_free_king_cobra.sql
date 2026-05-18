ALTER TABLE `calendar_print_day_overrides` ADD `show_no_kaya` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_print_events` DROP COLUMN `suppress_normal_schedule`;