PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Nursery Workers become People, and nursery + special music move off their
-- frozen service enums onto service_times. See docs/adr/0025 and docs/adr/0026.
--
-- Every guard runs BEFORE any mutation. Guards use a CHECK constraint rather
-- than RAISE(ABORT), which is only legal inside a trigger body: the INSERT
-- fails and the migration stops with nothing yet changed.

CREATE TEMP TABLE worker_person_map AS
SELECT
  w.id AS worker_id,
  (
    SELECT p.id FROM people p
    WHERE TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) = TRIM(w.name)
    ORDER BY p.id LIMIT 1
  ) AS person_id,
  w.name AS worker_name
FROM nursery_workers w;
--> statement-breakpoint

-- Worker "Yuny Mejia" is contact 363 "Juni Salgado" — different surname, so no
-- name match exists. This is also why the name override column exists, and why
-- matching on name string alone was rejected.
UPDATE worker_person_map
SET person_id = (SELECT id FROM people WHERE id = 363 AND first_name = 'Juni' AND last_name = 'Salgado')
WHERE person_id IS NULL AND worker_name = 'Yuny Mejia';
--> statement-breakpoint

CREATE TEMP TABLE nursery_service_map AS
SELECT 'sunday_school' AS service_type, id AS service_time_id FROM service_times WHERE name = 'Sunday School'
UNION ALL SELECT 'morning', id FROM service_times WHERE name = 'Sunday Morning'
UNION ALL SELECT 'evening', id FROM service_times WHERE name = 'Sunday Evening'
UNION ALL SELECT 'wednesday_evening', id FROM service_times WHERE name = 'Wednesday Evening';
--> statement-breakpoint

-- 'other' is deliberately absent: it becomes a NULL service_time_id.
CREATE TEMP TABLE special_service_map AS
SELECT 'sunday_am' AS service_type, id AS service_time_id FROM service_times WHERE name = 'Sunday Morning'
UNION ALL SELECT 'sunday_pm', id FROM service_times WHERE name = 'Sunday Evening'
UNION ALL SELECT 'wednesday_pm', id FROM service_times WHERE name = 'Wednesday Evening';
--> statement-breakpoint

CREATE TEMP TABLE migration_guard (label text NOT NULL, n integer NOT NULL CHECK (n = 0));
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'nursery_workers not resolving to a person', COUNT(*) FROM worker_person_map WHERE person_id IS NULL;
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'nursery service_times missing', 4 - COUNT(*) FROM nursery_service_map;
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'nursery_assignments with unmappable service_type', COUNT(*)
FROM nursery_assignments a
WHERE NOT EXISTS (SELECT 1 FROM nursery_service_map m WHERE m.service_type = a.service_type);
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'nursery_worker_services with unmappable service_type', COUNT(*)
FROM nursery_worker_services ws
WHERE NOT EXISTS (SELECT 1 FROM nursery_service_map m WHERE m.service_type = ws.service_type);
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'special_music with unmappable service_type', COUNT(*)
FROM special_music s
WHERE s.service_type <> 'other'
  AND NOT EXISTS (SELECT 1 FROM special_service_map m WHERE m.service_type = s.service_type);
--> statement-breakpoint

-- Snapshot every child of nursery_workers BEFORE the parent is dropped.
-- drizzle-kit runs migrations inside a transaction, where PRAGMA foreign_keys
-- is a no-op, so the DROP below fires each child's FK action: the eligibility
-- rows would cascade away and every assignment's worker_id would be SET NULL.
-- Rebuilding from these snapshots is correct either way.
CREATE TEMP TABLE old_worker_services AS SELECT * FROM nursery_worker_services;
--> statement-breakpoint
CREATE TEMP TABLE old_assignments AS SELECT * FROM nursery_assignments;
--> statement-breakpoint
CREATE TEMP TABLE old_service_config AS SELECT * FROM nursery_service_config;
--> statement-breakpoint
CREATE TEMP TABLE old_workers AS SELECT * FROM nursery_workers;
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'worker_services lost before snapshot', 11 - COUNT(*) FROM old_worker_services;
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'assignments already unassigned before snapshot', COUNT(*)
FROM old_assignments WHERE worker_id IS NULL;
--> statement-breakpoint

