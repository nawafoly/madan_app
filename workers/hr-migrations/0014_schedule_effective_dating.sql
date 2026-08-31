PRAGMA foreign_keys = ON;

-- MADAN SCHEDULE EFFECTIVE DATING V1
--
-- Additive cutover foundation:
-- - employees remains the compatibility/current projection for now.
-- - canonical work-schedule assignment history lives here.
-- - bootstrap records only the state observed at cutover time.
-- - no pre-cutover schedule history is invented.
-- - a missing fixed shift window is preserved as NULL/NULL, not fabricated.
-- - weekly rest days are canonical lowercase English day keys.
-- - attendance/location zone ownership is intentionally excluded from this table.
-- - periods use [effective_from, effective_to) semantics.

CREATE TABLE IF NOT EXISTS employee_schedule_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,

  effective_from TEXT NOT NULL,
  effective_to TEXT,

  shift_start_time TEXT,
  shift_end_time TEXT,
  weekly_off_days_json TEXT NOT NULL DEFAULT '[]',

  source TEXT NOT NULL DEFAULT 'hr_api',
  reason TEXT,

  created_by_uid TEXT,
  created_by_email TEXT,

  closed_at TEXT,
  closed_by_uid TEXT,
  closed_by_email TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,

  CHECK (
    effective_from GLOB '????-??-??'
    AND date(effective_from) IS NOT NULL
  ),

  CHECK (
    effective_to IS NULL
    OR (
      effective_to GLOB '????-??-??'
      AND date(effective_to) IS NOT NULL
      AND effective_to > effective_from
    )
  ),

  CHECK (
    (shift_start_time IS NULL AND shift_end_time IS NULL)
    OR
    (shift_start_time IS NOT NULL AND shift_end_time IS NOT NULL)
  ),

  CHECK (
    shift_start_time IS NULL
    OR (
      length(shift_start_time) = 5
      AND shift_start_time GLOB '[0-2][0-9]:[0-5][0-9]'
      AND CAST(SUBSTR(shift_start_time, 1, 2) AS INTEGER) BETWEEN 0 AND 23
    )
  ),

  CHECK (
    shift_end_time IS NULL
    OR (
      length(shift_end_time) = 5
      AND shift_end_time GLOB '[0-2][0-9]:[0-5][0-9]'
      AND CAST(SUBSTR(shift_end_time, 1, 2) AS INTEGER) BETWEEN 0 AND 23
    )
  ),

  CHECK (json_valid(weekly_off_days_json))
);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_employee_effective
  ON employee_schedule_assignments (
    employee_id,
    effective_from DESC,
    effective_to
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_assignments_one_open_period
  ON employee_schedule_assignments(employee_id)
  WHERE effective_to IS NULL;

DROP TRIGGER IF EXISTS trg_schedule_assignment_no_overlap_insert;
CREATE TRIGGER trg_schedule_assignment_no_overlap_insert
BEFORE INSERT ON employee_schedule_assignments
WHEN EXISTS (
  SELECT 1
    FROM employee_schedule_assignments existing
   WHERE existing.employee_id = NEW.employee_id
     AND existing.effective_from < COALESCE(NEW.effective_to, '9999-12-31')
     AND NEW.effective_from < COALESCE(existing.effective_to, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'schedule_assignment_period_overlap');
END;

DROP TRIGGER IF EXISTS trg_schedule_assignment_weekly_off_array_insert;
CREATE TRIGGER trg_schedule_assignment_weekly_off_array_insert
BEFORE INSERT ON employee_schedule_assignments
WHEN
  CASE
    WHEN json_valid(NEW.weekly_off_days_json) = 0 THEN 1
    WHEN json_type(NEW.weekly_off_days_json) <> 'array' THEN 1
    ELSE 0
  END
BEGIN
  SELECT RAISE(ABORT, 'schedule_weekly_off_days_invalid');
END;

DROP TRIGGER IF EXISTS trg_schedule_assignment_weekly_off_values_insert;
CREATE TRIGGER trg_schedule_assignment_weekly_off_values_insert
BEFORE INSERT ON employee_schedule_assignments
WHEN json_valid(NEW.weekly_off_days_json) = 1
 AND json_type(NEW.weekly_off_days_json) = 'array'
 AND (
   EXISTS (
     SELECT 1
       FROM json_each(NEW.weekly_off_days_json)
      WHERE type <> 'text'
         OR CAST(value AS TEXT) NOT IN (
           'sunday',
           'monday',
           'tuesday',
           'wednesday',
           'thursday',
           'friday',
           'saturday'
         )
   )
   OR EXISTS (
     SELECT value
       FROM json_each(NEW.weekly_off_days_json)
      GROUP BY value
     HAVING COUNT(*) > 1
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'schedule_weekly_off_days_invalid');
END;

-- Existing business facts are immutable.
-- The only allowed UPDATE closes an open period and may record close metadata.
DROP TRIGGER IF EXISTS trg_schedule_assignment_immutable_update;
CREATE TRIGGER trg_schedule_assignment_immutable_update
BEFORE UPDATE ON employee_schedule_assignments
WHEN
     OLD.effective_to IS NOT NULL
  OR NEW.effective_to IS NULL
  OR NOT (NEW.id IS OLD.id)
  OR NOT (NEW.employee_id IS OLD.employee_id)
  OR NOT (NEW.effective_from IS OLD.effective_from)
  OR NOT (NEW.shift_start_time IS OLD.shift_start_time)
  OR NOT (NEW.shift_end_time IS OLD.shift_end_time)
  OR NOT (NEW.weekly_off_days_json IS OLD.weekly_off_days_json)
  OR NOT (NEW.source IS OLD.source)
  OR NOT (NEW.reason IS OLD.reason)
  OR NOT (NEW.created_by_uid IS OLD.created_by_uid)
  OR NOT (NEW.created_by_email IS OLD.created_by_email)
  OR NOT (NEW.created_at IS OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'schedule_assignment_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_schedule_assignment_block_delete;
CREATE TRIGGER trg_schedule_assignment_block_delete
BEFORE DELETE ON employee_schedule_assignments
BEGIN
  SELECT RAISE(ABORT, 'schedule_assignment_history_immutable');
END;

-- Bootstrap the currently observed schedule projection only.
-- effective_from is the cutover date, not an inferred historical schedule date.
-- NULL/NULL fixed shift windows are retained exactly as observed.
INSERT INTO employee_schedule_assignments (
  id,
  employee_id,
  effective_from,
  effective_to,
  shift_start_time,
  shift_end_time,
  weekly_off_days_json,
  source,
  reason,
  created_at,
  updated_at
)
SELECT
  'bootstrap:schedule:' || e.id,
  e.id,
  strftime('%Y-%m-%d', 'now'),
  NULL,
  e.shift_start_time,
  e.shift_end_time,
  e.weekly_off_days_json,
  'compat_bootstrap_0014',
  'bootstrap_current_employee_schedule_projection_at_cutover',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM employees e;

DROP VIEW IF EXISTS hr_current_schedule_assignments;
CREATE VIEW hr_current_schedule_assignments AS
SELECT a.*
  FROM employee_schedule_assignments a
 WHERE a.effective_from <= strftime('%Y-%m-%d', 'now')
   AND (
     a.effective_to IS NULL
     OR a.effective_to > strftime('%Y-%m-%d', 'now')
   );

DROP VIEW IF EXISTS hr_schedule_integrity_summary;
CREATE VIEW hr_schedule_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM employee_schedule_assignments
     WHERE effective_to IS NOT NULL
       AND effective_to <= effective_from
  ) AS invalid_effective_ranges,

  (
    SELECT COUNT(*)
      FROM employee_schedule_assignments a
      JOIN employee_schedule_assignments b
        ON a.employee_id = b.employee_id
       AND a.id < b.id
       AND a.effective_from < COALESCE(b.effective_to, '9999-12-31')
       AND b.effective_from < COALESCE(a.effective_to, '9999-12-31')
  ) AS overlapping_schedule_periods,

  (
    SELECT COUNT(*)
      FROM employees e
      LEFT JOIN hr_current_schedule_assignments a
        ON a.employee_id = e.id
     WHERE a.id IS NULL
  ) AS employees_without_current_schedule_assignment,

  (
    SELECT COUNT(*)
      FROM employee_schedule_assignments
     WHERE (shift_start_time IS NULL) <> (shift_end_time IS NULL)
  ) AS partial_shift_pairs,

  (
    SELECT COUNT(*)
      FROM employee_schedule_assignments a
     WHERE json_valid(a.weekly_off_days_json) = 0
        OR (
          json_valid(a.weekly_off_days_json) = 1
          AND json_type(a.weekly_off_days_json) <> 'array'
        )
  ) AS invalid_weekly_off_json,

  (
    SELECT COUNT(*)
      FROM employee_schedule_assignments a
     WHERE json_valid(a.weekly_off_days_json) = 1
       AND json_type(a.weekly_off_days_json) = 'array'
       AND EXISTS (
         SELECT 1
           FROM json_each(a.weekly_off_days_json)
          WHERE type <> 'text'
             OR CAST(value AS TEXT) NOT IN (
               'sunday',
               'monday',
               'tuesday',
               'wednesday',
               'thursday',
               'friday',
               'saturday'
             )
       )
  ) AS noncanonical_weekly_off_days,

  (
    SELECT COUNT(*)
      FROM employee_schedule_assignments a
     WHERE json_valid(a.weekly_off_days_json) = 1
       AND json_type(a.weekly_off_days_json) = 'array'
       AND EXISTS (
         SELECT value
           FROM json_each(a.weekly_off_days_json)
          GROUP BY value
         HAVING COUNT(*) > 1
       )
  ) AS duplicate_weekly_off_days,

  (
    SELECT COUNT(*)
      FROM hr_current_schedule_assignments
     WHERE shift_start_time IS NULL
       AND shift_end_time IS NULL
  ) AS current_assignments_without_fixed_shift_window;
