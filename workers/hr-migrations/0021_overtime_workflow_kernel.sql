PRAGMA foreign_keys = ON;

-- MADAN OVERTIME WORKFLOW KERNEL V1
--
-- Converts canonical Attendance extra-time evidence into a governed overtime
-- candidate + approval workflow without making that time payable by itself.
--
-- OVT-001: attendance extra time is a candidate, never a payable obligation.
-- OVT-002: payable overtime requires eligibility + approval unless the exact
--          effective eligibility policy explicitly permits auto approval.
--
-- This migration intentionally creates no cash amount, payable overtime line,
-- comp-time entitlement or historical bootstrap. Those belong to later
-- Time/Payroll command paths after policy/approval resolution.

CREATE TABLE IF NOT EXISTS employee_overtime_candidates (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  attendance_resolution_id TEXT NOT NULL,
  candidate_minutes INTEGER NOT NULL CHECK (candidate_minutes > 0),

  eligibility_result TEXT NOT NULL CHECK (
    eligibility_result IN ('eligible', 'ineligible', 'unresolved')
  ),
  eligibility_policy_version_id TEXT,
  approval_mode TEXT NOT NULL CHECK (
    approval_mode IN ('blocked', 'manual', 'policy_auto')
  ),
  settlement_preference TEXT CHECK (
    settlement_preference IS NULL
    OR settlement_preference IN ('cash', 'comp_time')
  ),

  source_evidence_json TEXT NOT NULL DEFAULT '{}',
  eligibility_inputs_json TEXT NOT NULL DEFAULT '{}',

  supersedes_candidate_id TEXT,
  idempotency_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'overtime_resolver',
  reason TEXT,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (attendance_resolution_id) REFERENCES employee_attendance_resolutions(id) ON DELETE RESTRICT,
  FOREIGN KEY (eligibility_policy_version_id) REFERENCES hr_policy_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_candidate_id) REFERENCES employee_overtime_candidates(id) ON DELETE RESTRICT,

  UNIQUE (employee_id, work_date, revision),
  UNIQUE (attendance_resolution_id),
  UNIQUE (idempotency_key),
  UNIQUE (supersedes_candidate_id),

  CHECK (
    work_date GLOB '????-??-??'
    AND date(work_date) IS NOT NULL
  ),
  CHECK (TRIM(idempotency_key) <> ''),
  CHECK (json_valid(source_evidence_json) = 1),
  CHECK (json_valid(eligibility_inputs_json) = 1),

  CHECK (
    (eligibility_result = 'eligible' AND approval_mode IN ('manual', 'policy_auto'))
    OR
    (eligibility_result IN ('ineligible', 'unresolved') AND approval_mode = 'blocked')
  ),

  CHECK (
    eligibility_result = 'eligible'
    OR settlement_preference IS NULL
  ),

  CHECK (
    eligibility_result = 'unresolved'
    OR eligibility_policy_version_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_overtime_candidates_employee_date
  ON employee_overtime_candidates(employee_id, work_date DESC, revision DESC);

CREATE INDEX IF NOT EXISTS idx_overtime_candidates_attendance_resolution
  ON employee_overtime_candidates(attendance_resolution_id);

CREATE INDEX IF NOT EXISTS idx_overtime_candidates_eligibility
  ON employee_overtime_candidates(eligibility_result, work_date DESC);

DROP TRIGGER IF EXISTS trg_overtime_candidate_json_objects_insert;
CREATE TRIGGER trg_overtime_candidate_json_objects_insert
BEFORE INSERT ON employee_overtime_candidates
WHEN
     json_type(NEW.source_evidence_json) <> 'object'
  OR json_type(NEW.eligibility_inputs_json) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'overtime_candidate_json_must_be_object');
END;

