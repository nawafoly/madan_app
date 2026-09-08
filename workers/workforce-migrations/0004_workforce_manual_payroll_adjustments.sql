PRAGMA foreign_keys = ON;

-- Generic manual payroll adjustment lifecycle.
-- Attendance/absence deductions remain zero until the payroll readiness engine is
-- explicitly connected; this migration only makes human-entered adjustments
-- retry-safe, cancellable, and auditable.

ALTER TABLE workforce_payroll_adjustments ADD COLUMN operation_id TEXT;
ALTER TABLE workforce_payroll_adjustments ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'cancelled'));
ALTER TABLE workforce_payroll_adjustments ADD COLUMN metadata_json TEXT;
ALTER TABLE workforce_payroll_adjustments ADD COLUMN cancelled_at TEXT;
ALTER TABLE workforce_payroll_adjustments ADD COLUMN cancelled_by_uid TEXT;
ALTER TABLE workforce_payroll_adjustments ADD COLUMN cancelled_by_email TEXT;
ALTER TABLE workforce_payroll_adjustments ADD COLUMN updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_payroll_adjustment_operation
  ON workforce_payroll_adjustments (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL AND trim(operation_id) <> '';

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_adjustment_employee_status
  ON workforce_payroll_adjustments (tenant_id, employee_id, status, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_adjustment_source
  ON workforce_payroll_adjustments (tenant_id, source_type, source_id, status)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
