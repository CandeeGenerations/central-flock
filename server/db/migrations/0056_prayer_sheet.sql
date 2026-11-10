CREATE TABLE `prayer_sheet_editions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`theme_color` text NOT NULL,
	`column_split` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prayer_sheet_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sunday_id` integer NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`sunday_id`) REFERENCES `prayer_sheet_sundays`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prayer_sheet_entries_sunday_idx` ON `prayer_sheet_entries` (`sunday_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `prayer_sheet_ministry_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`bold` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prayer_sheet_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'CBC PRAYER SHEET' NOT NULL,
	`scripture_text` text DEFAULT '“And it shall come to pass, that before they call, I will answer; and while they are yet speaking, I will hear.”' NOT NULL,
	`scripture_reference` text DEFAULT 'Isaiah 65:24' NOT NULL,
	`color_sunday_1` text DEFAULT '#1D4ED8' NOT NULL,
	`color_sunday_2` text DEFAULT '#15803D' NOT NULL,
	`color_sunday_3` text DEFAULT '#B91C1C' NOT NULL,
	`color_sunday_4` text DEFAULT '#B45309' NOT NULL,
	`color_sunday_5` text DEFAULT '#6D28D9' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prayer_sheet_sundays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`sunday_date` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `prayer_sheet_editions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prayer_sheet_sundays_edition_idx` ON `prayer_sheet_sundays` (`edition_id`,`sort_order`);--> statement-breakpoint
-- Seed the settings singleton
INSERT OR IGNORE INTO prayer_sheet_settings (id) VALUES (1);
--> statement-breakpoint
-- Seed ministry items from the CBC back page
INSERT INTO prayer_sheet_ministry_items (text, bold, sort_order) VALUES
('Armoury in 2027 (soul winning training program)', 1, 0),
('Bible Institute, Advanced Studies', 0, 1),
('Bus Ministry – Growth, Workers, Drivers', 0, 2),
('CBC I.T. Ministry', 0, 3),
('Children / Teens – studies, testimony', 0, 4),
('Churches & Pastors, struggling', 0, 5),
('Church Cleaning & Yard Work', 0, 6),
('College Students – studies, testimony', 0, 7),
('Couples (with young children)', 0, 8),
('Discipling & Soulwinning', 0, 9),
('Faithful Men', 0, 10),
('Families – faithful and strengthened', 0, 11),
('Fellowship House Bible Study, residents', 0, 12),
('Hispanic Ministry', 0, 13),
('Kids Alive & Youth Alive, Extravaganza', 0, 14),
('Ladies Fellowship', 0, 15),
('Loyal Ladies Bible Study', 0, 16),
('Marriages – strengthened', 0, 17),
('Members and New Converts', 0, 18),
('Men''s Fellowship', 0, 19),
('Military Ministry', 0, 20),
('Missions, Missionaries, both foreign & domestic', 0, 21),
('Music Ministry', 0, 22),
('Nursery Ministry', 0, 23),
('Parents training children', 0, 24),
('President, leaders, Military and Nation', 0, 25),
('Prison & jail Ministries', 0, 26),
('Salvation of Family & Friends', 0, 27),
('Senior Citizens & Shut-Ins', 0, 28),
('Singles Ministry', 0, 29),
('Souls Saved in Church Ministries', 0, 30),
('Sunday School Classes & Workers', 0, 31),
('Unspoken', 0, 32),
('Visitation Ministry', 0, 33),
('Wednesday Bible Study & Prayer (growth & souls)', 0, 34),
('Widows', 0, 35),
('Workers needed', 0, 36);
