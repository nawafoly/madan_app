-- MIHVARA Workforce Core — schedule exception / weekly-rest control extension.
-- Generic and tenant-scoped. Existing schedule rows remain intact.

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled'));

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN source_type TEXT;

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN source_id TEXT;

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN operation_id TEXT;

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN metadata_json TEXT;

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN cancelled_at TEXT;

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN cancelled_by_uid TEXT;

ALTER TABLE workforce_schedule_exceptions
  ADD COLUMN cancelled_by_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_schedule_exception_operation
  ON workforce_schedule_exceptions (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL AND trim(operation_id) <> '';

CREATE INDEX IF NOT EXISTS idx_workforce_schedule_exception_employee_status_date
  ON workforce_schedule_exceptions (tenant_id, employee_id, status, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_workforce_schedule_exception_source
  ON workforce_schedule_exceptions (tenant_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
