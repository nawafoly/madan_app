import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(path, "utf8");
const ui = read("client/src/features/workforce/WorkforceEmployeeFile.tsx");
const integration = read("scripts/integrate-workforce-employee-file.mjs");

test("generic Workforce employee file contains no Habbat tenant knowledge", () => {
  assert.doesNotMatch(ui, /habat[_-]|حبات الورق|habat_attendance_/i);
  assert.match(ui, /WorkforceService/);
  assert.match(ui, /workforceClient/);
});

test("employee file covers the scoped Workforce operating tabs", () => {
  for (const tab of ["basic", "payroll", "schedule", "leaves", "absences", "attendance"]) {
    assert.match(ui, new RegExp(`value=\\"${tab}\\"`));
  }
  for (const operation of [
    "updateEmployee",
    "saveEmployment",
    "savePayrollSettings",
    "createScheduleAssignment",
    "createLeave",
    "createAbsence",
  ]) {
    assert.match(ui, new RegExp(`WorkforceService\\.${operation}`));
  }
});

test("V4 integration is explicit, idempotent, and preserves legacy attendance only at the Habbat edge", () => {
  assert.match(integration, /WorkforceEmployeeFile/);
  assert.match(integration, /legacyAttendance=\{<AttendanceMonthWorkspace/);
  assert.match(integration, /already integrated/);
  assert.match(integration, /employee-file/);
  assert.doesNotMatch(integration, /--remote|wrangler|d1\s+execute/i);
});
