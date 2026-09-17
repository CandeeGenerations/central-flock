-- Seed the Prayer Request shortcut with the group and template it has always meant: the
-- Prayer Warriors group and the Prayer Chain template. The shortcut stays hidden until both
-- settings point at a live row, so seeding here is what makes it appear on deploy.
--
-- Data only. Both guards matter: an existing value is never overwritten, and an id that no
-- longer exists is never written, which would leave the setting dangling on a rebuilt DB.

INSERT INTO settings (`key`, `value`)
SELECT 'prayerRequest.groupId', CAST(id AS text) FROM groups WHERE name = 'Prayer Warriors'
AND NOT EXISTS (SELECT 1 FROM settings WHERE `key` = 'prayerRequest.groupId')
LIMIT 1;--> statement-breakpoint

INSERT INTO settings (`key`, `value`)
SELECT 'prayerRequest.templateId', CAST(id AS text) FROM templates WHERE name = 'Prayer Chain'
AND NOT EXISTS (SELECT 1 FROM settings WHERE `key` = 'prayerRequest.templateId')
LIMIT 1;
