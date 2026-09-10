import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyWorkforceDayRange, monthKeysBetween } from "./workforce-day-state.js";

const schedule = {
  date: "2026-09-10",
  ready: true,
  isWorkingDay: true,
  startTime: "09:00",
  endTime: "17:00",
};

test("canonical day state: paid full-day leave is leave, not absence", () => {
  const [day] = classifyWorkforceDayRange({
    from: "2026-09-10",
    to: "2026-09-10",
    today: "2026-09-10",
    employment: { employment_status: "active", service_start_date: "2026-01-01" },
    schedules: [schedule],
    leaves: [{
      id: "leave-1",
      status: "approved",
      leave_type: "annual",
      duration_kind: "full_day",
      start_date: "2026-09-10",
      end_date: "2026-09-10",
    }],
  });
  assert.equal(day.state, "leave");
  assert.equal(day.expectedAttendanceMinutes, 0);
  assert.equal(day.absencePortion, 0);
});

test("canonical day state: past working day without punch is absence, today and future are not", () => {
  const schedules = [
    {
      date: "2026-09-09",
      ready: true,
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
    },
    {
      date: "2026-09-10",
      ready: true,
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
    },
    {
      date: "2026-09-11",
      ready: true,
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
    },
  ];

  const days = classifyWorkforceDayRange({
    from: "2026-09-09",
    to: "2026-09-11",
    today: "2026-09-10",
    employment: {
      employment_status: "active",
      service_start_date: "2026-01-01",
    },
    schedules,
    sourceRows: [],
  });

  assert.equal(days[0].state, "absence");
  assert.equal(days[1].state, "work");
  assert.equal(days[2].state, "future");
});
test("canonical day state: before employment is never absence", () => {
  const [day] = classifyWorkforceDayRange({
    from: "2026-09-10",
    to: "2026-09-10",
    today: "2026-09-10",
    employment: { employment_status: "active", service_start_date: "2026-09-11" },
    schedules: [schedule],
  });
  assert.equal(day.state, "before_employment");
  assert.equal(day.employmentEligible, false);
});

test("canonical day state: full-day leave plus attendance is conflict", () => {
  const [day] = classifyWorkforceDayRange({
    from: "2026-09-10",
    to: "2026-09-10",
    today: "2026-09-10",
    employment: { employment_status: "active", service_start_date: "2026-01-01" },
    schedules: [schedule],
    leaves: [{
      id: "leave-1",
      status: "approved",
      leave_type: "annual",
      duration_kind: "full_day",
      start_date: "2026-09-10",
      end_date: "2026-09-10",
    }],
    sourceRows: [{ date: "2026-09-10", checkInAt: "2026-09-10T06:00:00Z" }],
  });
  assert.equal(day.state, "conflict");
  assert.ok(day.conflicts.includes("leave_attendance_conflict"));
});

test("canonical day state: partial leave reduces expected minutes", () => {
  const [day] = classifyWorkforceDayRange({
    from: "2026-09-10",
    to: "2026-09-10",
    today: "2026-09-10",
    employment: { employment_status: "active", service_start_date: "2026-01-01" },
    schedules: [schedule],
    leaves: [{
      id: "leave-1",
      status: "approved",
      leave_type: "annual",
      duration_kind: "partial",
      requested_minutes: 120,
      start_date: "2026-09-10",
      end_date: "2026-09-10",
    }],
  });
  assert.equal(day.expectedAttendanceMinutes, 360);
  assert.equal(day.paidExcusedMinutes, 120);
});


test("payroll month range spans every affected month", () => {
  assert.deepEqual(
    monthKeysBetween("2026-09-30", "2026-11-02"),
    ["2026-09", "2026-10", "2026-11"]
  );
});


test("leave and absence mutations share payroll locking and stale invalidation", () => {
  const guard = fs.readFileSync(new URL("./workforce-mutation-guard.js", import.meta.url), "utf8");
  assert.match(guard, /assertPayrollSourceMutationAllowed/);
  assert.match(guard, /buildPayrollStaleStatements/);
  assert.match(guard, /workforce_full_day_leave_conflicts_with_attendance/);
  assert.match(guard, /workforce_absence_conflicts_with_leave/);
});

test("absence mutation is atomic, cancellable, and audited", () => {
  const core = fs.readFileSync(new URL("./workforce-core.js", import.meta.url), "utf8");
  assert.match(core, /cancelEmployeeAbsence/);
  assert.match(core, /runWorkforceBatch/);
  assert.match(core, /workforce\.absence\.create/);
  assert.match(core, /workforce\.absence\.cancel/);
});


test("legacy and v2 punch routes are payroll-lock guarded", () => {
  const guard = fs.readFileSync(new URL("./workforce-mutation-guard.js", import.meta.url), "utf8");
  const legacy = fs.readFileSync(new URL("./habat-attendance-core.js", import.meta.url), "utf8");
  const v2 = fs.readFileSync(new URL("./habat-attendance-v2.js", import.meta.url), "utf8");
  assert.match(guard, /prepareAttendanceMutationGuard/);
  assert.match(guard, /assertPayrollSourceMutationAllowed/);
  assert.match(legacy, /prepareAttendanceMutationGuard/);
  assert.match(v2, /prepareAttendanceMutationGuard/);
  assert.match(v2, /mutation: "correction"/);
});

