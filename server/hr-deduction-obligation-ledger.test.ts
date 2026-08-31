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
      .filter(name => !name.startsWith("0017_"))
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
        'obligation-uid-1', 'obligation1@example.com', 'Obligation Employee 1', 'staff', 1,
        1, 'obligation-emp-1', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      ),
      (
        'obligation-uid-2', 'obligation2@example.com', 'Obligation Employee 2', 'staff', 1,
        1, 'obligation-emp-2', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );

      INSERT INTO employees (
        id, auth_uid, name, employment_status, is_active,
        salary_deductions_json, source, created_at, updated_at
      ) VALUES
      (
        'obligation-emp-1', 'obligation-uid-1', 'Obligation Employee 1', 'active', 1,
        '[]', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      ),
      (
        'obligation-emp-2', 'obligation-uid-2', 'Obligation Employee 2', 'active', 1,
        '[{"amount":50}]', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );

      INSERT INTO employee_service_requests (
        id, employee_id, employee_uid, employee_name,
        status, request_type, amount, source
      ) VALUES (
        'advance-request-1', 'obligation-emp-1', 'obligation-uid-1', 'Obligation Employee 1',
        'approved', 'salary_advance', 1000, 'test'
      );

      INSERT INTO employee_payroll_records (
        id, employee_id, employee_uid,
        payroll_month, month_start, month_end,
        total_salary_deductions, absence_deduction, delay_deduction,
        salary_advance_deduction, source
      ) VALUES
      (
        'payroll-obligation-1', 'obligation-emp-1', 'obligation-uid-1',
        '2026-08', '2026-08-01', '2026-08-31',
        100, 50, 50, 0, 'test'
      ),
      (
        'payroll-obligation-2', 'obligation-emp-2', 'obligation-uid-2',
        '2026-08', '2026-08-01', '2026-08-31',
        0, 0, 0, 0, 'test'
      );
    \`);

    db.exec(
      readFileSync(
        resolve(migrationsDir, "0017_deduction_obligation_ledger.sql"),
        "utf8"
      )
    );

    const bootstrapCount = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_financial_obligations"
    ).get().count;
    assert(bootstrapCount === 0, "legacy deduction/payroll snapshots were incorrectly promoted to obligations");

    db.prepare(\`
      INSERT INTO employee_financial_obligations (
        id,
        employee_id,
        obligation_type,
        source_request_id,
        source,
        reason
      ) VALUES (
        'obligation-1',
        'obligation-emp-1',
        'salary_advance',
        'advance-request-1',
        'test',
        'approved salary advance'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_financial_obligations (
          id, employee_id, obligation_type, source_request_id, source
        ) VALUES (
          'obligation-cross-request', 'obligation-emp-2', 'salary_advance',
          'advance-request-1', 'test'
        )
      \`).run(),
      "financial_obligation_request_employee_mismatch"
    );

    db.prepare(\`
      INSERT INTO employee_obligation_ledger_entries (
        id,
        obligation_id,
        employee_id,
        effective_date,
        entry_type,
        amount_delta,
        idempotency_key,
        source,
        reason
      ) VALUES (
        'obligation-charge-1',
        'obligation-1',
        'obligation-emp-1',
        date('now'),
        'charge',
        1000,
        'obligation-1:charge:v1',
        'test',
        'salary advance principal'
      )
    \`).run();

    let current = db.prepare(\`
      SELECT balance_amount, derived_status
      FROM hr_current_employee_obligations
      WHERE obligation_id = 'obligation-1'
    \`).get();
    assert(current.balance_amount === 1000, "initial obligation balance mismatch");
    assert(current.derived_status === "open", "charged obligation should be open");

    db.prepare(\`
      INSERT INTO employee_obligation_ledger_entries (
        id,
        obligation_id,
        employee_id,
        effective_date,
        entry_type,
        amount_delta,
        payroll_record_id,
        idempotency_key,
        source,
        reason
      ) VALUES (
        'obligation-deduction-1',
        'obligation-1',
        'obligation-emp-1',
        date('now'),
        'deduction',
        -300,
        'payroll-obligation-1',
        'payroll-obligation-1:obligation-1:deduction:v1',
        'test',
        'payroll installment'
      )
    \`).run();

    current = db.prepare(\`
      SELECT balance_amount, derived_status
      FROM hr_current_employee_obligations
      WHERE obligation_id = 'obligation-1'
    \`).get();
    assert(current.balance_amount === 700, "payroll deduction did not reduce obligation balance");
    assert(current.derived_status === "open", "partially settled obligation should remain open");

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_obligation_ledger_entries (
          id, obligation_id, employee_id, effective_date,
          entry_type, amount_delta, payroll_record_id, idempotency_key, source
        ) VALUES (
          'obligation-deduction-duplicate', 'obligation-1', 'obligation-emp-1', date('now'),
          'deduction', -300, 'payroll-obligation-1',
          'payroll-obligation-1:obligation-1:deduction:v1', 'test'
        )
      \`).run(),
      "UNIQUE constraint failed: employee_obligation_ledger_entries.idempotency_key"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_obligation_ledger_entries (
          id, obligation_id, employee_id, effective_date,
          entry_type, amount_delta, payroll_record_id, idempotency_key, source
        ) VALUES (
          'obligation-over-settlement', 'obligation-1', 'obligation-emp-1', date('now'),
          'deduction', -800, 'payroll-obligation-1',
          'obligation-over-settlement:v1', 'test'
        )
      \`).run(),
      "obligation_balance_negative"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_obligation_ledger_entries (
          id, obligation_id, employee_id, effective_date,
          entry_type, amount_delta, payroll_record_id, idempotency_key, source
        ) VALUES (
          'obligation-cross-payroll', 'obligation-1', 'obligation-emp-1', date('now'),
          'deduction', -10, 'payroll-obligation-2',
          'obligation-cross-payroll:v1', 'test'
        )
      \`).run(),
      "obligation_ledger_payroll_employee_mismatch"
    );

    db.prepare(\`
      INSERT INTO employee_obligation_ledger_entries (
        id,
        obligation_id,
        employee_id,
        effective_date,
        entry_type,
        amount_delta,
        reverses_entry_id,
        idempotency_key,
        source,
        reason
      ) VALUES (
        'obligation-reversal-1',
        'obligation-1',
        'obligation-emp-1',
        date('now'),
        'reversal',
        300,
        'obligation-deduction-1',
        'obligation-deduction-1:reversal:v1',
        'test',
        'reverse payroll installment'
      )
    \`).run();

    current = db.prepare(\`
      SELECT balance_amount, derived_status
      FROM hr_current_employee_obligations
      WHERE obligation_id = 'obligation-1'
    \`).get();
    assert(current.balance_amount === 1000, "reversal did not restore obligation balance");

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_obligation_ledger_entries (
          id, obligation_id, employee_id, effective_date,
          entry_type, amount_delta, reverses_entry_id, idempotency_key, source
        ) VALUES (
          'obligation-reversal-duplicate', 'obligation-1', 'obligation-emp-1', date('now'),
          'reversal', 300, 'obligation-deduction-1',
          'obligation-deduction-1:reversal:v2', 'test'
        )
      \`).run(),
      "UNIQUE constraint failed: employee_obligation_ledger_entries.reverses_entry_id"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_obligation_ledger_entries (
          id, obligation_id, employee_id, effective_date,
          entry_type, amount_delta, reverses_entry_id, idempotency_key, source
        ) VALUES (
          'obligation-bad-reversal', 'obligation-1', 'obligation-emp-1', date('now'),
          'reversal', 299, 'obligation-deduction-1',
          'obligation-bad-reversal:v1', 'test'
        )
      \`).run(),
      "obligation_ledger_reversal_target_invalid"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_financial_obligations
           SET reason = 'rewritten'
         WHERE id = 'obligation-1'
      \`).run(),
      "financial_obligation_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_obligation_ledger_entries
           SET amount_delta = 999
         WHERE id = 'obligation-charge-1'
      \`).run(),
      "obligation_ledger_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_obligation_ledger_entries
         WHERE id = 'obligation-charge-1'
      \`).run(),
      "obligation_ledger_history_immutable"
    );

    db.prepare(\`
      INSERT INTO employee_obligation_ledger_entries (
        id,
        obligation_id,
        employee_id,
        effective_date,
        entry_type,
        amount_delta,
        idempotency_key,
        source,
        reason
      ) VALUES (
        'obligation-future-payment',
        'obligation-1',
        'obligation-emp-1',
        date('now', '+10 day'),
        'payment',
        -200,
        'obligation-future-payment:v1',
        'test',
        'future external settlement'
      )
    \`).run();

    current = db.prepare(\`
      SELECT balance_amount, derived_status, future_entry_count
      FROM hr_current_employee_obligations
      WHERE obligation_id = 'obligation-1'
    \`).get();
    assert(current.balance_amount === 1000, "future settlement affected current obligation balance early");
    assert(current.future_entry_count === 1, "future obligation entry signal missing");

    const summary = db.prepare(\`
      SELECT
        obligations_without_charge,
        negative_current_balances,
        entry_employee_mismatches,
        payroll_employee_mismatches,
        legacy_employee_deduction_items,
        invalid_legacy_employee_deductions_json,
        amount_bearing_requests_without_obligation,
        historical_payroll_records_with_deduction_snapshots
      FROM hr_deduction_obligation_integrity_summary
    \`).get();

    assert(summary.obligations_without_charge === 0, "obligation missing canonical charge");
    assert(summary.negative_current_balances === 0, "negative current obligation balance detected");
    assert(summary.entry_employee_mismatches === 0, "ledger/obligation employee mismatch detected");
    assert(summary.payroll_employee_mismatches === 0, "ledger/payroll employee mismatch detected");
    assert(summary.legacy_employee_deduction_items === 1, "legacy deduction compatibility signal lost");
    assert(summary.invalid_legacy_employee_deductions_json === 0, "valid legacy deduction JSON flagged invalid");
    assert(summary.amount_bearing_requests_without_obligation === 0, "canonicalized amount-bearing request still reported as debt");
    assert(summary.historical_payroll_records_with_deduction_snapshots === 1, "historical payroll deduction snapshot signal lost");

    const entryCount = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_obligation_ledger_entries WHERE obligation_id = 'obligation-1'"
    ).get().count;
    assert(entryCount === 4, "expected charge, deduction, reversal and future payment entries");

    db.close();
    console.log("DEDUCTION_OBLIGATION_LEDGER_CONTRACT=PASS");
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

describe("MADAN canonical deduction and obligation ledger 0017", () => {
  it("preserves immutable idempotent employee financial obligations and settlements", () => {
    expect(runContract()).toContain("DEDUCTION_OBLIGATION_LEDGER_CONTRACT=PASS");
  });
});
