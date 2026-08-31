PRAGMA foreign_keys = ON;

-- MADAN EMPLOYMENT EFFECTIVE DATING V1
--
-- Additive cutover foundation:
-- - employees remains the compatibility/current projection for now.
-- - canonical employment history lives here.
-- - bootstrap records only the state observed at cutover time.
-- - no pre-cutover employment history is invented.
-- - periods use [effective_from, effective_to) semantics.
-- - historical rows are immutable; change creates a new period.

CREATE TABLE IF NOT EXISTS employee_employment_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,

  effective_from TEXT NOT NULL,
  effective_to TEXT,

  employment_status TEXT NOT NULL,
  position_title TEXT,
  department TEXT,

  branch_id TEXT,
  team_id TEXT,
  position_id TEXT,
  manager_employee_id TEXT,

  employment_start_date TEXT,
  employment_end_date TEXT,

  source TEXT NOT NULL DEFAULT 'hr_api',
  reason TEXT,

  created_by_uid TEXT,
  created_by_email TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,

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

  CHECK (TRIM(employment_status) <> ''),

  CHECK (
    employment_end_date IS NULL
    OR employment_start_date IS NULL
    OR employment_end_date >= employment_start_date
  )
);

CREATE INDEX IF NOT EXISTS idx_employment_assignments_employee_effective
  ON employee_employment_assignments (
    employee_id,
    effective_from DESC,
    effective_to
  );

CREATE INDEX IF NOT EXISTS idx_employment_assignments_status_effective
  ON employee_employment_assignments (
    employment_status,
    effective_from DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_employment_assignments_one_open_period
  ON employee_employment_assignments(employee_id)
  WHERE effective_to IS NULL;

DROP TRIGGER IF EXISTS trg_employment_assignment_no_overlap_insert;
CREATE TRIGGER trg_employment_assignment_no_overlap_insert
BEFORE INSERT ON employee_employment_assignments
WHEN EXISTS (
  SELECT 1
    FROM employee_employment_assignments existing
   WHERE existing.employee_id = NEW.employee_id
     AND existing.effective_from < COALESCE(NEW.effective_to, '9999-12-31')
     AND NEW.effective_from < COALESCE(existing.effective_to, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'employment_assignment_period_overlap');
END;

-- Existing history cannot be rewritten.
-- The only allowed UPDATE closes an open period by setting effective_to.
DROP TRIGGER IF EXISTS trg_employment_assignment_immutable_update;
CREATE TRIGGER trg_employment_assignment_immutable_update
BEFORE UPDATE ON employee_employment_assignments
WHEN
     OLD.effective_to IS NOT NULL
  OR NEW.effective_to IS NULL
  OR NOT (NEW.id IS OLD.id)
  OR NOT (NEW.employee_id IS OLD.employee_id)
  OR NOT (NEW.effective_from IS OLD.effective_from)
  OR NOT (NEW.employment_status IS OLD.employment_status)
  OR NOT (NEW.position_title IS OLD.position_title)
  OR NOT (NEW.department IS OLD.department)
  OR NOT (NEW.branch_id IS OLD.branch_id)
  OR NOT (NEW.team_id IS OLD.team_id)
  OR NOT (NEW.position_id IS OLD.position_id)
  OR NOT (NEW.manager_employee_id IS OLD.manager_employee_id)
  OR NOT (NEW.employment_start_date IS OLD.employment_start_date)
  OR NOT (NEW.employment_end_date IS OLD.employment_end_date)
  OR NOT (NEW.source IS OLD.source)
  OR NOT (NEW.reason IS OLD.reason)
  OR NOT (NEW.created_by_uid IS OLD.created_by_uid)
  OR NOT (NEW.created_by_email IS OLD.created_by_email)
  OR NOT (NEW.created_at IS OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'employment_assignment_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_employment_assignment_block_delete;
CREATE TRIGGER trg_employment_assignment_block_delete
BEFORE DELETE ON employee_employment_assignments
BEGIN
  SELECT RAISE(ABORT, 'employment_assignment_history_immutable');
END;

-- Bootstrap the current observed projection only.
-- effective_from is the cutover date, NOT the employee hire date.
INSERT OR IGNORE INTO employee_employment_assignments (
  id,
  employee_id,
  effective_from,
  effective_to,
  employment_status,
  position_title,
  department,
  employment_start_date,
  source,
  reason,
  created_at,
  updated_at
)
SELECT
  'bootstrap:' || e.id,
  e.id,
  strftime('%Y-%m-%d', 'now'),
  NULL,
  TRIM(e.employment_status),
  e.title,
  e.department,
  CASE
    WHEN e.start_date IS NOT NULL
     AND date(SUBSTR(e.start_date, 1, 10)) IS NOT NULL
    THEN SUBSTR(e.start_date, 1, 10)
    ELSE NULL
  END,
  'compat_bootstrap_0012',
  'bootstrap_current_employee_projection_at_cutover',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM employees e;

DROP VIEW IF EXISTS hr_current_employment_assignments;
CREATE VIEW hr_current_employment_assignments AS
SELECT a.*
  FROM employee_employment_assignments a
 WHERE a.effective_from <= strftime('%Y-%m-%d', 'now')
   AND (
     a.effective_to IS NULL
     OR a.effective_to > strftime('%Y-%m-%d', 'now')
   );

DROP VIEW IF EXISTS hr_employment_integrity_summary;
CREATE VIEW hr_employment_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM employee_employment_assignments
     WHERE effective_to IS NOT NULL
       AND effective_to <= effective_from
  ) AS invalid_effective_ranges,

  (
    SELECT COUNT(*)
      FROM employee_employment_assignments a
      JOIN employee_employment_assignments b
        ON a.employee_id = b.employee_id
       AND a.id < b.id
       AND a.effective_from < COALESCE(b.effective_to, '9999-12-31')
       AND b.effective_from < COALESCE(a.effective_to, '9999-12-31')
  ) AS overlapping_assignment_periods,

  (
    SELECT COUNT(*)
      FROM employees e
      LEFT JOIN hr_current_employment_assignments a
        ON a.employee_id = e.id
     WHERE a.id IS NULL
  ) AS employees_without_current_assignment,

  (
    SELECT COUNT(*)
      FROM hr_current_employment_assignments
     WHERE employment_status NOT IN (
       'active',
       'probation',
       'on_leave',
       'inactive',
       'suspended',
       'terminated'
     )
  ) AS noncanonical_employment_statuses;
