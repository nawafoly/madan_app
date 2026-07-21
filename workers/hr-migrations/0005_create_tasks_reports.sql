PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hr_daily_tasks (
  id TEXT PRIMARY KEY,
  created_by_uid TEXT NOT NULL,
  receiver_uid TEXT,
  task_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  payload_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'hr_api',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_hr_daily_tasks_creator_date
  ON hr_daily_tasks (created_by_uid, task_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_daily_tasks_receiver_status
  ON hr_daily_tasks (receiver_uid, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_daily_tasks_status
  ON hr_daily_tasks (status, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_weekly_reports (
  id TEXT PRIMARY KEY,
  created_by_uid TEXT NOT NULL,
  receiver_uid TEXT,
  report_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  payload_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'hr_api',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_hr_weekly_reports_creator_date
  ON hr_weekly_reports (created_by_uid, report_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_weekly_reports_receiver_status
  ON hr_weekly_reports (receiver_uid, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_weekly_reports_status
  ON hr_weekly_reports (status, created_at DESC);

ALTER TABLE hr_migration_runs ADD COLUMN daily_tasks_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_migration_runs ADD COLUMN weekly_reports_received INTEGER NOT NULL DEFAULT 0;

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('daily_tasks.view', 'عرض المهام اليومية', 'View daily tasks', 'daily_tasks'),
  ('daily_tasks.manage', 'إدارة المهام اليومية', 'Manage daily tasks', 'daily_tasks'),
  ('weekly_reports.view', 'عرض التقارير الأسبوعية', 'View weekly reports', 'weekly_reports'),
  ('weekly_reports.manage', 'إدارة التقارير الأسبوعية', 'Manage weekly reports', 'weekly_reports')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'daily_tasks.view'),
  ('owner', 'daily_tasks.manage'),
  ('owner', 'weekly_reports.view'),
  ('owner', 'weekly_reports.manage'),
  ('admin', 'daily_tasks.view'),
  ('admin', 'daily_tasks.manage'),
  ('admin', 'weekly_reports.view'),
  ('admin', 'weekly_reports.manage'),
  ('hr', 'daily_tasks.view'),
  ('hr', 'daily_tasks.manage'),
  ('hr', 'weekly_reports.view'),
  ('hr', 'weekly_reports.manage'),
  ('staff', 'daily_tasks.view'),
  ('staff', 'weekly_reports.view');
