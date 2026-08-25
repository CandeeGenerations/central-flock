-- A free note about the week as a whole ("Tyler running services"). Lives on
-- the week rather than a service because it describes the whole edition, and
-- it is a working note: shown and searchable on the list, never printed.

ALTER TABLE music_schedules ADD COLUMN note text DEFAULT '' NOT NULL;
