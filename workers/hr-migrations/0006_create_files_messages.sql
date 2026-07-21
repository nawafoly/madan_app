CREATE TABLE IF NOT EXISTS hr_employee_files (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  employee_uid TEXT,
  sender_uid TEXT,
  receiver_uid TEXT,
  participant_uids_json TEXT NOT NULL DEFAULT '[]',
  title TEXT NOT NULL,
  description TEXT,
  file_type TEXT NOT NULL DEFAULT 'general',
  file_id TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_url TEXT,
  storage_key TEXT,
  content_type TEXT,
  file_size INTEGER,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  active INTEGER NOT NULL DEFAULT 1,
  official_document INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'hr_api',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_files_employee_uid
  ON hr_employee_files(employee_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_employee_files_sender_uid
  ON hr_employee_files(sender_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_employee_files_receiver_uid
  ON hr_employee_files(receiver_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_employee_files_active
  ON hr_employee_files(active, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_employee_messages (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  employee_uid TEXT,
  conversation_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  conversation_type TEXT NOT NULL DEFAULT 'hr_to_employee',
  participant_uids_json TEXT NOT NULL DEFAULT '[]',
  sender_uid TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'employee',
  recipient_uid TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'message',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'hr_api',
  source_updated_at TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_messages_employee_uid
  ON hr_employee_messages(employee_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_employee_messages_conversation
  ON hr_employee_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_hr_employee_messages_sender_uid
  ON hr_employee_messages(sender_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_employee_messages_recipient_uid
  ON hr_employee_messages(recipient_uid, is_read, created_at DESC);

ALTER TABLE hr_migration_runs ADD COLUMN employee_files_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_migration_runs ADD COLUMN employee_messages_received INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO permissions (permission_key, label_ar, label_en, category)
VALUES
  ('employee_files.view', 'عرض ملفات الموظفين', 'View employee files', 'hr'),
  ('employee_files.manage', 'إدارة ملفات الموظفين', 'Manage employee files', 'hr'),
  ('employee_messages.view', 'عرض رسائل الموظفين', 'View employee messages', 'hr'),
  ('employee_messages.manage', 'إدارة رسائل الموظفين', 'Manage employee messages', 'hr');

INSERT OR IGNORE INTO role_permissions (role_key, permission_key)
VALUES
  ('owner', 'employee_files.view'),
  ('owner', 'employee_files.manage'),
  ('owner', 'employee_messages.view'),
  ('owner', 'employee_messages.manage'),
  ('admin', 'employee_files.view'),
  ('admin', 'employee_files.manage'),
  ('admin', 'employee_messages.view'),
  ('admin', 'employee_messages.manage'),
  ('hr', 'employee_files.view'),
  ('hr', 'employee_files.manage'),
  ('hr', 'employee_messages.view'),
  ('hr', 'employee_messages.manage'),
  ('staff', 'employee_files.view'),
  ('staff', 'employee_messages.view');
