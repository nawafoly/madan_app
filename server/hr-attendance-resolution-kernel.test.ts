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
        assert(
          text.includes(expected),
          "expected sqlite failure: " + expected + "; got: " + text
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
      .filter(name => !name.startsWith("0020_"))
      .sort();

    for (const migration of migrations) {
      db.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
    }

    db.exec(
      readFileSync(resolve(migrationsDir, "0020_attendance_resolution_kernel.sql"), "utf8")
    );

    const emptyAtCutover = db.prepare(
      "SELECT COUNT(*) AS count FROM employee_attendance_resolutions"
    ).get().count;
    assert(
      emptyAtCutover === 0,
      "migration fabricated attendance resolutions without cross-D1 evidence/policy resolution"
    );

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

    const publishedPolicies = [
      ['policy:work:v1', 'SA-WORK-SCHEDULE'],
      ['policy:rest:v1', 'SA-WEEKLY-REST'],
      ['policy:attendance:v1', 'SA-ATTENDANCE'],
      ['policy:late:v1', 'SA-LATE-EARLY'],
    ];

    for (const [id, policyKey] of publishedPolicies) {
      db.prepare(\`
        INSERT INTO hr_policy_versions (
          id, policy_key, version, effective_from, status,
          parameters_json, published_at, published_by_uid, source
        ) VALUES (?, ?, 1, '2026-01-01', 'published', '{}',
          '2026-01-01T00:00:00.000Z', 'tester', 'test')
      \`).run(id, policyKey);
    }

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status, source
      ) VALUES (
        'policy:attendance:draft', 'SA-ATTENDANCE', 2,
        '2027-01-01', 'draft', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        shift_start_time, shift_end_time, expected_minutes,
        schedule_assignment_id, work_schedule_policy_version_id,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'work:employee1:2026-09-03:r1', 'employee:1', '2026-09-03', 1, 'work',
        '08:00', '17:00', 540,
        'schedule:1', 'policy:work:v1',
        '{"resolver":"test"}', 'wo:employee1:2026-09-03:r1', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        expected_minutes, schedule_assignment_id,
        work_schedule_policy_version_id, weekly_rest_policy_version_id,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'rest:employee1:2026-09-04:r1', 'employee:1', '2026-09-04', 1, 'weekly_rest',
        0, 'schedule:1', 'policy:work:v1', 'policy:rest:v1',
        '{"weekday":"friday"}', 'wo:employee1:2026-09-04:r1', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_work_obligations (
        id, employee_id, work_date, revision, obligation_kind,
        shift_start_time, shift_end_time, expected_minutes,
        schedule_assignment_id, work_schedule_policy_version_id,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'work:employee2:2026-09-03:r1', 'employee:2', '2026-09-03', 1, 'work',
        '09:00', '18:00', 540,
        'schedule:2', 'policy:work:v1',
        '{"resolver":"test"}', 'wo:employee2:2026-09-03:r1', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_attendance_resolutions (
        id, employee_id, attendance_date, revision, resolution_kind,
        work_obligation_id, first_observed_at, last_observed_at,
        worked_minutes, late_minutes, early_exit_minutes,
        overtime_candidate_minutes, attendance_policy_version_id,
        late_early_policy_version_id, source_evidence_json,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'attendance:employee1:2026-09-03:r1', 'employee:1', '2026-09-03', 1, 'attended',
        'work:employee1:2026-09-03:r1',
        '2026-09-03T08:10:00.000Z', '2026-09-03T16:50:00.000Z',
        520, 10, 10, 0,
        'policy:attendance:v1', 'policy:late:v1',
        '{"attendanceDb":"ATTENDANCE_DB","eventIds":["punch:1","punch:2"]}',
        '{"resolver":"test","workObligationRevision":1}',
        'attendance:employee1:2026-09-03:r1', 'test'
      )
    \`).run();

    const attended = db.prepare(\`
      SELECT resolution_kind, worked_minutes, late_minutes,
             early_exit_minutes, overtime_candidate_minutes,
             work_obligation_id
        FROM hr_current_attendance_resolutions
       WHERE employee_id = 'employee:1'
         AND attendance_date = '2026-09-03'
    \`).get();

    assert(attended?.resolution_kind === 'attended', "attended resolution missing");
    assert(attended?.worked_minutes === 520, "worked minutes were not preserved");
    assert(attended?.late_minutes === 10, "late minutes were not preserved");
    assert(attended?.early_exit_minutes === 10, "early-exit minutes were not preserved");
    assert(attended?.overtime_candidate_minutes === 0, "overtime candidate was not preserved");
    assert(
      attended?.work_obligation_id === 'work:employee1:2026-09-03:r1',
      "attendance did not reference exact work obligation revision"
    );

    db.prepare(\`
      INSERT INTO employee_attendance_resolutions (
        id, employee_id, attendance_date, revision, resolution_kind,
        work_obligation_id, worked_minutes, late_minutes,
        early_exit_minutes, overtime_candidate_minutes,
        attendance_policy_version_id, source_evidence_json,
        resolution_inputs_json, idempotency_key, source
      ) VALUES (
        'attendance:employee1:2026-09-04:r1', 'employee:1', '2026-09-04', 1, 'non_working',
        'rest:employee1:2026-09-04:r1', 0, 0, 0, 0,
        'policy:attendance:v1',
        '{"reason":"weekly_rest"}', '{"resolver":"test"}',
        'attendance:employee1:2026-09-04:r1', 'test'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, worked_minutes, late_minutes,
          early_exit_minutes, overtime_candidate_minutes,
          attendance_policy_version_id, source_evidence_json,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'attendance:bad-kind-on-work', 'employee:2', '2026-09-03', 1, 'non_working',
          'work:employee2:2026-09-03:r1', 0, 0, 0, 0,
          'policy:attendance:v1', '{}', '{}', 'attendance:bad-kind-on-work', 'test'
        )
      \`).run(),
      'attendance_resolution_kind_conflicts_with_work_obligation'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, first_observed_at, last_observed_at,
          worked_minutes, late_minutes, early_exit_minutes,
          overtime_candidate_minutes, attendance_policy_version_id,
          late_early_policy_version_id, source_evidence_json,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'attendance:cross-employee', 'employee:2', '2026-09-03', 1, 'attended',
          'work:employee1:2026-09-03:r1',
          '2026-09-03T09:00:00.000Z', '2026-09-03T18:00:00.000Z',
          540, 0, 0, 0,
          'policy:attendance:v1', 'policy:late:v1', '{}', '{}',
          'attendance:cross-employee', 'test'
        )
      \`).run(),
      'attendance_resolution_work_obligation_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, first_observed_at, last_observed_at,
          worked_minutes, late_minutes, early_exit_minutes,
          overtime_candidate_minutes, attendance_policy_version_id,
          late_early_policy_version_id, source_evidence_json,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'attendance:wrong-attendance-policy', 'employee:2', '2026-09-03', 1, 'attended',
          'work:employee2:2026-09-03:r1',
          '2026-09-03T09:00:00.000Z', '2026-09-03T18:00:00.000Z',
          540, 0, 0, 0,
          'policy:rest:v1', 'policy:late:v1', '{}', '{}',
          'attendance:wrong-attendance-policy', 'test'
        )
      \`).run(),
      'attendance_resolution_policy_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, first_observed_at, last_observed_at,
          worked_minutes, late_minutes, early_exit_minutes,
          overtime_candidate_minutes, attendance_policy_version_id,
          late_early_policy_version_id, source_evidence_json,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'attendance:wrong-late-policy', 'employee:2', '2026-09-03', 1, 'attended',
          'work:employee2:2026-09-03:r1',
          '2026-09-03T09:00:00.000Z', '2026-09-03T18:00:00.000Z',
          540, 0, 0, 0,
          'policy:attendance:v1', 'policy:rest:v1', '{}', '{}',
          'attendance:wrong-late-policy', 'test'
        )
      \`).run(),
      'attendance_resolution_late_early_policy_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, first_observed_at, last_observed_at,
          worked_minutes, late_minutes, early_exit_minutes,
          overtime_candidate_minutes, attendance_policy_version_id,
          late_early_policy_version_id, source_evidence_json,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (
          'attendance:array-evidence', 'employee:2', '2026-09-03', 1, 'attended',
          'work:employee2:2026-09-03:r1',
          '2026-09-03T09:00:00.000Z', '2026-09-03T18:00:00.000Z',
          540, 0, 0, 0,
          'policy:attendance:v1', 'policy:late:v1', '[]', '{}',
          'attendance:array-evidence', 'test'
        )
      \`).run(),
      'attendance_resolution_json_must_be_object'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, source_evidence_json,
          resolution_inputs_json, idempotency_key, supersedes_resolution_id,
          source
        ) VALUES (
          'attendance:skip-r3', 'employee:1', '2026-09-03', 3, 'unresolved',
          'work:employee1:2026-09-03:r1', '{}', '{}', 'attendance:skip-r3',
          'attendance:employee1:2026-09-03:r1', 'test'
        )
      \`).run(),
      'attendance_resolution_revision_chain_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_attendance_resolutions (
        id, employee_id, attendance_date, revision, resolution_kind,
        work_obligation_id, source_evidence_json, resolution_inputs_json,
        idempotency_key, supersedes_resolution_id, source, reason
      ) VALUES (
        'attendance:employee1:2026-09-03:r2', 'employee:1', '2026-09-03', 2, 'unresolved',
        'work:employee1:2026-09-03:r1',
        '{"reason":"correction_under_review"}',
        '{"resolver":"test","revision":2}',
        'attendance:employee1:2026-09-03:r2',
        'attendance:employee1:2026-09-03:r1', 'test',
        'temporary fail-closed correction state'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_attendance_resolutions (
        id, employee_id, attendance_date, revision, resolution_kind,
        work_obligation_id, first_observed_at, last_observed_at,
        worked_minutes, late_minutes, early_exit_minutes,
        overtime_candidate_minutes, attendance_policy_version_id,
        late_early_policy_version_id, source_evidence_json,
        resolution_inputs_json, idempotency_key, supersedes_resolution_id,
        source
      ) VALUES (
        'attendance:employee1:2026-09-03:r3', 'employee:1', '2026-09-03', 3, 'attended',
        'work:employee1:2026-09-03:r1',
        '2026-09-03T08:05:00.000Z', '2026-09-03T17:00:00.000Z',
        535, 5, 0, 0,
        'policy:attendance:v1', 'policy:late:v1',
        '{"attendanceDb":"ATTENDANCE_DB","eventIds":["punch:corrected:1","punch:corrected:2"]}',
        '{"resolver":"test","revision":3}',
        'attendance:employee1:2026-09-03:r3',
        'attendance:employee1:2026-09-03:r2', 'test'
      )
    \`).run();

    const currentRevision = db.prepare(\`
      SELECT id, revision, resolution_kind
        FROM hr_current_attendance_resolutions
       WHERE employee_id = 'employee:1'
         AND attendance_date = '2026-09-03'
    \`).get();
    assert(
      currentRevision?.id === 'attendance:employee1:2026-09-03:r3',
      "current attendance resolution did not select latest revision"
    );
    assert(currentRevision?.revision === 3, "current attendance revision is wrong");
    assert(currentRevision?.resolution_kind === 'attended', "current attendance outcome is wrong");

    const historyCount = db.prepare(\`
      SELECT COUNT(*) AS count
        FROM employee_attendance_resolutions
       WHERE employee_id = 'employee:1'
         AND attendance_date = '2026-09-03'
    \`).get().count;
    assert(historyCount === 3, "attendance resolution revision history was destroyed");

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_attendance_resolutions
           SET worked_minutes = 480
         WHERE id = 'attendance:employee1:2026-09-03:r1'
      \`).run(),
      'attendance_resolution_history_immutable'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_attendance_resolutions
         WHERE id = 'attendance:employee1:2026-09-03:r1'
      \`).run(),
      'attendance_resolution_history_immutable'
    );

    expectAnySqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, source_evidence_json, resolution_inputs_json,
          idempotency_key, source
        ) VALUES (
          'attendance:duplicate-idempotency', 'employee:2', '2026-09-03', 1, 'unresolved',
          'work:employee2:2026-09-03:r1', '{}', '{}',
          'attendance:employee1:2026-09-03:r3', 'test'
        )
      \`).run(),
      'duplicate attendance idempotency key'
    );

    const summary = db.prepare(\`
      SELECT
        current_unresolved_resolutions,
        invalid_revision_links,
        invalid_work_obligation_references,
        invalid_attendance_policy_references,
        invalid_late_early_policy_references,
        current_attended_rows_missing_worked_minutes,
        current_kind_work_obligation_conflicts
      FROM hr_attendance_resolution_integrity_summary
    \`).get();

    assert(summary.current_unresolved_resolutions === 0, "unexpected unresolved current attendance resolution");
    assert(summary.invalid_revision_links === 0, "invalid attendance revision link detected");
    assert(summary.invalid_work_obligation_references === 0, "invalid work-obligation reference detected");
    assert(summary.invalid_attendance_policy_references === 0, "invalid attendance policy reference detected");
    assert(summary.invalid_late_early_policy_references === 0, "invalid late/early policy reference detected");
    assert(summary.current_attended_rows_missing_worked_minutes === 0, "attended row missing worked minutes");
    assert(summary.current_kind_work_obligation_conflicts === 0, "attendance/work-obligation kind conflict detected");

    const columns = db.prepare(
      "SELECT name FROM pragma_table_info('employee_attendance_resolutions')"
    ).all().map(row => row.name);
    assert(!columns.includes('overtime_pay'), "attendance resolution must not own overtime pay");
    assert(!columns.includes('overtime_amount'), "attendance resolution must not own overtime amount");
    assert(!columns.includes('payable_overtime_minutes'), "attendance candidate became payable inside Attendance Kernel");

    db.close();
    console.log("ATTENDANCE_RESOLUTION_KERNEL_CONTRACT=PASS");
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

describe("MADAN canonical attendance resolution kernel 0020", () => {
  it("resolves immutable daily attendance against the canonical work obligation without making overtime payable", () => {
    expect(runContract()).toContain("ATTENDANCE_RESOLUTION_KERNEL_CONTRACT=PASS");
  });
});
