PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hr_notifications (
  id TEXT PRIMARY KEY,
  target_uid TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  notification_type TEXT NOT NULL DEFAULT 'system',
  related_to TEXT,
  related_id TEXT,
  related_path TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  read_at TEXT,
  source TEXT NOT NULL DEFAULT 'hr_api',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_by_uid TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (target_uid) REFERENCES accounts(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hr_notifications_target_created
  ON hr_notifications (target_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_target_unread
  ON hr_notifications (target_uid, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_related
  ON hr_notifications (related_to, related_id);

ALTER TABLE hr_audit_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'system';
ALTER TABLE hr_audit_logs ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE hr_audit_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'success';
ALTER TABLE hr_audit_logs ADD COLUMN message TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN entity_path TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN actor_name TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN source_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE hr_audit_logs ADD COLUMN related_ids_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE hr_audit_logs ADD COLUMN changes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE hr_audit_logs ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE hr_audit_logs ADD COLUMN request_id TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN session_id TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN occurred_at TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN source_system TEXT NOT NULL DEFAULT 'hr_api';
ALTER TABLE hr_audit_logs ADD COLUMN source_updated_at TEXT;
ALTER TABLE hr_audit_logs ADD COLUMN migrated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_created
  ON hr_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_category
  ON hr_audit_logs (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_status
  ON hr_audit_logs (status, created_at DESC);

ALTER TABLE hr_migration_runs ADD COLUMN notifications_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_migration_runs ADD COLUMN audit_logs_received INTEGER NOT NULL DEFAULT 0;

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('notifications.manage', 'إدارة الإشعارات الداخلية', 'Manage internal notifications', 'notifications'),
  ('audit.view', 'عرض سجل العمليات', 'View audit log', 'audit')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'notifications.manage'),
  ('owner', 'audit.view'),
  ('admin', 'notifications.manage'),
  ('admin', 'audit.view'),
  ('hr', 'notifications.manage'),
  ('hr', 'audit.view'),
  ('accountant', 'audit.view');
