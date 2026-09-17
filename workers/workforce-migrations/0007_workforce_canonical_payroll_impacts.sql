PRAGMA foreign_keys = ON;

-- Canonical payroll financial impact ledger.
-- This becomes the single financial source for automatic and manual payroll effects.
-- Existing workforce_payroll_adjustments data is backfilled for compatibility;
-- the legacy table is intentionally kept until cutover is proven in production.

CREATE TABLE IF NOT EXISTS workforce_payroll_impacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payroll_entry_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('addition', 'deduction')),
  kind TEXT NOT NULL,
  amount_halalas INTEGER NOT NULL CHECK (amount_halalas >= 0),
  reason TEXT NOT NULL,
  note TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  automatic INTEGER NOT NULL DEFAULT 0 CHECK (automatic IN (0, 1)),
  policy_version TEXT,
  operation_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  metadata_json TEXT,
  added_by_uid TEXT,
  added_by_email TEXT,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at TEXT,
  cancelled_by_uid TEXT,
  cancelled_by_email TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (tenant_id) REFERENCES workforce_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_entry_id) REFERENCES workforce_payroll_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES workforce_employee_profiles(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_payroll_impacts_source
  ON workforce_payroll_impacts (tenant_id, payroll_entry_id, source_type, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_payroll_impacts_operation
  ON workforce_payroll_impacts (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL AND trim(operation_id) <> '';

CREATE INDEX IF NOT EXISTS idx_workforce_payroll_impacts_employee_month
  ON workforce_payroll_impacts (tenant_id, employee_id, month_key, status, added_at DESC);

-- Backfill legacy manual adjustments into the canonical impact ledger.
INSERT OR IGNORE INTO workforce_payroll_impacts (
  id, tenant_id, payroll_entry_id, employee_id, month_key,
  direction, kind, amount_halalas, reason, note,
  source_type, source_id, automatic, policy_version, operation_id,
  status, metadata_json,
  added_by_uid, added_by_email, added_at,
  cancelled_at, cancelled_by_uid, cancelled_by_email, updated_at
)
SELECT
  a.id,
  a.tenant_id,
  a.payroll_entry_id,
  a.employee_id,
  e.month_key,
  a.direction,
  a.kind,
  a.amount_halalas,
  a.reason,
  a.note,
  COALESCE(NULLIF(trim(a.source_type), ''), 'manual'),
  COALESCE(NULLIF(trim(a.source_id), ''), a.id),
  0,
  NULL,
  a.operation_id,
  COALESCE(a.status, 'active'),
  a.metadata_json,
  a.added_by_uid,
  a.added_by_email,
  a.added_at,
  a.cancelled_at,
  a.cancelled_by_uid,
  a.cancelled_by_email,
  COALESCE(a.updated_at, a.added_at)
FROM workforce_payroll_adjustments a
JOIN workforce_payroll_entries e
  ON e.tenant_id = a.tenant_id AND e.id = a.payroll_entry_id;

-- Backfill already-calculated automatic impacts so historical locked payroll remains complete.
INSERT OR IGNORE INTO workforce_payroll_impacts (
  id, tenant_id, payroll_entry_id, employee_id, month_key,
  direction, kind, amount_halalas, reason, note,
  source_type, source_id, automatic, policy_version, operation_id,
  status, metadata_json, added_by_uid, added_by_email, added_at, updated_at
)
SELECT
  'wf_payroll_impact_' || id || '_overtime', tenant_id, id, employee_id, month_key,
  'addition', 'overtime', overtime_halalas, 'Overtime', NULL,
  'payroll_readiness', month_key || ':overtime', 1, NULL, NULL,
  'active', calculation_snapshot_json, NULL, NULL, created_at, updated_at
FROM workforce_payroll_entries
WHERE overtime_halalas > 0;

INSERT OR IGNORE INTO workforce_payroll_impacts (
  id, tenant_id, payroll_entry_id, employee_id, month_key,
  direction, kind, amount_halalas, reason, note,
  source_type, source_id, automatic, policy_version, operation_id,
  status, metadata_json, added_by_uid, added_by_email, added_at, updated_at
)
SELECT
  'wf_payroll_impact_' || id || '_attendance_deduction', tenant_id, id, employee_id, month_key,
  'deduction', 'attendance_deduction', attendance_deduction_halalas, 'Attendance deduction', NULL,
  'payroll_readiness', month_key || ':attendance_deduction', 1, NULL, NULL,
  'active', calculation_snapshot_json, NULL, NULL, created_at, updated_at
FROM workforce_payroll_entries
WHERE attendance_deduction_halalas > 0;

INSERT OR IGNORE INTO workforce_payroll_impacts (
  id, tenant_id, payroll_entry_id, employee_id, month_key,
  direction, kind, amount_halalas, reason, note,
  source_type, source_id, automatic, policy_version, operation_id,
  status, metadata_json, added_by_uid, added_by_email, added_at, updated_at
)
SELECT
  'wf_payroll_impact_' || id || '_absence_deduction', tenant_id, id, employee_id, month_key,
  'deduction', 'absence_deduction', absence_deduction_halalas, 'Absence deduction', NULL,
  'payroll_readiness', month_key || ':absence_deduction', 1, NULL, NULL,
  'active', calculation_snapshot_json, NULL, NULL, created_at, updated_at
FROM workforce_payroll_entries
WHERE absence_deduction_halalas > 0;
