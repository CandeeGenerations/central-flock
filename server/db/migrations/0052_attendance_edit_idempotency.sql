-- Attendance edit idempotency (ADR-0034). The entry app now mints an id per Tally/Correction and
-- re-sends it until it hears back, because a wifi handover drops responses as readily as requests.
-- The unique index is what turns that re-send into a lookup instead of a second +1. NULL for admin
-- edits and every row written before this — SQLite treats NULLs as distinct, so they do not collide.

ALTER TABLE `service_record_edits` ADD `client_edit_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `service_record_edits_client_edit_id_uniq` ON `service_record_edits` (`client_edit_id`);