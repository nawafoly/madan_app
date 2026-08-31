PRAGMA foreign_keys = ON;

-- MADAN POLICY KERNEL V1
--
-- Establishes the canonical versioned/effective-dated policy registry required
-- by payroll, attendance, leave, GOSI, schedule and approval workflows.
--
-- This migration deliberately seeds policy *definitions only*. It does not
-- invent Saudi legal rates, thresholds, grace periods, contribution rates or
-- other business parameters. Concrete policy versions must be created from an
-- approved policy source and then referenced by downstream calculations.

CREATE TABLE IF NOT EXISTS hr_policy_definitions (
  policy_key TEXT PRIMARY KEY,
  policy_family TEXT NOT NULL CHECK (
    policy_family IN ('saudi_hr', 'operational')
  ),
  purpose TEXT NOT NULL,
  target_consumer TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (TRIM(policy_key) <> ''),
  CHECK (TRIM(purpose) <> '')
);

CREATE TABLE IF NOT EXISTS hr_policy_versions (
  id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),

  effective_from TEXT NOT NULL,
  effective_to TEXT,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'superseded', 'retired')
  ),

  scope_json TEXT NOT NULL DEFAULT '{}',
  parameters_json TEXT NOT NULL DEFAULT '{}',
  calculation_contract_json TEXT NOT NULL DEFAULT '{}',
  approval_contract_json TEXT NOT NULL DEFAULT '{}',
  evidence_contract_json TEXT NOT NULL DEFAULT '{}',
  attendance_effect_json TEXT NOT NULL DEFAULT '{}',
  payroll_effect_json TEXT NOT NULL DEFAULT '{}',

  supersedes_version_id TEXT,
  source TEXT NOT NULL DEFAULT 'policy_admin',
  reason TEXT,

  created_by_uid TEXT,
  created_by_email TEXT,
  published_at TEXT,
  published_by_uid TEXT,
  published_by_email TEXT,
  closed_at TEXT,
  closed_by_uid TEXT,
  closed_by_email TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (policy_key) REFERENCES hr_policy_definitions(policy_key) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_version_id) REFERENCES hr_policy_versions(id) ON DELETE RESTRICT,

  UNIQUE (policy_key, version),

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

  CHECK (json_valid(scope_json) = 1),
  CHECK (json_valid(parameters_json) = 1),
  CHECK (json_valid(calculation_contract_json) = 1),
  CHECK (json_valid(approval_contract_json) = 1),
  CHECK (json_valid(evidence_contract_json) = 1),
  CHECK (json_valid(attendance_effect_json) = 1),
  CHECK (json_valid(payroll_effect_json) = 1),

  CHECK (
    status = 'draft'
    OR published_at IS NOT NULL
  ),

  CHECK (
    status NOT IN ('superseded', 'retired')
    OR effective_to IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_key_effective
  ON hr_policy_versions (
    policy_key,
    effective_from DESC,
    effective_to,
    version DESC
  );

CREATE INDEX IF NOT EXISTS idx_policy_versions_status_effective
  ON hr_policy_versions (
    status,
    effective_from DESC,
    effective_to
  );

CREATE INDEX IF NOT EXISTS idx_policy_versions_supersedes
  ON hr_policy_versions(supersedes_version_id)
  WHERE supersedes_version_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_policy_versions_one_open_finalized_period
  ON hr_policy_versions(policy_key)
  WHERE status <> 'draft' AND effective_to IS NULL;

-- All JSON contract surfaces are objects. Arrays/scalars would make downstream
-- named policy inputs ambiguous.
DROP TRIGGER IF EXISTS trg_policy_version_json_objects_insert;
CREATE TRIGGER trg_policy_version_json_objects_insert
BEFORE INSERT ON hr_policy_versions
WHEN
     json_type(NEW.scope_json) <> 'object'
  OR json_type(NEW.parameters_json) <> 'object'
  OR json_type(NEW.calculation_contract_json) <> 'object'
  OR json_type(NEW.approval_contract_json) <> 'object'
  OR json_type(NEW.evidence_contract_json) <> 'object'
  OR json_type(NEW.attendance_effect_json) <> 'object'
  OR json_type(NEW.payroll_effect_json) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'policy_contract_json_must_be_object');
