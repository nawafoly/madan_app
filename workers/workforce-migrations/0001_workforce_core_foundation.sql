PRAGMA foreign_keys = ON;

-- MIHVARA Workforce Core foundation.
-- This schema is tenant-scoped and intentionally contains no tenant/store names.
-- Existing tenant-specific attendance tables remain a legacy source during cutover.

CREATE TABLE IF NOT EXISTS workforce_tenants (
  id TEXT PRIMARY KEY,
  product_key TEXT NOT NULL,
  tenant_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_key, tenant_key)
);

CREATE INDEX IF NOT EXISTS idx_workforce_tenants_product_active
  ON workforce_tenants (product_key, is_active, tenant_key);

CREATE TABLE IF NOT EXISTS workforce_employee_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  account_uid TEXT,
  account_email TEXT,
  employee_number TEXT,
  display_name TEXT NOT NULL,
  job_title TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'terminated')),
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_employee_uid_unique
  ON workforce_employee_profiles (tenant_id, account_uid)
  WHERE account_uid IS NOT NULL AND trim(account_uid) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_employee_email_unique
  ON workforce_employee_profiles (tenant_id, lower(account_email))
  WHERE account_email IS NOT NULL AND trim(account_email) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_employee_number_unique
  ON workforce_employee_profiles (tenant_id, employee_number)
  WHERE employee_number IS NOT NULL AND trim(employee_number) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_employee_source_unique
  ON workforce_employee_profiles (tenant_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_employee_status
  ON workforce_employee_profiles (tenant_id, status, display_name);

CREATE TABLE IF NOT EXISTS workforce_employment (
  employee_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  service_start_date TEXT,
  service_end_date TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'inactive', 'terminated')),
  department TEXT,
  location_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workforce_employment_tenant_status
  ON workforce_employment (tenant_id, employment_status, service_start_date);

CREATE TABLE IF NOT EXISTS workforce_schedule_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0),
  early_leave_tolerance_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (early_leave_tolerance_minutes >= 0),
  working_days_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workforce_schedule_templates_active
  ON workforce_schedule_templates (tenant_id, is_active, name);

CREATE TABLE IF NOT EXISTS workforce_schedule_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES workforce_schedule_templates(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workforce_schedule_assignments_employee
  ON workforce_schedule_assignments (tenant_id, employee_id, effective_from DESC, effective_to);

CREATE TABLE IF NOT EXISTS workforce_schedule_exceptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  exception_type TEXT NOT NULL
    CHECK (exception_type IN ('off', 'custom_shift', 'alternate_shift', 'weekly_rest_work')),
  template_id TEXT,
  custom_start_time TEXT,
  custom_end_time TEXT,
  reason TEXT,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES workforce_schedule_templates(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_workforce_schedule_exceptions_date
  ON workforce_schedule_exceptions (tenant_id, work_date, employee_id);

CREATE TABLE IF NOT EXISTS workforce_attendance_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'unlinked', 'not_ready', 'exempt')),
  exemption_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, employee_id),
  UNIQUE (tenant_id, source_type, source_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_workforce_attendance_links_status
  ON workforce_attendance_links (tenant_id, status, employee_id);

CREATE TABLE IF NOT EXISTS workforce_attendance_month_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  link_status TEXT NOT NULL
    CHECK (link_status IN ('confirmed', 'unlinked', 'not_ready', 'exempt')),
  source_type TEXT,
  source_revision TEXT,
  summary_json TEXT NOT NULL,
  generated_by_uid TEXT,
  generated_by_email TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  locked_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, employee_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_workforce_attendance_month_snapshots_month
  ON workforce_attendance_month_snapshots (tenant_id, month_key, employee_id);

CREATE TABLE IF NOT EXISTS workforce_leaves (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type TEXT NOT NULL
    CHECK (leave_type IN ('annual', 'sick', 'emergency', 'unpaid', 'rest', 'weekly_rest_substitute', 'other')),
  duration_kind TEXT NOT NULL DEFAULT 'full_day'
    CHECK (duration_kind IN ('full_day', 'half_day', 'partial')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  partial_start_time TEXT,
  partial_end_time TEXT,
  requested_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  note TEXT,
  requested_by_uid TEXT,
  approved_by_uid TEXT,
  approved_by_email TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workforce_leaves_employee_dates
  ON workforce_leaves (tenant_id, employee_id, start_date DESC, end_date, status);
CREATE INDEX IF NOT EXISTS idx_workforce_leaves_status_dates
  ON workforce_leaves (tenant_id, status, start_date DESC, end_date);

CREATE TABLE IF NOT EXISTS workforce_absences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  absence_date TEXT NOT NULL,
  day_portion TEXT NOT NULL DEFAULT 'full_day'
    CHECK (day_portion IN ('full_day', 'half_day')),
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'cancelled')),
  reason TEXT,
  payroll_treatment TEXT NOT NULL DEFAULT 'attendance_policy'
    CHECK (payroll_treatment IN ('attendance_policy', 'no_deduction', 'manual_review')),
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, employee_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_workforce_absences_date
  ON workforce_absences (tenant_id, absence_date DESC, status, employee_id);

CREATE TABLE IF NOT EXISTS workforce_leave_balances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  balance_minutes INTEGER NOT NULL DEFAULT 0,
  as_of_date TEXT NOT NULL,
  policy_snapshot_json TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, employee_id, leave_type)
);

