-- The campaign goal counts PACKETS, not tracts. Renamed so the column cannot be
-- read as a tract target, and so it stays distinct from the per-roster-entry
-- `goal` that came off the spreadsheet.
ALTER TABLE `fill_america_campaigns` RENAME COLUMN `goal` TO `packet_goal`;
