PRAGMA foreign_keys = ON;

-- Employee-specific weekly schedule maturity layer.
--
-- Shift templates define reusable time/policy only. Weekly rest and weekday
-- pattern belong to the employee's effective-dated schedule assignment.
-- Existing working_days_json on workforce_schedule_templates remains only as a
-- backward-compatibility fallback for assignments created before this migration.
--
-- IMPORTANT: additive only. No habat_* table is renamed or dropped.

ALTER TABLE workforce_schedule_assignments
  ADD COLUMN weekly_rest_weekday INTEGER
  CHECK (weekly_rest_weekday IS NULL OR weekly_rest_weekday BETWEEN 0 AND 6);

ALTER TABLE workforce_schedule_assignments
  ADD COLUMN week_pattern_json TEXT;

ALTER TABLE workforce_schedule_assignments
  ADD COLUMN reason TEXT;

ALTER TABLE workforce_schedule_assignments
  ADD COLUMN operation_id TEXT;

ALTER TABLE workforce_schedule_assignments
  ADD COLUMN updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_schedule_assignment_operation_unique
  ON workforce_schedule_assignments (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL AND trim(operation_id) <> '';

CREATE INDEX IF NOT EXISTS idx_workforce_schedule_assignments_effective_weekly_rest
  ON workforce_schedule_assignments (
    tenant_id,
    employee_id,
    effective_from DESC,
    effective_to,
    weekly_rest_weekday
  );

-- Existing assignments intentionally stay NULL here. Runtime resolution keeps a
-- legacy-template fallback until HR explicitly saves that employee's schedule.
-- This avoids guessing a rest day for historical data and preserves audit truth.
