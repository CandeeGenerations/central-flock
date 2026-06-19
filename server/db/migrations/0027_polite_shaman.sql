PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_quote_searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic` text NOT NULL,
	`synthesis` text,
	`results` text,
	`model` text,
	`candidate_count` integer,
	`duration_ms` integer,
	`music_results` text,
	`music_model` text,
	`music_searched_at` text,
	`music_duration_ms` integer,
	`created_at` text DEFAULT (datetime('now', 'localtime'))
);
--> statement-breakpoint
INSERT INTO `__new_quote_searches`("id", "topic", "synthesis", "results", "model", "candidate_count", "duration_ms", "created_at") SELECT "id", "topic", "synthesis", "results", "model", "candidate_count", "duration_ms", "created_at" FROM `quote_searches`;--> statement-breakpoint
DROP TABLE `quote_searches`;--> statement-breakpoint
ALTER TABLE `__new_quote_searches` RENAME TO `quote_searches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;