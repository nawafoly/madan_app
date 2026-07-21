PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employee_payroll_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  employee_uid TEXT NOT NULL,
  payroll_month TEXT NOT NULL,
  month_start TEXT NOT NULL,
  month_end TEXT NOT NULL,
  calculation_start_date TEXT,
  calculation_end_date TEXT,
  base_salary REAL NOT NULL DEFAULT 0,
  housing_allowance REAL,
  transportation_allowance REAL,
  other_allowances REAL,
  allowances REAL NOT NULL DEFAULT 0,
  absence_days REAL NOT NULL DEFAULT 0,
  absence_deduction REAL NOT NULL DEFAULT 0,
  expected_work_hours REAL,
  actual_worked_hours REAL,
  attendance_late_hours REAL,
  attendance_missing_hours REAL,
  attendance_overtime_hours REAL,
  attendance_complete_days REAL,
  attendance_incomplete_days REAL,
  attendance_absent_days REAL,
  attendance_absence_deduction REAL,
  attendance_source TEXT NOT NULL DEFAULT 'cloudflare_attendance',
  attendance_summary_json TEXT NOT NULL DEFAULT '{}',
  schedule_snapshot_json TEXT NOT NULL DEFAULT '{}',
  delay_deduction REAL NOT NULL DEFAULT 0,
  overtime_bonus REAL NOT NULL DEFAULT 0,
  insurance_deduction REAL NOT NULL DEFAULT 0,
  salary_deductions_json TEXT NOT NULL DEFAULT '[]',
  salary_advance_deduction REAL NOT NULL DEFAULT 0,
  salary_advance_request_ids_json TEXT NOT NULL DEFAULT '[]',
  total_salary_deductions REAL NOT NULL DEFAULT 0,
  absence_entries_json TEXT NOT NULL DEFAULT '[]',
  gross_salary REAL,
  final_salary REAL NOT NULL DEFAULT 0,
  mudad_document_json TEXT,
  status TEXT NOT NULL DEFAULT 'finalized',
  source TEXT NOT NULL DEFAULT 'hr_api',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by_uid TEXT,
  created_by_email TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_employee_month_unique
  ON employee_payroll_records (employee_id, payroll_month)
  WHERE employee_id IS NOT NULL AND employee_id <> '';
CREATE INDEX IF NOT EXISTS idx_payroll_employee_uid_month
  ON employee_payroll_records (employee_uid, payroll_month DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_month
  ON employee_payroll_records (payroll_month DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_status
  ON employee_payroll_records (status, payroll_month DESC);

ALTER TABLE employee_service_requests ADD COLUMN payroll_record_id TEXT;
ALTER TABLE employee_service_requests ADD COLUMN payroll_month TEXT;
ALTER TABLE employee_service_requests ADD COLUMN settled_at TEXT;
ALTER TABLE employee_service_requests ADD COLUMN settled_by TEXT;

CREATE INDEX IF NOT EXISTS idx_service_requests_payroll_settlement
  ON employee_service_requests (request_type, status, payroll_record_id, employee_uid);

ALTER TABLE hr_migration_runs ADD COLUMN payroll_records_received INTEGER NOT NULL DEFAULT 0;

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('payroll.view', 'عرض الرواتب', 'View payroll', 'payroll'),
  ('payroll.manage', 'إدارة واعتماد الرواتب', 'Manage payroll', 'payroll')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'payroll.view'),
  ('owner', 'payroll.manage'),
  ('admin', 'payroll.view'),
  ('admin', 'payroll.manage'),
  ('hr', 'payroll.view'),
  ('hr', 'payroll.manage'),
  ('accountant', 'payroll.view'),
  ('accountant', 'payroll.manage');
