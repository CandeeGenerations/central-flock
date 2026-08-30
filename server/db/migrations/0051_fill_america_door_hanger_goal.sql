-- "Packets" is what the church calls Door Hangers, so the campaign goal is a
-- door-hanger target and now has an actual to measure against. One noun.
ALTER TABLE `fill_america_campaigns` RENAME COLUMN `packet_goal` TO `door_hanger_goal`;
