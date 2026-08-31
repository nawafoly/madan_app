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
        const text = String(error?.message || error);
        assert(text.includes(expected), "expected sqlite failure: " + expected + "; got: " + text);
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
      .filter(name => !name.startsWith("0019_"))
      .sort();

    for (const migration of migrations) {
      db.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
    }

    db.exec(readFileSync(resolve(migrationsDir, "0019_work_obligation_kernel.sql"), "utf8"));

    const emptyAtCutover = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_work_obligations"
    ).get().count;
    assert(emptyAtCutover === 0, "migration fabricated work obligations without policy resolution");

    db.prepare(\`
      INSERT INTO employees (id, name, employment_status, is_active)
      VALUES ('employee:1', 'Employee One', 'active', 1)
    \`).run();

    db.prepare(\`
      INSERT INTO employees (id, name, employment_status, is_active)
      VALUES ('employee:2', 'Employee Two', 'active', 1)
    \`).run();

    db.prepare(\`
      INSERT INTO employee_schedule_assignments (
        id, employee_id, effective_from, shift_start_time, shift_end_time,
        weekly_off_days_json, source, reason
      ) VALUES (
        'schedule:1', 'employee:1', '2026-01-01', '08:00', '17:00',
        '["friday"]', 'test', 'test schedule'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_schedule_assignments (
        id, employee_id, effective_from, shift_start_time, shift_end_time,
        weekly_off_days_json, source, reason
      ) VALUES (
        'schedule:2', 'employee:2', '2026-01-01', '09:00', '18:00',
        '["friday"]', 'test', 'test schedule'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status,
        parameters_json, published_at, published_by_uid, source
      ) VALUES (
        'policy:work:v1', 'SA-WORK-SCHEDULE', 1, '2026-01-01', 'published',
        '{}', '2026-01-01T00:00:00.000Z', 'tester', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status,
        parameters_json, published_at, published_by_uid, source
      ) VALUES (
        'policy:rest:v1', 'SA-WEEKLY-REST', 1, '2026-01-01', 'published',
        '{}', '2026-01-01T00:00:00.000Z', 'tester', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status, source
      ) VALUES (
        'policy:work:draft', 'SA-WORK-SCHEDULE', 2, '2027-01-01', 'draft', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        shift_start_time, shift_end_time, expected_minutes,
        schedule_assignment_id, work_schedule_policy_version_id,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'obligation:work:r1', 'employee:1', '2026-09-03', 1, 'work',
        '08:00', '17:00', 540,
        'schedule:1', 'policy:work:v1',
        '{"resolver":"test"}', 'work:employee:1:2026-09-03:r1', 'test'
      )
    \`).run();

    const work = db.prepare(\`
      SELECT obligation_kind, shift_start_time, shift_end_time, expected_minutes
        FROM hr_current_work_obligations
       WHERE employee_id = 'employee:1' AND work_date = '2026-09-03'
    \`).get();
    assert(work?.obligation_kind === 'work', "scheduled work obligation missing");
    assert(work?.shift_start_time === '08:00', "work obligation did not snapshot schedule start");
    assert(work?.shift_end_time === '17:00', "work obligation did not snapshot schedule end");
    assert(work?.expected_minutes === 540, "expected work minutes missing");

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        expected_minutes, schedule_assignment_id,
        work_schedule_policy_version_id, weekly_rest_policy_version_id,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'obligation:rest:r1', 'employee:1', '2026-09-04', 1, 'weekly_rest',
        0, 'schedule:1', 'policy:work:v1', 'policy:rest:v1',
        '{"weekday":"friday"}', 'rest:employee:1:2026-09-04:r1', 'test'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          idempotency_key, source
        ) VALUES (
          'obligation:bad-friday', 'employee:1', '2026-09-04', 2, 'work',
          '08:00', '17:00', 540,
          'schedule:1', 'policy:work:v1',
          'bad-friday', 'test'
        )
      \`).run(),
      'work_obligation_revision_chain_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          idempotency_key, source
        ) VALUES (
          'obligation:bad-friday-first', 'employee:2', '2026-09-04', 1, 'work',
          '09:00', '18:00', 540,
          'schedule:2', 'policy:work:v1',
          'bad-friday-first', 'test'
        )
      \`).run(),
      'work_obligation_schedule_snapshot_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_leave_requests (
        id, employee_id, employee_uid, status, leave_type,
        start_date, end_date, cancelled_date_keys_json, source
      ) VALUES (
        'leave:approved', 'employee:1', 'uid:1', 'approved', 'annual',
        '2026-09-06', '2026-09-07', '[]', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        expected_minutes, schedule_assignment_id, leave_request_id,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'obligation:leave:r1', 'employee:1', '2026-09-07', 1, 'approved_leave',
        0, 'schedule:1', 'leave:approved',
        '{"leaveType":"annual"}', 'leave:employee:1:2026-09-07:r1', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_leave_requests (
        id, employee_id, employee_uid, status, leave_type,
        start_date, end_date, cancelled_date_keys_json, source
      ) VALUES (
        'leave:cancelled-day', 'employee:1', 'uid:1', 'approved', 'annual',
        '2026-09-06', '2026-09-06', '["2026-09-06"]', 'test'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          expected_minutes, schedule_assignment_id, leave_request_id,
          idempotency_key, source
        ) VALUES (
          'obligation:cancelled-leave', 'employee:1', '2026-09-06', 1, 'approved_leave',
          0, 'schedule:1', 'leave:cancelled-day',
          'cancelled-leave', 'test'
        )
      \`).run(),
      'work_obligation_leave_reference_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_leave_requests (
        id, employee_id, employee_uid, status, leave_type,
        start_date, end_date, cancelled_date_keys_json, source
      ) VALUES (
        'leave:other-employee', 'employee:2', 'uid:2', 'approved', 'annual',
        '2026-09-06', '2026-09-07', '[]', 'test'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          expected_minutes, schedule_assignment_id, leave_request_id,
          idempotency_key, source
        ) VALUES (
          'obligation:cross-employee-leave', 'employee:1', '2026-09-06', 1, 'approved_leave',
          0, 'schedule:1', 'leave:other-employee',
          'cross-employee-leave', 'test'
        )
      \`).run(),
      'work_obligation_leave_reference_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          idempotency_key, source
        ) VALUES (
          'obligation:draft-policy', 'employee:2', '2027-02-02', 1, 'work',
          '09:00', '18:00', 540,
          'schedule:2', 'policy:work:draft',
          'draft-policy', 'test'
        )
      \`).run(),
      'work_obligation_schedule_policy_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          idempotency_key, source
        ) VALUES (
          'obligation:wrong-policy-family', 'employee:2', '2026-09-03', 1, 'work',
          '09:00', '18:00', 540,
          'schedule:2', 'policy:rest:v1',
          'wrong-policy-family', 'test'
        )
      \`).run(),
      'work_obligation_schedule_policy_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'obligation:array-inputs', 'employee:2', '2026-09-03', 1, 'work',
          '09:00', '18:00', 540,
          'schedule:2', 'policy:work:v1',
          '[]', 'array-inputs', 'test'
        )
      \`).run(),
      'work_obligation_inputs_must_be_object'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          expected_minutes, supersedes_obligation_id,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'obligation:skip-r3', 'employee:1', '2026-09-03', 3, 'unresolved',
          NULL, 'obligation:work:r1',
          '{"reason":"skip"}', 'skip-r3', 'test'
        )
      \`).run(),
      'work_obligation_revision_chain_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        expected_minutes, supersedes_obligation_id,
        resolution_inputs_json, idempotency_key, source, reason
      ) VALUES (
        'obligation:work:r2', 'employee:1', '2026-09-03', 2, 'unresolved',
        NULL, 'obligation:work:r1',
        '{"reason":"source_changed"}', 'work:employee:1:2026-09-03:r2', 'test',
        'temporary unresolved re-resolution'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        shift_start_time, shift_end_time, expected_minutes,
        schedule_assignment_id, work_schedule_policy_version_id,
        supersedes_obligation_id, resolution_inputs_json,
        idempotency_key, source
      ) VALUES (
        'obligation:work:r3', 'employee:1', '2026-09-03', 3, 'work',
        '08:00', '17:00', 540,
        'schedule:1', 'policy:work:v1',
        'obligation:work:r2', '{"resolver":"test","revision":3}',
        'work:employee:1:2026-09-03:r3', 'test'
      )
    \`).run();

    const currentRevision = db.prepare(\`
      SELECT id, revision, obligation_kind
        FROM hr_current_work_obligations
       WHERE employee_id = 'employee:1' AND work_date = '2026-09-03'
    \`).get();
    assert(currentRevision?.id === 'obligation:work:r3', "current obligation did not select latest revision");
    assert(currentRevision?.revision === 3, "current obligation revision is wrong");

    const historyCount = db.prepare(\`
      SELECT COUNT(*) AS count
        FROM employee_work_obligations
       WHERE employee_id = 'employee:1' AND work_date = '2026-09-03'
    \`).get().count;
    assert(historyCount === 3, "work obligation revision history was destroyed");

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_work_obligations
           SET expected_minutes = 480
         WHERE id = 'obligation:work:r1'
      \`).run(),
      'work_obligation_history_immutable'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_work_obligations
         WHERE id = 'obligation:work:r1'
      \`).run(),
      'work_obligation_history_immutable'
    );

    expectAnySqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          idempotency_key, source
        ) VALUES (
          'obligation:duplicate-idempotency', 'employee:2', '2026-09-02', 1, 'work',
          '09:00', '18:00', 540,
          'schedule:2', 'policy:work:v1',
          'work:employee:1:2026-09-03:r3', 'test'
        )
      \`).run(),
      'duplicate idempotency key'
    );

    const summary = db.prepare(\`
      SELECT
        current_unresolved_obligations,
        invalid_revision_links,
        invalid_schedule_policy_references,
        invalid_weekly_rest_policy_references,
        current_work_rows_missing_expected_minutes
      FROM hr_work_obligation_integrity_summary
    \`).get();

    assert(summary.current_unresolved_obligations === 0, "unexpected unresolved current obligations");
    assert(summary.invalid_revision_links === 0, "invalid work obligation revision link detected");
    assert(summary.invalid_schedule_policy_references === 0, "invalid schedule policy reference detected");
    assert(summary.invalid_weekly_rest_policy_references === 0, "invalid weekly-rest policy reference detected");
    assert(summary.current_work_rows_missing_expected_minutes === 0, "current work row missing expected minutes");

    db.close();
    console.log("WORK_OBLIGATION_KERNEL_CONTRACT=PASS");
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

describe("MADAN canonical work obligation kernel 0019", () => {
  it("keeps one versioned daily work obligation contract for attendance and payroll", () => {
    expect(runContract()).toContain("WORK_OBLIGATION_KERNEL_CONTRACT=PASS");
  });
});
