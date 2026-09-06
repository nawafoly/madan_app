import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(path, "utf8");
const core = read("workers/workforce-core.js");
const adapter = read("workers/habat-workforce-adapter.js");
const cutover = read("workers/workforce-migrations/tenant-cutover/0001_habat_workforce_seed.sql");
const preflight = read("workers/workforce-migrations/tenant-cutover/0000_habat_production_preflight.sql");
const fixture = read("workers/workforce-migrations/tenant-cutover/fixtures/0001_habat_local_fixture.sql");
const verification = read("workers/workforce-migrations/tenant-cutover/fixtures/0002_verify_habat_local_cutover.sql");
const localHarness = read("scripts/test-workforce-cutover-local.mjs");
const productionReporter = read("scripts/report-workforce-cutover-production.mjs");

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

test("production preflight is SELECT-only", () => {
  assert.match(preflight, /PRODUCTION READ-ONLY PREFLIGHT/);
  assert.match(preflight, /\bSELECT\b/i);
  assert.doesNotMatch(preflight, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA)\b/i);
  for (const diagnostic of [
    "source_employees",
    "source_shifts",
    "source_assignments",
    "source_day_overrides",
    "source_monthly_summaries",
    "orphan_assignments_missing_employee",
    "orphan_assignments_missing_shift",
    "orphan_day_overrides",
    "orphan_monthly_summaries",
    "conflicting_employee_identity_rows",
    "conflicting_employee_source_rows",
    "expected_employee_rows_after_cutover",
    "expected_schedule_rows_after_cutover",
    "expected_assignment_rows_after_cutover",
    "expected_leave_rows_after_cutover",
    "expected_absence_rows_after_cutover",
    "expected_attendance_snapshot_rows_after_cutover",
  ]) {
    assert.match(preflight, new RegExp(diagnostic));
  }
});

test("production value reporter is remote but hard-blocked to SELECT-only checks", () => {
  assert.match(productionReporter, /READ ONLY/);
  assert.match(productionReporter, /"--remote"/);
  assert.match(productionReporter, /forbidden\s*=\s*\/\\b\(\?:INSERT\|UPDATE\|DELETE/);
  assert.match(productionReporter, /!\/\^\\s\*SELECT\\b\/i\.test\(sql\)/);
  assert.doesNotMatch(productionReporter, /0001_habat_workforce_seed\.sql/);
  assert.doesNotMatch(productionReporter, /"--file"/);
});

test("local cutover fixture and harness can never target remote D1", () => {
  assert.match(fixture, /LOCAL TEST FIXTURE ONLY/);
  assert.match(fixture, /Never run it with --remote/i);
  assert.match(verification, /LOCAL TEST VERIFICATION ONLY/);
  assert.match(verification, /Never run it with --remote/i);
  assert.match(localHarness, /"--local"/);
  assert.match(localHarness, /--persist-to/);
  assert.doesNotMatch(localHarness, /"--remote"/);
});

test("local harness validates idempotency by applying tenant cutover twice", () => {
  const occurrences = localHarness.match(/0001_habat_workforce_seed\.sql/g) || [];
  assert.ok(occurrences.length >= 2, "cutover seed must be applied at least twice in the isolated harness");
});

test("local harness uses the existing npx Wrangler workflow without direct .cmd spawning", () => {
  assert.match(localHarness, /process\.env\.ComSpec\s*\|\|\s*"cmd\.exe"/);
  assert.match(localHarness, /\["\/d",\s*"\/s",\s*"\/c",\s*"npx"/);
  assert.match(localHarness, /return \{ command: "npx", args: wranglerArgs \}/);
  assert.doesNotMatch(localHarness, /spawnSync\([^\n]*npx\.cmd/i);
  assert.doesNotMatch(localHarness, /shell:\s*true/);
  assert.doesNotMatch(localHarness, /node_modules.*wrangler.*bin.*wrangler\.js/s);
});

test("local verification is file-based so Windows cmd cannot truncate SQL", () => {
  assert.match(localHarness, /0002_verify_habat_local_cutover\.sql/);
  assert.doesNotMatch(localHarness, /"--command"/);
  assert.match(verification, /CHECK \(ok = 1\)/);
  for (const invariant of [
    "tenant_count",
    "employee_count",
    "employment_count",
    "schedule_count",
    "assignment_count",
    "attendance_link_count",
    "leave_count",
    "absence_count",
    "attendance_snapshot_count",
    "employee_mapping",
    "leave_mapping",
    "absence_mapping",
    "snapshot_mapping",
  ]) {
    assert.match(verification, new RegExp(invariant));
  }
});

test("local verification avoids D1-blocked TEMP and cleanup operations", () => {
  assert.match(verification, /CREATE TABLE workforce_cutover_local_assertions/);
  assert.doesNotMatch(verification, /CREATE\s+TEMP(?:ORARY)?\s+TABLE/i);
  assert.doesNotMatch(verification, /\bDROP\s+TABLE\b/i);
});