-- Candidate revisions follow Attendance corrections. A newer candidate for the
-- same employee/date must supersede exactly the prior revision.
DROP TRIGGER IF EXISTS trg_overtime_candidate_revision_chain_insert;
CREATE TRIGGER trg_overtime_candidate_revision_chain_insert
BEFORE INSERT ON employee_overtime_candidates
WHEN
     (NEW.revision = 1 AND NEW.supersedes_candidate_id IS NOT NULL)
  OR (NEW.revision > 1 AND NEW.supersedes_candidate_id IS NULL)
  OR (
    NEW.revision > 1
    AND NOT EXISTS (
      SELECT 1
        FROM employee_overtime_candidates previous
       WHERE previous.id = NEW.supersedes_candidate_id
         AND previous.employee_id = NEW.employee_id
         AND previous.work_date = NEW.work_date
         AND previous.revision = NEW.revision - 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'overtime_candidate_revision_chain_invalid');
END;

-- The candidate is not client-entered overtime. It must exactly match the
-- current canonical Attendance Resolution for the same employee/date.
DROP TRIGGER IF EXISTS trg_overtime_candidate_attendance_insert;
CREATE TRIGGER trg_overtime_candidate_attendance_insert
BEFORE INSERT ON employee_overtime_candidates
WHEN NOT EXISTS (
  SELECT 1
    FROM employee_attendance_resolutions resolution
   WHERE resolution.id = NEW.attendance_resolution_id
     AND resolution.employee_id = NEW.employee_id
     AND resolution.attendance_date = NEW.work_date
     AND resolution.resolution_kind = 'attended'
     AND resolution.overtime_candidate_minutes = NEW.candidate_minutes
     AND resolution.overtime_candidate_minutes > 0
     AND resolution.revision = (
       SELECT MAX(current_resolution.revision)
         FROM employee_attendance_resolutions current_resolution
        WHERE current_resolution.employee_id = NEW.employee_id
          AND current_resolution.attendance_date = NEW.work_date
     )
)
BEGIN
  SELECT RAISE(ABORT, 'overtime_candidate_attendance_resolution_invalid');
END;

-- Eligibility is resolved only under the exact effective
-- SA-OVERTIME-ELIGIBILITY policy version for the business date.
DROP TRIGGER IF EXISTS trg_overtime_candidate_eligibility_policy_insert;
CREATE TRIGGER trg_overtime_candidate_eligibility_policy_insert
BEFORE INSERT ON employee_overtime_candidates
WHEN NEW.eligibility_policy_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions policy
    WHERE policy.id = NEW.eligibility_policy_version_id
      AND policy.policy_key = 'SA-OVERTIME-ELIGIBILITY'
      AND policy.status <> 'draft'
      AND policy.effective_from <= NEW.work_date
      AND (policy.effective_to IS NULL OR policy.effective_to > NEW.work_date)
 )
BEGIN
  SELECT RAISE(ABORT, 'overtime_eligibility_policy_invalid');
END;

-- Auto approval is exceptional and must be explicitly enabled by the exact
-- policy version. This is an operational contract flag, not a legal rate.
DROP TRIGGER IF EXISTS trg_overtime_candidate_auto_approval_insert;
CREATE TRIGGER trg_overtime_candidate_auto_approval_insert
BEFORE INSERT ON employee_overtime_candidates
WHEN NEW.approval_mode = 'policy_auto'
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions policy
    WHERE policy.id = NEW.eligibility_policy_version_id
      AND policy.policy_key = 'SA-OVERTIME-ELIGIBILITY'
      AND policy.status <> 'draft'
      AND policy.effective_from <= NEW.work_date
      AND (policy.effective_to IS NULL OR policy.effective_to > NEW.work_date)
      AND COALESCE(json_extract(policy.approval_contract_json, '$.autoApproval'), 0) = 1
 )
BEGIN
  SELECT RAISE(ABORT, 'overtime_auto_approval_policy_not_enabled');
END;

DROP TRIGGER IF EXISTS trg_overtime_candidate_block_update;
CREATE TRIGGER trg_overtime_candidate_block_update
BEFORE UPDATE ON employee_overtime_candidates
BEGIN
  SELECT RAISE(ABORT, 'overtime_candidate_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_overtime_candidate_block_delete;
CREATE TRIGGER trg_overtime_candidate_block_delete
BEFORE DELETE ON employee_overtime_candidates
BEGIN
  SELECT RAISE(ABORT, 'overtime_candidate_history_immutable');
END;

CREATE TABLE IF NOT EXISTS employee_overtime_approval_events (
  id TEXT PRIMARY KEY,
  overtime_candidate_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'approval_requested',
      'approved',
      'rejected',
      'cancelled',
      'auto_approved'
    )
  ),
  previous_event_id TEXT,
  decision_reason TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  actor_uid TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (overtime_candidate_id) REFERENCES employee_overtime_candidates(id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_event_id) REFERENCES employee_overtime_approval_events(id) ON DELETE RESTRICT,

  UNIQUE (overtime_candidate_id, sequence),
  UNIQUE (previous_event_id),
  UNIQUE (idempotency_key),

  CHECK (TRIM(idempotency_key) <> ''),
  CHECK (json_valid(evidence_json) = 1)
);

CREATE INDEX IF NOT EXISTS idx_overtime_approval_events_candidate_sequence
  ON employee_overtime_approval_events(overtime_candidate_id, sequence DESC);

