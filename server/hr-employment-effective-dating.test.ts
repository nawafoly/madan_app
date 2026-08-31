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
      .filter(name => !name.startsWith("0012_"))
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
        start_date, title, department, source,
        created_at, updated_at
      ) VALUES (
        'emp-1', 'test-uid', 'Test Employee', 'active', 1,
        '2025-01-01', 'Developer', 'Engineering', 'test',
        '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );
    \`);

    db.exec(
      readFileSync(
        resolve(migrationsDir, "0012_employment_effective_dating.sql"),
        "utf8"
      )
    );

    const bootstrap = db.prepare(\`
      SELECT
        id,
        employee_id,
        employment_status,
        position_title,
        department,
        effective_from,
        effective_to,
        employment_start_date,
        source
      FROM employee_employment_assignments
      WHERE id = 'bootstrap:emp-1'
    \`).get();

    assert(bootstrap, "bootstrap assignment missing");
    assert(bootstrap.employee_id === "emp-1", "employee mismatch");
    assert(bootstrap.employment_status === "active", "status mismatch");
    assert(bootstrap.position_title === "Developer", "title mismatch");
    assert(bootstrap.department === "Engineering", "department mismatch");
    assert(bootstrap.effective_to === null, "bootstrap must be open");
    assert(bootstrap.employment_start_date === "2025-01-01", "hire date lost");
    assert(bootstrap.source === "compat_bootstrap_0012", "bootstrap source mismatch");
    assert(
      bootstrap.effective_from !== "2025-01-01",
      "cutover effective date must not fabricate historical employment history"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_employment_assignments (
          id, employee_id, effective_from, employment_status, source
        ) VALUES (?, 'emp-1', ?, 'active', 'test')
      \`).run("overlap", bootstrap.effective_from),
      "employment_assignment_period_overlap"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_employment_assignments
           SET department = 'Changed'
         WHERE id = 'bootstrap:emp-1'
      \`).run(),
      "employment_assignment_history_immutable"
    );

    const nextDate = db.prepare(
      "SELECT date(?, '+1 day') AS next_date"
    ).get(bootstrap.effective_from).next_date;

    db.prepare(\`
      UPDATE employee_employment_assignments
         SET effective_to = ?
       WHERE id = 'bootstrap:emp-1'
    \`).run(nextDate);

    db.prepare(\`
      INSERT INTO employee_employment_assignments (
        id,
        employee_id,
        effective_from,
        employment_status,
        position_title,
        department,
        source
      ) VALUES (
        'assignment-2',
        'emp-1',
        ?,
        'active',
        'Senior Developer',
        'Engineering',
        'test'
      )
    \`).run(nextDate);

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_employment_assignments
           SET effective_to = date(effective_to, '+1 day')
         WHERE id = 'bootstrap:emp-1'
      \`).run(),
      "employment_assignment_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_employment_assignments
        WHERE id = 'bootstrap:emp-1'
      \`).run(),
      "employment_assignment_history_immutable"
    );

    const summary = db.prepare(\`
      SELECT
        invalid_effective_ranges,
        overlapping_assignment_periods,
        employees_without_current_assignment,
        noncanonical_employment_statuses
      FROM hr_employment_integrity_summary
    \`).get();

    assert(summary.invalid_effective_ranges === 0, "invalid ranges detected");
    assert(summary.overlapping_assignment_periods === 0, "overlaps detected");
    assert(summary.employees_without_current_assignment === 0, "current assignment missing");
    assert(summary.noncanonical_employment_statuses === 0, "noncanonical status detected");

    const assignments = db.prepare(\`
      SELECT id, effective_from, effective_to, position_title
      FROM employee_employment_assignments
      ORDER BY effective_from, id
    \`).all();

    assert(assignments.length === 2, "expected exactly two employment periods");

    db.close();

    console.log("EMPLOYMENT_EFFECTIVE_DATING_CONTRACT=PASS");
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

describe("MADAN employment effective dating 0012", () => {
  it("preserves immutable non-overlapping effective-dated employment history", () => {
    expect(runContract()).toContain(
      "EMPLOYMENT_EFFECTIVE_DATING_CONTRACT=PASS"
    );
  });
});
