PRAGMA foreign_keys = ON;

-- MADAN DEDUCTION & OBLIGATION LEDGER V1
-- Establishes canonical employee financial obligations and append-only ledger
-- movements. Existing employee/payroll deduction JSON and payroll scalar fields
-- remain compatibility/snapshot surfaces until command/payroll cutover.
--
-- Bootstrap rule: none. The audited Production preflight found no current
-- employee salary deduction items and no amount-bearing salary-advance request
-- evidence that can be safely promoted. Historical payroll deduction fields are
-- immutable payroll snapshots and are deliberately not replayed as obligations.

CREATE TABLE IF NOT EXISTS employee_financial_obligations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  obligation_type TEXT NOT NULL CHECK (
    obligation_type IN (
      'salary_advance',
      'manual_deduction',
      'disciplinary_fine',
      'judicial_deduction',
      'attendance_absence',
      'attendance_delay',
      'other'
    )
  ),
  currency TEXT NOT NULL DEFAULT 'SAR' CHECK (
    length(currency) = 3 AND currency = upper(currency)
  ),
  source_request_id TEXT,
  policy_version_key TEXT,
  evidence_ref TEXT,
  source TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) = 1
    AND json_type(metadata_json) = 'object'
  ),
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_request_id) REFERENCES employee_service_requests(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_obligation_source_request
  ON employee_financial_obligations(source_request_id)
  WHERE source_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_obligations_employee_created
  ON employee_financial_obligations(employee_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_financial_obligations_type_created
  ON employee_financial_obligations(obligation_type, created_at, id);

DROP TRIGGER IF EXISTS trg_financial_obligation_request_employee_insert;
CREATE TRIGGER trg_financial_obligation_request_employee_insert
BEFORE INSERT ON employee_financial_obligations
WHEN NEW.source_request_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM employee_service_requests request
    WHERE request.id = NEW.source_request_id
      AND request.employee_id = NEW.employee_id
 )
BEGIN
  SELECT RAISE(ABORT, 'financial_obligation_request_employee_mismatch');
END;

DROP TRIGGER IF EXISTS trg_financial_obligation_immutable_update;
CREATE TRIGGER trg_financial_obligation_immutable_update
BEFORE UPDATE ON employee_financial_obligations
BEGIN
  SELECT RAISE(ABORT, 'financial_obligation_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_financial_obligation_immutable_delete;
CREATE TRIGGER trg_financial_obligation_immutable_delete
BEFORE DELETE ON employee_financial_obligations
BEGIN
  SELECT RAISE(ABORT, 'financial_obligation_history_immutable');
END;

CREATE TABLE IF NOT EXISTS employee_obligation_ledger_entries (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  effective_date TEXT NOT NULL CHECK (
    effective_date = date(effective_date)
  ),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'charge',
      'deduction',
      'payment',
      'waiver',
      'adjustment',
      'reversal'
    )
  ),
  amount_delta REAL NOT NULL CHECK (ABS(amount_delta) > 0.0000001),
  payroll_record_id TEXT,
  reverses_entry_id TEXT,
  idempotency_key TEXT NOT NULL,
  policy_version_key TEXT,
  evidence_ref TEXT,
  source TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) = 1
    AND json_type(metadata_json) = 'object'
  ),
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (obligation_id) REFERENCES employee_financial_obligations(id) ON DELETE RESTRICT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (payroll_record_id) REFERENCES employee_payroll_records(id) ON DELETE RESTRICT,
  FOREIGN KEY (reverses_entry_id) REFERENCES employee_obligation_ledger_entries(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_obligation_ledger_idempotency
  ON employee_obligation_ledger_entries(idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_obligation_single_charge
  ON employee_obligation_ledger_entries(obligation_id)
  WHERE entry_type = 'charge';

CREATE UNIQUE INDEX IF NOT EXISTS ux_obligation_single_reversal
  ON employee_obligation_ledger_entries(reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_obligation_ledger_obligation_effective
  ON employee_obligation_ledger_entries(obligation_id, effective_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_obligation_ledger_employee_effective
  ON employee_obligation_ledger_entries(employee_id, effective_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_obligation_ledger_payroll
  ON employee_obligation_ledger_entries(payroll_record_id, created_at, id)
  WHERE payroll_record_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_obligation_ledger_employee_match_insert;
CREATE TRIGGER trg_obligation_ledger_employee_match_insert
BEFORE INSERT ON employee_obligation_ledger_entries
WHEN NOT EXISTS (
  SELECT 1
    FROM employee_financial_obligations obligation
   WHERE obligation.id = NEW.obligation_id
     AND obligation.employee_id = NEW.employee_id
)
BEGIN
  SELECT RAISE(ABORT, 'obligation_ledger_employee_mismatch');
END;

DROP TRIGGER IF EXISTS trg_obligation_ledger_shape_insert;
CREATE TRIGGER trg_obligation_ledger_shape_insert
BEFORE INSERT ON employee_obligation_ledger_entries
WHEN (
  (NEW.entry_type = 'charge' AND NEW.amount_delta <= 0)
  OR (NEW.entry_type IN ('deduction', 'payment', 'waiver') AND NEW.amount_delta >= 0)
  OR (NEW.entry_type = 'reversal' AND NEW.reverses_entry_id IS NULL)
  OR (NEW.entry_type <> 'reversal' AND NEW.reverses_entry_id IS NOT NULL)
  OR (NEW.entry_type = 'deduction' AND NEW.payroll_record_id IS NULL)
  OR (NEW.entry_type <> 'deduction' AND NEW.payroll_record_id IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'obligation_ledger_entry_shape_invalid');
END;

DROP TRIGGER IF EXISTS trg_obligation_ledger_payroll_employee_insert;
CREATE TRIGGER trg_obligation_ledger_payroll_employee_insert
BEFORE INSERT ON employee_obligation_ledger_entries
WHEN NEW.payroll_record_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM employee_payroll_records payroll
    WHERE payroll.id = NEW.payroll_record_id
      AND payroll.employee_id = NEW.employee_id
 )
BEGIN
  SELECT RAISE(ABORT, 'obligation_ledger_payroll_employee_mismatch');
END;

DROP TRIGGER IF EXISTS trg_obligation_ledger_reversal_target_insert;
CREATE TRIGGER trg_obligation_ledger_reversal_target_insert
BEFORE INSERT ON employee_obligation_ledger_entries
WHEN NEW.reverses_entry_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM employee_obligation_ledger_entries original
    WHERE original.id = NEW.reverses_entry_id
      AND original.obligation_id = NEW.obligation_id
      AND original.employee_id = NEW.employee_id
      AND ABS(NEW.amount_delta + original.amount_delta) <= 0.0000001
 )
BEGIN
  SELECT RAISE(ABORT, 'obligation_ledger_reversal_target_invalid');
END;

-- An obligation balance may never become negative at the new entry's business
-- effective date. This prevents over-deduction/over-payment while still
-- allowing future-dated settlements that do not affect current balance early.
DROP TRIGGER IF EXISTS trg_obligation_ledger_nonnegative_balance_insert;
CREATE TRIGGER trg_obligation_ledger_nonnegative_balance_insert
BEFORE INSERT ON employee_obligation_ledger_entries
WHEN (
  COALESCE((
    SELECT SUM(existing.amount_delta)
      FROM employee_obligation_ledger_entries existing
     WHERE existing.obligation_id = NEW.obligation_id
       AND existing.effective_date <= NEW.effective_date
  ), 0) + NEW.amount_delta
) < -0.0000001
BEGIN
  SELECT RAISE(ABORT, 'obligation_balance_negative');
END;

DROP TRIGGER IF EXISTS trg_obligation_ledger_immutable_update;
CREATE TRIGGER trg_obligation_ledger_immutable_update
BEFORE UPDATE ON employee_obligation_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'obligation_ledger_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_obligation_ledger_immutable_delete;
CREATE TRIGGER trg_obligation_ledger_immutable_delete
BEFORE DELETE ON employee_obligation_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'obligation_ledger_history_immutable');
END;

DROP VIEW IF EXISTS hr_current_employee_obligations;
CREATE VIEW hr_current_employee_obligations AS
SELECT
  obligation.id AS obligation_id,
  obligation.employee_id,
  obligation.obligation_type,
  obligation.currency,
  obligation.source_request_id,
  obligation.policy_version_key,
  obligation.source,
  obligation.reason,
  ROUND(COALESCE(SUM(
    CASE WHEN entry.effective_date <= date('now') THEN entry.amount_delta ELSE 0 END
  ), 0), 6) AS balance_amount,
  SUM(CASE WHEN entry.effective_date <= date('now') THEN 1 ELSE 0 END) AS current_entry_count,
  SUM(CASE WHEN entry.effective_date > date('now') THEN 1 ELSE 0 END) AS future_entry_count,
  CASE
    WHEN SUM(CASE WHEN entry.effective_date <= date('now') THEN 1 ELSE 0 END) = 0
      THEN 'pending_effective'
    WHEN ABS(COALESCE(SUM(
      CASE WHEN entry.effective_date <= date('now') THEN entry.amount_delta ELSE 0 END
    ), 0)) <= 0.0000001
      THEN 'settled'
    ELSE 'open'
  END AS derived_status,
  obligation.created_at
FROM employee_financial_obligations obligation
LEFT JOIN employee_obligation_ledger_entries entry
  ON entry.obligation_id = obligation.id
GROUP BY obligation.id;

DROP VIEW IF EXISTS hr_deduction_obligation_integrity_summary;
CREATE VIEW hr_deduction_obligation_integrity_summary AS
SELECT
  (SELECT COUNT(*)
     FROM employee_financial_obligations obligation
    WHERE NOT EXISTS (
      SELECT 1
        FROM employee_obligation_ledger_entries entry
       WHERE entry.obligation_id = obligation.id
         AND entry.entry_type = 'charge'
    )) AS obligations_without_charge,
  (SELECT COUNT(*)
     FROM hr_current_employee_obligations current_obligation
    WHERE current_obligation.balance_amount < -0.0000001) AS negative_current_balances,
  (SELECT COUNT(*)
     FROM employee_obligation_ledger_entries entry
     JOIN employee_financial_obligations obligation
       ON obligation.id = entry.obligation_id
    WHERE entry.employee_id <> obligation.employee_id) AS entry_employee_mismatches,
  (SELECT COUNT(*)
     FROM employee_obligation_ledger_entries entry
     JOIN employee_payroll_records payroll
       ON payroll.id = entry.payroll_record_id
    WHERE entry.payroll_record_id IS NOT NULL
      AND (payroll.employee_id IS NULL OR payroll.employee_id <> entry.employee_id)) AS payroll_employee_mismatches,
  (SELECT COALESCE(SUM(
      CASE
        WHEN json_valid(employee.salary_deductions_json) = 1
         AND json_type(employee.salary_deductions_json) = 'array'
          THEN json_array_length(employee.salary_deductions_json)
        ELSE 0
      END
    ), 0)
     FROM employees employee) AS legacy_employee_deduction_items,
  (SELECT COUNT(*)
     FROM employees employee
    WHERE employee.salary_deductions_json IS NULL
       OR TRIM(employee.salary_deductions_json) = ''
       OR json_valid(employee.salary_deductions_json) = 0
       OR json_type(employee.salary_deductions_json) <> 'array') AS invalid_legacy_employee_deductions_json,
  (SELECT COUNT(*)
     FROM employee_service_requests request
    WHERE request.amount IS NOT NULL
      AND request.amount > 0
      AND NOT EXISTS (
        SELECT 1
          FROM employee_financial_obligations obligation
         WHERE obligation.source_request_id = request.id
      )) AS amount_bearing_requests_without_obligation,
  (SELECT COUNT(*)
     FROM employee_payroll_records payroll
    WHERE ABS(COALESCE(payroll.total_salary_deductions, 0)) > 0.0000001
       OR ABS(COALESCE(payroll.salary_advance_deduction, 0)) > 0.0000001
       OR ABS(COALESCE(payroll.absence_deduction, 0)) > 0.0000001
       OR ABS(COALESCE(payroll.delay_deduction, 0)) > 0.0000001) AS historical_payroll_records_with_deduction_snapshots;