CREATE INDEX IF NOT EXISTS idx_overtime_approval_events_employee_created
  ON employee_overtime_approval_events(employee_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_overtime_approval_event_json_object_insert;
CREATE TRIGGER trg_overtime_approval_event_json_object_insert
BEFORE INSERT ON employee_overtime_approval_events
WHEN json_type(NEW.evidence_json) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_evidence_must_be_object');
END;

DROP TRIGGER IF EXISTS trg_overtime_approval_event_employee_insert;
CREATE TRIGGER trg_overtime_approval_event_employee_insert
BEFORE INSERT ON employee_overtime_approval_events
WHEN NOT EXISTS (
  SELECT 1
    FROM employee_overtime_candidates candidate
   WHERE candidate.id = NEW.overtime_candidate_id
     AND candidate.employee_id = NEW.employee_id
)
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_employee_mismatch');
END;

DROP TRIGGER IF EXISTS trg_overtime_approval_event_chain_insert;
CREATE TRIGGER trg_overtime_approval_event_chain_insert
BEFORE INSERT ON employee_overtime_approval_events
WHEN
     (NEW.sequence = 1 AND NEW.previous_event_id IS NOT NULL)
  OR (NEW.sequence > 1 AND NEW.previous_event_id IS NULL)
  OR (
    NEW.sequence > 1
    AND NOT EXISTS (
      SELECT 1
        FROM employee_overtime_approval_events previous
       WHERE previous.id = NEW.previous_event_id
         AND previous.overtime_candidate_id = NEW.overtime_candidate_id
         AND previous.sequence = NEW.sequence - 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_event_chain_invalid');
END;

-- Legal workflow:
-- manual eligible -> approval_requested -> approved/rejected/cancelled
-- policy_auto eligible -> auto_approved
-- blocked candidates cannot enter approval workflow.
DROP TRIGGER IF EXISTS trg_overtime_approval_event_transition_insert;
CREATE TRIGGER trg_overtime_approval_event_transition_insert
BEFORE INSERT ON employee_overtime_approval_events
WHEN NOT (
  (
    NEW.sequence = 1
    AND NEW.event_type = 'approval_requested'
    AND EXISTS (
      SELECT 1
        FROM employee_overtime_candidates candidate
       WHERE candidate.id = NEW.overtime_candidate_id
         AND candidate.eligibility_result = 'eligible'
         AND candidate.approval_mode = 'manual'
    )
  )
  OR
  (
    NEW.sequence = 1
    AND NEW.event_type = 'auto_approved'
    AND EXISTS (
      SELECT 1
        FROM employee_overtime_candidates candidate
        JOIN hr_policy_versions policy
          ON policy.id = candidate.eligibility_policy_version_id
       WHERE candidate.id = NEW.overtime_candidate_id
         AND candidate.eligibility_result = 'eligible'
         AND candidate.approval_mode = 'policy_auto'
         AND COALESCE(json_extract(policy.approval_contract_json, '$.autoApproval'), 0) = 1
    )
  )
  OR
  (
    NEW.sequence = 2
    AND NEW.event_type IN ('approved', 'rejected', 'cancelled')
    AND EXISTS (
      SELECT 1
        FROM employee_overtime_approval_events previous
       WHERE previous.id = NEW.previous_event_id
         AND previous.overtime_candidate_id = NEW.overtime_candidate_id
         AND previous.sequence = 1
         AND previous.event_type = 'approval_requested'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_transition_invalid');
END;

-- Human approval/rejection/cancellation must retain an actor. Auto approval is
-- policy evidence and therefore does not impersonate a human approver.
DROP TRIGGER IF EXISTS trg_overtime_approval_actor_insert;
CREATE TRIGGER trg_overtime_approval_actor_insert
BEFORE INSERT ON employee_overtime_approval_events
WHEN
  (
    NEW.event_type IN ('approved', 'rejected', 'cancelled')
    AND COALESCE(TRIM(NEW.actor_uid), '') = ''
    AND COALESCE(TRIM(NEW.actor_email), '') = ''
  )
  OR
  (
    NEW.event_type = 'auto_approved'
    AND (
      COALESCE(TRIM(NEW.actor_uid), '') <> ''
      OR COALESCE(TRIM(NEW.actor_email), '') <> ''
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_actor_invalid');
END;

DROP TRIGGER IF EXISTS trg_overtime_approval_event_block_update;
CREATE TRIGGER trg_overtime_approval_event_block_update
BEFORE UPDATE ON employee_overtime_approval_events
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_overtime_approval_event_block_delete;
CREATE TRIGGER trg_overtime_approval_event_block_delete
BEFORE DELETE ON employee_overtime_approval_events
BEGIN
  SELECT RAISE(ABORT, 'overtime_approval_history_immutable');
END;

DROP VIEW IF EXISTS hr_current_overtime_candidates;
CREATE VIEW hr_current_overtime_candidates AS
SELECT candidate.*
  FROM employee_overtime_candidates candidate
 WHERE candidate.revision = (
   SELECT MAX(current_candidate.revision)
     FROM employee_overtime_candidates current_candidate
    WHERE current_candidate.employee_id = candidate.employee_id
      AND current_candidate.work_date = candidate.work_date
 );

DROP VIEW IF EXISTS hr_current_overtime_workflow;
CREATE VIEW hr_current_overtime_workflow AS
SELECT
  candidate.*,
  latest_event.id AS latest_event_id,
  latest_event.sequence AS latest_event_sequence,
  latest_event.event_type AS latest_event_type,
  latest_event.actor_uid AS latest_actor_uid,
  latest_event.actor_email AS latest_actor_email,
  latest_event.created_at AS latest_event_at,
  CASE
    WHEN candidate.eligibility_result = 'unresolved' THEN 'blocked'
    WHEN candidate.eligibility_result = 'ineligible' THEN 'ineligible'
    WHEN candidate.approval_mode = 'manual' AND latest_event.id IS NULL THEN 'eligible_unsubmitted'
    WHEN candidate.approval_mode = 'policy_auto' AND latest_event.id IS NULL THEN 'policy_auto_pending'
    WHEN latest_event.event_type = 'approval_requested' THEN 'pending_approval'
    WHEN latest_event.event_type IN ('approved', 'auto_approved') THEN 'approved'
    WHEN latest_event.event_type = 'rejected' THEN 'rejected'
    WHEN latest_event.event_type = 'cancelled' THEN 'cancelled'
    ELSE 'blocked'
  END AS workflow_status
FROM hr_current_overtime_candidates candidate
LEFT JOIN employee_overtime_approval_events latest_event
  ON latest_event.overtime_candidate_id = candidate.id
 AND latest_event.sequence = (
   SELECT MAX(event.sequence)
     FROM employee_overtime_approval_events event
    WHERE event.overtime_candidate_id = candidate.id
 );

DROP VIEW IF EXISTS hr_overtime_workflow_integrity_summary;
CREATE VIEW hr_overtime_workflow_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM hr_current_overtime_candidates
     WHERE eligibility_result = 'unresolved'
  ) AS current_unresolved_candidates,

  (
    SELECT COUNT(*)
      FROM employee_overtime_candidates candidate
     WHERE candidate.revision > 1
       AND NOT EXISTS (
         SELECT 1
           FROM employee_overtime_candidates previous
          WHERE previous.id = candidate.supersedes_candidate_id
            AND previous.employee_id = candidate.employee_id
            AND previous.work_date = candidate.work_date
            AND previous.revision = candidate.revision - 1
       )
  ) AS invalid_candidate_revision_links,

  (
    SELECT COUNT(*)
      FROM employee_overtime_candidates candidate
     WHERE NOT EXISTS (
       SELECT 1
         FROM employee_attendance_resolutions resolution
        WHERE resolution.id = candidate.attendance_resolution_id
          AND resolution.employee_id = candidate.employee_id
          AND resolution.attendance_date = candidate.work_date
          AND resolution.resolution_kind = 'attended'
          AND resolution.overtime_candidate_minutes = candidate.candidate_minutes
     )
  ) AS invalid_attendance_resolution_references,

  (
    SELECT COUNT(*)
      FROM employee_overtime_candidates candidate
     WHERE candidate.eligibility_policy_version_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM hr_policy_versions policy
          WHERE policy.id = candidate.eligibility_policy_version_id
            AND policy.policy_key = 'SA-OVERTIME-ELIGIBILITY'
            AND policy.status <> 'draft'
            AND policy.effective_from <= candidate.work_date
            AND (policy.effective_to IS NULL OR policy.effective_to > candidate.work_date)
       )
  ) AS invalid_eligibility_policy_references,

  (
    SELECT COUNT(*)
      FROM hr_current_overtime_workflow workflow
     WHERE workflow.approval_mode = 'policy_auto'
       AND workflow.workflow_status = 'policy_auto_pending'
  ) AS current_policy_auto_candidates_without_approval_event,

  (
    SELECT COUNT(*)
      FROM employee_overtime_approval_events event
      JOIN employee_overtime_candidates candidate
        ON candidate.id = event.overtime_candidate_id
      JOIN hr_policy_versions policy
        ON policy.id = candidate.eligibility_policy_version_id
     WHERE event.event_type = 'auto_approved'
       AND COALESCE(json_extract(policy.approval_contract_json, '$.autoApproval'), 0) <> 1
  ) AS invalid_auto_approval_events,

  (
    SELECT COUNT(*)
      FROM hr_current_overtime_workflow workflow
     WHERE workflow.workflow_status = 'approved'
       AND workflow.approval_mode = 'manual'
       AND COALESCE(TRIM(workflow.latest_actor_uid), '') = ''
       AND COALESCE(TRIM(workflow.latest_actor_email), '') = ''
  ) AS current_manual_approvals_without_actor;
