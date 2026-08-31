import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function runContract() {
  const script = `
    import { readFileSync, readdirSync } from "node:fs";
    import { resolve } from "node:path";
    import { DatabaseSync } from "node:sqlite";

    const root = process.cwd();
    const migrationsDir = resolve(root, "workers", "hr-migrations");
    const db = new DatabaseSync(":memory:");

    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function expectSqliteFailure(fn, expected) {
      try {
        fn();
      } catch (error) {
        assert(
          String(error?.message || error).includes(expected),
          "expected sqlite failure: " + expected + "; got: " + String(error)
        );
        return;
      }
      throw new Error("expected sqlite failure but command succeeded: " + expected);
    }

    db.exec("PRAGMA foreign_keys = ON");

    const migrations = readdirSync(migrationsDir)
      .filter(name => /^[0-9]{4}_.*[.]sql$/.test(name))
      .filter(name => !name.startsWith("0016_"))
      .sort();

    for (const migration of migrations) {
      db.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
    }

    db.exec(\`
      INSERT INTO accounts (
        uid, email, display_name, role_key, is_active,
        employee_profile_enabled, linked_employee_id, source,
        created_at, updated_at
      ) VALUES
      (
        'leave-uid-1', 'leave1@example.com', 'Leave Employee 1', 'staff', 1,
        1, 'leave-emp-1', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      ),
      (
        'leave-uid-2', 'leave2@example.com', 'Leave Employee 2', 'staff', 1,
        1, 'leave-emp-2', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );

      INSERT INTO employees (
        id, auth_uid, name, employment_status, is_active,
        leave_balance, source, created_at, updated_at
      ) VALUES
      (
        'leave-emp-1', 'leave-uid-1', 'Leave Employee 1', 'active', 1,
        12, 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      ),
      (
        'leave-emp-2', 'leave-uid-2', 'Leave Employee 2', 'active', 1,
        NULL, 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );
    \`);

    db.exec(
      readFileSync(
        resolve(migrationsDir, "0016_leave_ledger.sql"),
        "utf8"
      )
    );

    const opening = db.prepare(\`
      SELECT
        id,
        employee_id,
        effective_date,
        entry_type,
        delta_days,
        idempotency_key,
        source,
        source_detail
      FROM employee_leave_ledger_entries
      WHERE id = 'bootstrap:leave:leave-emp-1'
    \`).get();

    assert(opening, "opening leave balance missing");
    assert(opening.employee_id === "leave-emp-1", "opening employee mismatch");
    assert(opening.entry_type === "opening_balance", "opening entry type mismatch");
    assert(opening.delta_days === 12, "opening leave balance mismatch");
    assert(opening.idempotency_key === "bootstrap:leave:leave-emp-1", "opening idempotency mismatch");
    assert(opening.source === "compat_bootstrap_0016", "opening source mismatch");
    assert(opening.source_detail === "employees.leave_balance", "opening source detail mismatch");

    const unknownOpening = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_leave_ledger_entries WHERE employee_id = 'leave-emp-2'"
    ).get().count;
    assert(unknownOpening === 0, "null legacy leave balance was fabricated");

    const initialBalance = db.prepare(
      "SELECT balance_days FROM hr_current_leave_balances WHERE employee_id = 'leave-emp-1'"
    ).get().balance_days;
    assert(initialBalance === 12, "initial canonical leave balance mismatch");

    db.exec(\`
      INSERT INTO employee_leave_requests (
        id,
        employee_id,
        employee_uid,
        employee_name,
        status,
        leave_type,
        start_date,
        end_date,
        days_count,
        balance_deducted_days,
        balance_restored_days,
        source
      ) VALUES (
        'leave-request-1',
        'leave-emp-1',
        'leave-uid-1',
        'Leave Employee 1',
        'approved',
        'annual',
        '2026-09-01',
        '2026-09-03',
        3,
        3,
        0,
        'test'
      );
    \`);

    db.prepare(\`
      INSERT INTO employee_leave_ledger_entries (
        id,
        employee_id,
        effective_date,
        entry_type,
        delta_days,
        leave_request_id,
        idempotency_key,
        source,
        reason
      ) VALUES (
        'leave-consume-1',
        'leave-emp-1',
        date('now'),
        'consumption',
        -3,
        'leave-request-1',
        'leave-request-1:consumption:v1',
        'test',
        'approved annual leave consumption'
      )
    \`).run();

    const consumedBalance = db.prepare(
      "SELECT balance_days FROM hr_current_leave_balances WHERE employee_id = 'leave-emp-1'"
    ).get().balance_days;
    assert(consumedBalance === 9, "leave consumption did not reduce canonical balance");

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_leave_ledger_entries (
          id, employee_id, effective_date, entry_type, delta_days,
          leave_request_id, idempotency_key, source
        ) VALUES (
          'leave-consume-duplicate', 'leave-emp-1', date('now'),
          'consumption', -3, 'leave-request-1',
          'leave-request-1:consumption:v1', 'test'
        )
      \`).run(),
      "UNIQUE constraint failed: employee_leave_ledger_entries.idempotency_key"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_leave_ledger_entries (
          id, employee_id, effective_date, entry_type, delta_days,
          leave_request_id, idempotency_key, source
        ) VALUES (
          'leave-cross-employee', 'leave-emp-2', date('now'),
          'consumption', -1, 'leave-request-1',
          'leave-cross-employee:v1', 'test'
        )
      \`).run(),
      "leave_ledger_request_employee_mismatch"
    );

    db.prepare(\`
      INSERT INTO employee_leave_ledger_entries (
        id,
        employee_id,
        effective_date,
        entry_type,
        delta_days,
        reverses_entry_id,
        idempotency_key,
        source,
        reason
      ) VALUES (
        'leave-reversal-1',
        'leave-emp-1',
        date('now'),
        'reversal',
        3,
        'leave-consume-1',
        'leave-consume-1:reversal:v1',
        'test',
        'approved leave cancellation restoration'
      )
    \`).run();

    const restoredBalance = db.prepare(
      "SELECT balance_days FROM hr_current_leave_balances WHERE employee_id = 'leave-emp-1'"
    ).get().balance_days;
    assert(restoredBalance === 12, "leave reversal did not restore canonical balance");

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_leave_ledger_entries (
          id, employee_id, effective_date, entry_type, delta_days,
          reverses_entry_id, idempotency_key, source
        ) VALUES (
          'leave-reversal-duplicate', 'leave-emp-1', date('now'),
          'reversal', 3, 'leave-consume-1',
          'leave-consume-1:reversal:v2', 'test'
        )
      \`).run(),
      "UNIQUE constraint failed: employee_leave_ledger_entries.reverses_entry_id"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_leave_ledger_entries (
          id, employee_id, effective_date, entry_type, delta_days,
          reverses_entry_id, idempotency_key, source
        ) VALUES (
          'leave-bad-reversal', 'leave-emp-1', date('now'),
          'reversal', 2, 'leave-reversal-1',
          'leave-bad-reversal:v1', 'test'
        )
      \`).run(),
      "leave_ledger_reversal_target_invalid"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_leave_ledger_entries
           SET delta_days = 99
         WHERE id = 'bootstrap:leave:leave-emp-1'
      \`).run(),
      "leave_ledger_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_leave_ledger_entries
         WHERE id = 'leave-consume-1'
      \`).run(),
      "leave_ledger_history_immutable"
    );

    db.prepare(\`
      INSERT INTO employee_leave_ledger_entries (
        id, employee_id, effective_date, entry_type, delta_days,
        idempotency_key, source, reason
      ) VALUES (
        'leave-future-accrual',
        'leave-emp-1',
        date('now', '+10 day'),
        'accrual',
        5,
        'leave-future-accrual:v1',
        'test',
        'future accrual'
      )
    \`).run();

    const currentAfterFuture = db.prepare(
      "SELECT balance_days FROM hr_current_leave_balances WHERE employee_id = 'leave-emp-1'"
    ).get().balance_days;
    assert(currentAfterFuture === 12, "future leave entry affected current balance early");

    const summary = db.prepare(\`
      SELECT
        compat_balance_without_ledger,
        employees_with_unknown_leave_balance,
        compat_balance_mismatch,
        legacy_adjustment_rows,
        legacy_requests_restored_gt_deducted,
        request_employee_reference_mismatch
      FROM hr_leave_ledger_integrity_summary
    \`).get();

    assert(summary.compat_balance_without_ledger === 0, "known compatibility balance missing ledger");
    assert(summary.employees_with_unknown_leave_balance === 1, "unknown balance signal lost");
    assert(summary.compat_balance_mismatch === 0, "compatibility/current ledger drift detected");
    assert(summary.legacy_adjustment_rows === 0, "unexpected legacy adjustments in test fixture");
    assert(summary.legacy_requests_restored_gt_deducted === 0, "legacy request restoration anomaly detected");
    assert(summary.request_employee_reference_mismatch === 0, "request/employee reference mismatch detected");

    const entryCount = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_leave_ledger_entries WHERE employee_id = 'leave-emp-1'"
    ).get().count;
    assert(entryCount === 4, "expected opening, consumption, reversal and future accrual entries");

    db.close();

    console.log("LEAVE_LEDGER_CONTRACT=PASS");
  `;

  return execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
}

describe("MADAN canonical leave ledger 0016", () => {
  it("preserves append-only reproducible idempotent leave balance history", () => {
    expect(runContract()).toContain("LEAVE_LEDGER_CONTRACT=PASS");
  });
});
