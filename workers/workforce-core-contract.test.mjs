import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const core = read("workers/workforce-core.js");
const adapter = read("workers/habat-workforce-adapter.js");
const worker = read("workers/attendance-worker.js");
const migration = read("workers/workforce-migrations/0001_workforce_core_foundation.sql");
const client = read("client/src/features/workforce/workforceClient.ts");

test("workforce core is tenant-agnostic", () => {
  assert.doesNotMatch(core, /habat_/i);
  assert.doesNotMatch(core, /habat-alwaraq/i);
  assert.doesNotMatch(core, /حبات الورق/);
  assert.match(core, /tenant\.id/);
  assert.match(core, /workforce_employee_profiles/);
  assert.match(core, /workforce_payroll_settings/);
  assert.match(core, /workforce_leaves/);
});

test("tenant-specific legacy knowledge stays in the edge adapter", () => {
  assert.match(adapter, /tenantKey:\s*"habat-alwaraq"/);
  assert.match(adapter, /FROM habat_attendance_access/);
  assert.match(adapter, /sourceType:\s*"legacy_attendance_access"/);
  assert.match(adapter, /handleWorkforceCoreRequest/);
});

test("attendance worker routes workforce before legacy Habbat handlers", () => {
  const workforceIndex = worker.indexOf('/attendance/habat/workforce/');
  const legacyIndex = worker.indexOf('return handleHabatAttendanceRequest(habatArgs)');
  assert.ok(workforceIndex >= 0, "workforce route is missing");
  assert.ok(legacyIndex >= 0, "legacy Habbat fallback is missing");
  assert.ok(workforceIndex < legacyIndex, "workforce route must be evaluated before legacy fallback");
});

test("schema establishes tenant-scoped workforce domains", () => {
  const requiredTables = [
    "workforce_tenants",
    "workforce_employee_profiles",
    "workforce_employment",
    "workforce_schedule_templates",
    "workforce_schedule_assignments",
    "workforce_schedule_exceptions",
    "workforce_attendance_links",
    "workforce_attendance_month_snapshots",
    "workforce_leaves",
    "workforce_absences",
    "workforce_leave_balances",
    "workforce_leave_ledger",
    "workforce_payroll_settings",
    "workforce_payroll_periods",
    "workforce_payroll_entries",
    "workforce_payroll_adjustments",
    "workforce_audit_events",
  ];

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }

  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS habat_/i);
  assert.match(migration, /amount_halalas INTEGER NOT NULL/);
  assert.match(migration, /CHECK \(status IN \('draft', 'reviewed', 'approved', 'paid'\)\)/);
  assert.match(migration, /reason TEXT NOT NULL/);
});

test("frontend client uses generic workforce contracts", () => {
  assert.match(client, /VITE_WORKFORCE_API_BASE/);
  assert.match(client, /WorkforceService/);
  assert.match(client, /attendancePayrollMode/);
  assert.match(client, /baseSalaryHalalas/);
  assert.match(client, /createLeave/);
  assert.match(client, /createAbsence/);
  assert.match(client, /createScheduleAssignment/);
});
