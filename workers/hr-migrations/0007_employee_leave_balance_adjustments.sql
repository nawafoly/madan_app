CREATE TABLE IF NOT EXISTS employee_leave_balance_adjustments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_uid TEXT,
  employee_name TEXT,
  previous_balance REAL NOT NULL,
  next_balance REAL NOT NULL,
  difference REAL NOT NULL,
  operation_type TEXT NOT NULL,
  operation_label TEXT,
  reason TEXT NOT NULL,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_employee_created
  ON employee_leave_balance_adjustments(employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_uid_created
  ON employee_leave_balance_adjustments(employee_uid, created_at DESC);