END;

DROP TRIGGER IF EXISTS trg_policy_version_json_objects_update;
CREATE TRIGGER trg_policy_version_json_objects_update
BEFORE UPDATE ON hr_policy_versions
WHEN
     json_type(NEW.scope_json) <> 'object'
  OR json_type(NEW.parameters_json) <> 'object'
  OR json_type(NEW.calculation_contract_json) <> 'object'
  OR json_type(NEW.approval_contract_json) <> 'object'
  OR json_type(NEW.evidence_contract_json) <> 'object'
  OR json_type(NEW.attendance_effect_json) <> 'object'
  OR json_type(NEW.payroll_effect_json) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'policy_contract_json_must_be_object');
END;

-- A superseding version must point to an existing version of the same policy
-- and advance the numeric version. This is lineage metadata, not a substitute
-- for effective-period validation.
DROP TRIGGER IF EXISTS trg_policy_version_supersedes_insert;
CREATE TRIGGER trg_policy_version_supersedes_insert
BEFORE INSERT ON hr_policy_versions
WHEN NEW.supersedes_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions previous
    WHERE previous.id = NEW.supersedes_version_id
      AND previous.policy_key = NEW.policy_key
      AND previous.version < NEW.version
 )
BEGIN
  SELECT RAISE(ABORT, 'policy_supersedes_invalid');
END;

DROP TRIGGER IF EXISTS trg_policy_version_supersedes_update;
CREATE TRIGGER trg_policy_version_supersedes_update
BEFORE UPDATE ON hr_policy_versions
WHEN NEW.supersedes_version_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM hr_policy_versions previous
    WHERE previous.id = NEW.supersedes_version_id
      AND previous.policy_key = NEW.policy_key
      AND previous.version < NEW.version
 )
BEGIN
  SELECT RAISE(ABORT, 'policy_supersedes_invalid');
END;

-- Finalized policy periods use half-open [effective_from, effective_to)
-- semantics and may not overlap for the same policy key.
DROP TRIGGER IF EXISTS trg_policy_version_no_overlap_insert;
CREATE TRIGGER trg_policy_version_no_overlap_insert
BEFORE INSERT ON hr_policy_versions
WHEN NEW.status <> 'draft'
 AND EXISTS (
   SELECT 1
     FROM hr_policy_versions existing
    WHERE existing.policy_key = NEW.policy_key
      AND existing.status <> 'draft'
      AND existing.effective_from < COALESCE(NEW.effective_to, '9999-12-31')
      AND NEW.effective_from < COALESCE(existing.effective_to, '9999-12-31')
 )
BEGIN
  SELECT RAISE(ABORT, 'policy_effective_period_overlap');
END;

DROP TRIGGER IF EXISTS trg_policy_version_no_overlap_update;
CREATE TRIGGER trg_policy_version_no_overlap_update
BEFORE UPDATE ON hr_policy_versions
WHEN NEW.status <> 'draft'
 AND EXISTS (
   SELECT 1
     FROM hr_policy_versions existing
    WHERE existing.policy_key = NEW.policy_key
      AND existing.id <> NEW.id
      AND existing.status <> 'draft'
      AND existing.effective_from < COALESCE(NEW.effective_to, '9999-12-31')
      AND NEW.effective_from < COALESCE(existing.effective_to, '9999-12-31')
 )
BEGIN
  SELECT RAISE(ABORT, 'policy_effective_period_overlap');
END;

