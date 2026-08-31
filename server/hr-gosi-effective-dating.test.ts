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
      .filter(name => !name.startsWith("0015_"))
      .sort();

    for (const migration of migrations) {
      db.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
    }

    db.exec(\`
      INSERT INTO accounts (
        uid, email, display_name, role_key, is_active,
        employee_profile_enabled, linked_employee_id, source,
        created_at, updated_at
      ) VALUES (
        'test-uid', 'test@example.com', 'Test Employee', 'staff', 1,
        1, 'emp-1', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );

      INSERT INTO employees (
        id, auth_uid, name, employment_status, is_active,
        insurance_deduction, source, created_at, updated_at
      ) VALUES (
        'emp-1', 'test-uid', 'Test Employee', 'active', 1,
        487.5, 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );
    \`);

    db.exec(
      readFileSync(
        resolve(migrationsDir, "0015_gosi_effective_dating.sql"),
        "utf8"
      )
    );

    const bootstrap = db.prepare(\`
      SELECT
        id,
        employee_id,
        effective_from,
        effective_to,
        applicability_status,
        gosi_wage,
        policy_version_key,
        policy_inputs_json,
        source
      FROM employee_gosi_profiles
      WHERE id = 'bootstrap:gosi:emp-1'
    \`).get();

    assert(bootstrap, "bootstrap GOSI profile missing");
    assert(bootstrap.employee_id === "emp-1", "employee mismatch");
    assert(bootstrap.effective_to === null, "bootstrap profile must be open");
    assert(bootstrap.applicability_status === "unknown", "GOSI applicability was inferred");
    assert(bootstrap.gosi_wage === null, "GOSI Wage was inferred from legacy deduction");
    assert(bootstrap.policy_version_key === null, "GOSI policy version was fabricated");
    assert(bootstrap.policy_inputs_json === "{}", "unexpected policy inputs were fabricated");
    assert(bootstrap.source === "compat_bootstrap_0015", "bootstrap source mismatch");

    const legacyDeduction = db.prepare(
      "SELECT insurance_deduction FROM employees WHERE id = 'emp-1'"
    ).get().insurance_deduction;

    assert(legacyDeduction === 487.5, "legacy deduction compatibility value changed");
    assert(
      bootstrap.gosi_wage !== legacyDeduction,
      "legacy insurance deduction must not become GOSI Wage"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_gosi_profiles (
          id, employee_id, effective_from, applicability_status, source
        ) VALUES (?, 'emp-1', ?, 'unknown', 'test')
      \`).run("overlap", bootstrap.effective_from),
      "gosi_profile_period_overlap"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_gosi_profiles
           SET gosi_wage = 5000
         WHERE id = 'bootstrap:gosi:emp-1'
      \`).run(),
      "gosi_profile_history_immutable"
    );

    db.exec(\`
      INSERT INTO employees (
        id, name, employment_status, is_active, source, created_at, updated_at
      ) VALUES (
        'emp-policy-inputs', 'Policy Input Test', 'active', 1, 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );
    \`);

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_gosi_profiles (
          id,
          employee_id,
          effective_from,
          applicability_status,
          policy_inputs_json,
          source
        ) VALUES (
          'invalid-policy-inputs',
          'emp-policy-inputs',
          ?,
          'applicable',
          '[]',
          'test'
        )
      \`).run(bootstrap.effective_from),
      "gosi_policy_inputs_invalid"
    );

    db.prepare("DELETE FROM employees WHERE id = 'emp-policy-inputs'").run();

    const nextDate = db.prepare(
      "SELECT date(?, '+1 day') AS next_date"
    ).get(bootstrap.effective_from).next_date;

    db.prepare(\`
      UPDATE employee_gosi_profiles
         SET effective_to = ?,
             closed_at = '2026-08-31T12:00:00.000Z',
             closed_by_uid = 'test-uid',
             closed_by_email = 'test@example.com',
             updated_at = '2026-08-31T12:00:00.000Z'
       WHERE id = 'bootstrap:gosi:emp-1'
    \`).run(nextDate);

    db.prepare(\`
      INSERT INTO employee_gosi_profiles (
        id,
        employee_id,
        effective_from,
        applicability_status,
        gosi_wage,
        policy_version_key,
        policy_inputs_json,
        source,
        reason
      ) VALUES (
        'gosi-2',
        'emp-1',
        ?,
        'applicable',
        5500,
        'gosi-policy-test-v1',
        '{"testInput":"confirmed"}',
        'test',
        'confirmed_gosi_profile'
      )
    \`).run(nextDate);

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_gosi_profiles
           SET effective_to = date(effective_to, '+1 day')
         WHERE id = 'bootstrap:gosi:emp-1'
      \`).run(),
      "gosi_profile_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_gosi_profiles
         WHERE id = 'bootstrap:gosi:emp-1'
      \`).run(),
      "gosi_profile_history_immutable"
    );

    const current = db.prepare(\`
      SELECT id, applicability_status, gosi_wage, policy_version_key
      FROM hr_current_gosi_profiles
      WHERE employee_id = 'emp-1'
    \`).get();

    assert(current, "current GOSI profile missing");
    assert(current.id === 'bootstrap:gosi:emp-1', "future GOSI profile became current too early");
    assert(current.applicability_status === 'unknown', "current applicability was rewritten");
    assert(current.gosi_wage === null, "current GOSI Wage was fabricated");

    const summary = db.prepare(\`
      SELECT
        invalid_effective_ranges,
        overlapping_gosi_periods,
        employees_without_current_gosi_profile,
        negative_gosi_wage_values,
        current_unknown_applicability,
        current_applicable_missing_gosi_wage,
        current_applicable_missing_policy_version
      FROM hr_gosi_integrity_summary
    \`).get();

    assert(summary.invalid_effective_ranges === 0, "invalid GOSI ranges detected");
    assert(summary.overlapping_gosi_periods === 0, "overlapping GOSI periods detected");
    assert(
      summary.employees_without_current_gosi_profile === 0,
      "current GOSI profile missing"
    );
    assert(summary.negative_gosi_wage_values === 0, "negative GOSI Wage detected");
    assert(summary.current_unknown_applicability === 1, "unknown applicability signal lost");
    assert(summary.current_applicable_missing_gosi_wage === 0, "unexpected current wage gap");
    assert(
      summary.current_applicable_missing_policy_version === 0,
      "unexpected current policy-version gap"
    );

    const profileCount = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_gosi_profiles WHERE employee_id = 'emp-1'"
    ).get().count;

    assert(profileCount === 2, "expected exactly two GOSI profile periods");

    db.close();

    console.log("GOSI_EFFECTIVE_DATING_CONTRACT=PASS");
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

describe("MADAN GOSI effective dating 0015", () => {
  it("preserves non-inferred immutable effective-dated GOSI profile history", () => {
    expect(runContract()).toContain("GOSI_EFFECTIVE_DATING_CONTRACT=PASS");
  });
});
