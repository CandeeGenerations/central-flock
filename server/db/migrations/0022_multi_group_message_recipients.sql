CREATE TABLE `message_groups` (
	`message_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	PRIMARY KEY(`message_id`, `group_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `draft_groups` (
	`draft_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	PRIMARY KEY(`draft_id`, `group_id`),
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `message_groups` (`message_id`, `group_id`) SELECT `id`, `group_id` FROM `messages` WHERE `group_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `draft_groups` (`draft_id`, `group_id`) SELECT `id`, `group_id` FROM `drafts` WHERE `group_id` IS NOT NULL;--> statement-breakpoint
-- Rebuilt rather than `ALTER TABLE ... DROP COLUMN group_id`: SQLite refuses to drop a column that a
-- FOREIGN KEY clause still names, so the original DROP COLUMN form failed on every fresh database.
-- Production applied this migration long ago and never re-runs it; this form is for new databases.
CREATE TABLE `__new_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`rendered_preview` text,
	`total_recipients` integer NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`batch_size` integer DEFAULT 1 NOT NULL,
	`batch_delay_ms` integer DEFAULT 5000 NOT NULL,
	`scheduled_at` text,
	`template_state` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`rsvp_list_id` integer REFERENCES rsvp_lists(id) ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_messages` (`id`, `content`, `rendered_preview`, `total_recipients`, `sent_count`, `failed_count`, `skipped_count`, `status`, `batch_size`, `batch_delay_ms`, `scheduled_at`, `template_state`, `created_at`, `completed_at`, `source`, `rsvp_list_id`) SELECT `id`, `content`, `rendered_preview`, `total_recipients`, `sent_count`, `failed_count`, `skipped_count`, `status`, `batch_size`, `batch_delay_ms`, `scheduled_at`, `template_state`, `created_at`, `completed_at`, `source`, `rsvp_list_id` FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE TABLE `__new_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`content` text DEFAULT '' NOT NULL,
	`recipient_mode` text DEFAULT 'group' NOT NULL,
	`selected_individual_ids` text,
	`exclude_ids` text,
	`batch_size` integer DEFAULT 1 NOT NULL,
	`batch_delay_ms` integer DEFAULT 5000 NOT NULL,
	`scheduled_at` text,
	`template_state` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`rsvp_list_id` integer REFERENCES rsvp_lists(id)
);
--> statement-breakpoint
INSERT INTO `__new_drafts` (`id`, `name`, `content`, `recipient_mode`, `selected_individual_ids`, `exclude_ids`, `batch_size`, `batch_delay_ms`, `scheduled_at`, `template_state`, `created_at`, `updated_at`, `rsvp_list_id`) SELECT `id`, `name`, `content`, `recipient_mode`, `selected_individual_ids`, `exclude_ids`, `batch_size`, `batch_delay_ms`, `scheduled_at`, `template_state`, `created_at`, `updated_at`, `rsvp_list_id` FROM `drafts`;--> statement-breakpoint
DROP TABLE `drafts`;--> statement-breakpoint
ALTER TABLE `__new_drafts` RENAME TO `drafts`;
