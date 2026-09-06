PRAGMA foreign_keys = ON;

-- Habbat Al Waraq attendance management layer.
-- This remains logically isolated in habat_* tables inside ATTENDANCE_DB.

CREATE TABLE IF NOT EXISTS habat_attendance_shifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 10,
  early_leave_tolerance_minutes INTEGER NOT NULL DEFAULT 0,
  working_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO habat_attendance_shifts (
  id, name, start_time, end_time, grace_minutes,
  early_leave_tolerance_minutes, working_days, is_active
) VALUES (
  'habat_shift_default', 'الدوام الافتراضي', '09:00', '17:00', 10, 0,
  '0,1,2,3,4,5,6', 1
);

CREATE TABLE IF NOT EXISTS habat_attendance_shift_assignments (
  id TEXT PRIMARY KEY,
  access_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (access_id) REFERENCES habat_attendance_access(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES habat_attendance_shifts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_habat_shift_assignments_access_dates
  ON habat_attendance_shift_assignments (access_id, effective_from DESC, effective_to);
CREATE INDEX IF NOT EXISTS idx_habat_shift_assignments_shift
  ON habat_attendance_shift_assignments (shift_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS habat_attendance_settings (
  id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  location_required INTEGER NOT NULL DEFAULT 0 CHECK (location_required IN (0, 1)),
  latitude REAL,
  longitude REAL,
  radius_m REAL NOT NULL DEFAULT 100,
  max_accuracy_m REAL NOT NULL DEFAULT 150,
  updated_by_uid TEXT,
  updated_by_email TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO habat_attendance_settings (
  id, timezone, location_required, latitude, longitude, radius_m, max_accuracy_m
) VALUES ('default', 'Asia/Riyadh', 0, NULL, NULL, 100, 150);

ALTER TABLE habat_attendance_records ADD COLUMN shift_id TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN scheduled_start_at TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN scheduled_end_at TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN attendance_status TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN late_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habat_attendance_records ADD COLUMN early_leave_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habat_attendance_records ADD COLUMN worked_minutes INTEGER;
ALTER TABLE habat_attendance_records ADD COLUMN check_in_latitude REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_in_longitude REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_in_accuracy_m REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_in_distance_m REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_out_latitude REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_out_longitude REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_out_accuracy_m REAL;
ALTER TABLE habat_attendance_records ADD COLUMN check_out_distance_m REAL;

CREATE INDEX IF NOT EXISTS idx_habat_attendance_records_status_date
  ON habat_attendance_records (attendance_status, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_habat_attendance_records_shift_date
  ON habat_attendance_records (shift_id, attendance_date DESC);
