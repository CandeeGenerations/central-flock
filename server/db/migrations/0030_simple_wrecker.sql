ALTER TABLE `rsvp_lists` ADD `calendar_event_uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_uid_nonrecurring_uniq` ON `calendar_events` (`event_uid`) WHERE "calendar_events"."recurring" = 0;--> statement-breakpoint
--> Backfill the new stable link from the old id-based FK, for links not already nulled
--> by a prior sync. Runs before 0031 drops calendar_event_id.
UPDATE `rsvp_lists`
SET `calendar_event_uid` = (
	SELECT `event_uid` FROM `calendar_events` WHERE `calendar_events`.`id` = `rsvp_lists`.`calendar_event_id`
)
WHERE `calendar_event_id` IS NOT NULL;