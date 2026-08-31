PRAGMA foreign_keys = ON;

-- MADAN LEAVE LEDGER V1
-- Establishes the append-only canonical leave balance ledger.
-- Existing employees.leave_balance remains a compatibility/current projection
-- until the HR command/API cutover is completed.
--
-- Bootstrap rule: a non-null legacy leave_balance becomes exactly one opening
-- balance at migration cutover. Null stays unknown. Pre-cutover request or
-- adjustment rows are not replayed because their historical opening state is
-- not safely reconstructible from the audited schema.

CREATE TABLE IF NOT EXISTS employee_leave_ledger_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  effective_date TEXT NOT NULL CHECK (
    effective_date = date(effective_date)
  ),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'opening_balance',
      'accrual',
      'grant',
      'consumption',
      'restoration',
      'adjustment',
      'expiration',
      'reversal'
    )
  ),
  delta_days REAL NOT NULL CHECK (
    entry_type = 'opening_balance' OR ABS(delta_days) > 0.0000001
  ),
  leave_request_id TEXT,
  reverses_entry_id TEXT,
  idempotency_key TEXT NOT NULL,
  policy_version_key TEXT,
  evidence_ref TEXT,
  source TEXT NOT NULL,
  source_detail TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) = 1
    AND json_type(metadata_json) = 'object'
  ),
  created_by_uid TEXT,
  created_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  FOREIGN KEY (leave_request_id) REFERENCES employee_leave_requests(id) ON DELETE RESTRICT,
  FOREIGN KEY (reverses_entry_id) REFERENCES employee_leave_ledger_entries(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_ledger_idempotency
  ON employee_leave_ledger_entries(idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_ledger_single_opening_balance
  ON employee_leave_ledger_entries(employee_id)
  WHERE entry_type = 'opening_balance';

CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_ledger_single_reversal
  ON employee_leave_ledger_entries(reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_ledger_employee_effective
  ON employee_leave_ledger_entries(employee_id, effective_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_leave_ledger_request
  ON employee_leave_ledger_entries(leave_request_id, created_at)
  WHERE leave_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_ledger_policy
  ON employee_leave_ledger_entries(policy_version_key, effective_date)
  WHERE policy_version_key IS NOT NULL;

-- Reversal entries are explicit compensating facts, never in-place edits.
DROP TRIGGER IF EXISTS trg_leave_ledger_reversal_shape_insert;
CREATE TRIGGER trg_leave_ledger_reversal_shape_insert
BEFORE INSERT ON employee_leave_ledger_entries
WHEN (
  (NEW.entry_type = 'reversal' AND NEW.reverses_entry_id IS NULL)
  OR (NEW.entry_type <> 'reversal' AND NEW.reverses_entry_id IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'leave_ledger_reversal_shape_invalid');
END;

DROP TRIGGER IF EXISTS trg_leave_ledger_reversal_target_insert;
CREATE TRIGGER trg_leave_ledger_reversal_target_insert
BEFORE INSERT ON employee_leave_ledger_entries
WHEN NEW.reverses_entry_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM employee_leave_ledger_entries original
    WHERE original.id = NEW.reverses_entry_id
      AND original.employee_id = NEW.employee_id
      AND ABS(NEW.delta_days + original.delta_days) <= 0.0000001
 )
BEGIN
  SELECT RAISE(ABORT, 'leave_ledger_reversal_target_invalid');
END;

-- A canonical request-backed ledger line may only reference a request that is
-- already canonically linked to the same employee. Legacy request rows with a
-- null employee_id are intentionally not accepted as canonical write sources.
DROP TRIGGER IF EXISTS trg_leave_ledger_request_employee_match_insert;
CREATE TRIGGER trg_leave_ledger_request_employee_match_insert
BEFORE INSERT ON employee_leave_ledger_entries
WHEN NEW.leave_request_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
     FROM employee_leave_requests request
    WHERE request.id = NEW.leave_request_id
      AND request.employee_id = NEW.employee_id
 )
BEGIN
  SELECT RAISE(ABORT, 'leave_ledger_request_employee_mismatch');
END;

-- Ledger history is immutable. Corrections are new adjustment/reversal lines.
DROP TRIGGER IF EXISTS trg_leave_ledger_history_immutable_update;
CREATE TRIGGER trg_leave_ledger_history_immutable_update
BEFORE UPDATE ON employee_leave_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'leave_ledger_history_immutable');
END;

DROP TRIGGER IF EXISTS trg_leave_ledger_history_immutable_delete;
CREATE TRIGGER trg_leave_ledger_history_immutable_delete
BEFORE DELETE ON employee_leave_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'leave_ledger_history_immutable');
END;

-- Capture only the observed balance at cutover. This is deliberately not
-- backdated to hire date and does not pretend to reconstruct accrual history.
INSERT OR IGNORE INTO employee_leave_ledger_entries (
  id,
  employee_id,
  effective_date,
  entry_type,
  delta_days,
  idempotency_key,
  source,
  source_detail,
  reason,
  metadata_json
)
SELECT
  'bootstrap:leave:' || employee.id,
  employee.id,
  date('now'),
  'opening_balance',
  employee.leave_balance,
  'bootstrap:leave:' || employee.id,
  'compat_bootstrap_0016',
  'employees.leave_balance',
  'Observed current leave balance at canonical ledger cutover; pre-cutover history not reconstructed',
  json_object(
    'compatField', 'employees.leave_balance',
    'bootstrapSemantics', 'current_observed_state_only'
  )
FROM employees employee
WHERE employee.leave_balance IS NOT NULL;

DROP VIEW IF EXISTS hr_current_leave_balances;
CREATE VIEW hr_current_leave_balances AS
SELECT
  employee.id AS employee_id,
  ROUND(SUM(entry.delta_days), 6) AS balance_days,
  COUNT(entry.id) AS ledger_entry_count,
  MIN(entry.effective_date) AS first_effective_date,
  MAX(entry.effective_date) AS latest_effective_date,
  MAX(entry.created_at) AS latest_recorded_at
FROM employees employee
JOIN employee_leave_ledger_entries entry
  ON entry.employee_id = employee.id
WHERE entry.effective_date <= date('now')
GROUP BY employee.id;

DROP VIEW IF EXISTS hr_leave_ledger_integrity_summary;
CREATE VIEW hr_leave_ledger_integrity_summary AS
SELECT
  (SELECT COUNT(*)
     FROM employees employee
     LEFT JOIN hr_current_leave_balances current_balance
       ON current_balance.employee_id = employee.id
    WHERE employee.leave_balance IS NOT NULL
      AND current_balance.employee_id IS NULL) AS compat_balance_without_ledger,
  (SELECT COUNT(*)
     FROM employees employee
     LEFT JOIN hr_current_leave_balances current_balance
       ON current_balance.employee_id = employee.id
    WHERE employee.leave_balance IS NULL
      AND current_balance.employee_id IS NULL) AS employees_with_unknown_leave_balance,
  (SELECT COUNT(*)
     FROM employees employee
     JOIN hr_current_leave_balances current_balance
       ON current_balance.employee_id = employee.id
    WHERE employee.leave_balance IS NOT NULL
      AND ABS(employee.leave_balance - current_balance.balance_days) > 0.0001) AS compat_balance_mismatch,
  (SELECT COUNT(*)
     FROM employee_leave_balance_adjustments) AS legacy_adjustment_rows,
  (SELECT COUNT(*)
     FROM employee_leave_requests request
    WHERE request.balance_restored_days > request.balance_deducted_days) AS legacy_requests_restored_gt_deducted,
  (SELECT COUNT(*)
     FROM employee_leave_ledger_entries entry
    WHERE entry.leave_request_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM employee_leave_requests request
         WHERE request.id = entry.leave_request_id
           AND request.employee_id = entry.employee_id
      )) AS request_employee_reference_mismatch;
