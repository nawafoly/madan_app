PRAGMA foreign_keys = ON;

-- MADAN WORK OBLIGATION KERNEL V1
--
-- Establishes a date-specific, versioned work-obligation resolution consumed by
-- attendance and payroll. The table stores immutable resolution snapshots; it
-- does not replace the underlying canonical schedule, leave or policy facts.
--
-- Important cutover rule:
-- - no work-obligation rows are bootstrapped by this migration;
-- - 0018 intentionally created policy definitions without inventing concrete
--   policy versions, so generating obligations during migration would fabricate
--   policy decisions;
-- - a later server-side resolver creates/revises rows from canonical inputs.

CREATE TABLE IF NOT EXISTS employee_work_obligations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),

  obligation_kind TEXT NOT NULL CHECK (
    obligation_kind IN (
      'work',
      'weekly_rest',
      'approved_leave',
      'holiday',
      'approved_exception',
      'not_employed',
      'unresolved'
    )
  ),

  shift_start_time TEXT,
  shift_end_time TEXT,
  expected_minutes INTEGER,

  schedule_assignment_id TEXT,
  leave_request_id TEXT,
  holiday_key TEXT,
  exception_key TEXT,

  work_schedule_policy_version_id TEXT,
  weekly_rest_policy_version_id TEXT,

  resolution_inputs_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  supersedes_obligation_id TEXT,

  source TEXT NOT NULL DEFAULT 'schedule_resolver',
  reason TEXT,
  resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by_uid TEXT,
  resolved_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (schedule_assignment_id) REFERENCES employee_schedule_assignments(id) ON DELETE RESTRICT,
  FOREIGN KEY (leave_request_id) REFERENCES employee_leave_requests(id) ON DELETE RESTRICT,
  FOREIGN KEY (work_schedule_policy_version_id) REFERENCES hr_policy_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (weekly_rest_policy_version_id) REFERENCES hr_policy_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_obligation_id) REFERENCES employee_work_obligations(id) ON DELETE RESTRICT,

  UNIQUE (employee_id, work_date, revision),
  UNIQUE (idempotency_key),
  UNIQUE (supersedes_obligation_id),

  CHECK (
    work_date GLOB '????-??-??'
    AND date(work_date) IS NOT NULL
  ),

  CHECK (TRIM(idempotency_key) <> ''),
  CHECK (json_valid(resolution_inputs_json) = 1),

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

  CHECK (expected_minutes IS NULL OR expected_minutes >= 0),

  CHECK (
    CASE obligation_kind
      WHEN 'work' THEN
        schedule_assignment_id IS NOT NULL
        AND shift_start_time IS NOT NULL
        AND shift_end_time IS NOT NULL
        AND expected_minutes IS NOT NULL
        AND expected_minutes > 0
        AND work_schedule_policy_version_id IS NOT NULL
        AND leave_request_id IS NULL
        AND holiday_key IS NULL
        AND exception_key IS NULL
      WHEN 'weekly_rest' THEN
        schedule_assignment_id IS NOT NULL
        AND shift_start_time IS NULL
        AND shift_end_time IS NULL
        AND expected_minutes = 0
        AND work_schedule_policy_version_id IS NOT NULL
        AND weekly_rest_policy_version_id IS NOT NULL
        AND leave_request_id IS NULL
        AND holiday_key IS NULL
        AND exception_key IS NULL
      WHEN 'approved_leave' THEN
        schedule_assignment_id IS NOT NULL
        AND shift_start_time IS NULL
        AND shift_end_time IS NULL
        AND expected_minutes = 0
        AND leave_request_id IS NOT NULL
        AND holiday_key IS NULL
        AND exception_key IS NULL
      WHEN 'holiday' THEN
        shift_start_time IS NULL
        AND shift_end_time IS NULL
        AND expected_minutes = 0
        AND leave_request_id IS NULL
        AND holiday_key IS NOT NULL
        AND TRIM(holiday_key) <> ''
        AND exception_key IS NULL
      WHEN 'approved_exception' THEN
        shift_start_time IS NULL
        AND shift_end_time IS NULL
        AND expected_minutes = 0
        AND leave_request_id IS NULL
        AND holiday_key IS NULL
        AND exception_key IS NOT NULL
        AND TRIM(exception_key) <> ''
      WHEN 'not_employed' THEN
        shift_start_time IS NULL
        AND shift_end_time IS NULL
        AND expected_minutes = 0
        AND leave_request_id IS NULL
        AND holiday_key IS NULL
        AND exception_key IS NULL
      WHEN 'unresolved' THEN
        shift_start_time IS NULL
        AND shift_end_time IS NULL
        AND expected_minutes IS NULL
        AND leave_request_id IS NULL
        AND holiday_key IS NULL
        AND exception_key IS NULL
      ELSE 0
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_work_obligations_employee_date
  ON employee_work_obligations(employee_id, work_date DESC, revision DESC);

CREATE INDEX IF NOT EXISTS idx_work_obligations_kind_date
  ON employee_work_obligations(obligation_kind, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_obligations_schedule_assignment
  ON employee_work_obligations(schedule_assignment_id)
  WHERE schedule_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_obligations_leave_request
  ON employee_work_obligations(leave_request_id)
  WHERE leave_request_id IS NOT NULL;

-- Resolution metadata must remain an object so named source/version inputs are
-- explicit and auditable.
DROP TRIGGER IF EXISTS trg_work_obligation_inputs_object_insert;
CREATE TRIGGER trg_work_obligation_inputs_object_insert
BEFORE INSERT ON employee_work_obligations
WHEN json_type(NEW.resolution_inputs_json) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_inputs_must_be_object');
END;

-- Revisions form one linear immutable chain per employee/date. A correction is
-- a new row, never an UPDATE of the historical resolution used by payroll.
DROP TRIGGER IF EXISTS trg_work_obligation_revision_chain_insert;
CREATE TRIGGER trg_work_obligation_revision_chain_insert
BEFORE INSERT ON employee_work_obligations
WHEN
     (NEW.revision = 1 AND NEW.supersedes_obligation_id IS NOT NULL)
  OR (NEW.revision > 1 AND NEW.supersedes_obligation_id IS NULL)
  OR (
    NEW.revision > 1
    AND NOT EXISTS (
      SELECT 1
        FROM employee_work_obligations previous
       WHERE previous.id = NEW.supersedes_obligation_id
         AND previous.employee_id = NEW.employee_id
         AND previous.work_date = NEW.work_date
         AND previous.revision = NEW.revision - 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_revision_chain_invalid');
END;

-- Any referenced schedule assignment must belong to the same employee and be
-- effective on the resolved business date.
DROP TRIGGER IF EXISTS trg_work_obligation_schedule_reference_insert;
CREATE TRIGGER trg_work_obligation_schedule_reference_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.schedule_assignment_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM employee_schedule_assignments assignment
    WHERE assignment.id = NEW.schedule_assignment_id
      AND assignment.employee_id = NEW.employee_id
      AND assignment.effective_from <= NEW.work_date
      AND (
        assignment.effective_to IS NULL
        OR assignment.effective_to > NEW.work_date
      )
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_schedule_reference_invalid');
END;

-- A scheduled work row snapshots the exact fixed shift carried by the canonical
-- schedule assignment and may not be created on a configured weekly-rest day.
DROP TRIGGER IF EXISTS trg_work_obligation_work_schedule_insert;
CREATE TRIGGER trg_work_obligation_work_schedule_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.obligation_kind = 'work'
 AND NOT EXISTS (
   SELECT 1
     FROM employee_schedule_assignments assignment
    WHERE assignment.id = NEW.schedule_assignment_id
      AND assignment.employee_id = NEW.employee_id
      AND assignment.shift_start_time = NEW.shift_start_time
      AND assignment.shift_end_time = NEW.shift_end_time
      AND NOT EXISTS (
        SELECT 1
          FROM json_each(assignment.weekly_off_days_json) weekly_off
         WHERE weekly_off.value = CASE strftime('%w', NEW.work_date)
           WHEN '0' THEN 'sunday'
           WHEN '1' THEN 'monday'
           WHEN '2' THEN 'tuesday'
           WHEN '3' THEN 'wednesday'
           WHEN '4' THEN 'thursday'
           WHEN '5' THEN 'friday'
           WHEN '6' THEN 'saturday'
         END
      )
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_schedule_snapshot_invalid');
END;

-- Weekly rest must be derived from the effective schedule assignment, not from
-- a caller-provided day label.
DROP TRIGGER IF EXISTS trg_work_obligation_weekly_rest_insert;
CREATE TRIGGER trg_work_obligation_weekly_rest_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.obligation_kind = 'weekly_rest'
 AND NOT EXISTS (
   SELECT 1
     FROM employee_schedule_assignments assignment,
          json_each(assignment.weekly_off_days_json) weekly_off
    WHERE assignment.id = NEW.schedule_assignment_id
      AND assignment.employee_id = NEW.employee_id
      AND weekly_off.value = CASE strftime('%w', NEW.work_date)
        WHEN '0' THEN 'sunday'
        WHEN '1' THEN 'monday'
        WHEN '2' THEN 'tuesday'
        WHEN '3' THEN 'wednesday'
        WHEN '4' THEN 'thursday'
        WHEN '5' THEN 'friday'
        WHEN '6' THEN 'saturday'
      END
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_weekly_rest_invalid');
END;

-- Approved leave may remove a work obligation only for the same employee, only
-- inside the approved request range, and not for a date that was later partially
-- cancelled/restored.
DROP TRIGGER IF EXISTS trg_work_obligation_approved_leave_insert;
CREATE TRIGGER trg_work_obligation_approved_leave_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.obligation_kind = 'approved_leave'
 AND NOT EXISTS (
   SELECT 1
     FROM employee_leave_requests request
    WHERE request.id = NEW.leave_request_id
      AND request.employee_id = NEW.employee_id
      AND request.status = 'approved'
      AND SUBSTR(request.start_date, 1, 10) <= NEW.work_date
      AND SUBSTR(request.end_date, 1, 10) >= NEW.work_date
      AND json_valid(request.cancelled_date_keys_json) = 1
      AND json_type(request.cancelled_date_keys_json) = 'array'
      AND NOT EXISTS (
        SELECT 1
          FROM json_each(request.cancelled_date_keys_json) cancelled
         WHERE cancelled.value = NEW.work_date
      )
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_leave_reference_invalid');
END;

-- Leave can only replace a date that the effective schedule would otherwise
-- consider a working day. Weekly rest remains a separate obligation kind.
DROP TRIGGER IF EXISTS trg_work_obligation_leave_schedule_day_insert;
CREATE TRIGGER trg_work_obligation_leave_schedule_day_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.obligation_kind = 'approved_leave'
 AND EXISTS (
   SELECT 1
     FROM employee_schedule_assignments assignment,
          json_each(assignment.weekly_off_days_json) weekly_off
    WHERE assignment.id = NEW.schedule_assignment_id
      AND weekly_off.value = CASE strftime('%w', NEW.work_date)
        WHEN '0' THEN 'sunday'
        WHEN '1' THEN 'monday'
        WHEN '2' THEN 'tuesday'
        WHEN '3' THEN 'wednesday'
        WHEN '4' THEN 'thursday'
        WHEN '5' THEN 'friday'
        WHEN '6' THEN 'saturday'
      END
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_leave_on_weekly_rest');
END;

-- Policy references are only resolvable if published/finalized, match the
-- expected policy family and cover the business date being resolved.
DROP TRIGGER IF EXISTS trg_work_obligation_schedule_policy_insert;
CREATE TRIGGER trg_work_obligation_schedule_policy_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.work_schedule_policy_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions policy
    WHERE policy.id = NEW.work_schedule_policy_version_id
      AND policy.policy_key = 'SA-WORK-SCHEDULE'
      AND policy.status <> 'draft'
      AND policy.effective_from <= NEW.work_date
      AND (policy.effective_to IS NULL OR policy.effective_to > NEW.work_date)
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_schedule_policy_invalid');
END;

DROP TRIGGER IF EXISTS trg_work_obligation_weekly_rest_policy_insert;
CREATE TRIGGER trg_work_obligation_weekly_rest_policy_insert
BEFORE INSERT ON employee_work_obligations
WHEN NEW.weekly_rest_policy_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions policy
    WHERE policy.id = NEW.weekly_rest_policy_version_id
      AND policy.policy_key = 'SA-WEEKLY-REST'
      AND policy.status <> 'draft'
      AND policy.effective_from <= NEW.work_date
      AND (policy.effective_to IS NULL OR policy.effective_to > NEW.work_date)
 )
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_weekly_rest_policy_invalid');
END;

-- Resolution snapshots are immutable. Re-resolution creates the next revision.
DROP TRIGGER IF EXISTS trg_work_obligation_block_update;
CREATE TRIGGER trg_work_obligation_block_update
BEFORE UPDATE ON employee_work_obligations
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_work_obligation_block_delete;
CREATE TRIGGER trg_work_obligation_block_delete
BEFORE DELETE ON employee_work_obligations
BEGIN
  SELECT RAISE(ABORT, 'work_obligation_history_immutable');
END;

DROP VIEW IF EXISTS hr_current_work_obligations;
CREATE VIEW hr_current_work_obligations AS
SELECT obligation.*
  FROM employee_work_obligations obligation
 WHERE obligation.revision = (
   SELECT MAX(candidate.revision)
     FROM employee_work_obligations candidate
    WHERE candidate.employee_id = obligation.employee_id
      AND candidate.work_date = obligation.work_date
 );

DROP VIEW IF EXISTS hr_work_obligation_integrity_summary;
CREATE VIEW hr_work_obligation_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM hr_current_work_obligations
     WHERE obligation_kind = 'unresolved'
  ) AS current_unresolved_obligations,

  (
    SELECT COUNT(*)
      FROM employee_work_obligations obligation
     WHERE obligation.revision > 1
       AND NOT EXISTS (
         SELECT 1
           FROM employee_work_obligations previous
          WHERE previous.id = obligation.supersedes_obligation_id
            AND previous.employee_id = obligation.employee_id
            AND previous.work_date = obligation.work_date
            AND previous.revision = obligation.revision - 1
       )
  ) AS invalid_revision_links,

  (
    SELECT COUNT(*)
      FROM employee_work_obligations obligation
      JOIN hr_policy_versions policy
        ON policy.id = obligation.work_schedule_policy_version_id
     WHERE policy.policy_key <> 'SA-WORK-SCHEDULE'
        OR policy.status = 'draft'
        OR policy.effective_from > obligation.work_date
        OR (policy.effective_to IS NOT NULL AND policy.effective_to <= obligation.work_date)
  ) AS invalid_schedule_policy_references,

  (
    SELECT COUNT(*)
      FROM employee_work_obligations obligation
      JOIN hr_policy_versions policy
        ON policy.id = obligation.weekly_rest_policy_version_id
     WHERE policy.policy_key <> 'SA-WEEKLY-REST'
        OR policy.status = 'draft'
        OR policy.effective_from > obligation.work_date
        OR (policy.effective_to IS NOT NULL AND policy.effective_to <= obligation.work_date)
  ) AS invalid_weekly_rest_policy_references,

  (
    SELECT COUNT(*)
      FROM hr_current_work_obligations
     WHERE obligation_kind = 'work'
       AND (expected_minutes IS NULL OR expected_minutes <= 0)
  ) AS current_work_rows_missing_expected_minutes;
