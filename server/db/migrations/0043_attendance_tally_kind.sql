-- Attendance edits split into tallies and corrections (ADR-0027).
-- Every existing row is a correction: a full snapshot write is all the old endpoint could produce.

ALTER TABLE service_record_edits ADD COLUMN kind text DEFAULT 'correction' NOT NULL;--> statement-breakpoint
ALTER TABLE service_record_edits ADD COLUMN adjustment integer;
