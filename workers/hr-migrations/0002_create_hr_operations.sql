PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employee_leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  employee_uid TEXT NOT NULL,
  employee_name TEXT,
  employee_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  leave_type TEXT NOT NULL DEFAULT 'annual',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count REAL,
  balance_deducted_days REAL NOT NULL DEFAULT 0,
  balance_restored_days REAL NOT NULL DEFAULT 0,
  cancelled_date_keys_json TEXT NOT NULL DEFAULT '[]',
  cancellation_date TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancelled_by_email TEXT,
  cancelled_by_name TEXT,
  employee_note TEXT,
  hr_note TEXT,
  decided_at TEXT,
  decided_by TEXT,
  decided_by_email TEXT,
  decided_by_name TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  reviewed_by_email TEXT,
  reviewed_by_name TEXT,
  source TEXT NOT NULL DEFAULT 'firestore',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_uid
  ON employee_leave_requests (employee_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id
  ON employee_leave_requests (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON employee_leave_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates
  ON employee_leave_requests (start_date, end_date);

CREATE TABLE IF NOT EXISTS employee_absences (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  employee_uid TEXT NOT NULL,
  absence_date TEXT NOT NULL,
  absence_type TEXT NOT NULL DEFAULT 'full_day',
  note TEXT,
  created_by_uid TEXT,
  source TEXT NOT NULL DEFAULT 'firestore',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_absences_employee_uid_date
  ON employee_absences (employee_uid, absence_date DESC);
CREATE INDEX IF NOT EXISTS idx_absences_employee_id_date
  ON employee_absences (employee_id, absence_date DESC);
CREATE INDEX IF NOT EXISTS idx_absences_date
  ON employee_absences (absence_date DESC);

CREATE TABLE IF NOT EXISTS employee_service_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  employee_uid TEXT NOT NULL,
  employee_name TEXT,
  employee_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  request_type TEXT NOT NULL,
  title TEXT,
  request_date TEXT,
  start_date TEXT,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  amount REAL,
  letter_type TEXT,
  employee_note TEXT,
  hr_note TEXT,
  decided_at TEXT,
  decided_by TEXT,
  decided_by_email TEXT,
  decided_by_name TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  reviewed_by_email TEXT,
  reviewed_by_name TEXT,
  source TEXT NOT NULL DEFAULT 'firestore',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_requests_employee_uid
  ON employee_service_requests (employee_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_employee_id
  ON employee_service_requests (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_status
  ON employee_service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_type
  ON employee_service_requests (request_type, created_at DESC);

ALTER TABLE hr_migration_runs ADD COLUMN leave_requests_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_migration_runs ADD COLUMN absences_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_migration_runs ADD COLUMN service_requests_received INTEGER NOT NULL DEFAULT 0;

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('leave_requests.view', 'عرض طلبات الإجازة', 'View leave requests', 'leave'),
  ('leave_requests.manage', 'إدارة طلبات الإجازة', 'Manage leave requests', 'leave'),
  ('absences.view', 'عرض الغياب', 'View absences', 'attendance'),
  ('absences.manage', 'إدارة الغياب', 'Manage absences', 'attendance'),
  ('service_requests.view', 'عرض طلبات الموظفين', 'View employee requests', 'requests'),
  ('service_requests.manage', 'إدارة طلبات الموظفين', 'Manage employee requests', 'requests')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'leave_requests.view'),
  ('owner', 'leave_requests.manage'),
  ('owner', 'absences.view'),
  ('owner', 'absences.manage'),
  ('owner', 'service_requests.view'),
  ('owner', 'service_requests.manage'),
  ('admin', 'leave_requests.view'),
  ('admin', 'leave_requests.manage'),
  ('admin', 'absences.view'),
  ('admin', 'absences.manage'),
  ('admin', 'service_requests.view'),
  ('admin', 'service_requests.manage'),
  ('hr', 'leave_requests.view'),
  ('hr', 'leave_requests.manage'),
  ('hr', 'absences.view'),
  ('hr', 'absences.manage'),
  ('hr', 'service_requests.view'),
  ('hr', 'service_requests.manage'),
  ('accountant', 'leave_requests.view'),
  ('accountant', 'absences.view'),
  ('accountant', 'service_requests.view');
