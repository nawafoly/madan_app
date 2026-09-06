PRAGMA foreign_keys = ON;

-- Habbat Al Waraq attendance-only day management.
-- These tables remain logically isolated under the habat_* namespace.

CREATE TABLE IF NOT EXISTS habat_attendance_day_overrides (
  id TEXT PRIMARY KEY,
  access_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  override_type TEXT NOT NULL
    CHECK (override_type IN ('emergency_leave', 'absence')),
  day_portion TEXT NOT NULL DEFAULT 'full_day'
    CHECK (day_portion IN ('full_day', 'half_day')),
  reason TEXT,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (access_id) REFERENCES habat_attendance_access(id) ON DELETE CASCADE,
  UNIQUE (access_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_habat_day_overrides_access_date
  ON habat_attendance_day_overrides (access_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_habat_day_overrides_type_date
  ON habat_attendance_day_overrides (override_type, attendance_date DESC);

CREATE TABLE IF NOT EXISTS habat_attendance_monthly_summaries (
  id TEXT PRIMARY KEY,
  access_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  generated_by_uid TEXT,
  generated_by_email TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (access_id) REFERENCES habat_attendance_access(id) ON DELETE CASCADE,
  UNIQUE (access_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_habat_monthly_summaries_access_month
  ON habat_attendance_monthly_summaries (access_id, month_key DESC);
