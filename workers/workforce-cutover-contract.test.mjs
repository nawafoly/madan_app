import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(path, "utf8");
const core = read("workers/workforce-core.js");
const adapter = read("workers/habat-workforce-adapter.js");
const cutover = read("workers/workforce-migrations/tenant-cutover/0001_habat_workforce_seed.sql");
const fixture = read("workers/workforce-migrations/tenant-cutover/fixtures/0001_habat_local_fixture.sql");
const localHarness = read("scripts/test-workforce-cutover-local.mjs");

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

test("local cutover fixture and harness can never target remote D1", () => {
  assert.match(fixture, /LOCAL TEST FIXTURE ONLY/);
  assert.match(fixture, /Never run it with --remote/i);
  assert.match(localHarness, /"--local"/);
  assert.match(localHarness, /--persist-to/);
  assert.doesNotMatch(localHarness, /"--remote"/);
});

test("local harness validates idempotency by applying tenant cutover twice", () => {
  const occurrences = localHarness.match(/0001_habat_workforce_seed\.sql/g) || [];
  assert.ok(occurrences.length >= 2, "cutover seed must be applied at least twice in the isolated harness");
});

test("local harness runs Wrangler through Node and never spawns a Windows .cmd shim", () => {
  assert.match(localHarness, /process\.execPath/);
  assert.match(localHarness, /node_modules.*wrangler.*bin.*wrangler\.js/s);
  assert.doesNotMatch(localHarness, /spawnSync\([^\n]*npx\.cmd/i);
  assert.doesNotMatch(localHarness, /shell:\s*true/);
});
