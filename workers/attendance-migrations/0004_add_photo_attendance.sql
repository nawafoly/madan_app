ALTER TABLE work_zones
  ADD COLUMN photo_attendance_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (photo_attendance_enabled IN (0, 1));

ALTER TABLE attendance_records
  ADD COLUMN photo_required INTEGER NOT NULL DEFAULT 0
  CHECK (photo_required IN (0, 1));

ALTER TABLE attendance_records ADD COLUMN photo_path TEXT;
ALTER TABLE attendance_records ADD COLUMN photo_content_type TEXT;
ALTER TABLE attendance_records ADD COLUMN photo_size_bytes INTEGER;
ALTER TABLE attendance_records ADD COLUMN photo_captured_at TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_records_photo
  ON attendance_records (photo_required, server_time DESC);