-- ── nursery_workers: person_id required, name becomes an override ───────────
CREATE TABLE `__new_nursery_workers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `person_id` integer NOT NULL REFERENCES `people`(`id`) ON DELETE cascade,
  `name` text,
  `max_per_month` integer DEFAULT 4 NOT NULL,
  `allow_multiple_per_day` integer DEFAULT false NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint

-- The override is stored only where it differs from the contact's own name, so
-- the nine exact matches store NULL and follow their contact automatically.
INSERT INTO `__new_nursery_workers`
  (`id`, `person_id`, `name`, `max_per_month`, `allow_multiple_per_day`, `is_active`, `created_at`, `updated_at`)
SELECT
  w.id,
  m.person_id,
  CASE
    WHEN TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) = TRIM(w.name) THEN NULL
    ELSE w.name
  END,
  w.max_per_month, w.allow_multiple_per_day, w.is_active, w.created_at, w.updated_at
FROM old_workers w
JOIN worker_person_map m ON m.worker_id = w.id
JOIN people p ON p.id = m.person_id;
--> statement-breakpoint

DROP TABLE `nursery_worker_services`;--> statement-breakpoint
DROP TABLE `nursery_assignments`;--> statement-breakpoint
DROP TABLE `nursery_service_config`;--> statement-breakpoint
DROP TABLE `nursery_workers`;--> statement-breakpoint
ALTER TABLE `__new_nursery_workers` RENAME TO `nursery_workers`;--> statement-breakpoint

-- ── nursery_worker_services ─────────────────────────────────────────────────
CREATE TABLE `nursery_worker_services` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `worker_id` integer NOT NULL REFERENCES `nursery_workers`(`id`) ON DELETE cascade,
  `service_time_id` integer NOT NULL REFERENCES `service_times`(`id`) ON DELETE cascade,
  `max_per_month` integer
);
--> statement-breakpoint

INSERT INTO `nursery_worker_services` (`id`, `worker_id`, `service_time_id`, `max_per_month`)
SELECT ws.id, ws.worker_id, m.service_time_id, ws.max_per_month
FROM old_worker_services ws
JOIN nursery_service_map m ON m.service_type = ws.service_type;
--> statement-breakpoint

CREATE UNIQUE INDEX `nursery_worker_services_worker_id_service_time_id_unique`
  ON `nursery_worker_services` (`worker_id`, `service_time_id`);
--> statement-breakpoint

-- ── nursery_service_config: label + sort_order now live on service_times ────
CREATE TABLE `nursery_service_config` (
  `service_time_id` integer PRIMARY KEY NOT NULL REFERENCES `service_times`(`id`) ON DELETE cascade,
  `worker_count` integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint

INSERT INTO `nursery_service_config` (`service_time_id`, `worker_count`)
SELECT m.service_time_id, c.worker_count
FROM old_service_config c
JOIN nursery_service_map m ON m.service_type = c.service_type;
--> statement-breakpoint

-- ── nursery_assignments ─────────────────────────────────────────────────────
CREATE TABLE `nursery_assignments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `schedule_id` integer NOT NULL REFERENCES `schedules`(`id`) ON DELETE cascade,
  `date` text NOT NULL,
  `service_time_id` integer NOT NULL REFERENCES `service_times`(`id`) ON DELETE cascade,
  `slot` integer NOT NULL,
  `worker_id` integer REFERENCES `nursery_workers`(`id`) ON DELETE set null
);
--> statement-breakpoint

INSERT INTO `nursery_assignments` (`id`, `schedule_id`, `date`, `service_time_id`, `slot`, `worker_id`)
SELECT a.id, a.schedule_id, a.date, m.service_time_id, a.slot, a.worker_id
FROM old_assignments a
JOIN nursery_service_map m ON m.service_type = a.service_type;
--> statement-breakpoint

CREATE UNIQUE INDEX `nursery_assignments_schedule_id_date_service_time_id_slot_unique`
  ON `nursery_assignments` (`schedule_id`, `date`, `service_time_id`, `slot`);
--> statement-breakpoint

-- Nothing may be lost in the rebuild.
INSERT INTO migration_guard (label, n)
SELECT 'worker_services rows lost in rebuild',
  (SELECT COUNT(*) FROM old_worker_services) - (SELECT COUNT(*) FROM nursery_worker_services);
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'assignments lost in rebuild',
  (SELECT COUNT(*) FROM old_assignments) - (SELECT COUNT(*) FROM nursery_assignments);
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'assignments that lost their worker in rebuild',
  (SELECT COUNT(*) FROM nursery_assignments WHERE worker_id IS NULL)
  - (SELECT COUNT(*) FROM old_assignments WHERE worker_id IS NULL);
--> statement-breakpoint

-- ── special_music: nullable FK, 'other' becomes NULL ────────────────────────
ALTER TABLE `special_music` ADD `service_time_id` integer REFERENCES `service_times`(`id`);
--> statement-breakpoint

UPDATE special_music
SET service_time_id = (
  SELECT m.service_time_id FROM special_service_map m WHERE m.service_type = special_music.service_type
)
WHERE service_type <> 'other';
--> statement-breakpoint

-- A one-off must carry its own label once it no longer has a service time.
UPDATE special_music
SET service_label = COALESCE(NULLIF(TRIM(COALESCE(service_label, '')), ''), 'Other Service')
WHERE service_type = 'other';
--> statement-breakpoint

INSERT INTO migration_guard (label, n)
SELECT 'special_music rows that lost their service_time_id', COUNT(*)
FROM special_music WHERE service_type <> 'other' AND service_time_id IS NULL;
--> statement-breakpoint

ALTER TABLE `special_music` DROP COLUMN `service_type`;
--> statement-breakpoint

-- The Special Music Schedule used to hardcode ['sunday_am','sunday_pm']. That
-- set becomes an explicit setting so it survives a Service Time rename, seeded
-- here where the old enum's meaning is still known.
INSERT INTO settings (`key`, `value`)
SELECT
  'schedules.specialMusic.serviceTimeIds',
  '[' || GROUP_CONCAT(id) || ']'
FROM (
  SELECT id FROM service_times WHERE name IN ('Sunday Morning', 'Sunday Evening') ORDER BY sort_order
)
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE `key` = 'schedules.specialMusic.serviceTimeIds');
--> statement-breakpoint

DROP TABLE worker_person_map;--> statement-breakpoint
DROP TABLE nursery_service_map;--> statement-breakpoint
DROP TABLE special_service_map;--> statement-breakpoint
DROP TABLE old_workers;--> statement-breakpoint
DROP TABLE old_worker_services;--> statement-breakpoint
DROP TABLE old_assignments;--> statement-breakpoint
DROP TABLE old_service_config;--> statement-breakpoint
DROP TABLE migration_guard;--> statement-breakpoint

PRAGMA foreign_keys=ON;
