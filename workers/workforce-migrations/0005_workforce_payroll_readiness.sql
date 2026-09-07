PRAGMA foreign_keys = ON;

-- Generic payroll attendance-readiness snapshot fields.
-- These fields record whether automatic attendance deductions were eligible and
-- exactly which closed-through date/policy version produced the payroll entry.

ALTER TABLE workforce_payroll_entries ADD COLUMN attendance_readiness_status TEXT NOT NULL DEFAULT 'not_evaluated'
  CHECK (attendance_readiness_status IN ('not_evaluated', 'ready', 'not_ready', 'exempt'));
ALTER TABLE workforce_payroll_entries ADD COLUMN attendance_readiness_reason TEXT;
ALTER TABLE workforce_payroll_entries ADD COLUMN attendance_link_status TEXT;
ALTER TABLE workforce_payroll_entries ADD COLUMN attendance_completed_through TEXT;
ALTER TABLE workforce_payroll_entries ADD COLUMN attendance_calculated_at TEXT;
ALTER TABLE workforce_payroll_entries ADD COLUMN attendance_policy_version TEXT;

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_entry_readiness
  ON workforce_payroll_entries (tenant_id, month_key, attendance_readiness_status, employee_id);
