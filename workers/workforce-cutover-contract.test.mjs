import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(path, "utf8");
const core = read("workers/workforce-core.js");
const adapter = read("workers/habat-workforce-adapter.js");
const cutover = read("workers/workforce-migrations/tenant-cutover/0001_habat_workforce_seed.sql");

test("Workforce Core stays free of Habbat table knowledge", () => {
  assert.doesNotMatch(core, /habat_attendance_/i);
  assert.doesNotMatch(core, /habat-alwaraq/i);
  assert.doesNotMatch(core, /حبات الورق/);
});

test("tenant-specific legacy knowledge is isolated to adapter and cutover", () => {
  assert.match(adapter, /habat_attendance_access/);
  assert.match(cutover, /habat_attendance_access/);
  assert.match(cutover, /habat_attendance_shifts/);
  assert.match(cutover, /habat_attendance_shift_assignments/);
  assert.match(cutover, /habat_attendance_day_overrides/);
  assert.match(cutover, /habat_attendance_monthly_summaries/);
});

test("cutover seeds generic tenant-scoped Workforce domains", () => {
  for (const table of [
    "workforce_tenants",
    "workforce_employee_profiles",
    "workforce_employment",
    "workforce_schedule_templates",
    "workforce_schedule_assignments",
    "workforce_attendance_links",
    "workforce_leaves",
    "workforce_absences",
    "workforce_attendance_month_snapshots",
  ]) {
    assert.match(cutover, new RegExp(table));
  }
  assert.match(cutover, /restaurant_tenant_habat_alwaraq/);
});

test("cutover is additive and never deletes legacy data", () => {
  assert.doesNotMatch(cutover, /\bDROP\b/i);
  assert.doesNotMatch(cutover, /\bDELETE\s+FROM\s+habat_/i);
  assert.doesNotMatch(cutover, /\bUPDATE\s+habat_/i);
});
