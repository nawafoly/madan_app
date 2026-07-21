PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  role_key TEXT PRIMARY KEY,
  label_ar TEXT NOT NULL,
  label_en TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_key TEXT PRIMARY KEY,
  label_ar TEXT NOT NULL,
  label_en TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_key TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (role_key, permission_key),
  FOREIGN KEY (role_key) REFERENCES roles(role_key) ON DELETE CASCADE,
  FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  uid TEXT PRIMARY KEY,
  email TEXT,
  username TEXT,
  display_name TEXT,
  title TEXT,
  role_key TEXT NOT NULL DEFAULT 'staff',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  employee_profile_enabled INTEGER NOT NULL DEFAULT 0 CHECK (employee_profile_enabled IN (0, 1)),
  linked_employee_id TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'firebase',
  source TEXT NOT NULL DEFAULT 'firestore',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (role_key) REFERENCES roles(role_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_unique
  ON accounts (lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username_unique
  ON accounts (lower(username)) WHERE username IS NOT NULL AND username <> '';
CREATE INDEX IF NOT EXISTS idx_accounts_role_key ON accounts (role_key);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts (is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_linked_employee_id ON accounts (linked_employee_id);

CREATE TABLE IF NOT EXISTS account_permissions (
  uid TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (uid, permission_key),
  FOREIGN KEY (uid) REFERENCES accounts(uid) ON DELETE CASCADE,
  FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_permissions_uid_effect
  ON account_permissions (uid, effect);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  auth_uid TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  title TEXT,
  department TEXT,
  employee_code TEXT,
  fingerprint_number TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  start_date TEXT,
  leave_balance REAL,
  base_salary REAL,
  housing_allowance REAL,
  transportation_allowance REAL,
  other_allowances REAL,
  insurance_deduction REAL,
  shift_start_time TEXT,
  shift_end_time TEXT,
  weekly_off_days_json TEXT NOT NULL DEFAULT '[]',
  allowed_zone_ids_json TEXT NOT NULL DEFAULT '[]',
  salary_deductions_json TEXT NOT NULL DEFAULT '[]',
  admin_notes TEXT,
  personal_json TEXT NOT NULL DEFAULT '{}',
  employment_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'firestore',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (auth_uid) REFERENCES accounts(uid) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_auth_uid_unique
  ON employees (auth_uid) WHERE auth_uid IS NOT NULL AND auth_uid <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_code_unique
  ON employees (employee_code) WHERE employee_code IS NOT NULL AND employee_code <> '';
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees (is_active);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees (employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees (department);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS hr_audit_logs (
  id TEXT PRIMARY KEY,
  actor_uid TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_entity
  ON hr_audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_actor
  ON hr_audit_logs (actor_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_migration_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  accounts_received INTEGER NOT NULL DEFAULT 0,
  employees_received INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

INSERT INTO roles (role_key, label_ar, label_en, priority) VALUES
  ('guest', 'زائر', 'Guest', 0),
  ('client', 'عميل', 'Client', 1),
  ('staff', 'موظف', 'Staff', 2),
  ('hr', 'موارد بشرية', 'HR', 3),
  ('accountant', 'محاسب', 'Accountant', 4),
  ('admin', 'مدير', 'Admin', 5),
  ('owner', 'مالك', 'Owner', 6)
ON CONFLICT(role_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  priority = excluded.priority,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('dashboard.view', 'عرض لوحة التحكم', 'View dashboard', 'dashboard'),
  ('projects.view', 'عرض المشاريع', 'View projects', 'projects'),
  ('projects.manage', 'إدارة المشاريع', 'Manage projects', 'projects'),
  ('projects.publish', 'نشر المشاريع', 'Publish projects', 'projects'),
  ('investments.view', 'عرض الاستثمارات', 'View investments', 'investments'),
  ('investments.manage', 'إدارة الاستثمارات', 'Manage investments', 'investments'),
  ('users.view', 'عرض العملاء', 'View clients', 'users'),
  ('users.manage', 'إدارة العملاء', 'Manage clients', 'users'),
  ('messages.view', 'عرض الرسائل', 'View messages', 'messages'),
  ('messages.manage', 'إدارة الرسائل', 'Manage messages', 'messages'),
  ('recruitment.view', 'عرض طلبات التوظيف', 'View recruitment', 'recruitment'),
  ('recruitment.manage', 'إدارة طلبات التوظيف', 'Manage recruitment', 'recruitment'),
  ('employees.view', 'عرض الموظفين', 'View employees', 'employees'),
  ('employees.manage', 'إدارة الموظفين', 'Manage employees', 'employees'),
  ('attendance.view', 'عرض الحضور والانصراف', 'View attendance', 'attendance'),
  ('weekly_reports.manager_notes', 'كتابة ملاحظات المدير', 'Write manager notes', 'reports'),
  ('reports.view', 'عرض التقارير', 'View reports', 'reports'),
  ('financial.view', 'عرض المالية', 'View financials', 'financial'),
  ('financial.edit', 'تعديل المالية', 'Edit financials', 'financial'),
  ('settings.manage', 'إدارة الإعدادات', 'Manage settings', 'settings'),
  ('admin_accounts.manage', 'إدارة حسابات الإدارة', 'Manage admin accounts', 'accounts')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

DELETE FROM role_permissions;

INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'dashboard.view'),
  ('owner', 'projects.view'),
  ('owner', 'projects.manage'),
  ('owner', 'projects.publish'),
  ('owner', 'investments.view'),
  ('owner', 'investments.manage'),
  ('owner', 'users.view'),
  ('owner', 'users.manage'),
  ('owner', 'messages.view'),
  ('owner', 'messages.manage'),
  ('owner', 'recruitment.view'),
  ('owner', 'recruitment.manage'),
  ('owner', 'employees.view'),
  ('owner', 'employees.manage'),
  ('owner', 'attendance.view'),
  ('owner', 'weekly_reports.manager_notes'),
  ('owner', 'reports.view'),
  ('owner', 'financial.view'),
  ('owner', 'financial.edit'),
  ('owner', 'settings.manage'),
  ('owner', 'admin_accounts.manage'),

  ('admin', 'dashboard.view'),
  ('admin', 'projects.view'),
  ('admin', 'projects.manage'),
  ('admin', 'projects.publish'),
  ('admin', 'investments.view'),
  ('admin', 'investments.manage'),
  ('admin', 'users.view'),
  ('admin', 'users.manage'),
  ('admin', 'messages.view'),
  ('admin', 'messages.manage'),
  ('admin', 'recruitment.view'),
  ('admin', 'recruitment.manage'),
  ('admin', 'employees.view'),
  ('admin', 'employees.manage'),
  ('admin', 'attendance.view'),
  ('admin', 'reports.view'),
  ('admin', 'settings.manage'),
  ('admin', 'admin_accounts.manage'),

  ('hr', 'recruitment.view'),
  ('hr', 'recruitment.manage'),
  ('hr', 'employees.view'),
  ('hr', 'employees.manage'),
  ('hr', 'attendance.view'),
  ('hr', 'reports.view'),

  ('accountant', 'dashboard.view'),
  ('accountant', 'projects.view'),
  ('accountant', 'investments.view'),
  ('accountant', 'financial.view'),
  ('accountant', 'financial.edit'),
  ('accountant', 'reports.view'),

  ('client', 'projects.view'),
  ('guest', 'projects.view');
