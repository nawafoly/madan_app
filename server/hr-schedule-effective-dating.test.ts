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

    function expectAnySqliteFailure(fn, label) {
      try {
        fn();
      } catch {
        return;
      }
      throw new Error("expected sqlite failure but command succeeded: " + label);
    }

    db.exec("PRAGMA foreign_keys = ON");

    const migrations = readdirSync(migrationsDir)
      .filter(name => /^[0-9]{4}_.*[.]sql$/.test(name))
      .filter(name => !name.startsWith("0014_"))
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
        shift_start_time, shift_end_time, weekly_off_days_json,
        source, created_at, updated_at
      ) VALUES (
        'emp-1', 'test-uid', 'Test Employee', 'active', 1,
        NULL, NULL, '["friday"]',
        'test', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'
      );
    \`);

    db.exec(
      readFileSync(
        resolve(migrationsDir, "0014_schedule_effective_dating.sql"),
        "utf8"
      )
    );

    const bootstrap = db.prepare(\`
      SELECT
        id,
        employee_id,
        effective_from,
        effective_to,
        shift_start_time,
        shift_end_time,
        weekly_off_days_json,
        source
      FROM employee_schedule_assignments
      WHERE id = 'bootstrap:schedule:emp-1'
    \`).get();

    assert(bootstrap, "bootstrap schedule assignment missing");
    assert(bootstrap.employee_id === "emp-1", "employee mismatch");
    assert(bootstrap.effective_to === null, "bootstrap schedule must be open");
    assert(bootstrap.shift_start_time === null, "missing shift start was fabricated");
    assert(bootstrap.shift_end_time === null, "missing shift end was fabricated");
    assert(bootstrap.weekly_off_days_json === '["friday"]', "weekly rest day lost");
    assert(bootstrap.source === "compat_bootstrap_0014", "bootstrap source mismatch");

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_schedule_assignments (
          id, employee_id, effective_from, shift_start_time, shift_end_time,
          weekly_off_days_json, source
        ) VALUES (?, 'emp-1', ?, '08:00', '17:00', '[]', 'test')
      \`).run("overlap", bootstrap.effective_from),
      "schedule_assignment_period_overlap"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_schedule_assignments
           SET weekly_off_days_json = '["thursday"]'
         WHERE id = 'bootstrap:schedule:emp-1'
      \`).run(),
      "schedule_assignment_history_immutable"
    );

    const nextDate = db.prepare(
      "SELECT date(?, '+1 day') AS next_date"
    ).get(bootstrap.effective_from).next_date;

    db.prepare(\`
      UPDATE employee_schedule_assignments
         SET effective_to = ?,
             closed_at = '2026-08-31T12:00:00.000Z',
             closed_by_uid = 'test-uid',
             closed_by_email = 'test@example.com',
             updated_at = '2026-08-31T12:00:00.000Z'
       WHERE id = 'bootstrap:schedule:emp-1'
    \`).run(nextDate);

    expectAnySqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_schedule_assignments (
          id, employee_id, effective_from, shift_start_time, shift_end_time,
          weekly_off_days_json, source
        ) VALUES ('partial-shift', 'emp-1', ?, '08:00', NULL, '[]', 'test')
      \`).run(nextDate),
      "partial shift pair"
    );

    expectAnySqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_schedule_assignments (
          id, employee_id, effective_from, shift_start_time, shift_end_time,
          weekly_off_days_json, source
        ) VALUES ('invalid-time', 'emp-1', ?, '25:00', '17:00', '[]', 'test')
      \`).run(nextDate),
      "invalid shift time"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_schedule_assignments (
          id, employee_id, effective_from, shift_start_time, shift_end_time,
          weekly_off_days_json, source
        ) VALUES ('invalid-day', 'emp-1', ?, '08:00', '17:00', '["holiday"]', 'test')
      \`).run(nextDate),
      "schedule_weekly_off_days_invalid"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_schedule_assignments (
          id, employee_id, effective_from, shift_start_time, shift_end_time,
          weekly_off_days_json, source
        ) VALUES ('duplicate-day', 'emp-1', ?, '08:00', '17:00', '["friday","friday"]', 'test')
      \`).run(nextDate),
      "schedule_weekly_off_days_invalid"
    );

    db.prepare(\`
      INSERT INTO employee_schedule_assignments (
        id,
        employee_id,
        effective_from,
        shift_start_time,
        shift_end_time,
        weekly_off_days_json,
        source,
        reason
      ) VALUES (
        'schedule-2',
        'emp-1',
        ?,
        '08:00',
        '17:00',
        '["saturday"]',
        'test',
        'scheduled_work_pattern_change'
      )
    \`).run(nextDate);

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_schedule_assignments
           SET effective_to = date(effective_to, '+1 day')
         WHERE id = 'bootstrap:schedule:emp-1'
      \`).run(),
      "schedule_assignment_history_immutable"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_schedule_assignments
         WHERE id = 'bootstrap:schedule:emp-1'
      \`).run(),
      "schedule_assignment_history_immutable"
    );

    const current = db.prepare(\`
      SELECT
        id,
        shift_start_time,
        shift_end_time,
        weekly_off_days_json
      FROM hr_current_schedule_assignments
      WHERE employee_id = 'emp-1'
    \`).get();

    assert(current, "current schedule assignment missing");
    assert(current.id === 'bootstrap:schedule:emp-1', "future schedule became current too early");
    assert(current.shift_start_time === null, "current missing shift start was fabricated");
    assert(current.shift_end_time === null, "current missing shift end was fabricated");
    assert(current.weekly_off_days_json === '["friday"]', "current weekly rest mismatch");

    const summary = db.prepare(\`
      SELECT
        invalid_effective_ranges,
        overlapping_schedule_periods,
        employees_without_current_schedule_assignment,
        partial_shift_pairs,
        invalid_weekly_off_json,
        noncanonical_weekly_off_days,
        duplicate_weekly_off_days,
        current_assignments_without_fixed_shift_window
      FROM hr_schedule_integrity_summary
    \`).get();

    assert(summary.invalid_effective_ranges === 0, "invalid ranges detected");
    assert(summary.overlapping_schedule_periods === 0, "overlaps detected");
    assert(
      summary.employees_without_current_schedule_assignment === 0,
      "current schedule assignment missing"
    );
    assert(summary.partial_shift_pairs === 0, "partial shift pair detected");
    assert(summary.invalid_weekly_off_json === 0, "invalid weekly rest JSON detected");
    assert(summary.noncanonical_weekly_off_days === 0, "noncanonical weekly rest day detected");
    assert(summary.duplicate_weekly_off_days === 0, "duplicate weekly rest day detected");
    assert(
      summary.current_assignments_without_fixed_shift_window === 1,
      "missing fixed shift completeness signal was lost"
    );

    const assignmentCount = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_schedule_assignments WHERE employee_id = 'emp-1'"
    ).get().count;

    assert(assignmentCount === 2, "expected exactly two schedule periods");

    db.close();

    console.log("SCHEDULE_EFFECTIVE_DATING_CONTRACT=PASS");
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

describe("MADAN schedule effective dating 0014", () => {
  it("preserves immutable non-overlapping effective-dated work schedules", () => {
    expect(runContract()).toContain(
      "SCHEDULE_EFFECTIVE_DATING_CONTRACT=PASS"
    );
  });
});