-- Drafts are editable. Once a version is published, its business contents are
-- immutable. The only later mutation is closing the effective period and
-- moving lifecycle status to superseded/retired with close metadata.
DROP TRIGGER IF EXISTS trg_policy_version_published_immutable;
CREATE TRIGGER trg_policy_version_published_immutable
BEFORE UPDATE ON hr_policy_versions
WHEN OLD.status <> 'draft'
 AND (
      OLD.status IN ('superseded', 'retired')
   OR NEW.status NOT IN ('superseded', 'retired')
   OR OLD.effective_to IS NOT NULL
   OR NEW.effective_to IS NULL
   OR NOT (NEW.id IS OLD.id)
   OR NOT (NEW.policy_key IS OLD.policy_key)
   OR NOT (NEW.version IS OLD.version)
   OR NOT (NEW.effective_from IS OLD.effective_from)
   OR NOT (NEW.scope_json IS OLD.scope_json)
   OR NOT (NEW.parameters_json IS OLD.parameters_json)
   OR NOT (NEW.calculation_contract_json IS OLD.calculation_contract_json)
   OR NOT (NEW.approval_contract_json IS OLD.approval_contract_json)
   OR NOT (NEW.evidence_contract_json IS OLD.evidence_contract_json)
   OR NOT (NEW.attendance_effect_json IS OLD.attendance_effect_json)
   OR NOT (NEW.payroll_effect_json IS OLD.payroll_effect_json)
   OR NOT (NEW.supersedes_version_id IS OLD.supersedes_version_id)
   OR NOT (NEW.source IS OLD.source)
   OR NOT (NEW.reason IS OLD.reason)
   OR NOT (NEW.created_by_uid IS OLD.created_by_uid)
   OR NOT (NEW.created_by_email IS OLD.created_by_email)
   OR NOT (NEW.published_at IS OLD.published_at)
   OR NOT (NEW.published_by_uid IS OLD.published_by_uid)
   OR NOT (NEW.published_by_email IS OLD.published_by_email)
   OR NOT (NEW.created_at IS OLD.created_at)
 )
BEGIN
  SELECT RAISE(ABORT, 'published_policy_version_immutable');
END;

-- Finalized versions are historical business facts and cannot be deleted.
DROP TRIGGER IF EXISTS trg_policy_version_block_finalized_delete;
CREATE TRIGGER trg_policy_version_block_finalized_delete
BEFORE DELETE ON hr_policy_versions
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'published_policy_version_immutable');
END;

-- Stable policy families from the foundation Policy Catalog. Definitions do
-- not contain rates, limits or other legal/business parameter values.
INSERT INTO hr_policy_definitions (
  policy_key,
  policy_family,
  purpose,
  target_consumer
) VALUES
  ('SA-EMPLOYMENT-STATUS', 'saudi_hr', 'Employment lifecycle transitions', 'Employment'),
  ('SA-PROBATION', 'saudi_hr', 'Probation rules and configuration', 'Employment'),
  ('SA-WORK-SCHEDULE', 'saudi_hr', 'Normal work obligation', 'Schedule/Attendance'),
  ('SA-WEEKLY-REST', 'saudi_hr', 'Weekly rest handling', 'Schedule/Leave/Attendance'),
  ('SA-ANNUAL-LEAVE', 'saudi_hr', 'Annual leave entitlement and accrual', 'Leave/Payroll'),
  ('SA-SICK-LEAVE', 'saudi_hr', 'Sick leave pay buckets', 'Leave/Payroll'),
  ('SA-UNPAID-LEAVE', 'saudi_hr', 'Unpaid leave payroll effect', 'Leave/Payroll'),
  ('SA-COMP-TIME', 'saudi_hr', 'Compensatory time entitlement', 'Time/Leave/Payroll'),
  ('SA-ATTENDANCE', 'saudi_hr', 'Attendance daily resolution', 'Attendance'),
  ('SA-LATE-EARLY', 'saudi_hr', 'Late and early-exit treatment', 'Attendance/Payroll'),
  ('SA-OVERTIME-ELIGIBILITY', 'saudi_hr', 'Overtime eligibility and approval', 'Attendance/Overtime'),
  ('SA-OVERTIME-PAY', 'saudi_hr', 'Cash overtime calculation contract', 'Payroll'),
  ('SA-GOSI', 'saudi_hr', 'GOSI profile and contribution calculation', 'GOSI/Payroll'),
  ('SA-ATTENDANCE-DEDUCTION', 'saudi_hr', 'Attendance-originated payroll deduction', 'Deduction/Payroll'),
  ('SA-DISCIPLINARY-FINE', 'saudi_hr', 'Disciplinary fine policy', 'Discipline/Deduction'),
  ('SA-EMPLOYER-LOAN', 'saudi_hr', 'Employer loan and salary advance recovery', 'Obligation/Payroll'),
  ('SA-JUDICIAL-DEDUCTION', 'saudi_hr', 'Judicial deduction policy', 'Deduction/Payroll'),
  ('SA-DEDUCTION-AGGREGATE-LIMIT', 'saudi_hr', 'Aggregate deduction guard', 'Deduction/Payroll'),
  ('SA-PAYROLL-CYCLE', 'saudi_hr', 'Payroll calculation and settlement lifecycle', 'Payroll'),
  ('SA-PAYROLL-CORRECTION', 'saudi_hr', 'Backdated payroll correction', 'Payroll/Audit'),
  ('SA-FINAL-SETTLEMENT', 'saudi_hr', 'Termination final settlement', 'Employment/Payroll'),
  ('MADAN-IDENTITY-LINK', 'operational', 'Account and employee linkage invariant', 'Identity/Employee'),
  ('MADAN-AVATAR-DEFAULT', 'operational', 'Explicit or neutral avatar fallback policy', 'Employee/Profile'),
  ('MADAN-APPROVAL-MATRIX', 'operational', 'Actor, amount and type dependent approvals', 'Workflow'),
  ('MADAN-IDEMPOTENCY', 'operational', 'Duplicate command and replay behavior', 'All commands'),
  ('MADAN-RECONCILIATION', 'operational', 'Drift detection and repair classification', 'System Health'),
  ('MADAN-AUDIT-EVIDENCE', 'operational', 'Required audit and evidence fields', 'Audit'),
  ('MADAN-DATA-RETENTION', 'operational', 'Retention and archival by data class', 'Governance')
