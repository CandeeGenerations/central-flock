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
ALTER TABLE `messages` DROP COLUMN `group_id`;--> statement-breakpoint
ALTER TABLE `drafts` DROP COLUMN `group_id`;