test("live attendance resolves access_id before legacy uid fallback", () => {
  const legacy = fs.readFileSync(new URL("./habat-attendance-core.js", import.meta.url), "utf8");
  const v2 = fs.readFileSync(new URL("./habat-attendance-v2.js", import.meta.url), "utf8");
  for (const source of [legacy, v2]) {
    assert.match(source, /access_id = \?/);
    assert.match(source, /access_id IS NULL OR trim\(access_id\) = ''/);
  }
});


test("attendance stale invalidation happens only after a successful record mutation", () => {
  const legacy = fs.readFileSync(new URL("./habat-attendance-core.js", import.meta.url), "utf8");
  const v2 = fs.readFileSync(new URL("./habat-attendance-v2.js", import.meta.url), "utf8");

  const legacyIn = legacy.slice(
    legacy.indexOf("async function checkIn("),
    legacy.indexOf("async function checkOut(")
  );
  const legacyOut = legacy.slice(
    legacy.indexOf("async function checkOut("),
    legacy.indexOf("async function listRecords(")
  );
  const v2In = v2.slice(
    v2.indexOf("async function clockIn("),
    v2.indexOf("async function clockOut(")
  );
  const v2Out = v2.slice(
    v2.indexOf("async function clockOut("),
    v2.indexOf("async function listMyHistory(")
  );
  const correction = v2.slice(
    v2.indexOf("async function correctRecord("),
    v2.indexOf("async function getSummaryReport(")
  );

  for (const [source, marker] of [
    [legacyIn, "payroll_stale_after_checkIn"],
    [legacyOut, "payroll_stale_after_checkOut"],
    [v2In, "payroll_stale_after_clockIn"],
    [v2Out, "payroll_stale_after_clockOut"],
    [correction, "payroll_stale_after_correctRecord"],
  ]) {
    const mutation = Math.max(
      source.lastIndexOf(".run();"),
      source.lastIndexOf(").run();")
    );
    const stale = source.indexOf(marker);
    assert.ok(stale > mutation, `${marker} must run after the record write`);
  }
});


test("v3 manual and delete attendance mutations respect payroll integrity", () => {
  const v3 = fs.readFileSync(new URL("./habat-attendance-v3.js", import.meta.url), "utf8");
  assert.match(v3, /payroll_stale_after_manual_record/);
  assert.match(v3, /assertPayrollSourceMutationAllowed/);
  assert.match(v3, /workforce\.attendance\.delete/);
  assert.match(v3, /db\.batch\(\[\s*deleteStatement/);
});

test("v3 manual attendance resolves access_id before legacy uid fallback", () => {
  const v3 = fs.readFileSync(new URL("./habat-attendance-v3.js", import.meta.url), "utf8");
  assert.match(v3, /access_id = \?/);
  assert.match(v3, /access_id IS NULL OR trim\(access_id\) = ''/);
});


test("attendance never marks payroll stale before the attendance write succeeds", () => {
  const legacy = fs.readFileSync(new URL("./habat-attendance-core.js", import.meta.url), "utf8");
  const v2 = fs.readFileSync(new URL("./habat-attendance-v2.js", import.meta.url), "utf8");

  const slices = [
    ["checkIn", legacy.slice(legacy.indexOf("async function checkIn("), legacy.indexOf("async function checkOut(")), "workforceGuard"],
    ["checkOut", legacy.slice(legacy.indexOf("async function checkOut("), legacy.indexOf("async function listRecords(")), "workforceGuard"],
    ["clockIn", v2.slice(v2.indexOf("async function clockIn("), v2.indexOf("async function clockOut(")), "workforceGuard"],
    ["clockOut", v2.slice(v2.indexOf("async function clockOut("), v2.indexOf("async function listMyHistory(")), "workforceGuard"],
    ["correctRecord", v2.slice(v2.indexOf("async function correctRecord("), v2.indexOf("async function getSummaryReport(")), "correctionGuard"],
  ];

  for (const [name, source, guardVar] of slices) {
    const marker = source.indexOf(`// payroll_stale_after_${name}`);
    assert.ok(marker >= 0, `${name} missing post-write stale marker`);
    const before = source.slice(0, marker);
    const eager = new RegExp(`if \\\(${guardVar}\\?\\.staleStatements\\?\\.length\\) \\\{\\s*await db\\.batch\\(${guardVar}\\.staleStatements\\);\\s*\\}`);
    assert.doesNotMatch(before, eager, `${name} must not stale payroll before attendance write`);
  }
});


test("v2 context mapper helpers are all defined", () => {
  const v2 = fs.readFileSync(new URL("./habat-attendance-v2.js", import.meta.url), "utf8");
  for (const helper of [
    "mapPrincipal",
    "mapShift",
    "mapAssignment",
    "mapSettings",
    "mapPublicSettings",
    "mapRecord",
    "mapClockLocation",
  ]) {
    assert.match(v2, new RegExp(`function ${helper}\\(`), `${helper} must be defined`);
  }
});
test("administrative absence cannot be created for today or future dates", () => {
  const core = fs.readFileSync(
    new URL("./workforce-core.js", import.meta.url),
    "utf8"
  );

  assert.match(
    core,
    /if \(absenceDate >= todayRiyadh\)/
  );

  assert.match(
    core,
    /workforce_absence_requires_completed_day/
  );
});
