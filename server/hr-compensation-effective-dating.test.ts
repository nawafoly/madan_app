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
      .filter(name => !name.startsWith("0013_"))
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
        start_date, title, department,
        base_salary, housing_allowance, transportation_allowance, other_allowances,
        source, created_at, updated_at
      ) VALUES (
        'emp-1', 'test-uid', 'Test Employee', 'active', 1,
        '2025-01-01', 'Developer', 'Engineering',
        NULL, 1000, 500, 250,
        'test', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );
    \`);

    db.exec(
      readFileSync(
        resolve(migrationsDir, "0013_compensation_effective_dating.sql"),
        "utf8"
      )
    );

    const bootstrap = db.prepare(\`
      SELECT
        id,
        employee_id,
        effective_from,
        effective_to,
        currency_code,
        basic_wage,
        actual_fixed_wage,
        source
      FROM employee_compensation_terms
      WHERE id = 'bootstrap:compensation:emp-1'
    \`).get();

    assert(bootstrap, "bootstrap compensation term missing");
    assert(bootstrap.employee_id === "emp-1", "employee mismatch");
    assert(bootstrap.effective_to === null, "bootstrap term must be open");
    assert(bootstrap.currency_code === "SAR", "currency mismatch");
    assert(bootstrap.basic_wage === null, "missing Basic Wage must remain missing");
    assert(
      bootstrap.actual_fixed_wage === null,
      "Actual/Fixed Wage must not be inferred from Basic Wage"
    );
    assert(bootstrap.source === "compat_bootstrap_0013", "bootstrap source mismatch");

    const bootstrapComponents = db.prepare(\`
      SELECT component_type, component_code, amount
      FROM employee_compensation_components
      WHERE compensation_term_id = 'bootstrap:compensation:emp-1'
      ORDER BY component_code
    \`).all();

    assert(bootstrapComponents.length === 3, "expected three compatibility allowance components");

    const componentMap = Object.fromEntries(
      bootstrapComponents.map(component => [component.component_code, component.amount])
    );

    assert(componentMap.housing === 1000, "housing allowance lost");
    assert(componentMap.transportation === 500, "transport allowance lost");
    assert(componentMap.legacy_other_allowances === 250, "other allowance lost");

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_compensation_terms (
          id, employee_id, effective_from, currency_code, basic_wage, source
        ) VALUES (?, 'emp-1', ?, 'SAR', 5000, 'test')
      \`).run("overlap", bootstrap.effective_from),
      "compensation_term_period_overlap"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_compensation_terms
           SET basic_wage = 5000
         WHERE id = 'bootstrap:compensation:emp-1'
      \`).run(),
      "compensation_term_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_compensation_components
           SET amount = 2000
         WHERE id = 'bootstrap:compensation:emp-1:housing'
      \`).run(),
      "compensation_component_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_compensation_components
         WHERE id = 'bootstrap:compensation:emp-1:housing'
      \`).run(),
      "compensation_component_history_immutable"
    );

    const nextDate = db.prepare(
      "SELECT date(?, '+1 day') AS next_date"
    ).get(bootstrap.effective_from).next_date;

    db.prepare(\`
      UPDATE employee_compensation_terms
         SET effective_to = ?,
             closed_at = '2026-08-31T12:00:00.000Z',
             closed_by_uid = 'test-uid',
             closed_by_email = 'test@example.com',
             updated_at = '2026-08-31T12:00:00.000Z'
       WHERE id = 'bootstrap:compensation:emp-1'
    \`).run(nextDate);

    db.prepare(\`
      INSERT INTO employee_compensation_terms (
        id,
        employee_id,
        effective_from,
        currency_code,
        basic_wage,
        actual_fixed_wage,
        source,
        reason
      ) VALUES (
        'compensation-2',
        'emp-1',
        ?,
        'SAR',
        5500,
        6000,
        'test',
        'scheduled_compensation_change'
      )
    \`).run(nextDate);

    db.prepare(\`
      INSERT INTO employee_compensation_components (
        id,
        compensation_term_id,
        component_type,
        component_code,
        amount,
        source
      ) VALUES (
        'compensation-2:housing',
        'compensation-2',
        'housing_allowance',
        'housing',
        1200,
        'test'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_compensation_terms
           SET effective_to = date(effective_to, '+1 day')
         WHERE id = 'bootstrap:compensation:emp-1'
      \`).run(),
      "compensation_term_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_compensation_terms
         WHERE id = 'bootstrap:compensation:emp-1'
      \`).run(),
      "compensation_term_history_immutable"
    );

    const current = db.prepare(\`
      SELECT
        id,
        basic_wage,
        actual_fixed_wage,
        housing_allowance,
        transportation_allowance,
        other_allowances
      FROM hr_current_compensation_terms
      WHERE employee_id = 'emp-1'
    \`).get();

    assert(current, "current compensation term missing");
    assert(current.id === 'bootstrap:compensation:emp-1', "future term became current too early");
    assert(current.basic_wage === null, "current missing Basic Wage was fabricated");
    assert(current.actual_fixed_wage === null, "current Actual/Fixed Wage was fabricated");
    assert(current.housing_allowance === 1000, "current housing projection mismatch");
    assert(current.transportation_allowance === 500, "current transport projection mismatch");
    assert(current.other_allowances === 250, "current other projection mismatch");

    const summary = db.prepare(\`
      SELECT
        invalid_effective_ranges,
        overlapping_compensation_periods,
        employees_without_current_compensation_term,
        negative_compensation_values,
        negative_component_values,
        current_terms_missing_basic_wage
      FROM hr_compensation_integrity_summary
    \`).get();

    assert(summary.invalid_effective_ranges === 0, "invalid ranges detected");
    assert(summary.overlapping_compensation_periods === 0, "overlaps detected");
    assert(
      summary.employees_without_current_compensation_term === 0,
      "current compensation term missing"
    );
    assert(summary.negative_compensation_values === 0, "negative compensation detected");
    assert(summary.negative_component_values === 0, "negative component detected");
    assert(
      summary.current_terms_missing_basic_wage === 1,
      "missing Basic Wage completeness signal was lost"
    );

    const termCount = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_compensation_terms WHERE employee_id = 'emp-1'"
    ).get().count;

    assert(termCount === 2, "expected exactly two compensation periods");

    db.close();

    console.log("COMPENSATION_EFFECTIVE_DATING_CONTRACT=PASS");
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

describe("MADAN compensation effective dating 0013", () => {
  it("preserves immutable typed effective-dated compensation history", () => {
    expect(runContract()).toContain(
      "COMPENSATION_EFFECTIVE_DATING_CONTRACT=PASS"
    );
  });
});
