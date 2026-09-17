PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS habat_attendance_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_m REAL NOT NULL DEFAULT 100 CHECK (radius_m >= 10 AND radius_m <= 5000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_habat_attendance_locations_active
  ON habat_attendance_locations (is_active, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS habat_attendance_location_assignments (
  id TEXT PRIMARY KEY,
  access_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(access_id, location_id),
  FOREIGN KEY(access_id) REFERENCES habat_attendance_access(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES habat_attendance_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_habat_location_assignments_access
  ON habat_attendance_location_assignments (access_id, location_id);
CREATE INDEX IF NOT EXISTS idx_habat_location_assignments_location
  ON habat_attendance_location_assignments (location_id, access_id);

ALTER TABLE habat_attendance_records ADD COLUMN check_in_location_id TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN check_in_location_name TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN check_out_location_id TEXT;
ALTER TABLE habat_attendance_records ADD COLUMN check_out_location_name TEXT;

-- Preserve the currently configured single geofence as the first managed location.
INSERT OR IGNORE INTO habat_attendance_locations (
  id, name, latitude, longitude, radius_m, is_active, created_at, updated_at
)
SELECT
  'habat_location_legacy_main',
  'الموقع الرئيسي',
  latitude,
  longitude,
  CASE
    WHEN radius_m < 10 THEN 10
    WHEN radius_m > 5000 THEN 5000
    ELSE radius_m
  END,
  1,
  updated_at,
  updated_at
FROM habat_attendance_settings
WHERE id = 'default'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

-- Keep existing employees working after migration by assigning the legacy location.
INSERT OR IGNORE INTO habat_attendance_location_assignments (
  id, access_id, location_id, created_at
)
SELECT
  'habat_location_assignment_legacy_' || a.id,
  a.id,
  'habat_location_legacy_main',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM habat_attendance_access a
WHERE a.is_active = 1
  AND a.clock_enabled = 1
  AND EXISTS (
    SELECT 1 FROM habat_attendance_locations l
    WHERE l.id = 'habat_location_legacy_main' AND l.is_active = 1
  );