CREATE TABLE IF NOT EXISTS workforce_leave_ledger (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('opening', 'accrual', 'credit', 'debit', 'adjustment', 'recall', 'reversal')),
  delta_minutes INTEGER NOT NULL,
  balance_before_minutes INTEGER,
  balance_after_minutes INTEGER,
  effective_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  operation_id TEXT,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_leave_ledger_operation_unique
  ON workforce_leave_ledger (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL AND trim(operation_id) <> '';
CREATE INDEX IF NOT EXISTS idx_workforce_leave_ledger_employee
  ON workforce_leave_ledger (tenant_id, employee_id, leave_type, effective_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS workforce_payroll_settings (
  employee_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  base_salary_halalas INTEGER NOT NULL DEFAULT 0 CHECK (base_salary_halalas >= 0),
  housing_allowance_halalas INTEGER NOT NULL DEFAULT 0 CHECK (housing_allowance_halalas >= 0),
  transportation_allowance_halalas INTEGER NOT NULL DEFAULT 0 CHECK (transportation_allowance_halalas >= 0),
  other_allowances_halalas INTEGER NOT NULL DEFAULT 0 CHECK (other_allowances_halalas >= 0),
  work_days_per_month REAL,
  daily_hours REAL,
  monthly_hours REAL,
  deduction_method TEXT NOT NULL DEFAULT 'hourly'
    CHECK (deduction_method IN ('hourly', 'daily')),
  overtime_enabled INTEGER NOT NULL DEFAULT 0 CHECK (overtime_enabled IN (0, 1)),
  overtime_multiplier REAL NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier > 0),
  attendance_payroll_mode TEXT NOT NULL DEFAULT 'required'
    CHECK (attendance_payroll_mode IN ('required', 'exempt')),
  attendance_payroll_exemption_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_settings_tenant
  ON workforce_payroll_settings (tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS workforce_payroll_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  pay_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'approved', 'paid')),
  reviewed_at TEXT,
  reviewed_by_uid TEXT,
  approved_at TEXT,
  approved_by_uid TEXT,
  paid_at TEXT,
  paid_by_uid TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_periods_month
  ON workforce_payroll_periods (tenant_id, month_key DESC, status);

CREATE TABLE IF NOT EXISTS workforce_payroll_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'approved', 'paid')),
  base_salary_halalas INTEGER NOT NULL DEFAULT 0 CHECK (base_salary_halalas >= 0),
  allowances_halalas INTEGER NOT NULL DEFAULT 0 CHECK (allowances_halalas >= 0),
  attendance_deduction_halalas INTEGER NOT NULL DEFAULT 0 CHECK (attendance_deduction_halalas >= 0),
  absence_deduction_halalas INTEGER NOT NULL DEFAULT 0 CHECK (absence_deduction_halalas >= 0),
  overtime_halalas INTEGER NOT NULL DEFAULT 0 CHECK (overtime_halalas >= 0),
  manual_additions_halalas INTEGER NOT NULL DEFAULT 0 CHECK (manual_additions_halalas >= 0),
  manual_deductions_halalas INTEGER NOT NULL DEFAULT 0 CHECK (manual_deductions_halalas >= 0),
  gross_salary_halalas INTEGER NOT NULL DEFAULT 0 CHECK (gross_salary_halalas >= 0),
  total_deductions_halalas INTEGER NOT NULL DEFAULT 0 CHECK (total_deductions_halalas >= 0),
  net_salary_halalas INTEGER NOT NULL DEFAULT 0 CHECK (net_salary_halalas >= 0),
  attendance_snapshot_json TEXT NOT NULL DEFAULT '{}',
  setup_snapshot_json TEXT NOT NULL DEFAULT '{}',
  calculation_snapshot_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  reviewed_at TEXT,
  reviewed_by_uid TEXT,
  approved_at TEXT,
  approved_by_uid TEXT,
  paid_at TEXT,
  paid_by_uid TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (period_id) REFERENCES workforce_payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, employee_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_entries_period
  ON workforce_payroll_entries (tenant_id, period_id, status, employee_id);

CREATE TABLE IF NOT EXISTS workforce_payroll_adjustments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payroll_entry_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('addition', 'deduction')),
  kind TEXT NOT NULL
    CHECK (kind IN ('bonus', 'allowance', 'commission', 'manual_addition', 'advance', 'penalty', 'manual_deduction', 'other_deduction')),
  amount_halalas INTEGER NOT NULL CHECK (amount_halalas > 0),
  reason TEXT NOT NULL,
  note TEXT,
  source_type TEXT,
  source_id TEXT,
  added_by_uid TEXT,
  added_by_email TEXT,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_entry_id) REFERENCES workforce_payroll_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_adjustments_entry
  ON workforce_payroll_adjustments (tenant_id, payroll_entry_id, added_at DESC);

CREATE TABLE IF NOT EXISTS workforce_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_uid TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workforce_audit_tenant_created
  ON workforce_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workforce_audit_entity
  ON workforce_audit_events (tenant_id, entity_type, entity_id, created_at DESC);