ON CONFLICT(policy_key) DO UPDATE SET
  policy_family = excluded.policy_family,
  purpose = excluded.purpose,
  target_consumer = excluded.target_consumer,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

DROP VIEW IF EXISTS hr_resolvable_policy_versions;
CREATE VIEW hr_resolvable_policy_versions AS
SELECT version.*
  FROM hr_policy_versions version
 WHERE version.status <> 'draft';

DROP VIEW IF EXISTS hr_current_policy_versions;
CREATE VIEW hr_current_policy_versions AS
SELECT version.*
  FROM hr_resolvable_policy_versions version
 WHERE version.effective_from <= strftime('%Y-%m-%d', 'now')
   AND (
     version.effective_to IS NULL
     OR version.effective_to > strftime('%Y-%m-%d', 'now')
   );

DROP VIEW IF EXISTS hr_policy_integrity_summary;
CREATE VIEW hr_policy_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM hr_policy_versions
     WHERE effective_to IS NOT NULL
       AND effective_to <= effective_from
  ) AS invalid_effective_ranges,

  (
    SELECT COUNT(*)
      FROM hr_policy_versions a
      JOIN hr_policy_versions b
        ON a.policy_key = b.policy_key
       AND a.id < b.id
       AND a.status <> 'draft'
       AND b.status <> 'draft'
       AND a.effective_from < COALESCE(b.effective_to, '9999-12-31')
       AND b.effective_from < COALESCE(a.effective_to, '9999-12-31')
  ) AS overlapping_finalized_policy_periods,

  (
    SELECT COUNT(*)
      FROM (
        SELECT policy_key
          FROM hr_current_policy_versions
         GROUP BY policy_key
        HAVING COUNT(*) > 1
      ) duplicates
  ) AS policy_keys_with_multiple_current_versions,

  (
    SELECT COUNT(*)
      FROM hr_policy_definitions definition
      LEFT JOIN hr_current_policy_versions current_version
        ON current_version.policy_key = definition.policy_key
     WHERE current_version.id IS NULL
  ) AS policy_definitions_without_current_version,

  (
    SELECT COUNT(*)
      FROM hr_policy_versions version
     WHERE version.supersedes_version_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM hr_policy_versions previous
          WHERE previous.id = version.supersedes_version_id
            AND previous.policy_key = version.policy_key
            AND previous.version < version.version
       )
  ) AS invalid_supersession_links,

  (
    SELECT COUNT(*)
      FROM hr_policy_versions
     WHERE status <> 'draft'
       AND published_at IS NULL
  ) AS finalized_versions_missing_publish_metadata;
