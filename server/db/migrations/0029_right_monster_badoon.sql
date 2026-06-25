CREATE TABLE `route_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`visited_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `route_visits_visited_at_idx` ON `route_visits` (`visited_at`);--> statement-breakpoint
CREATE INDEX `route_visits_path_idx` ON `route_visits` (`path`);