ALTER TABLE `drafts` ADD `rsvp_list_id` integer REFERENCES rsvp_lists(id);--> statement-breakpoint
ALTER TABLE `rsvp_entries` ADD `public_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_entries_public_token_unique` ON `rsvp_entries` (`public_token`);