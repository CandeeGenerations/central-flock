CREATE TABLE `connections` (
	`provider` text PRIMARY KEY NOT NULL,
	`secrets` blob NOT NULL,
	`expires_at` text,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_error` text,
	`last_checked_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
