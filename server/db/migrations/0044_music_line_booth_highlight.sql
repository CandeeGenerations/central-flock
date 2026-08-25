-- A highlight is per sheet, not per line: the same song is often exceptional to
-- the sound team ("this is the opener, and Pastor Candee is on it") and routine
-- to the musicians. One flag drove both sheets, so neither could be set alone.
--
-- Existing rows are backfilled from `highlight`, so nothing that prints today
-- changes; the two can now be set apart from each other going forward.

ALTER TABLE music_schedule_lines ADD COLUMN booth_highlight integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE music_schedule_lines SET booth_highlight = highlight;
