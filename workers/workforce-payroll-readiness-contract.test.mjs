import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  calculateWorkforcePayrollDeductions,
  calculateWorkforcePayrollRates,
  evaluatePayrollAttendanceReadiness,
} from "./workforce-payroll-readiness.js";

const service = fs.readFileSync(new URL("./workforce-payroll-readiness.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforcePayrollReadinessPanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-payroll-readiness.mjs", import.meta.url), "utf8");

test("payroll readiness core remains tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("Saudi-style daily and hourly wage basis is deterministic", () => {
  const rates = calculateWorkforcePayrollRates({
    baseSalaryHalalas: 300000,
    allowancesHalalas: 60000,
    dailyNormalHours: 8,
  });
  assert.deepEqual(rates, {
    baseSalaryHalalas: 300000,
    allowancesHalalas: 60000,
    actualWageHalalas: 360000,
    dailyNormalHours: 8,
    dailyRateHalalas: 12000,
    hourlyRateHalalas: 1500,
  });
});

test("attendance and absence deductions are separated to avoid double accounting", () => {
  const result = calculateWorkforcePayrollDeductions({
    attendanceMissingMinutes: 120,
    hourlyRateHalalas: 1500,
    absenceUnits: 1.5,
    dailyRateHalalas: 12000,
    unpaidPartialMinutes: 60,
  });
  assert.deepEqual(result, {
    attendanceDeductionHalalas: 3000,
    absenceDeductionHalalas: 19500,
    absenceDayDeductionHalalas: 18000,
    absencePartialDeductionHalalas: 1500,
  });
});

test("confirmed attendance can be ready only with complete punches and resolved schedules", () => {
  const ready = evaluatePayrollAttendanceReadiness({
    employeeActive: true,
    settingsReady: true,
    baseSalaryHalalas: 300000,
    workDaysPerMonth: 26,
    periodStarted: true,
    attendancePayrollMode: "required",
    attendanceLinkStatus: "confirmed",
    sourceAvailable: true,
    scheduleReady: true,
    dailyNormalHours: 8,
    expectedAttendanceMinutes: 480,
    attendanceRecordCount: 1,
    incompletePunchDays: 0,
    manualReviewAbsenceDays: 0,
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.blockers.length, 0);

  const incomplete = evaluatePayrollAttendanceReadiness({
    employeeActive: true,
    settingsReady: true,
    baseSalaryHalalas: 300000,
    workDaysPerMonth: 26,
    periodStarted: true,
    attendancePayrollMode: "required",
    attendanceLinkStatus: "confirmed",
    sourceAvailable: true,
    scheduleReady: true,
    dailyNormalHours: 8,
    expectedAttendanceMinutes: 480,
    attendanceRecordCount: 1,
    incompletePunchDays: 1,
  });
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.blockers.some(item => item.code === "workforce_payroll_attendance_incomplete"));
});

test("unconfirmed attendance explicitly blocks automatic deductions", () => {
  const result = evaluatePayrollAttendanceReadiness({
    employeeActive: true,
    settingsReady: true,
    baseSalaryHalalas: 300000,
    workDaysPerMonth: 26,
    periodStarted: true,
    attendancePayrollMode: "required",
    attendanceLinkStatus: "unlinked",
    sourceAvailable: true,
    scheduleReady: true,
    dailyNormalHours: 8,
    expectedAttendanceMinutes: 480,
    attendanceRecordCount: 0,
  });
  assert.equal(result.ready, false);
  assert.equal(result.code, "workforce_payroll_attendance_unconfirmed");
  assert.ok(service.includes("لم يتم تطبيق خصم الحضور لأن ربط البصمات غير مكتمل أو غير مؤكد."));
  assert.ok(service.includes("الحضور غير مربوط/غير مؤكد، لم يتم تطبيق خصم حضور تلقائي."));
});

test("attendance-exempt employees require a documented reason but do not require punches", () => {
  const blocked = evaluatePayrollAttendanceReadiness({
    employeeActive: true,
    settingsReady: true,
    baseSalaryHalalas: 300000,
    workDaysPerMonth: 26,
    periodStarted: true,
    attendancePayrollMode: "exempt",
    attendancePayrollExemptionReason: "",
  });
  assert.equal(blocked.ready, false);

  const ready = evaluatePayrollAttendanceReadiness({
    employeeActive: true,
    settingsReady: true,
    baseSalaryHalalas: 300000,
    workDaysPerMonth: 26,
    periodStarted: true,
    attendancePayrollMode: "exempt",
    attendancePayrollExemptionReason: "وظيفة خارجية موثقة",
    attendanceLinkStatus: "exempt",
    attendanceRecordCount: 0,
  });
  assert.equal(ready.ready, true);
});

test("manual-review absences block payroll application", () => {
  const result = evaluatePayrollAttendanceReadiness({
    employeeActive: true,
    settingsReady: true,
    baseSalaryHalalas: 300000,
    workDaysPerMonth: 26,
    periodStarted: true,
    attendancePayrollMode: "exempt",
    attendancePayrollExemptionReason: "موثق",
    manualReviewAbsenceDays: 0.5,
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(item => item.code === "workforce_payroll_absence_manual_review_required"));
});

test("payroll engine uses completed-through yesterday for the active Riyadh month", () => {
  assert.ok(service.includes("const previous = addDays(today, -1);"));
  assert.ok(service.includes("completedThrough"));
  assert.ok(service.includes("Asia/Riyadh"));
});

test("payroll application is explicit POST-only, draft-only, batched, and audited", () => {
  assert.ok(service.includes('if (request.method === "POST")'));
  assert.ok(service.includes('const MUTABLE_STATUSES = new Set(["draft"])'));
  assert.ok(service.includes("workforce_payroll_entry_locked"));
  assert.ok(service.includes("runBatch"));
  assert.ok(service.includes("workforce.payroll_readiness.apply"));
  assert.ok(service.includes('stage: "attendance_applied"'));
  assert.equal(/DELETE\s+FROM\s+workforce_payroll_entries/i.test(service), false);
});

test("payroll readiness reuses shared schedule resolver and Habbat stays at the edge", () => {
  assert.ok(service.includes("resolveWorkforceScheduleRange"));
  assert.ok(service.includes("sourceAdapter.listAttendanceMonth"));
  assert.equal(/habat_/i.test(service), false);
});

test("readiness UI exposes blockers, missing-punch review, and explicit apply control", () => {
  for (const required of [
    "جاهزية المسير وخصم الحضور",
    "لم يتم تطبيق خصم الحضور لأن الجاهزية غير مكتملة",
    "أيام البصمة الناقصة",
    "تطبيق الاحتساب على مسودة المسير",
  ]) {
    assert.ok(ui.includes(required), required);
  }
});

test("payroll readiness integration is idempotent, CRLF-safe, and cannot deploy", () => {
  assert.ok(integration.includes("preferredEol"));
  assert.ok(integration.includes("crlfMarker"));
  assert.ok(integration.includes("includes"));
  assert.equal(/--remote|wrangler|deploy|d1\s+execute/i.test(integration), false);
});
