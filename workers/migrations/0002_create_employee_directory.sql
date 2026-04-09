-- ARCHITECTURE NOTE (2026-04-09):
-- Employee directory rows are stored in Cloudflare D1.
-- The worker reads this table directly for employee internal messaging.
-- Source synchronization is handled by a separate Firestore -> D1 sync script.

CREATE TABLE IF NOT EXISTS employee_directory (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  title TEXT,
  department TEXT,
  status_key TEXT NOT NULL DEFAULT 'active',
  role TEXT,
  linked_employee_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_directory_status_key
  ON employee_directory (status_key);

CREATE INDEX IF NOT EXISTS idx_employee_directory_is_active
  ON employee_directory (is_active);

CREATE INDEX IF NOT EXISTS idx_employee_directory_role
  ON employee_directory (role);

CREATE INDEX IF NOT EXISTS idx_employee_directory_name
  ON employee_directory (name);
