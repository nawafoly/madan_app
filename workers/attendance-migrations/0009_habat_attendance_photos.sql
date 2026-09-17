PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS habat_attendance_photos (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  access_id TEXT,
  attendance_date TEXT NOT NULL,
  clock_type TEXT NOT NULL CHECK (clock_type IN ('check_in', 'check_out')),
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(record_id, clock_type),
  FOREIGN KEY(record_id) REFERENCES habat_attendance_records(id) ON DELETE CASCADE,
  FOREIGN KEY(access_id) REFERENCES habat_attendance_access(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_habat_attendance_photos_record
  ON habat_attendance_photos (record_id, clock_type);

CREATE INDEX IF NOT EXISTS idx_habat_attendance_photos_access_date
  ON habat_attendance_photos (access_id, attendance_date DESC, captured_at DESC);
