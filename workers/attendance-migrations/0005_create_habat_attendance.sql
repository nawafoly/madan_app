PRAGMA foreign_keys = ON;

-- Habbat Al Waraq is intentionally isolated from Maedin's normal attendance tables.
-- Access and clock records live in their own namespace inside ATTENDANCE_DB.

CREATE TABLE IF NOT EXISTS habat_attendance_access (
  id TEXT PRIMARY KEY,
  uid TEXT,
  email TEXT NOT NULL,
  display_name TEXT,
  access_level TEXT NOT NULL DEFAULT 'employee'
    CHECK (access_level IN ('employee', 'manager')),
  clock_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (clock_enabled IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_habat_attendance_access_email_unique
  ON habat_attendance_access (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_habat_attendance_access_uid_unique
  ON habat_attendance_access (uid)
  WHERE uid IS NOT NULL AND trim(uid) <> '';
CREATE INDEX IF NOT EXISTS idx_habat_attendance_access_active
  ON habat_attendance_access (is_active, access_level);

CREATE TABLE IF NOT EXISTS habat_attendance_records (
  id TEXT PRIMARY KEY,
  access_id TEXT,
  account_uid TEXT NOT NULL,
  account_email TEXT,
  display_name TEXT,
  attendance_date TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  check_in_ip TEXT,
  check_out_ip TEXT,
  check_in_user_agent TEXT,
  check_out_user_agent TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (access_id) REFERENCES habat_attendance_access(id) ON DELETE SET NULL,
  UNIQUE (account_uid, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_habat_attendance_records_date
  ON habat_attendance_records (attendance_date DESC, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_habat_attendance_records_uid_date
  ON habat_attendance_records (account_uid, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_habat_attendance_records_email_date
  ON habat_attendance_records (account_email, attendance_date DESC);

CREATE TABLE IF NOT EXISTS habat_attendance_audit (
  id TEXT PRIMARY KEY,
  actor_uid TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_habat_attendance_audit_created
  ON habat_attendance_audit (created_at DESC);
