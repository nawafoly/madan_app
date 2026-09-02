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
      .filter(name => !name.startsWith("0021_"))
      .sort();

    for (const migration of migrations) {
      db.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
    }

    db.exec(
      readFileSync(resolve(migrationsDir, "0021_overtime_workflow_kernel.sql"), "utf8")
    );

    assert(
      db.prepare("SELECT COUNT(*) AS count FROM employee_overtime_candidates").get().count === 0,
      "migration fabricated overtime candidates"
    );
    assert(
      db.prepare("SELECT COUNT(*) AS count FROM employee_overtime_approval_events").get().count === 0,
      "migration fabricated overtime approval history"
    );

    for (const [id, name] of [
      ['employee:1', 'Employee One'],
      ['employee:2', 'Employee Two'],
    ]) {
      db.prepare(\`
        INSERT INTO employees (id, name, employment_status, is_active)
        VALUES (?, ?, 'active', 1)
      \`).run(id, name);
    }

    db.prepare(\`
      INSERT INTO employee_schedule_assignments (
        id, employee_id, effective_from, shift_start_time, shift_end_time,
        weekly_off_days_json, source, reason
      ) VALUES (
        'schedule:1', 'employee:1', '2026-01-01', '08:00', '17:00',
        '["friday"]', 'test', 'overtime contract schedule'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_schedule_assignments (
        id, employee_id, effective_from, shift_start_time, shift_end_time,
        weekly_off_days_json, source, reason
      ) VALUES (
        'schedule:2', 'employee:2', '2026-01-01', '09:00', '18:00',
        '["friday"]', 'test', 'overtime contract schedule'
      )
    \`).run();

    for (const [id, key] of [
      ['policy:work:v1', 'SA-WORK-SCHEDULE'],
      ['policy:attendance:v1', 'SA-ATTENDANCE'],
      ['policy:late:v1', 'SA-LATE-EARLY'],
    ]) {
      db.prepare(\`
        INSERT INTO hr_policy_versions (
          id, policy_key, version, effective_from, status,
          parameters_json, approval_contract_json,
          published_at, published_by_uid, source
        ) VALUES (?, ?, 1, '2026-01-01', 'published', '{}', '{}',
          '2026-01-01T00:00:00.000Z', 'tester', 'test')
      \`).run(id, key);
    }

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, effective_to, status,
        parameters_json, approval_contract_json,
        published_at, published_by_uid, source
      ) VALUES (
        'policy:overtime:manual:v1', 'SA-OVERTIME-ELIGIBILITY', 1,
        '2026-01-01', '2026-10-01', 'superseded', '{}',
        '{"autoApproval":false}',
        '2026-01-01T00:00:00.000Z', 'tester', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status,
        parameters_json, approval_contract_json, supersedes_version_id,
        published_at, published_by_uid, source
      ) VALUES (
        'policy:overtime:auto:v2', 'SA-OVERTIME-ELIGIBILITY', 2,
        '2026-10-01', 'published', '{}', '{"autoApproval":true}',
        'policy:overtime:manual:v1',
        '2026-10-01T00:00:00.000Z', 'tester', 'test'
      )
    \`).run();

    function insertWorkObligation(id, employeeId, workDate, scheduleId, start, end) {
      db.prepare(\`
        INSERT INTO employee_work_obligations (
          id, employee_id, work_date, revision, obligation_kind,
          shift_start_time, shift_end_time, expected_minutes,
          schedule_assignment_id, work_schedule_policy_version_id,
          resolution_inputs_json, idempotency_key, source
        ) VALUES (?, ?, ?, 1, 'work', ?, ?, 540, ?, 'policy:work:v1',
          '{"resolver":"overtime-test"}', ?, 'test')
      \`).run(
        id,
        employeeId,
        workDate,
        start,
        end,
        scheduleId,
        'wo:' + employeeId + ':' + workDate + ':r1'
      );
    }

    function insertAttendance({
      id,
      employeeId,
      workDate,
      workObligationId,
      revision = 1,
      supersedes = null,
      overtimeMinutes,
      workedMinutes = 600,
    }) {
      db.prepare(\`
        INSERT INTO employee_attendance_resolutions (
          id, employee_id, attendance_date, revision, resolution_kind,
          work_obligation_id, first_observed_at, last_observed_at,
          worked_minutes, late_minutes, early_exit_minutes,
          overtime_candidate_minutes, attendance_policy_version_id,
          late_early_policy_version_id, source_evidence_json,
          resolution_inputs_json, idempotency_key,
          supersedes_resolution_id, source
        ) VALUES (
          ?, ?, ?, ?, 'attended', ?,
          ? || 'T08:00:00.000Z', ? || 'T18:00:00.000Z',
          ?, 0, 0, ?, 'policy:attendance:v1', 'policy:late:v1',
          '{"attendanceDb":"ATTENDANCE_DB","eventIds":["punch:a","punch:b"]}',
          '{"resolver":"overtime-test"}', ?, ?, 'test'
        )
      \`).run(
        id,
        employeeId,
        workDate,
        revision,
        workObligationId,
        workDate,
        workDate,
        workedMinutes,
        overtimeMinutes,
        'attendance:' + id,
        supersedes
      );
    }

    insertWorkObligation(
      'work:employee1:2026-09-03:r1',
      'employee:1',
      '2026-09-03',
      'schedule:1',
      '08:00',
      '17:00'
    );

    insertAttendance({
      id: 'attendance:employee1:2026-09-03:r1',
      employeeId: 'employee:1',
      workDate: '2026-09-03',
      workObligationId: 'work:employee1:2026-09-03:r1',
      overtimeMinutes: 60,
    });

    db.prepare(\`
      INSERT INTO employee_overtime_candidates (
        id, employee_id, work_date, revision, attendance_resolution_id,
        candidate_minutes, eligibility_result, eligibility_policy_version_id,
        approval_mode, settlement_preference,
        source_evidence_json, eligibility_inputs_json,
        idempotency_key, source
      ) VALUES (
        'overtime:employee1:2026-09-03:r1', 'employee:1', '2026-09-03', 1,
        'attendance:employee1:2026-09-03:r1', 60,
        'eligible', 'policy:overtime:manual:v1', 'manual', 'cash',
        '{"attendanceResolution":"attendance:employee1:2026-09-03:r1"}',
        '{"candidateMinutes":60}',
        'overtime:employee1:2026-09-03:r1', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        evidence_json, idempotency_key
      ) VALUES (
        'overtime-event:employee1:r1:request',
        'overtime:employee1:2026-09-03:r1', 'employee:1', 1,
        'approval_requested', '{}',
        'overtime-event:employee1:r1:request'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        previous_event_id, decision_reason, evidence_json,
        idempotency_key, actor_uid, actor_email
      ) VALUES (
        'overtime-event:employee1:r1:approved',
        'overtime:employee1:2026-09-03:r1', 'employee:1', 2,
        'approved', 'overtime-event:employee1:r1:request',
        'manager approved', '{"approval":"manual"}',
        'overtime-event:employee1:r1:approved', 'manager:1', 'manager@example.com'
      )
    \`).run();

    const approvedR1 = db.prepare(\`
      SELECT workflow_status, candidate_minutes, settlement_preference,
             latest_event_type, latest_actor_uid
        FROM hr_current_overtime_workflow
       WHERE employee_id = 'employee:1'
         AND work_date = '2026-09-03'
    \`).get();

    assert(approvedR1?.workflow_status === 'approved', "manual overtime did not reach approved state");
    assert(approvedR1?.candidate_minutes === 60, "candidate minutes were not preserved");
    assert(approvedR1?.settlement_preference === 'cash', "settlement preference was not preserved");
    assert(approvedR1?.latest_event_type === 'approved', "manual approval event missing");
    assert(approvedR1?.latest_actor_uid === 'manager:1', "manual approver evidence missing");

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE employee_overtime_candidates
           SET candidate_minutes = 30
         WHERE id = 'overtime:employee1:2026-09-03:r1'
      \`).run(),
      'overtime_candidate_history_immutable'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM employee_overtime_approval_events
         WHERE id = 'overtime-event:employee1:r1:approved'
      \`).run(),
      'overtime_approval_history_immutable'
    );

    insertAttendance({
      id: 'attendance:employee1:2026-09-03:r2',
      employeeId: 'employee:1',
      workDate: '2026-09-03',
      workObligationId: 'work:employee1:2026-09-03:r1',
      revision: 2,
      supersedes: 'attendance:employee1:2026-09-03:r1',
      overtimeMinutes: 30,
      workedMinutes: 570,
    });

    db.prepare(\`
      INSERT INTO employee_overtime_candidates (
        id, employee_id, work_date, revision, attendance_resolution_id,
        candidate_minutes, eligibility_result, eligibility_policy_version_id,
        approval_mode, settlement_preference,
        source_evidence_json, eligibility_inputs_json,
        supersedes_candidate_id, idempotency_key, source, reason
      ) VALUES (
        'overtime:employee1:2026-09-03:r2', 'employee:1', '2026-09-03', 2,
        'attendance:employee1:2026-09-03:r2', 30,
        'eligible', 'policy:overtime:manual:v1', 'manual', 'cash',
        '{"attendanceResolution":"attendance:employee1:2026-09-03:r2"}',
        '{"candidateMinutes":30,"reason":"attendanceCorrection"}',
        'overtime:employee1:2026-09-03:r1',
        'overtime:employee1:2026-09-03:r2', 'test', 'attendance correction'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        evidence_json, idempotency_key
      ) VALUES (
        'overtime-event:employee1:r2:request',
        'overtime:employee1:2026-09-03:r2', 'employee:1', 1,
        'approval_requested', '{}',
        'overtime-event:employee1:r2:request'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        previous_event_id, evidence_json, idempotency_key,
        actor_uid, actor_email
      ) VALUES (
        'overtime-event:employee1:r2:approved',
        'overtime:employee1:2026-09-03:r2', 'employee:1', 2,
        'approved', 'overtime-event:employee1:r2:request', '{}',
        'overtime-event:employee1:r2:approved', 'manager:1', 'manager@example.com'
      )
    \`).run();

    const corrected = db.prepare(\`
      SELECT id, revision, candidate_minutes, workflow_status
        FROM hr_current_overtime_workflow
       WHERE employee_id = 'employee:1'
         AND work_date = '2026-09-03'
    \`).get();

    assert(corrected?.id === 'overtime:employee1:2026-09-03:r2', "current overtime candidate did not follow attendance correction");
    assert(corrected?.revision === 2, "current overtime candidate revision is wrong");
    assert(corrected?.candidate_minutes === 30, "corrected candidate minutes are wrong");
    assert(corrected?.workflow_status === 'approved', "corrected overtime workflow is not approved");

    assert(
      db.prepare(\`
        SELECT COUNT(*) AS count
          FROM employee_overtime_candidates
         WHERE employee_id = 'employee:1'
           AND work_date = '2026-09-03'
      \`).get().count === 2,
      "overtime candidate correction destroyed history"
    );

    insertWorkObligation(
      'work:employee2:2026-09-05:r1',
      'employee:2',
      '2026-09-05',
      'schedule:2',
      '09:00',
      '18:00'
    );

    insertAttendance({
      id: 'attendance:employee2:2026-09-05:r1',
      employeeId: 'employee:2',
      workDate: '2026-09-05',
      workObligationId: 'work:employee2:2026-09-05:r1',
      overtimeMinutes: 40,
    });

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_candidates (
          id, employee_id, work_date, revision, attendance_resolution_id,
          candidate_minutes, eligibility_result, eligibility_policy_version_id,
          approval_mode, source_evidence_json, eligibility_inputs_json,
          idempotency_key, source
        ) VALUES (
          'overtime:manual-policy-auto-mode', 'employee:2', '2026-09-05', 1,
          'attendance:employee2:2026-09-05:r1', 40,
          'eligible', 'policy:overtime:manual:v1', 'policy_auto', '{}', '{}',
          'overtime:manual-policy-auto-mode', 'test'
        )
      \`).run(),
      'overtime_auto_approval_policy_not_enabled'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_candidates (
          id, employee_id, work_date, revision, attendance_resolution_id,
          candidate_minutes, eligibility_result, eligibility_policy_version_id,
          approval_mode, source_evidence_json, eligibility_inputs_json,
          idempotency_key, source
        ) VALUES (
          'overtime:wrong-policy-family', 'employee:2', '2026-09-05', 1,
          'attendance:employee2:2026-09-05:r1', 40,
          'eligible', 'policy:attendance:v1', 'manual', '{}', '{}',
          'overtime:wrong-policy-family', 'test'
        )
      \`).run(),
      'overtime_eligibility_policy_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_candidates (
          id, employee_id, work_date, revision, attendance_resolution_id,
          candidate_minutes, eligibility_result, eligibility_policy_version_id,
          approval_mode, source_evidence_json, eligibility_inputs_json,
          idempotency_key, source
        ) VALUES (
          'overtime:minutes-mismatch', 'employee:2', '2026-09-05', 1,
          'attendance:employee2:2026-09-05:r1', 41,
          'eligible', 'policy:overtime:manual:v1', 'manual', '{}', '{}',
          'overtime:minutes-mismatch', 'test'
        )
      \`).run(),
      'overtime_candidate_attendance_resolution_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_overtime_candidates (
        id, employee_id, work_date, revision, attendance_resolution_id,
        candidate_minutes, eligibility_result, eligibility_policy_version_id,
        approval_mode, settlement_preference, source_evidence_json,
        eligibility_inputs_json, idempotency_key, source
      ) VALUES (
        'overtime:employee2:2026-09-05:r1', 'employee:2', '2026-09-05', 1,
        'attendance:employee2:2026-09-05:r1', 40,
        'eligible', 'policy:overtime:manual:v1', 'manual', 'comp_time',
        '{}', '{}', 'overtime:employee2:2026-09-05:r1', 'test'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_approval_events (
          id, overtime_candidate_id, employee_id, sequence, event_type,
          evidence_json, idempotency_key, actor_uid
        ) VALUES (
          'overtime-event:direct-approve',
          'overtime:employee2:2026-09-05:r1', 'employee:2', 1,
          'approved', '{}', 'overtime-event:direct-approve', 'manager:2'
        )
      \`).run(),
      'overtime_approval_transition_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        evidence_json, idempotency_key
      ) VALUES (
        'overtime-event:employee2:manual:request',
        'overtime:employee2:2026-09-05:r1', 'employee:2', 1,
        'approval_requested', '{}',
        'overtime-event:employee2:manual:request'
      )
    \`).run();

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_approval_events (
          id, overtime_candidate_id, employee_id, sequence, event_type,
          previous_event_id, evidence_json, idempotency_key
        ) VALUES (
          'overtime-event:missing-actor',
          'overtime:employee2:2026-09-05:r1', 'employee:2', 2,
          'approved', 'overtime-event:employee2:manual:request', '{}',
          'overtime-event:missing-actor'
        )
      \`).run(),
      'overtime_approval_actor_invalid'
    );

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        previous_event_id, evidence_json, idempotency_key,
        actor_email
      ) VALUES (
        'overtime-event:employee2:manual:approved',
        'overtime:employee2:2026-09-05:r1', 'employee:2', 2,
        'approved', 'overtime-event:employee2:manual:request', '{}',
        'overtime-event:employee2:manual:approved', 'approver@example.com'
      )
    \`).run();

    expectAnySqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_approval_events (
          id, overtime_candidate_id, employee_id, sequence, event_type,
          previous_event_id, evidence_json, idempotency_key,
          actor_uid
        ) VALUES (
          'overtime-event:after-terminal',
          'overtime:employee2:2026-09-05:r1', 'employee:2', 3,
          'approved', 'overtime-event:employee2:manual:approved', '{}',
          'overtime-event:after-terminal', 'manager:2'
        )
      \`).run(),
      'terminal overtime approval cannot advance'
    );

    insertWorkObligation(
      'work:employee2:2026-10-03:r1',
      'employee:2',
      '2026-10-03',
      'schedule:2',
      '09:00',
      '18:00'
    );

    insertAttendance({
      id: 'attendance:employee2:2026-10-03:r1',
      employeeId: 'employee:2',
      workDate: '2026-10-03',
      workObligationId: 'work:employee2:2026-10-03:r1',
      overtimeMinutes: 45,
    });

    db.prepare(\`
      INSERT INTO employee_overtime_candidates (
        id, employee_id, work_date, revision, attendance_resolution_id,
        candidate_minutes, eligibility_result, eligibility_policy_version_id,
        approval_mode, source_evidence_json, eligibility_inputs_json,
        idempotency_key, source
      ) VALUES (
        'overtime:employee2:2026-10-03:r1', 'employee:2', '2026-10-03', 1,
        'attendance:employee2:2026-10-03:r1', 45,
        'eligible', 'policy:overtime:auto:v2', 'policy_auto', '{}', '{}',
        'overtime:employee2:2026-10-03:r1', 'test'
      )
    \`).run();

    db.prepare(\`
      INSERT INTO employee_overtime_approval_events (
        id, overtime_candidate_id, employee_id, sequence, event_type,
        evidence_json, idempotency_key
      ) VALUES (
        'overtime-event:employee2:auto:approved',
        'overtime:employee2:2026-10-03:r1', 'employee:2', 1,
        'auto_approved', '{"policyAuto":true}',
        'overtime-event:employee2:auto:approved'
      )
    \`).run();

    const autoApproved = db.prepare(\`
      SELECT workflow_status, approval_mode, latest_event_type,
             latest_actor_uid, latest_actor_email
        FROM hr_current_overtime_workflow
       WHERE employee_id = 'employee:2'
         AND work_date = '2026-10-03'
    \`).get();

    assert(autoApproved?.workflow_status === 'approved', "policy-auto overtime did not reach approved state");
    assert(autoApproved?.approval_mode === 'policy_auto', "auto approval mode missing");
    assert(autoApproved?.latest_event_type === 'auto_approved', "auto approval event missing");
    assert(autoApproved?.latest_actor_uid == null, "auto approval impersonated a human uid");
    assert(autoApproved?.latest_actor_email == null, "auto approval impersonated a human email");

    expectAnySqliteFailure(
      () => db.prepare(\`
        INSERT INTO employee_overtime_approval_events (
          id, overtime_candidate_id, employee_id, sequence, event_type,
          evidence_json, idempotency_key, actor_uid
        ) VALUES (
          'overtime-event:auto-with-actor',
          'overtime:employee2:2026-10-03:r1', 'employee:2', 1,
          'auto_approved', '{}', 'overtime-event:auto-with-actor', 'fake-human'
        )
      \`).run(),
      'duplicate/invalid auto approval event'
    );

    const summary = db.prepare(\`
      SELECT
        current_unresolved_candidates,
        invalid_candidate_revision_links,
        invalid_attendance_resolution_references,
        invalid_eligibility_policy_references,
        current_policy_auto_candidates_without_approval_event,
        invalid_auto_approval_events,
        current_manual_approvals_without_actor
      FROM hr_overtime_workflow_integrity_summary
    \`).get();

    assert(summary.current_unresolved_candidates === 0, "unexpected unresolved current overtime candidate");
    assert(summary.invalid_candidate_revision_links === 0, "invalid overtime candidate revision link detected");
    assert(summary.invalid_attendance_resolution_references === 0, "invalid attendance reference detected");
    assert(summary.invalid_eligibility_policy_references === 0, "invalid eligibility policy reference detected");
    assert(summary.current_policy_auto_candidates_without_approval_event === 0, "policy-auto candidate missing approval event");
    assert(summary.invalid_auto_approval_events === 0, "invalid auto approval event detected");
    assert(summary.current_manual_approvals_without_actor === 0, "manual approval lost actor evidence");

    const candidateColumns = db.prepare(
      "SELECT name FROM pragma_table_info('employee_overtime_candidates')"
    ).all().map(row => row.name);
    const eventColumns = db.prepare(
      "SELECT name FROM pragma_table_info('employee_overtime_approval_events')"
    ).all().map(row => row.name);

    for (const forbidden of [
      'amount',
      'overtime_amount',
      'overtime_pay',
      'payable_amount',
      'payable_overtime_minutes',
      'comp_time_balance',
    ]) {
      assert(!candidateColumns.includes(forbidden), "candidate table owns forbidden payable field: " + forbidden);
      assert(!eventColumns.includes(forbidden), "approval event owns forbidden payable field: " + forbidden);
    }

    db.close();
    console.log("OVERTIME_WORKFLOW_KERNEL_CONTRACT=PASS");
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

describe("MADAN canonical overtime workflow kernel 0021", () => {
  it("keeps attendance extra time as an eligibility-and-approval candidate without creating payable overtime", () => {
    expect(runContract()).toContain("OVERTIME_WORKFLOW_KERNEL_CONTRACT=PASS");
  });
});
