PRAGMA foreign_keys = ON;

-- MADAN ATTENDANCE RESOLUTION KERNEL V1
--
-- Establishes the canonical, immutable daily attendance result consumed by
-- Payroll. Raw punches remain owned by the Attendance D1 event ledger; this HR
-- database stores only the governed daily resolution and cross-boundary evidence
-- references needed to reproduce/explain it.
--
-- Cutover rules:
-- - no attendance resolution rows are bootstrapped by this migration;
-- - raw punch/event history lives across a separate durable D1 boundary;
-- - concrete policy versions are not fabricated;
-- - a later server resolver creates/revises rows from the current canonical
--   Work Obligation plus raw attendance evidence and effective policies.

CREATE TABLE IF NOT EXISTS employee_attendance_resolutions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),

  resolution_kind TEXT NOT NULL CHECK (
    resolution_kind IN (
      'attended',
      'absent',
      'non_working',
      'unresolved'
    )
  ),

  work_obligation_id TEXT NOT NULL,

  first_observed_at TEXT,
  last_observed_at TEXT,
  worked_minutes INTEGER,
  late_minutes INTEGER,
  early_exit_minutes INTEGER,
  overtime_candidate_minutes INTEGER,

  attendance_policy_version_id TEXT,
  late_early_policy_version_id TEXT,

  source_evidence_json TEXT NOT NULL DEFAULT '{}',
  resolution_inputs_json TEXT NOT NULL DEFAULT '{}',

  idempotency_key TEXT NOT NULL,
  supersedes_resolution_id TEXT,

  source TEXT NOT NULL DEFAULT 'attendance_resolver',
  reason TEXT,
  resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by_uid TEXT,
  resolved_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (work_obligation_id) REFERENCES employee_work_obligations(id) ON DELETE RESTRICT,
  FOREIGN KEY (attendance_policy_version_id) REFERENCES hr_policy_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (late_early_policy_version_id) REFERENCES hr_policy_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_resolution_id) REFERENCES employee_attendance_resolutions(id) ON DELETE RESTRICT,

  UNIQUE (employee_id, attendance_date, revision),
  UNIQUE (idempotency_key),
  UNIQUE (supersedes_resolution_id),

  CHECK (
    attendance_date GLOB '????-??-??'
    AND date(attendance_date) IS NOT NULL
  ),

  CHECK (TRIM(idempotency_key) <> ''),
  CHECK (json_valid(source_evidence_json) = 1),
  CHECK (json_valid(resolution_inputs_json) = 1),

  CHECK (worked_minutes IS NULL OR worked_minutes >= 0),
  CHECK (late_minutes IS NULL OR late_minutes >= 0),
  CHECK (early_exit_minutes IS NULL OR early_exit_minutes >= 0),
  CHECK (overtime_candidate_minutes IS NULL OR overtime_candidate_minutes >= 0),

  CHECK (
    first_observed_at IS NULL
    OR last_observed_at IS NULL
    OR last_observed_at >= first_observed_at
  ),

  CHECK (
    CASE resolution_kind
      WHEN 'attended' THEN
        first_observed_at IS NOT NULL
        AND last_observed_at IS NOT NULL
        AND worked_minutes IS NOT NULL
        AND worked_minutes > 0
        AND late_minutes IS NOT NULL
        AND early_exit_minutes IS NOT NULL
        AND overtime_candidate_minutes IS NOT NULL
        AND attendance_policy_version_id IS NOT NULL
        AND late_early_policy_version_id IS NOT NULL
      WHEN 'absent' THEN
        first_observed_at IS NULL
        AND last_observed_at IS NULL
        AND worked_minutes = 0
        AND late_minutes = 0
        AND early_exit_minutes = 0
        AND overtime_candidate_minutes = 0
        AND attendance_policy_version_id IS NOT NULL
        AND late_early_policy_version_id IS NULL
      WHEN 'non_working' THEN
        first_observed_at IS NULL
        AND last_observed_at IS NULL
        AND worked_minutes = 0
        AND late_minutes = 0
        AND early_exit_minutes = 0
        AND overtime_candidate_minutes = 0
        AND attendance_policy_version_id IS NOT NULL
        AND late_early_policy_version_id IS NULL
      WHEN 'unresolved' THEN
        first_observed_at IS NULL
        AND last_observed_at IS NULL
        AND worked_minutes IS NULL
        AND late_minutes IS NULL
        AND early_exit_minutes IS NULL
        AND overtime_candidate_minutes IS NULL
      ELSE 0
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_attendance_resolutions_employee_date
  ON employee_attendance_resolutions(employee_id, attendance_date DESC, revision DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_resolutions_kind_date
  ON employee_attendance_resolutions(resolution_kind, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_resolutions_work_obligation
  ON employee_attendance_resolutions(work_obligation_id);

CREATE INDEX IF NOT EXISTS idx_attendance_resolutions_attendance_policy
  ON employee_attendance_resolutions(attendance_policy_version_id)
  WHERE attendance_policy_version_id IS NOT NULL;

-- Cross-boundary evidence and normalized resolver inputs are named objects, not
-- untyped arrays/scalars. Raw Attendance D1 event IDs can be retained inside the
-- evidence object without pretending a cross-database foreign key exists.
DROP TRIGGER IF EXISTS trg_attendance_resolution_json_objects_insert;
CREATE TRIGGER trg_attendance_resolution_json_objects_insert
BEFORE INSERT ON employee_attendance_resolutions
WHEN
     json_type(NEW.source_evidence_json) <> 'object'
  OR json_type(NEW.resolution_inputs_json) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_json_must_be_object');
END;

-- Revisions form one linear immutable chain per employee/business date.
DROP TRIGGER IF EXISTS trg_attendance_resolution_revision_chain_insert;
CREATE TRIGGER trg_attendance_resolution_revision_chain_insert
BEFORE INSERT ON employee_attendance_resolutions
WHEN
     (NEW.revision = 1 AND NEW.supersedes_resolution_id IS NOT NULL)
  OR (NEW.revision > 1 AND NEW.supersedes_resolution_id IS NULL)
  OR (
    NEW.revision > 1
    AND NOT EXISTS (
      SELECT 1
        FROM employee_attendance_resolutions previous
       WHERE previous.id = NEW.supersedes_resolution_id
         AND previous.employee_id = NEW.employee_id
         AND previous.attendance_date = NEW.attendance_date
         AND previous.revision = NEW.revision - 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_revision_chain_invalid');
END;

-- A daily attendance resolution is always against one exact Work Obligation
-- revision for the same employee/date. New resolutions must use the current
-- Work Obligation revision at write time; historical attendance rows retain the
-- exact older obligation revision they originally referenced.
DROP TRIGGER IF EXISTS trg_attendance_resolution_work_obligation_insert;
CREATE TRIGGER trg_attendance_resolution_work_obligation_insert
BEFORE INSERT ON employee_attendance_resolutions
WHEN NOT EXISTS (
  SELECT 1
    FROM employee_work_obligations obligation
   WHERE obligation.id = NEW.work_obligation_id
     AND obligation.employee_id = NEW.employee_id
     AND obligation.work_date = NEW.attendance_date
     AND obligation.revision = (
       SELECT MAX(current_candidate.revision)
         FROM employee_work_obligations current_candidate
        WHERE current_candidate.employee_id = NEW.employee_id
          AND current_candidate.work_date = NEW.attendance_date
     )
)
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_work_obligation_invalid');
END;

-- Attendance outcome semantics come from the referenced Work Obligation.
-- A normal work obligation can become attended/absent; rest/leave/holiday/etc.
-- resolve as non_working. unresolved remains fail-closed for contradictory or
-- incomplete source/policy input.
DROP TRIGGER IF EXISTS trg_attendance_resolution_kind_insert;
CREATE TRIGGER trg_attendance_resolution_kind_insert
BEFORE INSERT ON employee_attendance_resolutions
WHEN NEW.resolution_kind <> 'unresolved'
 AND NOT EXISTS (
   SELECT 1
     FROM employee_work_obligations obligation
    WHERE obligation.id = NEW.work_obligation_id
      AND (
        (NEW.resolution_kind IN ('attended', 'absent') AND obligation.obligation_kind = 'work')
        OR
        (NEW.resolution_kind = 'non_working' AND obligation.obligation_kind IN (
          'weekly_rest',
          'approved_leave',
          'holiday',
          'approved_exception',
          'not_employed'
        ))
      )
 )
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_kind_conflicts_with_work_obligation');
END;

-- Finalized daily attendance results resolve under an effective SA-ATTENDANCE
-- policy. unresolved rows may intentionally omit the policy when policy absence
-- itself is the reason the resolver failed closed.
DROP TRIGGER IF EXISTS trg_attendance_resolution_policy_insert;
CREATE TRIGGER trg_attendance_resolution_policy_insert
BEFORE INSERT ON employee_attendance_resolutions
WHEN NEW.attendance_policy_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions policy
    WHERE policy.id = NEW.attendance_policy_version_id
      AND policy.policy_key = 'SA-ATTENDANCE'
      AND policy.status <> 'draft'
      AND policy.effective_from <= NEW.attendance_date
      AND (policy.effective_to IS NULL OR policy.effective_to > NEW.attendance_date)
 )
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_policy_invalid');
END;

-- Late/early minutes are policy-resolved values, not uncontrolled client grace
-- calculations. An attended result therefore carries the exact effective
-- SA-LATE-EARLY policy version used to derive them.
DROP TRIGGER IF EXISTS trg_attendance_resolution_late_early_policy_insert;
CREATE TRIGGER trg_attendance_resolution_late_early_policy_insert
BEFORE INSERT ON employee_attendance_resolutions
WHEN NEW.late_early_policy_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions policy
    WHERE policy.id = NEW.late_early_policy_version_id
      AND policy.policy_key = 'SA-LATE-EARLY'
      AND policy.status <> 'draft'
      AND policy.effective_from <= NEW.attendance_date
      AND (policy.effective_to IS NULL OR policy.effective_to > NEW.attendance_date)
 )
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_late_early_policy_invalid');
END;

-- Resolutions are historical payroll-impacting facts. Re-resolution/correction
-- creates the next row; existing rows are never edited or deleted.
DROP TRIGGER IF EXISTS trg_attendance_resolution_block_update;
CREATE TRIGGER trg_attendance_resolution_block_update
BEFORE UPDATE ON employee_attendance_resolutions
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_attendance_resolution_block_delete;
CREATE TRIGGER trg_attendance_resolution_block_delete
BEFORE DELETE ON employee_attendance_resolutions
BEGIN
  SELECT RAISE(ABORT, 'attendance_resolution_history_immutable');
END;

DROP VIEW IF EXISTS hr_current_attendance_resolutions;
CREATE VIEW hr_current_attendance_resolutions AS
SELECT resolution.*
  FROM employee_attendance_resolutions resolution
 WHERE resolution.revision = (
   SELECT MAX(candidate.revision)
     FROM employee_attendance_resolutions candidate
    WHERE candidate.employee_id = resolution.employee_id
      AND candidate.attendance_date = resolution.attendance_date
 );

DROP VIEW IF EXISTS hr_attendance_resolution_integrity_summary;
CREATE VIEW hr_attendance_resolution_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM hr_current_attendance_resolutions
     WHERE resolution_kind = 'unresolved'
  ) AS current_unresolved_resolutions,

  (
    SELECT COUNT(*)
      FROM employee_attendance_resolutions resolution
     WHERE resolution.revision > 1
       AND NOT EXISTS (
         SELECT 1
           FROM employee_attendance_resolutions previous
          WHERE previous.id = resolution.supersedes_resolution_id
            AND previous.employee_id = resolution.employee_id
            AND previous.attendance_date = resolution.attendance_date
            AND previous.revision = resolution.revision - 1
       )
  ) AS invalid_revision_links,

  (
    SELECT COUNT(*)
      FROM employee_attendance_resolutions resolution
     WHERE NOT EXISTS (
       SELECT 1
         FROM employee_work_obligations obligation
        WHERE obligation.id = resolution.work_obligation_id
          AND obligation.employee_id = resolution.employee_id
          AND obligation.work_date = resolution.attendance_date
     )
  ) AS invalid_work_obligation_references,

  (
    SELECT COUNT(*)
      FROM employee_attendance_resolutions resolution
      JOIN hr_policy_versions policy
        ON policy.id = resolution.attendance_policy_version_id
     WHERE policy.policy_key <> 'SA-ATTENDANCE'
        OR policy.status = 'draft'
        OR policy.effective_from > resolution.attendance_date
        OR (policy.effective_to IS NOT NULL AND policy.effective_to <= resolution.attendance_date)
  ) AS invalid_attendance_policy_references,

  (
    SELECT COUNT(*)
      FROM employee_attendance_resolutions resolution
      JOIN hr_policy_versions policy
        ON policy.id = resolution.late_early_policy_version_id
     WHERE policy.policy_key <> 'SA-LATE-EARLY'
        OR policy.status = 'draft'
        OR policy.effective_from > resolution.attendance_date
        OR (policy.effective_to IS NOT NULL AND policy.effective_to <= resolution.attendance_date)
  ) AS invalid_late_early_policy_references,

  (
    SELECT COUNT(*)
      FROM hr_current_attendance_resolutions
     WHERE resolution_kind = 'attended'
       AND (worked_minutes IS NULL OR worked_minutes <= 0)
  ) AS current_attended_rows_missing_worked_minutes,

  (
    SELECT COUNT(*)
      FROM hr_current_attendance_resolutions resolution
      JOIN employee_work_obligations obligation
        ON obligation.id = resolution.work_obligation_id
     WHERE (
       resolution.resolution_kind IN ('attended', 'absent')
       AND obligation.obligation_kind <> 'work'
     )
     OR (
       resolution.resolution_kind = 'non_working'
       AND obligation.obligation_kind NOT IN (
         'weekly_rest',
         'approved_leave',
         'holiday',
         'approved_exception',
         'not_employed'
       )
     )
  ) AS current_kind_work_obligation_conflicts;
