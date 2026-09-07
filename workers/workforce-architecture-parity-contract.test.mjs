import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(path, "utf8");
const core = read("workers/workforce-core.js");
const schedule = read("workers/workforce-schedule-control.js");
const client = read("client/src/features/workforce/workforceClient.ts");
const employeeFile = read("client/src/features/workforce/WorkforceEmployeeFile.tsx");
const admin = read("client/src/pages/habat/HabatAttendanceAdmin.tsx");
const habatV2 = read("workers/habat-attendance-v2.js");
const migration = read("workers/workforce-migrations/0005_workforce_employee_weekly_schedule.sql");

test("0005 adds employee-owned weekly rest without destructive legacy changes", () => {
  assert.match(migration, /ADD COLUMN weekly_rest_weekday INTEGER/);
  assert.match(migration, /ADD COLUMN week_pattern_json TEXT/);
  assert.match(migration, /ADD COLUMN operation_id TEXT/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE\s+habat_/i);
});

test("shift templates no longer own employee weekly rest", () => {
  assert.match(core, /templateCompatibilityDays = \[0, 1, 2, 3, 4, 5, 6\]/);
  assert.doesNotMatch(core, /workforce_schedule_working_days_required/);
  assert.match(core, /scheduleOwnership: "template_time_policy_only"/);
});

test("new schedule assignments require one employee weekly rest day", () => {
  assert.match(core, /weeklyRestWeekday/);
  assert.match(core, /workforce_weekly_rest_weekday_required/);
  assert.match(core, /week_pattern_json/);
  assert.match(core, /workforce_schedule_assignment_operation_unique|operation_id/);
  assert.match(client, /weeklyRestWeekday: number/);
});

test("resolver prefers employee schedule and keeps legacy fallback", () => {
  assert.match(schedule, /resolveAssignmentWeekPattern/);
  assert.match(schedule, /source: "employee_schedule"/);
  assert.match(schedule, /source: "legacy_template_fallback"/);
  assert.match(schedule, /weeklyRestWeekday: weekPattern\.weeklyRestWeekday/);
});

test("Habbat edge reuses generic Workforce resolver before legacy fallback", () => {
  assert.match(habatV2, /import \{ resolveWorkforceScheduleDay \} from "\.\/workforce-schedule-control\.js"/);
  assert.match(habatV2, /await resolveWorkforceScheduleDay\(/);
  const workforceResolverIndex = habatV2.indexOf("await resolveWorkforceScheduleDay(");
  const legacyIndex = habatV2.indexOf("habat_attendance_shift_assignments", workforceResolverIndex);
  assert.ok(workforceResolverIndex >= 0);
  assert.ok(legacyIndex > workforceResolverIndex);
});

test("employee UI owns weekly rest and payroll starts with setup", () => {
  assert.match(employeeFile, /الإجازة الأسبوعية الأساسية/);
  assert.match(employeeFile, /جدول الموظف الأسبوعي/);
  const payrollStart = employeeFile.indexOf('<TabsContent value="payroll"');
  const setup = employeeFile.indexOf('onSubmit={savePayroll}', payrollStart);
  const readiness = employeeFile.indexOf("WorkforcePayrollReadinessPanel", payrollStart);
  const lifecycle = employeeFile.indexOf("WorkforcePayrollLifecyclePanel", payrollStart);
  const report = employeeFile.indexOf("WorkforceMonthlyEmployeeReportPanel", payrollStart);
  assert.ok(payrollStart >= 0 && setup > payrollStart);
  assert.ok(setup < readiness);
  assert.ok(readiness < lifecycle);
  assert.ok(lifecycle < report);
});

test("global Habbat shift page is template-only", () => {
  assert.match(admin, /قوالب الشفتات/);
  assert.match(admin, /يوم الراحة يُحدد لكل موظف/);
  assert.doesNotMatch(admin, /<p className="mb-2 text-sm font-bold">أيام العمل<\/p>/);
  assert.doesNotMatch(admin, /workingDays:\s*\[0, 1, 2, 3, 4\]/);
});

test("generic Workforce runtime remains tenant-agnostic", () => {
  assert.doesNotMatch(core, /habat_|حبات الورق|habat-alwaraq/i);
  assert.doesNotMatch(schedule, /habat_|حبات الورق|habat-alwaraq/i);
});
