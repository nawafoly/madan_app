-- MIHVARA Workforce Core — annual leave canonical ledger extension.
-- Generic / tenant-scoped only. No Habbat-specific knowledge belongs here.

ALTER TABLE workforce_employment
  ADD COLUMN annual_leave_contract_days REAL;

ALTER TABLE workforce_employment
  ADD COLUMN annual_leave_accrual_mode TEXT NOT NULL DEFAULT 'service_anniversary'
    CHECK (annual_leave_accrual_mode IN ('service_anniversary'));

ALTER TABLE workforce_leave_balances
  ADD COLUMN balance_days REAL NOT NULL DEFAULT 0;

ALTER TABLE workforce_leave_balances
  ADD COLUMN review_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (review_status IN ('ready', 'review_required'));

ALTER TABLE workforce_leave_balances
  ADD COLUMN review_reason TEXT;

ALTER TABLE workforce_leave_ledger
  ADD COLUMN delta_days REAL;

ALTER TABLE workforce_leave_ledger
  ADD COLUMN balance_before_days REAL;

ALTER TABLE workforce_leave_ledger
  ADD COLUMN balance_after_days REAL;

ALTER TABLE workforce_leave_ledger
  ADD COLUMN entry_code TEXT
    CHECK (entry_code IS NULL OR entry_code IN (
      'OPENING_BALANCE',
      'ACCRUAL',
      'LEAVE_USED',
      'LEAVE_REVERSAL',
      'MANUAL_CREDIT',
      'MANUAL_DEBIT',
      'MANUAL_ADJUSTMENT',
      'RECALL'
    ));

ALTER TABLE workforce_leave_ledger
  ADD COLUMN metadata_json TEXT;

ALTER TABLE workforce_leave_ledger
  ADD COLUMN deleted_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_annual_leave_single_opening
  ON workforce_leave_ledger (tenant_id, employee_id, leave_type)
  WHERE leave_type = 'annual'
    AND entry_code = 'OPENING_BALANCE'
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_annual_leave_ledger_effective
  ON workforce_leave_ledger (
    tenant_id,
    employee_id,
    leave_type,
    effective_date ASC,
    created_at ASC
  )
  WHERE deleted_at IS NULL;
