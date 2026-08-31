PRAGMA foreign_keys = ON;

-- MADAN COMPENSATION EFFECTIVE DATING V1
--
-- Additive cutover foundation:
-- - employees remains the compatibility/current projection for now.
-- - canonical compensation history lives here.
-- - bootstrap records only the state observed at cutover time.
-- - no pre-cutover compensation history is invented.
-- - Basic Wage and Actual/Fixed Wage are separate concepts.
-- - Actual/Fixed Wage is never inferred from Basic Wage.
-- - allowance components are typed and attached to an immutable term version.
-- - periods use [effective_from, effective_to) semantics.

CREATE TABLE IF NOT EXISTS employee_compensation_terms (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,

  effective_from TEXT NOT NULL,
  effective_to TEXT,

  currency_code TEXT NOT NULL DEFAULT 'SAR',
  basic_wage REAL,
  actual_fixed_wage REAL,

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

  CHECK (length(TRIM(currency_code)) = 3),
  CHECK (basic_wage IS NULL OR basic_wage >= 0),
  CHECK (actual_fixed_wage IS NULL OR actual_fixed_wage >= 0)
);

CREATE INDEX IF NOT EXISTS idx_compensation_terms_employee_effective
  ON employee_compensation_terms (
    employee_id,
    effective_from DESC,
    effective_to
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_compensation_terms_one_open_period
  ON employee_compensation_terms(employee_id)
  WHERE effective_to IS NULL;

DROP TRIGGER IF EXISTS trg_compensation_term_no_overlap_insert;
CREATE TRIGGER trg_compensation_term_no_overlap_insert
BEFORE INSERT ON employee_compensation_terms
WHEN EXISTS (
  SELECT 1
    FROM employee_compensation_terms existing
   WHERE existing.employee_id = NEW.employee_id
     AND existing.effective_from < COALESCE(NEW.effective_to, '9999-12-31')
     AND NEW.effective_from < COALESCE(existing.effective_to, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'compensation_term_period_overlap');
END;

-- Existing business facts are immutable.
-- The only allowed UPDATE closes an open period and may record close metadata.
DROP TRIGGER IF EXISTS trg_compensation_term_immutable_update;
CREATE TRIGGER trg_compensation_term_immutable_update
BEFORE UPDATE ON employee_compensation_terms
WHEN
     OLD.effective_to IS NOT NULL
  OR NEW.effective_to IS NULL
  OR NOT (NEW.id IS OLD.id)
  OR NOT (NEW.employee_id IS OLD.employee_id)
  OR NOT (NEW.effective_from IS OLD.effective_from)
  OR NOT (NEW.currency_code IS OLD.currency_code)
  OR NOT (NEW.basic_wage IS OLD.basic_wage)
  OR NOT (NEW.actual_fixed_wage IS OLD.actual_fixed_wage)
  OR NOT (NEW.source IS OLD.source)
  OR NOT (NEW.reason IS OLD.reason)
  OR NOT (NEW.created_by_uid IS OLD.created_by_uid)
  OR NOT (NEW.created_by_email IS OLD.created_by_email)
  OR NOT (NEW.created_at IS OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'compensation_term_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_compensation_term_block_delete;
CREATE TRIGGER trg_compensation_term_block_delete
BEFORE DELETE ON employee_compensation_terms
BEGIN
  SELECT RAISE(ABORT, 'compensation_term_history_immutable');
END;

CREATE TABLE IF NOT EXISTS employee_compensation_components (
  id TEXT PRIMARY KEY,
  compensation_term_id TEXT NOT NULL,

  component_type TEXT NOT NULL,
  component_code TEXT NOT NULL,
  amount REAL NOT NULL,

  source TEXT NOT NULL DEFAULT 'hr_api',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (compensation_term_id)
    REFERENCES employee_compensation_terms(id)
    ON DELETE RESTRICT,

  UNIQUE (compensation_term_id, component_code),

  CHECK (
    component_type IN (
      'housing_allowance',
      'transportation_allowance',
      'other_allowance'
    )
  ),
  CHECK (TRIM(component_code) <> ''),
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_compensation_components_term
  ON employee_compensation_components(compensation_term_id, component_type, component_code);

DROP TRIGGER IF EXISTS trg_compensation_component_immutable_update;
CREATE TRIGGER trg_compensation_component_immutable_update
BEFORE UPDATE ON employee_compensation_components
BEGIN
  SELECT RAISE(ABORT, 'compensation_component_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_compensation_component_block_delete;
CREATE TRIGGER trg_compensation_component_block_delete
BEFORE DELETE ON employee_compensation_components
BEGIN
  SELECT RAISE(ABORT, 'compensation_component_history_immutable');
END;

-- Bootstrap the currently observed compensation projection only.
-- effective_from is the cutover date, not an inferred historical wage date.
INSERT INTO employee_compensation_terms (
  id,
  employee_id,
  effective_from,
  effective_to,
  currency_code,
  basic_wage,
  actual_fixed_wage,
  source,
  reason,
  created_at,
  updated_at
)
SELECT
  'bootstrap:compensation:' || e.id,
  e.id,
  strftime('%Y-%m-%d', 'now'),
  NULL,
  'SAR',
  e.base_salary,
  NULL,
  'compat_bootstrap_0013',
  'bootstrap_current_employee_compensation_projection_at_cutover',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM employees e;

-- Preserve explicit compatibility allowance values, including explicit zero.
-- Missing values remain missing instead of being fabricated as zero.
INSERT INTO employee_compensation_components (
  id,
  compensation_term_id,
  component_type,
  component_code,
  amount,
  source
)
SELECT
  'bootstrap:compensation:' || e.id || ':housing',
  'bootstrap:compensation:' || e.id,
  'housing_allowance',
  'housing',
  e.housing_allowance,
  'compat_bootstrap_0013'
FROM employees e
WHERE e.housing_allowance IS NOT NULL;

INSERT INTO employee_compensation_components (
  id,
  compensation_term_id,
  component_type,
  component_code,
  amount,
  source
)
SELECT
  'bootstrap:compensation:' || e.id || ':transportation',
  'bootstrap:compensation:' || e.id,
  'transportation_allowance',
  'transportation',
  e.transportation_allowance,
  'compat_bootstrap_0013'
FROM employees e
WHERE e.transportation_allowance IS NOT NULL;

INSERT INTO employee_compensation_components (
  id,
  compensation_term_id,
  component_type,
  component_code,
  amount,
  source
)
SELECT
  'bootstrap:compensation:' || e.id || ':legacy-other',
  'bootstrap:compensation:' || e.id,
  'other_allowance',
  'legacy_other_allowances',
  e.other_allowances,
  'compat_bootstrap_0013'
FROM employees e
WHERE e.other_allowances IS NOT NULL;

DROP VIEW IF EXISTS hr_current_compensation_terms;
CREATE VIEW hr_current_compensation_terms AS
SELECT
  t.id,
  t.employee_id,
  t.effective_from,
  t.effective_to,
  t.currency_code,
  t.basic_wage,
  t.actual_fixed_wage,
  SUM(CASE WHEN c.component_type = 'housing_allowance' THEN c.amount END) AS housing_allowance,
  SUM(CASE WHEN c.component_type = 'transportation_allowance' THEN c.amount END) AS transportation_allowance,
  SUM(CASE WHEN c.component_type = 'other_allowance' THEN c.amount END) AS other_allowances,
  t.source,
  t.reason,
  t.created_by_uid,
  t.created_by_email,
  t.closed_at,
  t.closed_by_uid,
  t.closed_by_email,
  t.created_at,
  t.updated_at
FROM employee_compensation_terms t
LEFT JOIN employee_compensation_components c
  ON c.compensation_term_id = t.id
WHERE t.effective_from <= strftime('%Y-%m-%d', 'now')
  AND (
    t.effective_to IS NULL
    OR t.effective_to > strftime('%Y-%m-%d', 'now')
  )
GROUP BY t.id;

DROP VIEW IF EXISTS hr_compensation_integrity_summary;
CREATE VIEW hr_compensation_integrity_summary AS
SELECT
  (
    SELECT COUNT(*)
      FROM employee_compensation_terms
     WHERE effective_to IS NOT NULL
       AND effective_to <= effective_from
  ) AS invalid_effective_ranges,

  (
    SELECT COUNT(*)
      FROM employee_compensation_terms a
      JOIN employee_compensation_terms b
        ON a.employee_id = b.employee_id
       AND a.id < b.id
       AND a.effective_from < COALESCE(b.effective_to, '9999-12-31')
       AND b.effective_from < COALESCE(a.effective_to, '9999-12-31')
  ) AS overlapping_compensation_periods,

  (
    SELECT COUNT(*)
      FROM employees e
      LEFT JOIN hr_current_compensation_terms t
        ON t.employee_id = e.id
     WHERE t.id IS NULL
  ) AS employees_without_current_compensation_term,

  (
    SELECT COUNT(*)
      FROM employee_compensation_terms
     WHERE (basic_wage IS NOT NULL AND basic_wage < 0)
        OR (actual_fixed_wage IS NOT NULL AND actual_fixed_wage < 0)
  ) AS negative_compensation_values,

  (
    SELECT COUNT(*)
      FROM employee_compensation_components
     WHERE amount < 0
  ) AS negative_component_values,

  (
    SELECT COUNT(*)
      FROM hr_current_compensation_terms
     WHERE basic_wage IS NULL
  ) AS current_terms_missing_basic_wage;
