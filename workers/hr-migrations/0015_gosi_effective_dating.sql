PRAGMA foreign_keys = ON;

-- MADAN GOSI EFFECTIVE DATING V1
--
-- Additive cutover foundation:
-- - employees remains the compatibility/current projection for now.
-- - canonical GOSI profile history lives here.
-- - bootstrap records only what is actually known at cutover time.
-- - no pre-cutover GOSI history is invented.
-- - legacy employees.insurance_deduction is NOT a GOSI Wage and is not used
--   to infer GOSI applicability, GOSI Wage, or a policy version.
-- - GOSI contribution calculation/ledger is intentionally a later stage.
-- - periods use [effective_from, effective_to) semantics.

CREATE TABLE IF NOT EXISTS employee_gosi_profiles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,

  effective_from TEXT NOT NULL,
  effective_to TEXT,

  applicability_status TEXT NOT NULL DEFAULT 'unknown',
  gosi_wage REAL,
  policy_version_key TEXT,
  policy_inputs_json TEXT NOT NULL DEFAULT '{}',

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
    applicability_status IN (
      'unknown',
      'applicable',
      'not_applicable',
      'exempt'
    )
  ),

  CHECK (gosi_wage IS NULL OR gosi_wage >= 0),
  CHECK (policy_version_key IS NULL OR TRIM(policy_version_key) <> ''),
  CHECK (json_valid(policy_inputs_json))
);

CREATE INDEX IF NOT EXISTS idx_gosi_profiles_employee_effective
  ON employee_gosi_profiles (
    employee_id,
    effective_from DESC,
    effective_to
  );

CREATE INDEX IF NOT EXISTS idx_gosi_profiles_applicability_effective
  ON employee_gosi_profiles (
    applicability_status,
    effective_from DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_gosi_profiles_one_open_period
  ON employee_gosi_profiles(employee_id)
  WHERE effective_to IS NULL;

DROP TRIGGER IF EXISTS trg_gosi_profile_no_overlap_insert;
CREATE TRIGGER trg_gosi_profile_no_overlap_insert
BEFORE INSERT ON employee_gosi_profiles
WHEN EXISTS (
  SELECT 1
    FROM employee_gosi_profiles existing
   WHERE existing.employee_id = NEW.employee_id
     AND existing.effective_from < COALESCE(NEW.effective_to, '9999-12-31')
     AND NEW.effective_from < COALESCE(existing.effective_to, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'gosi_profile_period_overlap');
END;

DROP TRIGGER IF EXISTS trg_gosi_profile_policy_inputs_object_insert;
CREATE TRIGGER trg_gosi_profile_policy_inputs_object_insert
BEFORE INSERT ON employee_gosi_profiles
WHEN
  CASE
    WHEN json_valid(NEW.policy_inputs_json) = 0 THEN 1
    WHEN json_type(NEW.policy_inputs_json) <> 'object' THEN 1
    ELSE 0
  END
BEGIN
  SELECT RAISE(ABORT, 'gosi_policy_inputs_invalid');
END;

-- Existing GOSI business facts are immutable.
-- The only allowed UPDATE closes an open period and may record close metadata.
DROP TRIGGER IF EXISTS trg_gosi_profile_immutable_update;
CREATE TRIGGER trg_gosi_profile_immutable_update
BEFORE UPDATE ON employee_gosi_profiles
WHEN
     OLD.effective_to IS NOT NULL
  OR NEW.effective_to IS NULL
  OR NOT (NEW.id IS OLD.id)
  OR NOT (NEW.employee_id IS OLD.employee_id)
  OR NOT (NEW.effective_from IS OLD.effective_from)
  OR NOT (NEW.applicability_status IS OLD.applicability_status)
  OR NOT (NEW.gosi_wage IS OLD.gosi_wage)
  OR NOT (NEW.policy_version_key IS OLD.policy_version_key)
  OR NOT (NEW.policy_inputs_json IS OLD.policy_inputs_json)
  OR NOT (NEW.source IS OLD.source)
  OR NOT (NEW.reason IS OLD.reason)
  OR NOT (NEW.created_by_uid IS OLD.created_by_uid)
  OR NOT (NEW.created_by_email IS OLD.created_by_email)
  OR NOT (NEW.created_at IS OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'gosi_profile_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_gosi_profile_block_delete;
CREATE TRIGGER trg_gosi_profile_block_delete
BEFORE DELETE ON employee_gosi_profiles
BEGIN
  SELECT RAISE(ABORT, 'gosi_profile_history_immutable');
END;

-- Bootstrap one current profile per employee without inventing GOSI facts.
-- The legacy insurance_deduction field is deliberately not copied into
-- gosi_wage or policy inputs because it is only an observed scalar deduction.
INSERT INTO employee_gosi_profiles (
  id,
  employee_id,
  effective_from,
  effective_to,
  applicability_status,
  gosi_wage,
  policy_version_key,
  policy_inputs_json,
  source,
  reason,
  created_at,
  updated_at
)
SELECT
  'bootstrap:gosi:' || e.id,
  e.id,
  strftime('%Y-%m-%d', 'now'),
  NULL,
  'unknown',
  NULL,
  NULL,
  '{}',
  'compat_bootstrap_0015',
  'bootstrap_gosi_profile_without_inferred_legacy_facts',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM employees e;

DROP VIEW IF EXISTS hr_current_gosi_profiles;
CREATE VIEW hr_current_gosi_profiles AS
SELECT p.*
  FROM employee_gosi_profiles p
 WHERE p.effective_from <= strftime('%Y-%m-%d', 'now')
   AND (
     p.effective_to IS NULL
     OR p.effective_to > strftime('%Y-%m-%d', 'now')
   );

DROP VIEW IF EXISTS hr_gosi_integrity_summary;
CREATE VIEW hr_gosi_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM employee_gosi_profiles
     WHERE effective_to IS NOT NULL
       AND effective_to <= effective_from
  ) AS invalid_effective_ranges,

  (
    SELECT COUNT(*)
      FROM employee_gosi_profiles a
      JOIN employee_gosi_profiles b
        ON a.employee_id = b.employee_id
       AND a.id < b.id
       AND a.effective_from < COALESCE(b.effective_to, '9999-12-31')
       AND b.effective_from < COALESCE(a.effective_to, '9999-12-31')
  ) AS overlapping_gosi_periods,

  (
    SELECT COUNT(*)
      FROM employees e
      LEFT JOIN hr_current_gosi_profiles p
        ON p.employee_id = e.id
     WHERE p.id IS NULL
  ) AS employees_without_current_gosi_profile,

  (
    SELECT COUNT(*)
      FROM employee_gosi_profiles
     WHERE gosi_wage IS NOT NULL
       AND gosi_wage < 0
  ) AS negative_gosi_wage_values,

  (
    SELECT COUNT(*)
      FROM hr_current_gosi_profiles
     WHERE applicability_status = 'unknown'
  ) AS current_unknown_applicability,

  (
    SELECT COUNT(*)
      FROM hr_current_gosi_profiles
     WHERE applicability_status = 'applicable'
       AND gosi_wage IS NULL
  ) AS current_applicable_missing_gosi_wage,

  (
    SELECT COUNT(*)
      FROM hr_current_gosi_profiles
     WHERE applicability_status = 'applicable'
       AND policy_version_key IS NULL
  ) AS current_applicable_missing_policy_version;
