PRAGMA foreign_keys = ON;

ALTER TABLE employee_payroll_records ADD COLUMN finalized_at TEXT;
ALTER TABLE employee_payroll_records ADD COLUMN finalized_by_uid TEXT;
ALTER TABLE employee_payroll_records ADD COLUMN reopened_at TEXT;
ALTER TABLE employee_payroll_records ADD COLUMN reopened_by_uid TEXT;
ALTER TABLE employee_payroll_records ADD COLUMN reopen_reason TEXT;
ALTER TABLE employee_payroll_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE employee_payroll_records ADD COLUMN paid_at TEXT;
ALTER TABLE employee_payroll_records ADD COLUMN paid_by_uid TEXT;

UPDATE employee_payroll_records
SET finalized_at = COALESCE(finalized_at, created_at),
    finalized_by_uid = COALESCE(finalized_by_uid, created_by_uid),
    status = CASE
      WHEN status IS NULL OR TRIM(status) = '' THEN 'finalized'
      ELSE status
    END,
    revision = CASE WHEN revision IS NULL OR revision < 1 THEN 1 ELSE revision END;

CREATE INDEX IF NOT EXISTS idx_payroll_lifecycle_status
  ON employee_payroll_records (status, payroll_month DESC, updated_at DESC);
